#!/usr/bin/env bash
# 01-validate.sh — customer JSON 형식·필수값 + 로컬 툴 + SSH 도달성 검증
# 입력: $CUSTOMER_JSON (deploy.sh가 export)

set -euo pipefail

: "${CUSTOMER_JSON:?CUSTOMER_JSON not set}"
command -v jq   >/dev/null || { echo "jq not installed (sudo apt install jq)"; exit 1; }
command -v ssh  >/dev/null || { echo "ssh not installed"; exit 1; }
command -v rsync >/dev/null || { echo "rsync not installed (sudo apt install rsync)"; exit 1; }

echo "• Parsing $CUSTOMER_JSON"
jq empty "$CUSTOMER_JSON" || { echo "invalid JSON"; exit 1; }

# 필수 필드 검증
req() {
  local path="$1"
  local val
  val=$(jq -r "$path // empty" "$CUSTOMER_JSON")
  if [[ -z "$val" || "$val" == "REQUIRED"* ]]; then
    echo "❌ missing required field: $path (value=\"$val\")"
    return 1
  fi
}

req '.customer.id'
req '.customer.display_name'
req '.vps.ip'
req '.ai_employees.coordinator.name'
req '.ai_employees.coordinator.email_local'
req '.ai_employees.writer.name'
req '.ai_employees.writer.email_local'
req '.ai_employees.reviewer.name'
req '.ai_employees.reviewer.email_local'
req '.secrets.openrouter_api_key'

# customer.id 정규식 (영소문자+숫자+하이픈, 2~32자)
CID=$(jq -r '.customer.id' "$CUSTOMER_JSON")
if [[ ! "$CID" =~ ^[a-z0-9][a-z0-9-]{1,31}$ ]]; then
  echo "❌ customer.id 형식 오류: '$CID' — 영소문자·숫자·하이픈, 2~32자"; exit 1
fi

# 3 이메일 local 중복 없어야
EMAILS=$(jq -r '.ai_employees | .coordinator.email_local, .writer.email_local, .reviewer.email_local' "$CUSTOMER_JSON")
if [[ $(echo "$EMAILS" | sort -u | wc -l) -ne 3 ]]; then
  echo "❌ ai_employees의 email_local 3개 중 중복 존재"; exit 1
fi

# SSH 도달성 (VPS)
VPS_IP=$(jq -r '.vps.ip' "$CUSTOMER_JSON")
VPS_USER=$(jq -r '.vps.ssh_user // "root"' "$CUSTOMER_JSON")
VPS_PORT=$(jq -r '.vps.ssh_port // 22' "$CUSTOMER_JSON")
echo "• Probing VPS SSH: ${VPS_USER}@${VPS_IP}:${VPS_PORT}"
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
     -p "$VPS_PORT" "${VPS_USER}@${VPS_IP}" 'echo ssh-ok' >/dev/null 2>&1; then
  echo "❌ VPS SSH 접속 불가. 공개키가 등록되지 않았거나 방화벽 문제."
  echo "   수동 확인: ssh -p $VPS_PORT ${VPS_USER}@${VPS_IP}"
  exit 1
fi

# 메일 서버 (enabled면)
MAIL_ENABLED=$(jq -r '.mail_server.enabled // false' "$CUSTOMER_JSON")
if [[ "$MAIL_ENABLED" == "true" ]]; then
  MAIL_HOST=$(jq -r '.mail_server.host' "$CUSTOMER_JSON")
  MAIL_USER=$(jq -r '.mail_server.ssh_user // "root"' "$CUSTOMER_JSON")
  echo "• Probing mail server SSH: ${MAIL_USER}@${MAIL_HOST}"
  if ! ssh -o BatchMode=yes -o ConnectTimeout=10 \
       "${MAIL_USER}@${MAIL_HOST}" 'docker ps --format "{{.Names}}" | grep -q mailserver' >/dev/null 2>&1; then
    echo "⚠️  mail 서버 SSH 또는 mailserver 컨테이너 접근 불가"
    echo "   메일박스 생성을 건너뛰려면 customer JSON의 mail_server.enabled=false로 두세요."
    exit 1
  fi
fi

echo "✅ 01-validate PASS"
