#!/usr/bin/env bash
# 04-mailboxes.sh — mail-01에 AI 3명의 메일박스 생성 (멱등)
# 생성된 비밀번호는 $STAGING_DIR/mail-passwords.json 에 저장 (0600).
# mail_server.enabled=false면 통째로 스킵.

set -euo pipefail
: "${CUSTOMER_JSON:?}"
: "${STAGING_DIR:?}"

MAIL_ENABLED=$(jq -r '.mail_server.enabled // false' "$CUSTOMER_JSON")
if [[ "$MAIL_ENABLED" != "true" ]]; then
  echo "• mail_server.enabled=false → 메일박스 생성 스킵"
  echo "✅ 04-mailboxes SKIP"
  exit 0
fi

MAIL_HOST=$(jq -r '.mail_server.host' "$CUSTOMER_JSON")
MAIL_USER=$(jq -r '.mail_server.ssh_user // "root"' "$CUSTOMER_JSON")
MAIL_DOMAIN=$(jq -r '.mail_server.domain // "teamver.online"' "$CUSTOMER_JSON")

LOCALS=$(jq -r '.ai_employees | .coordinator.email_local, .writer.email_local, .reviewer.email_local' "$CUSTOMER_JSON")

PW_FILE="${STAGING_DIR}/mail-passwords.json"
if [[ -f "$PW_FILE" ]]; then
  echo "• 기존 mail-passwords.json 재사용"
else
  echo "{}" > "$PW_FILE"
  chmod 600 "$PW_FILE"
fi

ensure_mailbox() {
  local local_part="$1"
  local addr="${local_part}@${MAIL_DOMAIN}"

  # 이미 있으면 skip (비밀번호는 기존 값이 json에 있어야 함, 없으면 경고만)
  if ssh "${MAIL_USER}@${MAIL_HOST}" \
       "docker exec mailserver setup email list 2>/dev/null | grep -q \"$addr\""; then
    echo "  $addr 이미 존재 — skip 생성"
    if ! jq -e --arg a "$addr" '.[$a]' "$PW_FILE" >/dev/null 2>&1; then
      echo "  ⚠️  비밀번호 로컬에 없음 (기존 mailbox). 필요시 setup email update로 재설정하세요."
    fi
    return
  fi

  local pw
  pw=$(openssl rand -base64 18 | tr -d '\n/+=')
  echo "  $addr 신규 생성"
  ssh "${MAIL_USER}@${MAIL_HOST}" \
      "docker exec mailserver setup email add '$addr' '$pw'" >/dev/null
  jq --arg a "$addr" --arg p "$pw" '. + {($a): $p}' "$PW_FILE" > "${PW_FILE}.new"
  mv "${PW_FILE}.new" "$PW_FILE"
  chmod 600 "$PW_FILE"
}

while read -r lp; do
  [[ -z "$lp" ]] && continue
  ensure_mailbox "$lp"
done <<< "$LOCALS"

echo "• 메일박스 비밀번호 저장: $PW_FILE"
echo "✅ 04-mailboxes PASS"
