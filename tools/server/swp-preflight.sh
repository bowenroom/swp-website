#!/usr/bin/env bash
# Disk preflight for the swp.lionpilot.tech deploy.
#
# Purpose: fail BEFORE rsync starts rather than halfway through it. A deploy that
# dies at 80% written leaves the live site in a mixed state -- some assets from
# the new build, some from the old -- which is worse than not deploying at all.
#
# The host sits around 79% normally (50G disk, ~11G free), so the threshold is
# deliberately not 90%: rsync needs room for the new tree while the old one is
# still on disk, and the build artifact plus SSH overhead add more.
#
# Exit 0 = safe to deploy. Exit 1 = do not deploy; something is wrong.
set -euo pipefail

MIN_FREE_PCT=10     # fail below 10% free
WARN_FREE_PCT=20    # warn below 20% free

# df prints the Use% column with a trailing percent sign (79%), which the
# arithmetic below cannot evaluate, so tr strips it first.
used_pct=$(df -P / | awk 'NR==2 {print $5}' | tr -d '%')
avail_kb=$(df -P / | awk 'NR==2 {print $4}')
free_pct=$(( 100 - used_pct ))
avail_gb=$(( avail_kb / 1024 / 1024 ))

echo "disk: ${used_pct}% used, ${free_pct}% free (${avail_gb}G available) on /"

if [ "$free_pct" -lt "$MIN_FREE_PCT" ]; then
  echo "::error::only ${free_pct}% free on / (need >= ${MIN_FREE_PCT}%). Refusing to deploy." >&2
  echo "Run the cleanup on the host first: sudo systemctl start swp-cleanup.service" >&2
  exit 1
fi

if [ "$free_pct" -lt "$WARN_FREE_PCT" ]; then
  echo "::warning::only ${free_pct}% free on /. Deploy is allowed but tight."
  echo "Consider: sudo systemctl start swp-cleanup.service"
fi

echo "preflight OK"
exit 0
