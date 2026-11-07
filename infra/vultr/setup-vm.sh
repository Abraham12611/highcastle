#!/usr/bin/env bash
# setup-vm.sh — idempotent host preparation for the HighCastle Vultr VM (L19).
#
# cloud-init.yaml already performs all of this at first boot; run this script
# on a hand-created instance, or re-run to reconcile drift. Safe to re-run.
# Requires root (or sudo). Ubuntu 24.04 target; adjust NODE_VERSION to re-pin.
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-v24.11.0}"
log() { printf '==> %s\n' "$*" >&2; }

[[ "$(id -u)" == "0" ]] || { echo "run as root (sudo $0)" >&2; exit 1; }

# --- packages -------------------------------------------------------------------
log "apt update + baseline packages"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg jq ufw unattended-upgrades

# --- Docker Engine ---------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker Engine from official apt repo"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker info >/dev/null

# --- host node toolchain (for controller CLI + pnpm builds; apps run in containers)
if ! node --version 2>/dev/null | grep -q "^v24\."; then
  log "installing node $NODE_VERSION (official tarball)"
  curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
  rm /tmp/node.tar.xz
fi
corepack enable && corepack prepare pnpm@10.34.9 --activate

# --- sshd hardening -----------------------------------------------------------------
cat > /etc/ssh/sshd_config.d/90-highcastle.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 4
EOF
systemctl reload ssh || systemctl reload sshd || true

# --- firewall (defense in depth under the Vultr firewall group) --------------------
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # the Vultr firewall group is the admin-CIDR restriction
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# --- layout --------------------------------------------------------------------------
install -d -m 0700 /etc/highcastle
install -d -m 0755 /opt/highcastle

log "host ready. Next: clone repo to /opt/highcastle, install /etc/highcastle/*.env, run infra/vultr/deploy.sh"
