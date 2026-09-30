#!/usr/bin/env bash
# Bounded housekeeping for the Tencent Cloud host that serves swp.lionpilot.tech.
#
# The site itself never accumulates old versions: deploys use `rsync --delete`,
# so /var/www/swp stays an exact mirror of dist/. What does accumulate on this
# host is shared-infrastructure litter -- chiefly the per-commit container images
# pulled by another project's CI, plus a journal with no size cap.
#
# Conservative by construction:
#   * no volume pruning (postgres/redis data lives in volumes)
#   * never removes an image that any container references, running or stopped
#   * never removes hand-tagged rollback images (dlm:rollback, ...)
#   * non-journal logs are left to logrotate
#   * --dry-run prints every deletion and performs none
set -euo pipefail

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

STATE_DIR=/var/lib/swp-cleanup
LOG=/var/log/swp-cleanup.log
USAGE_LOG="$STATE_DIR/usage.tsv"

JOURNAL_MAX=200M       # the journal was unbounded and had reached 982M
CI_IMAGE_MAX_AGE_H=336 # keep 14 days of CI images so rollback stays possible
CI_IMAGE_REPO=ghcr.io/bowenroom/dlm
FAIL_PCT=92

log() { printf '%s %s\n' "$(date -Is)" "$*" | tee -a "$LOG"; }

run() {
  if [ "$DRY" = 1 ]; then
    log "DRY-RUN: $*"
  else
    log "RUN: $*"
    "$@" >>"$LOG" 2>&1 || log "  -> exited non-zero (continuing)"
  fi
}

disk_pct() { df -P / | awk 'NR==2 {print $5}' | tr -d '%'; }

[ "$(id -u)" = 0 ] || { echo "must run as root" >&2; exit 1; }
mkdir -p "$STATE_DIR"

BEFORE_PCT=$(disk_pct)
BEFORE_AVAIL=$(df -Ph / | awk 'NR==2 {print $4}')
log "=== cleanup start (disk ${BEFORE_PCT}% used, ${BEFORE_AVAIL} free, dry=${DRY}) ==="

# 1. Journal -- the one genuinely unbounded growth path on this host.
journal_size() { journalctl --disk-usage 2>/dev/null | grep -oE '[0-9.]+[KMGT]' | tail -1 || echo unknown; }
log "journal before: $(journal_size)"
run journalctl --vacuum-size="$JOURNAL_MAX"
log "journal after: $(journal_size)"

# 2. Dangling images: referenced by no container, so safe by definition.
if command -v docker >/dev/null 2>&1; then
  DANGLING=$(docker images -f dangling=true -q 2>/dev/null | sort -u | wc -l)
  run docker image prune -f
  log "dangling images seen: ${DANGLING}"

  # 3. Per-commit CI images past the retention window. Restricted to this repo's
  #    registry plus a 40-hex-char tag, so hand-tagged rollback images survive.
  now=$(date +%s)
  docker images --format '{{.Repository}}:{{.Tag}}|{{.ID}}' 2>/dev/null |
  while IFS='|' read -r ref id; do
    [ -n "${id:-}" ] || continue
    case "$ref" in
      "$CI_IMAGE_REPO":*) ;;
      *) continue ;;
    esac
    tag="${ref##*:}"
    case "$tag" in
      *[!0-9a-f]*)
        log "keep (tag is not hex): $ref"
        continue
        ;;
    esac
    if [ "${#tag}" -ne 40 ]; then
      log "keep (tag is ${#tag} chars, not a 40-char sha): $ref"
      continue
    fi
    if docker ps -aq --filter "ancestor=$id" 2>/dev/null | grep -q .; then
      log "keep (referenced by a container): $ref"
      continue
    fi
    created=$(docker image inspect -f '{{.Created}}' "$id" 2>/dev/null || true)
    if [ -z "$created" ]; then
      log "keep (could not read created time): $ref"
      continue
    fi
    age_h=$(( (now - $(date -d "$created" +%s)) / 3600 ))
    if [ "$age_h" -ge "$CI_IMAGE_MAX_AGE_H" ]; then
      log "stale CI image (${age_h}h >= ${CI_IMAGE_MAX_AGE_H}h): $ref"
      run docker rmi "$ref"
    else
      log "keep CI image (${age_h}h < ${CI_IMAGE_MAX_AGE_H}h): $ref"
    fi
  done
else
  log "docker not present, skipping image steps"
fi

# 4. apt package cache: regenerable, ~111M here.
run apt-get clean

log "non-journal /var/log: $(du -sh /var/log 2>/dev/null | cut -f1) (managed by logrotate)"

AFTER_PCT=$(disk_pct)
AFTER_AVAIL=$(df -Ph / | awk 'NR==2 {print $4}')
printf '%s %s %s %s\n' "$(date -Is)" "$BEFORE_PCT" "$AFTER_PCT" "$AFTER_AVAIL" >>"$USAGE_LOG"
tail -n 400 "$USAGE_LOG" > "$USAGE_LOG.tmp" && mv "$USAGE_LOG.tmp" "$USAGE_LOG"

log "=== cleanup done (disk ${BEFORE_PCT}% -> ${AFTER_PCT}%, ${BEFORE_AVAIL} -> ${AFTER_AVAIL} free) ==="

if [ "$AFTER_PCT" -ge "$FAIL_PCT" ]; then
  log "WARNING: disk still at/above ${FAIL_PCT}%; deploys will fail preflight until resolved."
fi
exit 0
