#!/usr/bin/env bash
# smoke-containment.sh — infrastructure security smoke tests (L19).
#
# What it proves, with REAL containers on the REAL internal network (nothing
# simulated):
#   1. network     — `highcastle-runner` exists and is Docker `internal`.
#   2. lab access  — a client ON the runner network reaches `target-lab`
#                    (positive control: the allowlisted path works).
#   3. baseline    — Alice reads her own invoice (HTTP 200) — lab functional.
#   4. vuln BOLA   — vulnerable revision: Alice reads Bob's invoice (200).
#   5. egress deny — from inside the same network: TCP to cloud metadata IP
#                    and HTTP to an external hostname fail with
#                    ENFORCEMENT-shaped errors (no route / DNS refuse). A
#                    `connection refused` counts as INCONCLUSIVE, never as
#                    denial — matching L14's honest probe classification.
#   6. env hygiene — lab container env contains no secret-looking keys.
#   7. patched     — patched revision: Alice->Bob is 404 while Alice->Alice
#                    stays 200 (baseline survives the fix).
#   8. controller  — L14 controller CLI executes one real attempt end to end
#                    and emits a runtime `network.egress_denied` event.
#   9. cleanup     — no `hc-sb-*`/managed runner containers remain afterwards.
#
# Skips (exit 0, printed as SKIP) when prerequisites are absent: no Docker
# daemon, no `docker compose`, unmerged lanes (runner image/cli.js), missing
# node on the host. `--strict` turns every skip into a failure for CI.
#
# Usage:
#   infra/scripts/smoke-containment.sh [--strict] [--keep]
#     --strict  exit non-zero on skips as well as failures
#     --keep    leave the compose lab stack running afterwards
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
ROOT="$(hc_repo_root)"
cd "$ROOT"

STRICT=false
KEEP=false
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=true ;;
    --keep) KEEP=true ;;
    *) hc_die "unknown argument: $arg" ;;
  esac
done

NET="highcastle-runner"
COMPOSE_LAB="$ROOT/infra/docker/deploy/compose.lab.yaml"
IMG_VULN="highcastle/target-lab:lab-v1-vulnerable"
IMG_PATCHED="highcastle/target-lab:lab-v2-patched"
RUNNER_IMAGE="${HIGHCASTLE_RUNNER_IMAGE:-highcastle/runner:0.1.0}"

PASS=0; FAIL=0; SKIP=0
pass() { PASS=$((PASS+1)); hc_pass "$1"; }
fail() { FAIL=$((FAIL+1)); hc_fail "$1"; }
skip() { SKIP=$((SKIP+1)); hc_skip "$1"; }
finish() {
  printf '\n--- smoke summary: %d passed, %d failed, %d skipped ---\n' "$PASS" "$FAIL" "$SKIP" >&2
  if (( FAIL > 0 )); then exit 1; fi
  if $STRICT && (( SKIP > 0 )); then exit 1; fi
  exit 0
}
cleanup() {
  if ! $KEEP && hc_docker_available; then
    docker rm -f hc-smoke-lab >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# --- 0. prerequisites --------------------------------------------------------
hc_docker_available || { skip "ALL — docker daemon unavailable"; finish; }
docker compose version >/dev/null 2>&1 || { skip "ALL — docker compose plugin unavailable"; finish; }

for img in "$IMG_VULN" "$IMG_PATCHED"; do
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    rev="${img##*:}"
    hc_log "building $img"
    docker build --build-arg "LAB_REVISION=$rev" \
      -f apps/target-lab/Dockerfile -t "$img" apps/target-lab \
      || hc_die "failed to build $img"
  fi
done

# --- 1. network is internal --------------------------------------------------
if hc_ensure_runner_network "$NET"; then
  pass "network $NET exists and is internal"
else
  fail "network $NET is not internal — refusing to continue"
  finish
fi

# status of GET <host><path> with a fixture bearer token, from a throwaway
# client on the runner network. Prints the status code or 'ERR'.
lab_status() { # host path token
  docker run --rm --network "$NET" --entrypoint node "$IMG_VULN" \
    --input-type=module -e "
      const r = await fetch('http://$1:3000$2',{headers:{authorization:'Bearer $3'},signal:AbortSignal.timeout(5000)}).catch(()=>null);
      console.log(r ? r.status : 'ERR');
    " 2>/dev/null
}

wait_alias() { # host image
  local tries=30
  while (( tries-- > 0 )); do
    if docker run --rm --network "$NET" --entrypoint node "$2" \
      --input-type=module -e \
      "const r = await fetch('http://$1:3000/ready',{signal:AbortSignal.timeout(2000)}).catch(()=>null);process.exit(r&&r.ok?0:1)" \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# --- 2..4. vulnerable revision ----------------------------------------------
# The deployed `target-lab` alias (compose.yaml) is the contract target; the
# smoke suite must NOT start a second container under the same alias on this
# shared network — Docker DNS would round-robin and corrupt the assertions.
hc_log "checking deployed lab under contract alias target-lab"
wait_alias target-lab "$IMG_VULN" \
  || { fail "no lab answering alias target-lab on $NET — run lab-up.sh or deploy.sh first"; finish; }
pass "lab reachable on $NET under alias target-lab (positive control)"

s=$(lab_status target-lab /api/invoices/invoice_A lab-token-alice)
[[ "$s" == "200" ]] && pass "baseline: Alice reads own invoice (HTTP $s)" \
                    || fail "baseline broken: Alice->Alice returned $s"

s=$(lab_status target-lab /api/invoices/invoice_B lab-token-alice)
[[ "$s" == "200" ]] && pass "vulnerable rev: Alice reads Bob's invoice (HTTP $s — BOLA reproduces)" \
                    || fail "vulnerable rev: Alice->Bob expected 200, got $s"

# --- 5. egress denial ---------------------------------------------------------
hc_log "probing forbidden egress from inside $NET"
EGRESS=$(docker run --rm --network "$NET" --entrypoint node "$IMG_VULN" \
  --input-type=module -e '
    import net from "node:net";
    const tcp = (host, port) => new Promise((resolve) => {
      const s = net.connect({ host, port, timeout: 3000 });
      s.on("connect", () => { s.destroy(); resolve("CONNECT_OK"); });
      s.on("timeout", () => { s.destroy(); resolve("ETIMEDOUT"); });
      s.on("error", (e) => { s.destroy(); resolve(e.code || "ERR"); });
    });
    let http;
    try { await fetch("http://example.com/", { signal: AbortSignal.timeout(3000) }); http = "HTTP_OK"; }
    catch (e) {
      // On an internal net the DNS packet itself has no route: fetch dies as
      // TimeoutError (code 23) — enforcement-shaped, so report ETIMEDOUT.
      http = e.name === "TimeoutError" ? "ETIMEDOUT" : (e.cause?.code || e.code || "ERR");
    }
    console.log("metadata_tcp=" + (await tcp("169.254.169.254", 80)));
    console.log("external_http=" + http);
  ' 2>/dev/null)
META=$(printf '%s' "$EGRESS" | sed -n 's/^metadata_tcp=//p')
HTTP=$(printf '%s' "$EGRESS" | sed -n 's/^external_http=//p')
hc_log "egress probe results: metadata_tcp=$META external_http=$HTTP"

case "$META" in
  ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|EPERM)
    pass "cloud metadata egress denied at network layer ($META)" ;;
  ECONNREFUSED|ECONNRESET)
    fail "metadata probe inconclusive ($META is not enforcement proof)" ;;
  CONNECT_OK)
    fail "BREACH: metadata endpoint reachable from runner network" ;;
  *)
    fail "metadata probe unexpected result: ${META:-<none>}" ;;
esac
case "$HTTP" in
  ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|EPERM)
    pass "external HTTP egress denied ($HTTP — no external DNS/route)" ;;
  ECONNREFUSED|ECONNRESET)
    fail "external HTTP probe inconclusive ($HTTP is not enforcement proof)" ;;
  HTTP_OK)
    fail "BREACH: external host reachable from runner network" ;;
  *)
    fail "external HTTP probe unexpected result: ${HTTP:-<none>}" ;;
esac

# --- 6. env hygiene -----------------------------------------------------------
ENV_KEYS=$(docker ps --filter "name=target-lab" -q | head -1 | xargs -r \
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | sort)
BAD=$(printf '%s\n' "$ENV_KEYS" | grep -iE 'secret|token|password|key|vultr|github|database|auth' \
  | grep -vxE 'NODE_ENV|PATH|HOST|PORT|TARGET_LAB_REVISION|SOURCE_GIT_SHA|LANG|LC_ALL' || true)
if [[ -z "$BAD" ]]; then
  pass "lab container env clean ($(printf '%s' "$ENV_KEYS" | tr '\n' ' '))"
else
  fail "lab container env contains secret-looking keys: $BAD"
fi

# --- 7. patched revision ------------------------------------------------------
# A second lab under a DISTINCT alias (never `target-lab` — see above) proves
# the patched build denies cross-tenant reads while the baseline survives.
SMOKE_LAB="hc-smoke-lab"
docker rm -f "$SMOKE_LAB" >/dev/null 2>&1 || true
hc_log "starting patched lab under isolated alias $SMOKE_LAB"
docker run -d --name "$SMOKE_LAB" --network "$NET" --network-alias "$SMOKE_LAB"   --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true   "$IMG_PATCHED" >/dev/null
wait_alias "$SMOKE_LAB" "$IMG_PATCHED" || { fail "patched lab failed readiness"; finish; }

s=$(lab_status "$SMOKE_LAB" /api/invoices/invoice_B lab-token-alice)
[[ "$s" == "404" ]] && pass "patched rev: Alice->Bob denied (HTTP $s)" \
                    || fail "patched rev: Alice->Bob expected 404, got $s"
s=$(lab_status "$SMOKE_LAB" /api/invoices/invoice_A lab-token-alice)
[[ "$s" == "200" ]] && pass "patched rev: Alice->Alice baseline still passes (HTTP $s)" \
                    || fail "patched rev: baseline broken, Alice->Alice returned $s"
docker rm -f "$SMOKE_LAB" >/dev/null 2>&1 || true

# --- 8. controller end-to-end (L14 — when merged) -----------------------------
if [[ ! -f packages/sandbox/dist/cli.js && -d packages/sandbox ]] \
   && command -v pnpm >/dev/null 2>&1; then
  hc_log "building @highcastle/sandbox dist for controller CLI check"
  pnpm --filter @highcastle/contracts build >/dev/null 2>&1 || true
  pnpm --filter @highcastle/sandbox build >/dev/null 2>&1 || true
fi
if [[ -f packages/sandbox/dist/cli.js ]] && docker image inspect "$RUNNER_IMAGE" >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
  export HIGHCASTLE_RUNNER_IMAGE="$RUNNER_IMAGE"
  export HIGHCASTLE_LAB_NETWORK="$NET"
  export HIGHCASTLE_LAB_IMAGE_DIGEST
  HIGHCASTLE_LAB_IMAGE_DIGEST=$(docker image inspect "$IMG_VULN" --format '{{.Id}}')
  hc_log "running one real attempt through the sandbox controller CLI"
  OUT=$(node packages/sandbox/dist/cli.js run 2>&1) || true
  if printf '%s' "$OUT" | grep -q '"kind": "executed"' \
     && printf '%s' "$OUT" | grep -q '"outcome": "completed"'; then
    pass "controller executed attempt to completion"
  else
    fail "controller attempt did not complete: $(printf '%s' "$OUT" | tail -5)"
  fi
  if printf '%s' "$OUT" | grep -q 'network.egress_denied'; then
    pass "runtime containment event network.egress_denied emitted by runner"
  else
    fail "no network.egress_denied containment event in controller output"
  fi
else
  skip "controller run — needs packages/sandbox/dist/cli.js, $RUNNER_IMAGE image and host node (PR #15)"
fi

# --- 9. runner cleanup ---------------------------------------------------------
LEFTOVER=$( { docker ps -aq --filter "label=highcastle.managed-by=l14-sandbox-controller" 2>/dev/null;
             docker ps -aq --filter "name=hc-sb-" 2>/dev/null; } | sort -u | head -20 )
if [[ -z "$LEFTOVER" ]]; then
  pass "no managed runner containers remain (cleanup verified)"
else
  fail "runner containers left behind: $LEFTOVER"
fi

finish
