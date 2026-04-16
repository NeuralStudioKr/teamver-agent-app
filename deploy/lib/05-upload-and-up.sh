#!/usr/bin/env bash
# 05-upload-and-up.sh — 리포 + .env를 VPS:/opt/teamstack/teamver-agent로 업로드 + docker compose up

set -euo pipefail
: "${CUSTOMER_JSON:?}"
: "${STAGING_DIR:?}"
: "${REPO_ROOT:?}"

VPS_IP=$(jq -r '.vps.ip' "$CUSTOMER_JSON")
VPS_USER=$(jq -r '.vps.ssh_user // "root"' "$CUSTOMER_JSON")
VPS_PORT=$(jq -r '.vps.ssh_port // 22' "$CUSTOMER_JSON")

REMOTE_DIR=/opt/teamstack/teamver-agent

echo "• rsync 리포 → ${VPS_USER}@${VPS_IP}:${REMOTE_DIR}"
rsync -az --delete \
  -e "ssh -p $VPS_PORT -o StrictHostKeyChecking=accept-new" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='.next' \
  --exclude='dist' \
  --exclude='*-test.mjs' \
  --exclude='package.json' \
  --exclude='package-lock.json' \
  --exclude='deploy/staging' \
  "${REPO_ROOT}/" \
  "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/"

echo "• 렌더된 .env 업로드"
scp -P "$VPS_PORT" -o StrictHostKeyChecking=accept-new \
  "${STAGING_DIR}/.env" \
  "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/.env"

ssh -p "$VPS_PORT" "${VPS_USER}@${VPS_IP}" \
  "chmod 600 ${REMOTE_DIR}/.env"

echo "• docker compose up -d --build (원격)"
ssh -p "$VPS_PORT" "${VPS_USER}@${VPS_IP}" "bash -s" <<REMOTE
set -euo pipefail
cd ${REMOTE_DIR}
docker compose up -d --build 2>&1 | tail -20
REMOTE

echo "✅ 05-upload-and-up PASS"
