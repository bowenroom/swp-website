#!/bin/bash
# One command to get a local edit onto swp.lionpilot.tech.
#
#   ./deploy.sh "what changed"     # commit everything, push, wait for the deploy
#   ./deploy.sh --dry-run           # show what would be committed, push nothing
#
# Nothing is watching your disk: a local save changes nothing online. The site
# only changes when a commit lands on the branch the deploy workflow serves,
# then the build runs (usually 1-2 min). This script does the boring part and
# waits for the deploy to actually finish so you can trust the link it prints.
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

# Wait for the Tencent deploy specifically. The most recent run overall may be
# the Pages mirror, which says nothing about whether the live host got the build,
# so the list is filtered by workflow file and matched on this commit's HEAD.
say "→ waiting for the Tencent Cloud deploy"
head_sha=$(git rev-parse HEAD)
run_id=""
for i in $(seq 1 20); do
  run_id=$(gh run list -R "$REPO" -L 5 --workflow deploy-tencent.yml --commit "$head_sha" \
    --json databaseId --jq '.[0].databaseId' 2>/dev/null || echo "")
  [ -n "$run_id" ] && [ "$run_id" != "null" ] && break
  sleep 3
done

if [ -z "$run_id" ] || [ "$run_id" = "null" ]; then
  die "no Tencent deploy run appeared for $head_sha — check: gh run list -R $REPO"
fi

say "→ run $run_id"
for i in $(seq 1 60); do
  sleep 5
  state=$(gh run view "$run_id" -R "$REPO" --json status,conclusion --jq '.status+" "+(.conclusion//"")' 2>/dev/null || echo unknown)
  case "$state" in
    *success*) say "→ deploy succeeded"; break ;;
    *failure*|*cancelled*) die "Tencent deploy FAILED — see: gh run view $run_id -R $REPO" ;;
  esac
  [ $((i % 6)) = 0 ] && echo "  …$((i * 5))s ($state)"
done

say "→ live: $URL"
echo "  (Caddy serves the new build immediately; hard-refresh if stale)"
