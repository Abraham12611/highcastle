#!/usr/bin/env bash
# provision-vm.sh — create the HighCastle control-plane VM on Vultr (L19).
#
# NO credentials are stored here. Authentication comes from the environment:
#   VULTR_API_KEY  — vultr-cli reads it (or an existing ~/.vultr-cli.yaml)
#
# Required env:
#   ADMIN_SSH_CIDR    CIDR allowed to reach tcp/22 (e.g. "203.0.113.10/32").
#                     The Vultr firewall group enforces it before UFW.
#   SSH key — one of:
#     VULTR_SSH_KEY_ID     existing vultr ssh key id
#     VULTR_SSH_KEY_NAME   name of an existing key (resolved via list)
#     VULTR_SSH_PUBKEY_FILE  local pubkey file to upload as "highcastle-admin"
#
# Optional env:
#   VULTR_REGION  default ewr | VULTR_PLAN default vc2-2c-4gb
#   VULTR_OS_ID   default 2284 (Ubuntu 24.04 LTS x64)
#   INSTANCE_LABEL / INSTANCE_HOSTNAME  defaults highcastle-control-1
#   WAIT_TIMEOUT_SECONDS  default 600
#
# This script CREATES BILLABLE RESOURCES. It prints the instance IP and the
# exact follow-up steps; it does not deploy the app (see deploy.sh).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

err()  { printf 'ERROR: %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }
info() { printf '==> %s\n' "$*" >&2; }

command -v vultr-cli >/dev/null 2>&1 || die "vultr-cli not installed"
vultr-cli account info >/dev/null 2>&1 || die "vultr-cli not authenticated — set VULTR_API_KEY or ~/.vultr-cli.yaml"

# json_first — first scalar value for a key at ANY depth on stdin. vultr-cli
# wraps single objects ({"instance": {...}}, {"firewall_group": {...}}), so a
# top-level `.id` lookup is not reliable.
json_first() {
  local key="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg k "$key" '[.. | objects | .[$k]? // empty | select(type != "object" and type != "array")][0] // ""'
  elif command -v python3 >/dev/null 2>&1; then
    # NB: script is passed via -c (not stdin) so the piped JSON stays readable.
    python3 -c "
import json, sys
key = sys.argv[1]
def find(o):
    if isinstance(o, dict):
        if key in o and not isinstance(o[key], (dict, list)):
            return o[key]
        for v in o.values():
            r = find(v)
            if r is not None:
                return r
    elif isinstance(o, list):
        for v in o:
            r = find(v)
            if r is not None:
                return r
    return None
r = find(json.load(sys.stdin))
print('' if r is None else r)
" "$key"
  else
    die "need jq or python3 to parse vultr-cli JSON output"
  fi
}

# ssh_key_id_by_name <json-array-doc> <name> — id of the key with that name.
ssh_key_id_by_name() {
  local json="$1" name="$2"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$json" | jq -r --arg n "$name" '[.ssh_keys[] | select(.name==$n) | .id][0] // ""'
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$json" | python3 -c \
      "import json,sys;ks=json.load(sys.stdin)['ssh_keys'];print(next((k['id'] for k in ks if k['name']==sys.argv[1]),''))" "$name"
  else
    die "need jq or python3 to parse vultr-cli JSON output"
  fi
}

REGION="${VULTR_REGION:-ewr}"
PLAN="${VULTR_PLAN:-vc2-2c-4gb}"
OS_ID="${VULTR_OS_ID:-2284}"
LABEL="${INSTANCE_LABEL:-highcastle-control-1}"
HOSTNAME="${INSTANCE_HOSTNAME:-$LABEL}"
TIMEOUT="${WAIT_TIMEOUT_SECONDS:-600}"

[[ -n "${ADMIN_SSH_CIDR:-}" ]] || die "ADMIN_SSH_CIDR required (e.g. 203.0.113.10/32) — do not open SSH to the world"
SSH_SUBNET="${ADMIN_SSH_CIDR%%/*}"
SSH_SIZE="${ADMIN_SSH_CIDR##*/}"
[[ "$SSH_SIZE" =~ ^[0-9]+$ ]] || SSH_SIZE=32

# --- 1. SSH key ---------------------------------------------------------------
SSH_KEY_ID="${VULTR_SSH_KEY_ID:-}"
if [[ -z "$SSH_KEY_ID" && -n "${VULTR_SSH_PUBKEY_FILE:-}" ]]; then
  [[ -f "$VULTR_SSH_PUBKEY_FILE" ]] || die "pubkey file not found: $VULTR_SSH_PUBKEY_FILE"
  info "uploading ssh key from $VULTR_SSH_PUBKEY_FILE"
  SSH_KEY_ID=$(vultr-cli ssh-key create --name "highcastle-admin" \
    --key "$(cat "$VULTR_SSH_PUBKEY_FILE")" -o json | json_first id)
fi
if [[ -z "$SSH_KEY_ID" && -n "${VULTR_SSH_KEY_NAME:-}" ]]; then
  SSH_KEY_ID=$(ssh_key_id_by_name "$(vultr-cli ssh-key list -o json)" "$VULTR_SSH_KEY_NAME")
fi
[[ -n "$SSH_KEY_ID" ]] || die "no SSH key — set VULTR_SSH_KEY_ID, VULTR_SSH_KEY_NAME or VULTR_SSH_PUBKEY_FILE"
info "using ssh key id: $SSH_KEY_ID"

# --- 2. firewall group ---------------------------------------------------------
info "creating firewall group highcastle-edge"
FW_GROUP=$(vultr-cli firewall group create --description "highcastle-edge" -o json | json_first id)
[[ -n "$FW_GROUP" ]] || die "firewall group creation failed"
info "firewall group: $FW_GROUP"

fw_rule() { # protocol port subnet size notes
  vultr-cli firewall rule create --id "$FW_GROUP" --ip-type v4 \
    --protocol "$1" --port "$2" --subnet "$3" --size "$4" --notes "$5" >/dev/null
}
fw_rule tcp 22  "$SSH_SUBNET" "$SSH_SIZE" "admin ssh only"
fw_rule tcp 80  "0.0.0.0" 0 "public http (ACME + redirect)"
fw_rule tcp 443 "0.0.0.0" 0 "public https"
fw_rule udp 443 "0.0.0.0" 0 "public https http/3"
info "firewall rules: ssh=$ADMIN_SSH_CIDR, 80/443 world"

# --- 3. instance ----------------------------------------------------------------
info "creating instance $LABEL ($PLAN, os $OS_ID, region $REGION)"
INSTANCE=$(vultr-cli instance create \
  --region "$REGION" --plan "$PLAN" --os "$OS_ID" \
  --label "$LABEL" --host "$HOSTNAME" \
  --ssh-keys "$SSH_KEY_ID" \
  --firewall-group "$FW_GROUP" \
  --userdata-file "$(pwd)/cloud-init.yaml" \
  --tags "highcastle,control-plane,hackathon" \
  -o json | json_first id)
[[ -n "$INSTANCE" ]] || die "instance creation failed"
info "instance id: $INSTANCE — waiting for active status"

deadline=$(( $(date +%s) + TIMEOUT ))
while :; do
  STATUS=$(vultr-cli instance get "$INSTANCE" -o json | json_first status)
  [[ "$STATUS" == "active" ]] && break
  (( $(date +%s) < deadline )) || die "timed out waiting for active (last status: $STATUS)"
  sleep 10
done

IP=$(vultr-cli instance get "$INSTANCE" -o json | json_first main_ip)
info "instance active: $IP"

cat <<EOF

=============================================================
HighCastle VM provisioned.
  instance : $INSTANCE ($LABEL)
  ip       : $IP
  plan     : $PLAN ($REGION)   os: $OS_ID
  fw group : $FW_GROUP (ssh <- $ADMIN_SSH_CIDR)

Next steps (no secrets anywhere near git):
  1. Point the demo domain's A record at $IP  (see ENVIRONMENT.md)
  2. ssh root@$IP   # cloud-init may still be running:
     cloud-init status --wait
  3. Clone the repo:   git clone <repo-url> /opt/highcastle
  4. Install secrets:  /etc/highcastle/{postgres,web,worker,migrate}.env
  5. cd /opt/highcastle && infra/vultr/deploy.sh
  6. infra/scripts/health-check.sh && infra/scripts/smoke-containment.sh
=============================================================
EOF
