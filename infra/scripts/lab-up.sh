#!/usr/bin/env bash
# lab-up.sh — no-secret bring-up of the isolated target lab (L19).
#
# Provisions the internal `highcastle-runner` network (fail-loud if a
# non-internal network with that name exists) and starts the lab under the
# contract-fixed alias `target-lab`. This is the same topology the trusted
# sandbox controller requires in production.
#
#   infra/scripts/lab-up.sh                                  # vulnerable rev
#   LAB_REVISION=lab-v2-patched infra/scripts/lab-up.sh      # patched rev (replay)
#
# Honors: TARGET_LAB_IMAGE (prebuilt override), SOURCE_GIT_SHA.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
ROOT="$(hc_repo_root)"

hc_docker_available || hc_die "docker daemon unavailable"
hc_ensure_runner_network highcastle-runner || exit 1

LAB_REVISION="${LAB_REVISION:-lab-v1-vulnerable}"
export LAB_REVISION
case "$LAB_REVISION" in
  lab-v1-vulnerable|lab-v2-patched) ;;
  *) hc_die "LAB_REVISION must be lab-v1-vulnerable or lab-v2-patched" ;;
esac
export TARGET_LAB_IMAGE="${TARGET_LAB_IMAGE:-$(hc_lab_image_for_revision "$LAB_REVISION")}"
export SOURCE_GIT_SHA="${SOURCE_GIT_SHA:-$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo '')}"

hc_log "ensuring lab image $TARGET_LAB_IMAGE ($LAB_REVISION)"
if ! docker image inspect "$TARGET_LAB_IMAGE" >/dev/null 2>&1; then
  docker build --build-arg "LAB_REVISION=$LAB_REVISION" \
    --build-arg "SOURCE_GIT_SHA=$SOURCE_GIT_SHA" \
    -f "$ROOT/apps/target-lab/Dockerfile" -t "$TARGET_LAB_IMAGE" "$ROOT/apps/target-lab"
fi

hc_log "starting lab on internal network highcastle-runner (alias: target-lab)"
docker compose -f "$ROOT/infra/docker/deploy/compose.lab.yaml" up -d

hc_log "lab status:"
docker compose -f "$ROOT/infra/docker/deploy/compose.lab.yaml" ps
hc_log "reach it only from inside highcastle-runner, e.g.:"
printf '  docker run --rm --network highcastle-runner --entrypoint node %s -e \\\n' "$TARGET_LAB_IMAGE" >&2
printf '    "fetch(%q).then(r=>console.log(r.status))"\n' "http://target-lab:3000/health" >&2
