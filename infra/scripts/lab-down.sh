#!/usr/bin/env bash
# lab-down.sh — stop the standalone lab stack (L19).
#   infra/scripts/lab-down.sh             # stop lab, keep network (shared with controller)
#   infra/scripts/lab-down.sh --network   # also remove highcastle-runner
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
ROOT="$(hc_repo_root)"

hc_docker_available || hc_die "docker daemon unavailable"

docker compose -f "$ROOT/infra/docker/deploy/compose.lab.yaml" down
hc_log "lab stopped; network highcastle-runner left in place (shared resource)"

if [[ "${1:-}" == "--network" ]]; then
  # Refuse to drop a network that still has members (e.g. a live runner).
  members=$(docker network inspect highcastle-runner --format '{{len .Containers}}' 2>/dev/null || echo '?')
  if [[ "$members" == "0" ]]; then
    docker network rm highcastle-runner
    hc_log "removed network highcastle-runner"
  else
    hc_die "highcastle-runner still has $members attached container(s) — refusing to remove"
  fi
fi
