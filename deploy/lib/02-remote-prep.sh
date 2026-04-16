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

# Docker·compose는 바이너리 존재 여부로 체크 (template 1121/docker-ce와
# Ubuntu 기본 docker.io 패키지 충돌 방지)
need_install=""
if ! command -v docker >/dev/null 2>&1; then
  need_install="$need_install docker.io"
fi
if ! docker compose version >/dev/null 2>&1; then
  # docker가 있고 compose plugin만 없는 경우 — 공식 docker-ce 환경이면
  # docker-compose-plugin 설치 시도. 실패해도 무시(docker-ce가 이미 포함한 경우)
  if command -v docker >/dev/null 2>&1; then
    apt-get install -y -qq docker-compose-plugin 2>/dev/null || true
  else
    need_install="$need_install docker-compose-plugin"
  fi
fi
for pkg in git curl jq rsync; do
  if ! dpkg -s "$pkg" >/dev/null 2>&1; then
    need_install="$need_install $pkg"
  fi
done

if [[ -n "$need_install" ]]; then
  echo "  installing:$need_install"
  apt-get update -y -qq
  apt-get install -y -qq $need_install
else
  echo "  all required tools already present"
fi

systemctl enable --now docker >/dev/null 2>&1 || true

mkdir -p /opt/teamstack
echo "  /opt/teamstack ready"

docker --version
docker compose version
REMOTE

echo "✅ 02-remote-prep PASS"
