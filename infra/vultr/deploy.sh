#!/usr/bin/env bash
# deploy.sh — build and (re)deploy the HighCastle stack on the Vultr VM (L19).
#
# Run ON the VM, from a repo checkout (e.g. /opt/highcastle). Idempotent:
#   * verifies secrets files exist (never prints them)
#   * builds all images with the current git SHA provenance
#   * creates the internal runner network (fail-loud if non-internal)
#   * `docker compose up -d` — migrate completes before web/worker start
#   * reports the lab image digest to pin into worker.env
#   * runs the health check
#
# Env (non-secret deployment vars; see env-examples/deploy.env.example):
#   HIGHCASTLE_DOMAIN     public hostname served by Caddy (required)
#   HIGHCASTLE_RELEASE    image tag (default: git short SHA)
#   TARGET_LAB_IMAGE      lab image for the target-lab alias
#                         (default: highcastle/target-lab:lab-v1-vulnerable)
#   HIGHCASTLE_SECRETS_DIR  default /etc/highcastle
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=../scripts/lib.sh
. "$ROOT/infra/scripts/lib.sh"

DEPLOY_DIR="$ROOT/infra/docker/deploy"
SECRETS_DIR="${HIGHCASTLE_SECRETS_DIR:-/etc/highcastle}"
export HIGHCASTLE_SECRETS_DIR="$SECRETS_DIR"

command -v docker >/dev/null 2>&1 || hc_die "docker not installed — run infra/vultr/setup-vm.sh first"
docker info >/dev/null 2>&1 || hc_die "docker daemon not running"
docker compose version >/dev/null 2>&1 || hc_die "docker compose plugin missing"

[[ -n "${HIGHCASTLE_DOMAIN:-}" ]] || hc_die "HIGHCASTLE_DOMAIN required (public hostname or 'localhost' for bring-up)"

for f in postgres.env web.env worker.env migrate.env; do
  if [[ ! -f "$SECRETS_DIR/$f" ]]; then
    hc_die "missing $SECRETS_DIR/$f — copy from infra/docker/deploy/env-examples/ and fill in (chmod 0600)"
  fi
  perms=$(stat -c '%a' "$SECRETS_DIR/$f")
  [[ "$perms" == "600" || "$perms" == "400" ]] \
    || hc_die "$SECRETS_DIR/$f has mode $perms — chmod 0600 (secrets must not be group/world-readable)"
done
hc_log "secrets files present with safe permissions (values never read by this script)"

export HIGHCASTLE_RELEASE="${HIGHCASTLE_RELEASE:-$(git rev-parse --short HEAD)}"
export SOURCE_GIT_SHA="$(git rev-parse HEAD)"
export TARGET_LAB_IMAGE="${TARGET_LAB_IMAGE:-highcastle/target-lab:lab-v1-vulnerable}"
export HIGHCASTLE_RUNNER_IMAGE="${HIGHCASTLE_RUNNER_IMAGE:-highcastle/runner:0.1.0}"
hc_log "release=$HIGHCASTLE_RELEASE sha=$SOURCE_GIT_SHA lab=$TARGET_LAB_IMAGE"

hc_log "building images"
"$ROOT/infra/scripts/build-images.sh" --digest-file=/tmp/highcastle-image-digests.env

hc_log "ensuring internal runner network"
hc_ensure_runner_network highcastle-runner || hc_die "runner network precondition failed"

cd "$DEPLOY_DIR"
hc_log "docker compose up -d (migrate completes before web/worker)"
docker compose -f compose.yaml up -d --remove-orphans

LAB_DIGEST=$(docker image inspect "$TARGET_LAB_IMAGE" --format '{{.Id}}' 2>/dev/null || echo "unavailable")
hc_log "target-lab image digest: $LAB_DIGEST"
if ! grep -q "HIGHCASTLE_TARGET_IMAGE_DIGEST=$LAB_DIGEST" "$SECRETS_DIR/worker.env" 2>/dev/null; then
  hc_log "NOTE: worker.env HIGHCASTLE_TARGET_IMAGE_DIGEST does not match the deployed lab image."
  printf '  update %s/worker.env to: HIGHCASTLE_TARGET_IMAGE_DIGEST=%s\n' "$SECRETS_DIR" "$LAB_DIGEST" >&2
fi

hc_log "service status"
docker compose -f compose.yaml ps

hc_log "running health check"
HIGHCASTLE_DOMAIN="$HIGHCASTLE_DOMAIN" "$ROOT/infra/scripts/health-check.sh" || true

cat <<EOF

Deployment pass complete.
  public URL : https://$HIGHCASTLE_DOMAIN
  lab alias  : target-lab -> $TARGET_LAB_IMAGE ($LAB_DIGEST)
  next       : infra/scripts/smoke-containment.sh   (full containment suite)
  replay     : TARGET_LAB_IMAGE=highcastle/target-lab:lab-v2-patched \\
               docker compose -f $DEPLOY_DIR/compose.yaml up -d target-lab
EOF
