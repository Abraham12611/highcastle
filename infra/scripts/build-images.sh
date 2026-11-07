#!/usr/bin/env bash
# build-images.sh — build all deployment images locally (VM or dev box).
#
# Builds, in dependency order:
#   highcastle/target-lab:lab-v1-vulnerable   (apps/target-lab, L11 — merged)
#   highcastle/target-lab:lab-v2-patched      (apps/target-lab, L11 — merged)
#   highcastle/runner:0.1.0                   (infra/docker/runner, L14 — needs PR #15)
#   highcastle/db-migrate:<release>           (db-migrate.Dockerfile — needs PR #18 / packages/db)
#   highcastle/web:<release>                  (web.Dockerfile)
#   highcastle/worker:<release>               (worker.Dockerfile)
#
# Anything whose source isn't merged yet is skipped HONESTLY (exit stays 0 so
# partial environments still work); --strict turns skips into failures.
#
# Env:
#   HIGHCASTLE_RELEASE  image tag for web/worker/db-migrate (default: dev)
#   SOURCE_GIT_SHA      provenance arg for the lab build (default: git HEAD)
#   --digest-file FILE  write `KEY=<image-id>` lines for every built image,
#                       ready to source into worker.env/deploy.env
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
ROOT="$(hc_repo_root)"
cd "$ROOT"

STRICT=false
DIGEST_FILE=""
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=true ;;
    --digest-file=*) DIGEST_FILE="${arg#*=}" ;;
    *) hc_die "unknown argument: $arg" ;;
  esac
done

RELEASE="${HIGHCASTLE_RELEASE:-dev}"
SHA="${SOURCE_GIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo '')}"
SKIPPED=()

build() {
  local tag="$1"; shift
  hc_log "building $tag"
  docker build "$@" -t "$tag"
}

skip() {
  SKIPPED+=("$1")
  if $STRICT; then hc_die "cannot build $1: $2"; fi
  hc_skip "$1 — $2"
}

hc_docker_available || hc_die "docker daemon unavailable — install Docker or run on the Vultr VM"

# --- target lab (both revisions; required for every deployment) -------------
build highcastle/target-lab:lab-v1-vulnerable \
  --build-arg LAB_REVISION=lab-v1-vulnerable --build-arg SOURCE_GIT_SHA="$SHA" \
  -f apps/target-lab/Dockerfile apps/target-lab
build highcastle/target-lab:lab-v2-patched \
  --build-arg LAB_REVISION=lab-v2-patched --build-arg SOURCE_GIT_SHA="$SHA" \
  -f apps/target-lab/Dockerfile apps/target-lab

# --- runner (L14 — only after PR #15 merges) --------------------------------
if [[ -f infra/docker/runner/Dockerfile && -d packages/sandbox ]] && command -v pnpm >/dev/null 2>&1; then
  pnpm --filter @highcastle/contracts build >/dev/null
  pnpm --filter @highcastle/sandbox build >/dev/null
  build "highcastle/runner:0.1.0" -f infra/docker/runner/Dockerfile .
else
  skip "highcastle/runner:0.1.0" "infra/docker/runner+packages/sandbox (PR #15) or pnpm missing"
fi

# --- db migrator (L02 — only after PR #18 merges) ---------------------------
if [[ -d packages/db ]]; then
  build "highcastle/db-migrate:$RELEASE" -f infra/docker/deploy/db-migrate.Dockerfile .
else
  skip "highcastle/db-migrate:$RELEASE" "packages/db not merged yet (PR #18)"
fi

# --- control plane ----------------------------------------------------------
build "highcastle/web:$RELEASE"    -f infra/docker/deploy/web.Dockerfile .
build "highcastle/worker:$RELEASE" -f infra/docker/deploy/worker.Dockerfile .

if [[ -n "$DIGEST_FILE" ]]; then
  {
    for img in \
      "highcastle/target-lab:lab-v1-vulnerable" \
      "highcastle/target-lab:lab-v2-patched" \
      "highcastle/runner:0.1.0" \
      "highcastle/db-migrate:$RELEASE" \
      "highcastle/web:$RELEASE" \
      "highcastle/worker:$RELEASE"; do
      if docker image inspect "$img" >/dev/null 2>&1; then
        printf '%s=%s\n' "$img" "$(docker image inspect "$img" --format '{{.Id}}')"
      fi
    done
  } > "$DIGEST_FILE"
  hc_log "image digests written to $DIGEST_FILE"
fi

hc_log "done. built images:"
docker image ls --format '  {{.Repository}}:{{.Tag}}  {{.ID}}' | grep '  highcastle/' || true
if ((${#SKIPPED[@]})); then
  printf 'skipped (unmerged prerequisites): %s\n' "${SKIPPED[*]}" >&2
fi
