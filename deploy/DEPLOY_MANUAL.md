# Teamstack 배포 매뉴얼 (DEPLOY_MANUAL.md)

> **이 문서의 독자**: 판매자의 노트북에서 동작하는 AI 비서(Claude 등). 이 문서 하나와 `deploy/` 디렉토리만 있으면 새 Hostinger VPS에 Teamstack 전체 스택을 처음부터 끝까지 설치 가능하도록 설계됨.
> **이전 세션의 기억 없음**을 전제로 작성되었다. 필요한 모든 정보는 이 문서와 같은 저장소 안에 있다.

---

## 0. 이 문서의 사용법

판매자가 "새 VPS IP x.x.x.x를 받았다. 설치해라"라고 지시하면, 당신은 다음을 수행한다:

1. 이 매뉴얼을 처음부터 끝까지 **읽는다**.
2. §2의 필수 정보를 **판매자에게 대화로 질문**하여 빠짐없이 수집한다.
3. §3의 JSON을 채워 파일로 쓴다.
4. §5의 `deploy.sh`를 실행한다.
5. §6으로 결과를 판매자에게 보고한다.

**중요한 규칙**:
- JSON에 필수 값이 하나라도 빠지면 절대 실행하지 말고 판매자에게 되물어라.
- `deploy.sh`는 멱등이다. 실패 시 원인 해결 후 같은 명령을 재실행하면 된다. 절대 수동 SSH로 원격을 직접 수정하지 마라 — 재현성이 깨진다.
- 테스트 계정을 DB에 seed하지 마라. **DB는 3 봇만 시드된 상태로 배포되며, 첫 사람 가입자가 admin 권한을 갖는다**.

---

## 1. 사전 요구 (노트북 쪽)

이 저장소가 클론된 판매자 노트북에 다음이 있어야 한다. 부족한 게 있으면 설치 후 진행한다.

| 요구 | 확인 명령 | 부족하면 |
|---|---|---|
| `ssh` | `command -v ssh` | (표준 Linux 기본 포함) |
| `rsync` | `command -v rsync` | `sudo apt install rsync` |
| `jq` | `command -v jq` | `sudo apt install jq` |
| `openssl` | `command -v openssl` | 기본 포함 |

판매자 노트북의 `~/.ssh/id_ed25519` 공개키가 대상 VPS의 `/root/.ssh/authorized_keys`에 등록되어 있어야 한다. (Hostinger 콘솔에서 VPS 생성 시 SSH 키 선택하거나, 생성 직후 `ssh-copy-id` 수동 등록)

또한 저장소 루트(`/home/sangmin/projects/openclaw/try3/`)에 있는 **INFRA.md** 는 판매자 공용 자산 정보(메일 서버 IP, SSH 키 정보)를 담고 있다. 값이 필요할 때 참조한다. 단 **INFRA.md 자체는 커밋되지 않는다** — 거기서 읽기만.

---

## 2. 판매자에게 질문해서 수집할 정보

`deploy/customer.example.json`이 스키마이자 템플릿이다. 다음을 판매자에게 하나씩 묻고 기록한다. 판매자가 "기본값으로 해"라고 답하면 우측 기본값을 채운다.

### 2.1 고객사 기본

| 질문 | 필수 | 기본 |
|---|---|---|
| 고객사 식별자 (영소문자·숫자·하이픈, 예: `acme`) | ✅ | 없음 |
| 고객사 표시 이름 (예: `Acme Corp`) | ✅ | 없음 |

### 2.2 VPS

| 질문 | 필수 | 기본 |
|---|---|---|
| VPS IPv4 | ✅ | 없음 |
| SSH user | ⬜ | `root` |
| SSH port | ⬜ | `22` |

### 2.3 AI 직원 3명 (조율자/작성자/검수자 슬롯 각각)

각 슬롯에 대해 묻는다:

| 질문 | 예 |
|---|---|
| 이름 | `김상무` / `김부장` / `김과장` |
| 직함 | `상무` / `부장` / `과장` |
| 이메일 local (`@` 앞부분, 고객사 prefix 포함) | `acme-kim-coordinator` |
| LLM 모델 (기본 `anthropic/claude-haiku-4-5`) | 아래 허용 목록 참고 |
| 맞춤 프롬프트 (고객사 특수 지시, 없으면 빈 문자열) | `"Acme Corp는 B2B SaaS 회사..."` |

**허용 LLM 모델** (OpenRouter 라우팅 기준):
- `anthropic/claude-haiku-4-5` (빠름·저렴·기본)
- `anthropic/claude-sonnet-4-5`
- `anthropic/claude-opus-4-6`
- `openrouter/xiaomi/mimo-v2-pro` (저렴)

3명이 같은 모델일 필요는 없다. 조율자만 더 강한 모델을 쓰는 식도 OK.

### 2.4 시크릿

| 질문 | 필수 | 참고 |
|---|---|---|
| OpenRouter API 키 (고객사 별도 키) | ✅ | `sk-or-v1-...` |
| Anthropic API 키 (OpenRouter로 충분하면 빈 값) | ⬜ | `sk-ant-...` |

**중요**: 시크릿은 **고객사 별도 키**가 원칙이다. 판매자 공용 키를 사용하려는 경우 판매자에게 명시적 확인을 받아라.

### 2.5 메일 서버 (mail-01)

| 질문 | 기본 |
|---|---|
| 메일박스 자동 생성? | `true` (판매자의 mail-01에 AI 3명의 메일박스 생성) |
| 메일 서버 IP | INFRA.md 참조 (현재: `72.62.246.21`) |
| 메일 도메인 | `teamver.online` |

판매자가 메일박스 생성을 원치 않으면 `mail_server.enabled = false`로 설정. 그러면 이메일 local만 사용되고 실제 mail-01에는 아무것도 안 만든다.

---

## 3. JSON 파일 작성

수집한 정보로 customer JSON을 만든다. 위치는 임의 — 관례상 `/tmp/teamstack-deploy/<customer-id>.json` 또는 저장소 밖 별도 경로.

**템플릿**:
```bash
cp /path/to/teamver-agent/deploy/customer.example.json /tmp/teamstack-deploy/<customer-id>.json
# 편집기로 값 채움
```

**중요 필드 확인 사항**:
- `vps.ip` 에 `REQUIRED-put-ipv4-here` 같은 placeholder가 남아있으면 안 됨.
- `secrets.openrouter_api_key` 는 반드시 채워짐.
- `ai_employees.*.email_local` 은 3개 모두 서로 달라야 한다. 고객사 prefix 포함 권장 (예: `acme-kim-coordinator`).
- `customer.id` 는 `^[a-z0-9][a-z0-9-]{1,31}$` 만족.

---

## 4. 검증만 먼저 해보기 (선택, 권장)

`01-validate.sh` 만 단독 실행해 입력이 올바른지 확인:

```bash
cd /path/to/teamver-agent
CUSTOMER_JSON=/tmp/teamstack-deploy/acme.json bash deploy/lib/01-validate.sh
```

기대 출력: `✅ 01-validate PASS`. 실패하면 오류 메시지대로 JSON을 수정.

---

## 5. 배포 실행

```bash
cd /path/to/teamver-agent
./deploy/deploy.sh /tmp/teamstack-deploy/acme.json
```

예상 소요 시간: **5~15분**. 단계별 소요:

| 스텝 | 내용 | 시간 |
|---|---|---|
| 01-validate | 입력·툴·SSH 도달성 확인 | 10초 |
| 02-remote-prep | VPS에 docker·git 등 apt install | 1~3분 (첫 배포만) |
| 03-render-configs | 로컬에서 .env 렌더링 + 시크릿 생성 | 1초 |
| 04-mailboxes | mail-01에 3 메일박스 생성 | 10~30초 |
| 05-upload-and-up | rsync + docker compose up --build | 3~8분 (이미지 빌드) |
| 06-verify | 헬스체크 + 3 봇 online 확인 | 20~60초 |

## 6. 성공 시 보고 포맷

`06-verify.sh` 끝에서 요약이 출력된다. 판매자에게 그대로 전달:

```
✅ 배포 완료: Acme Corp (acme)

  Frontend: http://<VPS_IP>:3100
  Backend:  http://<VPS_IP>:3101

  AI 직원 3명 온라인:
    • 김상무 (조율자)
    • 김부장 (작성자)
    • 김과장 (검수자)

  첫 가입자가 admin 권한을 가집니다. 고객에게 URL을 전달하세요.
```

추가로 판매자에게 알릴 것:
- 고객에게 안내할 첫 접속 URL (frontend)
- 생성된 시크릿 저장 위치: `deploy/staging/<customer-id>/secrets.json`, `mail-passwords.json` (0600 권한)
- 메일박스 생성된 경우: 3개 주소

---

## 7. 실패 케이스별 대응

### 7.1 01-validate 실패

대부분 JSON 오타 또는 필수 필드 누락. 메시지대로 고쳐 재실행.

`SSH 접속 불가`가 나오면:
- Hostinger 콘솔에서 VPS가 실제로 running 상태인지 확인
- SSH 공개키가 등록됐는지 `ssh -p <port> <user>@<ip>` 수동 테스트
- 방화벽/보안 그룹이 22 포트 열려있는지

### 7.2 02-remote-prep 실패

apt 저장소가 어쩌다 일시 다운됐을 수 있음. 1~2분 후 재시도.

### 7.3 04-mailboxes 실패

- mail-01(72.62.246.21) SSH 접속 불가: INFRA.md의 SSH 키 경로 확인, 판매자 노트북의 `~/.ssh/id_ed25519` 공개키가 mail-01에 등록됐는지 확인.
- 메일박스 이미 존재: 무시해도 됨 (04 스크립트가 skip 처리). 단 기존 mailbox의 비밀번호를 모르면 필요시 판매자에게 재설정 여부 확인 (`docker exec mailserver setup email update`).
- 메일박스 생성을 지금 건너뛰고 싶으면: JSON의 `mail_server.enabled=false`로 바꾸고 재실행.

### 7.4 05-upload-and-up 실패

- `docker compose up` 중 이미지 빌드 OOM: VPS 메모리 2GB 미만이면 위험. 4GB 이상 권장. Hostinger 플랜 업그레이드 고려.
- 포트 충돌: 3100/3101이 VPS에서 이미 사용 중이면 JSON의 `ports`를 변경 후 재실행.
- `permission denied`: rsync 대상 `/opt/teamstack/` 소유권 확인. 원격에서 `sudo chown -R root:root /opt/teamstack` 후 재시도.

### 7.5 06-verify 실패

- `backend health 폴링 실패`: VPS에서 `docker logs ta-backend --tail 40` 확인. DB 연결 실패, JWT_SECRET 문제, Postgres 초기화 지연 등 가능성.
- `봇 socket 연결 실패`: `docker logs ta-ai-coordinator --tail 40` 확인. 대부분 backend가 아직 안 떴거나 `BOT_EMAIL / BOT_PASSWORD` 불일치. `.env`와 DB seed의 BOT_PASSWORD가 일치해야 함 — 이 스크립트는 매번 같은 값을 쓰도록 설계돼 있어 평상시엔 안 나는 문제.
- DB seed 이름 불일치: 이전 배포의 볼륨이 남아있어 기존 값이 보일 수 있음. 새 고객 VPS라면 있을 수 없는 현상. 의심되면 VPS에서 `docker compose down -v` 후 재배포 (⚠️ 데이터 삭제됨).

---

## 8. 중단·재시도 원칙

- 중간 실패 시 재실행하면 이전 성공 스텝은 **skip**된다 (멱등).
- 시크릿(JWT·Postgres·bot 비밀번호)은 `staging/<customer-id>/secrets.json`에 최초 생성 시 저장되어 재시도 때 **재사용**된다. 이 파일을 삭제하면 다음 실행에서 새 시크릿이 생성되어 기존 배포와 불일치 발생. 삭제 금지.
- `deploy.sh`를 Ctrl-C로 중단해도 안전. 다시 실행하면 이어서.

---

## 9. 성공 후 판매자가 해야 할 수동 액션

1. 첫 관리자 계정 생성: 브라우저로 `http://<VPS_IP>:3100` 접속 → 회원가입 → 첫 가입자가 자동으로 admin
2. 고객에게 접속 URL 전달 (메일 또는 메신저)
3. (선택) 도메인 연결: Porkbun에서 A 레코드 `acme.teamver.app → VPS_IP` 추가. 프론트의 `NEXT_PUBLIC_API_URL`도 함께 변경 후 재배포.
4. (선택) TLS: Caddy·nginx 등 리버스 프록시로 443 제공. 이 매뉴얼의 현재 버전은 http-only.

---

## 10. 테스트 위생 (이 원칙 반드시 지킬 것)

- **테스트 계정을 DB에 영구 시드하지 마라**. `backend/src/services/db.ts`의 seed는 오직 3 봇만 있어야 한다.
- 기능 검증을 위해 임시 사용자가 필요하면 `probe-<timestamp>@local` 같은 **ephemeral 이메일**로 등록 → 테스트 → `DELETE /auth/me`로 즉시 삭제.
- 브라우저로 검증할 때 판매자 본인 계정으로 로그인하되, 배포 검증용 계정을 별도로 만들지 마라. 고객이 admin 권한을 가져야 한다.
- `deploy/staging/` 디렉토리는 민감 정보(시크릿) 포함. gitignore 되어있다. 다른 머신으로 옮길 필요 없으면 그대로 두고, 옮겨야 하면 암호화.

---

## 11. 파일·경로 요약

| 경로 | 용도 |
|---|---|
| `deploy/DEPLOY_MANUAL.md` | 이 문서 |
| `deploy/customer.example.json` | JSON 스키마/템플릿 |
| `deploy/deploy.sh` | 진입점 |
| `deploy/lib/01-validate.sh` ~ `06-verify.sh` | 단계 스크립트 |
| `deploy/templates/.env.tpl` | .env 템플릿 |
| `deploy/staging/<customer-id>/` | (로컬, 배포 시 생성) 시크릿·렌더된 .env |
| `/opt/teamstack/teamver-agent/` (VPS) | 원격 설치 경로 |

---

## 12. 다음 버전에서 추가될 것

- Caddy 리버스 프록시 + 자동 TLS
- 도메인 기반 라우팅 (`<customer>.teamver.app`)
- Shadow 에이전트 자동 기동 (감시·Slack ops)
- 백업 자동화 (일일 pg_dump)
- 롤링 업데이트 스크립트

---

*이 매뉴얼 v1.0. 배포 스크립트 변경 시 이 문서도 함께 갱신.*
