#!/usr/bin/env bash
# 02-remote-prep.sh — VPS에 docker/git 등 기본 소프트웨어 설치 (멱등)

set -euo pipefail
: "${CUSTOMER_JSON:?}"

VPS_IP=$(jq -r '.vps.ip' "$CUSTOMER_JSON")
VPS_USER=$(jq -r '.vps.ssh_user // "root"' "$CUSTOMER_JSON")
VPS_PORT=$(jq -r '.vps.ssh_port // 22' "$CUSTOMER_JSON")

echo "• VPS 기본 준비 (docker, git, curl, jq, rsync)"

ssh -p "$VPS_PORT" "${VPS_USER}@${VPS_IP}" 'bash -s' <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

need_install=""
for pkg in docker.io docker-compose-plugin git curl jq rsync; do
  if ! dpkg -s "$pkg" >/dev/null 2>&1; then
    need_install="$need_install $pkg"
  fi
done

if [[ -n "$need_install" ]]; then
  echo "  installing:$need_install"
  apt-get update -y -qq
  apt-get install -y -qq $need_install
else
  echo "  all packages already installed"
fi

systemctl enable --now docker >/dev/null 2>&1 || true

mkdir -p /opt/teamstack
echo "  /opt/teamstack ready"

docker --version
docker compose version
REMOTE

echo "✅ 02-remote-prep PASS"
