#!/bin/bash
# Repair node_modules for this project on the SMB volume.
#
# WHY THIS EXISTS
# ---------------
# The repo lives on //swp@192.168.31.173:445/01.MyFiles (smbfs). Two independent
# SMB behaviours make a normal `npm install` impossible there:
#
#   1. npm's reify step does an atomic `rename(pkg, pkg.tmp-XXXX)` for every
#      package it materialises. On this volume a handful of leftover package
#      directories refuse `rename` with EACCES, and npm aborts the whole install:
#
#        npm error syscall rename
#        npm error path .../node_modules/argparse
#        npm error errno -13
#
#      (Plain `rename` of a freshly created directory works fine, so this is not
#      a general SMB limitation -- it is stale oplock state on those specific
#      directories. A fresh unmount/remount of the share clears it.)
#
#   2. Even when the rename succeeds, writing ~10k small files over SMB is
#      punishingly slow: measured ~965 files in 5 minutes. node_modules is the
#      single most metadata-heavy directory in any JS project, so it does not
#      belong on a network volume.
#
# THE FIX
# -------
# Install to local disk once, then point the project at it with a symlink.
# Node resolves `node_modules` by walking up from the importing file, and a
# symlink is transparent to that walk, so the project itself stays on SMB while
# all dependency I/O happens on the local APFS volume.
#
# The store lives in ~/.local/share (NOT /tmp) so it survives reboots -- the
# earlier /tmp-based workaround silently lost every dependency on restart.
#
# USAGE
#   ./scripts/fix-node-modules.sh          # install (if needed) and link
#   ./scripts/fix-node-modules.sh --check  # report status, change nothing
#   ./scripts/fix-node-modules.sh --relink # re-point the link, keep the store

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STORE_ROOT="$HOME/.local/share/swp-website"
DEPS="$STORE_ROOT/node_modules"
MODE="${1:-install}"

say()  { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

report() {
  if [ -L "$PROJECT_DIR/node_modules" ]; then
    local target; target="$(readlink "$PROJECT_DIR/node_modules")"
    if [ -d "$target" ]; then
      say "status: linked -> $target ($(ls "$target" | wc -l | tr -d ' ') packages, $(du -sh "$target" | cut -f1))"
      return 0
    fi
    say "status: BROKEN LINK -> $target (target missing)"
    return 1
  fi
  if [ -d "$PROJECT_DIR/node_modules" ]; then
    say "status: real directory on SMB ($(find "$PROJECT_DIR/node_modules" -type f 2>/dev/null | wc -l | tr -d ' ') files) -- this is the broken state"
    return 1
  fi
  say "status: no node_modules"
  return 1
}

case "$MODE" in
  --check)
    report
    exit $?
    ;;
esac

say "project: $PROJECT_DIR"
say "store:   $DEPS"

# ---- 1. make sure the local-disk store is populated -------------------------
if [ ! -x "$DEPS/.bin/astro" ] && [ "$MODE" != "--relink" ]; then
  say ""
  say "Installing dependencies to local disk (first run only)..."
  mkdir -p "$STORE_ROOT"

  # Install in a scratch dir on local disk, then move the finished tree into the
  # store. Installing straight into $DEPS is fine too, but staging keeps a failed
  # run from leaving a half-populated store that later looks "installed".
  STAGE="$(mktemp -d)"
  trap 'rm -rf "$STAGE"' EXIT
  cp "$PROJECT_DIR/package.json" "$PROJECT_DIR/package-lock.json" "$STAGE/" 2>/dev/null \
    || cp "$PROJECT_DIR/package.json" "$STAGE/"

  ( cd "$STAGE" && npm install --no-audit --no-fund ) \
    || die "npm install failed in the staging directory"

  rm -rf "$DEPS" 2>/dev/null
  mv "$STAGE/node_modules" "$DEPS" \
    || die "could not move the staged install into $DEPS"
  say "installed $(ls "$DEPS" | wc -l | tr -d ' ') packages ($(du -sh "$DEPS" | cut -f1))"
else
  say "store already populated ($(ls "$DEPS" 2>/dev/null | wc -l | tr -d ' ') packages) -- skipping install"
fi

[ -d "$DEPS" ] || die "no dependency store at $DEPS"

# ---- 2. clear whatever is sitting in the project's node_modules --------------
if [ -L "$PROJECT_DIR/node_modules" ]; then
  say ""
  say "Removing the existing symlink..."
  rm -f "$PROJECT_DIR/node_modules" || die "could not remove the existing node_modules symlink"
elif [ -d "$PROJECT_DIR/node_modules" ]; then
  say ""
  say "Removing the broken node_modules directory on SMB..."
  say "  (this can take a while, and may fail on files the SMB client still holds)"
  rm -rf "$PROJECT_DIR/node_modules" 2>/dev/null
  if [ -d "$PROJECT_DIR/node_modules" ]; then
    leftover="$(find "$PROJECT_DIR/node_modules" -type f 2>/dev/null | wc -l | tr -d ' ')"
    if [ "$leftover" -gt 0 ]; then
      warn "$leftover file(s) could not be removed -- the SMB client is holding an oplock on them:"
      find "$PROJECT_DIR/node_modules" -type f 2>/dev/null | sed 's/^/    /'
      warn ""
      warn "Fix that by remounting the share, which releases the stale handles:"
      warn "    diskutil unmount /Volumes/01.MyFiles && mount_smbfs //swp@192.168.31.173:445/01.MyFiles /Volumes/01.MyFiles"
      warn ""
      warn "Stop any dev server first (it holds files open):"
      warn "    lsof -nP -iTCP:4321 -sTCP:LISTEN"
      die "remount the share, then re-run this script"
    fi
  fi
fi

# ---- 3. link the project at the local-disk store ----------------------------
say ""
say "Linking node_modules -> $DEPS"
ln -s "$DEPS" "$PROJECT_DIR/node_modules" \
  || die "could not create the symlink (is the share mounted with nosuid only, or is node_modules still a real directory?)"

say ""
report
say ""
say "Verify with:  npm test    (or: npm run build)"
