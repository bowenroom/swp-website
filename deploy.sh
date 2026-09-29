#!/bin/bash
# One command to get a local edit onto swp.lionpilot.tech.
#
#   ./deploy.sh "what changed"     # commit everything, push, wait for Pages
#   ./deploy.sh --dry-run           # show what would be committed, push nothing
#
# GitHub Pages has no watcher on your disk: a local save changes nothing online.
# The site only changes when a commit lands on the branch Pages is serving, then
# the build runs (usually 1-2 min). This script does the boring part and waits for
# the deploy to actually finish so you can trust the link it prints.
set -euo pipefail
cd "$(dirname "$0")"

REPO="${SWP_REPO:-bowenroom/swp-website}"
BRANCH="${SWP_BRANCH:-main}"
URL="https://swp.lionpilot.tech/"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1 || MSG="${1:-update site}"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

say "→ staging changes"
git add -A
if git diff --cached --quiet; then
  echo "  nothing to commit — already up to date"
else
  git status --short | sed 's/^/  /'
  [ "$DRY" = 1 ] && { say "→ dry run, stopping before commit"; exit 0; }
  git commit -q -m "$MSG"
  say "→ committed: $MSG"
fi

if [ "$DRY" = 1 ]; then exit 0; fi

say "→ pushing to $REPO ($BRANCH)"
git push -q origin "$BRANCH" || die "push failed — run: gh auth login"

# Poll the Actions run so we report a finished deploy, not just a pushed commit.
# This site uses build_type=workflow, so the Pages build API (/pages/builds/latest)
# returns 404 — poll the workflow run instead.
say "→ waiting for GitHub Pages build"
run_id=$(gh run list -R "$REPO" -L 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || echo "")
if [ -z "$run_id" ]; then
  say "→ could not read the workflow run; skipping the wait"
else
  for i in $(seq 1 40); do
    sleep 5
    state=$(gh run view "$run_id" -R "$REPO" --json status,conclusion --jq '.status+" "+.conclusion' 2>/dev/null || echo unknown)
    case "$state" in
      *success*) say "→ build succeeded"; break ;;
      *failure*|*cancelled*) die "Pages build FAILED — see: gh run view $run_id -R $REPO" ;;
    esac
    [ $((i % 4)) = 0 ] && echo "  …$((i * 5))s ($state)"
  done
fi

say "→ live: $URL"
echo "  (Pages can take another ~30s to serve the new build; hard-refresh if stale)"
