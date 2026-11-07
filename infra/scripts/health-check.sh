#!/usr/bin/env bash
# health-check.sh — stack health probe for the deployed Compose stack (L19).
#
# Host-side checks (run on the Vultr VM inside the repo checkout):
#   * compose services running/healthy
#   * postgres pg_isready via compose exec
#   * target-lab /health probed from a client on the runner network
#   * highcastle-runner still internal + controller preconditions
#   * no overdue orphan sandbox runners (janitor surface check)
#   * public HTTPS /healthz through Caddy (when HIGHCASTLE_DOMAIN is set)
#
# What it deliberately does NOT check: Vultr inference reachability (needs the
# server-side key — the worker reports that itself), TLS cert validity beyond
# a curl success, and DB query correctness (covered by migrations/app tests).
#
# Exit 0 when everything checked is healthy, 1 on any failure. Skips are
# printed for components that aren't deployed (e.g. lab not running).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
ROOT="$(hc_repo_root)"
DEPLOY_DIR="$ROOT/infra/docker/deploy"
COMPOSE="docker compose -f $DEPLOY_DIR/compose.yaml"

FAIL=0
ok()   { hc_pass "$1"; }
bad()  { FAIL=$((FAIL+1)); hc_fail "$1"; }
note() { hc_skip "$1"; }

hc_docker_available || hc_die "docker daemon unavailable — run on the VM or a host with Docker"

echo "==> compose service status"
$COMPOSE ps 2>/dev/null || { hc_die "compose stack not running (docker compose -f compose.yaml ps failed)"; }

UNHEALTHY=$($COMPOSE ps --format '{{.Service}} {{.Health}}' 2>/dev/null \
  | awk '$2 != "" && $2 != "healthy" {print $1}')
if [[ -z "$UNHEALTHY" ]]; then
  ok "all healthchecked compose services report healthy"
else
  bad "unhealthy services: $UNHEALTHY"
fi

# Long-running services must be `running` (migrate legitimately exits 0).
for svc in caddy postgres web worker target-lab; do
  state=$($COMPOSE ps --format '{{.Service}} {{.State}}' 2>/dev/null | awk -v s="$svc" '$1==s{print $2}')
  if [[ "$state" == "running" ]]; then
    ok "$svc is running"
  else
    bad "$svc state=${state:-absent}"
  fi
done

echo "==> postgres"
if $COMPOSE exec -T postgres pg_isready -U "${POSTGRES_USER:-highcastle_app}" -d "${POSTGRES_DB:-highcastle}" >/dev/null 2>&1; then
  ok "postgres pg_isready"
else
  bad "postgres pg_isready failed"
fi

echo "==> target-lab (probed from inside highcastle-runner)"
if docker run --rm --network highcastle-runner --entrypoint node \
    highcastle/target-lab:lab-v1-vulnerable --input-type=module -e \
    'const r = await fetch("http://target-lab:3000/health",{signal:AbortSignal.timeout(4000)}).catch(()=>null);process.exit(r&&r.ok?0:1)' \
    >/dev/null 2>&1; then
  ok "target-lab /health reachable on runner network"
else
  note "target-lab unreachable — lab not deployed or wrong revision (check: docker compose ps)"
fi

echo "==> runner network posture"
INTERNAL=$(docker network inspect highcastle-runner --format '{{.Internal}}' 2>/dev/null || echo 'missing')
[[ "$INTERNAL" == "true" ]] && ok "highcastle-runner is internal" \
                            || bad "highcastle-runner internal=$INTERNAL — controller will refuse to launch"

echo "==> orphan sandbox runners"
NOW=$(date +%s)
ORPHANS=$(docker ps -a --filter "label=highcastle.managed-by=l14-sandbox-controller" \
  --format '{{.Names}} {{.Label "highcastle.expires-at"}}' \
  | awk -v now="$NOW" '$2 != "" && $2+0 < now {print $1}')
if [[ -z "$ORPHANS" ]]; then
  ok "no overdue managed runner containers"
else
  bad "overdue orphan runners: $ORPHANS — run: node packages/sandbox/dist/cli.js reap"
fi

if [[ -n "${HIGHCASTLE_DOMAIN:-}" ]]; then
  echo "==> public HTTPS through Caddy"
  CODE=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "https://${HIGHCASTLE_DOMAIN}/healthz" 2>/dev/null || echo '000')
  [[ "$CODE" == "200" ]] && ok "https://${HIGHCASTLE_DOMAIN}/healthz -> 200" \
                         || bad "https://${HIGHCASTLE_DOMAIN}/healthz -> $CODE"
else
  note "HIGHCASTLE_DOMAIN unset — public HTTPS check skipped"
fi

echo
if (( FAIL == 0 )); then
  echo "ALL CHECKS HEALTHY"
else
  echo "$FAIL CHECK(S) FAILED" >&2
fi
exit $((FAIL > 0))
