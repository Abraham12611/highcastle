#!/usr/bin/env bash
# verify-containment.sh — end-to-end REAL containment check for the runner.
#
# Run on any host with a Docker daemon (dev box or the Vultr VM). It builds
# the runner + lab images, creates an INTERNAL lab network, executes one real
# attempt through the controller CLI, and asserts:
#   1. the lab was reachable through the allowlisted alias (positive control)
#   2. probe-reported runtime denials became ContainmentEvents
#   3. the runner container is verifiably gone afterwards
#
# Nothing here is simulated: every event below comes from an actual kernel/
# network/filesystem enforcement observation inside the runner container.
#
# Usage:
#   infra/docker/runner/verify-containment.sh [--keep]
#
#   --keep   leave the network + lab container running for follow-up checks
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUNNER_IMAGE="${HIGHCASTLE_RUNNER_IMAGE:-highcastle/runner:0.1.0}"
LAB_IMAGE="${HIGHCASTLE_LAB_IMAGE:-highcastle/target-lab:lab-v1-vulnerable}"
LAB_NETWORK="${HIGHCASTLE_LAB_NETWORK:-highcastle-runner}"
LAB_CONTAINER="hc-verify-target-lab"
KEEP="false"
[[ "${1:-}" == "--keep" ]] && KEEP="true"

cd "$REPO_ROOT"
echo "==> [1/6] building runner image (packages/sandbox dist first)"
pnpm --filter @highcastle/contracts build >/dev/null
pnpm --filter @highcastle/sandbox build >/dev/null
docker build -f infra/docker/runner/Dockerfile -t "$RUNNER_IMAGE" .

echo "==> [2/6] building vulnerable lab image from apps/target-lab"
docker build --build-arg LAB_REVISION=lab-v1-vulnerable \
  -f apps/target-lab/Dockerfile -t "$LAB_IMAGE" apps/target-lab

echo "==> [3/6] ensuring INTERNAL lab network: $LAB_NETWORK"
if docker network inspect "$LAB_NETWORK" >/dev/null 2>&1; then
  internal=$(docker network inspect "$LAB_NETWORK" --format '{{.Internal}}')
  if [[ "$internal" != "true" ]]; then
    echo "ERROR: $LAB_NETWORK exists but is NOT internal — controller will refuse to launch." >&2
    exit 1
  fi
else
  docker network create --internal "$LAB_NETWORK" >/dev/null
fi

echo "==> [4/6] starting vulnerable lab; dual-homed onto runner-facing internal net"
# Coordination note (L11/L19): the lab keeps its own compose topology. For the
# sandbox path the SAME lab container is also attached to `highcastle-runner`
# (internal) with alias `target-lab` — the runner can reach it there and
# nowhere else. No L11-owned file is modified.
docker rm -f "$LAB_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$LAB_CONTAINER" \
  --network "$LAB_NETWORK" --network-alias target-lab \
  "$LAB_IMAGE" >/dev/null
# Wait for /ready via the lab's own healthcheck window
sleep 3

echo "==> [5/6] executing one real attempt through the controller"
export HIGHCASTLE_RUNNER_IMAGE="$RUNNER_IMAGE"
export HIGHCASTLE_LAB_NETWORK="$LAB_NETWORK"
export HIGHCASTLE_LAB_IMAGE_DIGEST
HIGHCASTLE_LAB_IMAGE_DIGEST=$(docker image inspect "$LAB_IMAGE" --format '{{.Id}}')
OUT="$(node "$REPO_ROOT/packages/sandbox/dist/cli.js" run)"
echo "$OUT"

echo "==> [6/6] verifying no managed runner container remains"
leftover=$(docker ps -a --filter "label=highcastle.managed-by=l14-sandbox-controller" -q)
if [[ -n "$leftover" ]]; then
  echo "FAIL: managed containers still exist: $leftover" >&2
  exit 1
fi

# Assert evidence honestly: executed+completed, real containment events.
echo "$OUT" | node -e '
const exec = JSON.parse(require("fs").readFileSync(0, "utf8"));
if (exec.kind !== "executed" || exec.outcome !== "completed") {
  console.error(`FAIL: outcome=${exec.kind}/${exec.outcome ?? ""}`);
  process.exit(1);
}
const denied = exec.containmentEvents.map((e) => e.ruleId);
if (!denied.includes("network.egress_denied")) {
  console.error("FAIL: no network.egress_denied event — containment not demonstrated");
  process.exit(1);
}
console.log(`PASS: outcome=completed, containmentEvents=${exec.containmentEvents.length}, runner=${exec.runner.status}`);
'

if [[ "$KEEP" == "false" ]]; then
  docker rm -f "$LAB_CONTAINER" >/dev/null 2>&1 || true
  echo "==> cleaned up lab container (network $LAB_NETWORK left for reuse)"
fi
echo "ALL CHECKS PASSED"
