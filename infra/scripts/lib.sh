# shellcheck shell=bash
# lib.sh — shared helpers for infra/scripts. Source; do not execute.

hc_log()  { printf '==> %s\n' "$*" >&2; }
hc_err()  { printf 'ERROR: %s\n' "$*" >&2; }
hc_die()  { hc_err "$*"; exit 1; }
hc_skip() { printf 'SKIP: %s\n' "$*"; }
hc_pass() { printf 'PASS: %s\n' "$*"; }
hc_fail() { printf 'FAIL: %s\n' "$*"; }

hc_repo_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}

# Returns 0 when a usable Docker daemon answers, 1 otherwise. Never throws.
hc_docker_available() {
  command -v docker >/dev/null 2>&1 || return 1
  docker info >/dev/null 2>&1 || return 1
  return 0
}

# Create the internal runner network if absent; FAIL LOUD if it exists but is
# not internal (that is the L14 launch precondition — never silently proceed).
# Prints nothing; returns non-zero on violation.
hc_ensure_runner_network() {
  local net="${1:-highcastle-runner}"
  if docker network inspect "$net" >/dev/null 2>&1; then
    local internal
    internal=$(docker network inspect "$net" --format '{{.Internal}}')
    if [[ "$internal" != "true" ]]; then
      hc_err "network $net exists but is NOT internal — sandbox egress would not be contained"
      return 1
    fi
  else
    docker network create --internal "$net" >/dev/null
  fi
  return 0
}

# Resolve the lab image tag for a revision id. Source of truth:
# infra/docker/deploy/lab-revisions.env (the committed mapping); builtin
# fallback keeps tools usable if run outside a checkout.
hc_lab_image_for_revision() {
  local rev="$1" map
  map="$(hc_repo_root)/infra/docker/deploy/lab-revisions.env"
  if [[ -f "$map" ]]; then
    local tag
    tag=$(grep -E "^${rev}=" "$map" | head -1 | cut -d= -f2-)
    [[ -n "$tag" ]] && { printf '%s' "$tag"; return 0; }
  fi
  case "$rev" in
    lab-v1-vulnerable) printf 'highcastle/target-lab:lab-v1-vulnerable' ;;
    lab-v2-patched)    printf 'highcastle/target-lab:lab-v2-patched' ;;
    *) return 1 ;;
  esac
}
