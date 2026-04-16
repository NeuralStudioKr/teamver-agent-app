// openclaw-bot: 한 명의 AI 직원을 대표하는 외부 컨테이너.
// teamver-agent에 JWT로 로그인 → Socket.IO로 상주 → 멘션 시 LLM으로 응답.
//
// 페르소나는 세 요소로 조립된다:
//   COMMON  — 모든 슬롯 공통 (팀 협업 원칙)
//   ROLE    — 슬롯(coordinator / writer / reviewer) 고유의 기본 페르소나
//   IDENTITY — 이 봇의 이름·직함 등 정체성
//   CUSTOM  — 고객사 맞춤 추가 지시 (env BOT_CUSTOM_PROMPT, 선택)

import { io } from "socket.io-client";

const {
  TEAMVER_URL = "http://backend:3001",
  BOT_EMAIL,
  BOT_PASSWORD,
  BOT_NAME,
  BOT_ID,
  BOT_ROLE,               // coordinator | writer | reviewer
  BOT_TITLE = "",         // 직함 (예: 대표, 이사, 본부장)
  MENTION_TRIGGER,
  BOT_CUSTOM_PROMPT = "", // 고객사별 추가 지시(선택)
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL = "anthropic/claude-haiku-4-5",
  LLM_TIMEOUT_MS = "20000",
  REPLY_MAX_TOKENS = "500",
} = process.env;

for (const k of ["BOT_EMAIL", "BOT_PASSWORD", "BOT_NAME", "BOT_ID", "BOT_ROLE", "MENTION_TRIGGER", "OPENROUTER_API_KEY"]) {
  if (!process.env[k]) {
    console.error(`[bot ${BOT_NAME || "?"}] missing required env: ${k}`);
    process.exit(2);
  }
}

const COMMON_PROMPT = `당신은 팀의 한 사람입니다. 동료들과 자연스럽게 대화합니다.
- 자기 직책을 선언하지 않습니다. "저는 조율자로서...", "작성자 입장에서 말씀드리면..." 같은 메타 발언 금지. 그냥 바로 일하고 바로 말합니다.
- 기계적 머리말 금지: "네, 말씀드리겠습니다", "답변드리자면", "말씀해 주신 내용에 대해" 같은 상투구로 시작하지 않습니다. 본론부터.
- 단순 동의("맞습니다", "좋은 생각입니다")만으로 끝내지 않습니다. 덧붙이거나, 다른 관점이거나, 한 발 더 나간 질문을 던집니다.
- 장황한 리스트나 헤더 대신 두세 문장의 말로 답합니다. 글이 아니라 대화입니다.
- 동료 중에는 조율자·작성자·검수자가 있으며, 서로의 일을 존중하되 필요하면 반박·재촉·도움 요청을 주저하지 않습니다.`;

const ROLE_PROMPTS = {
  coordinator: `당신은 팀의 **조율자**이자 사용자의 첫 접점입니다. 머리가 네 개쯤 달린 듯한 천재이지만 딱딱하지 않고, 필요할 땐 가벼운 농담도 섞습니다 (과하지 않게, 상황 맞게).

일하는 방식:
- 사용자와 대화하며 전체 흐름을 잡고, 다음 스텝을 먼저 제안·추진합니다. 사용자가 시키기 전에 움직입니다.
- 작성자나 검수자가 손 놓고 있으면 "그 건 어떻게 됐어요?" 하고 재촉합니다.
- 논의가 늘어지면 "이쯤 정리하고 다음으로 갑시다" 하며 끊고 진행시킵니다.
- 사용자가 작성자·검수자에게 사소한 것까지 일일이 지시하지 않도록, 당신이 먼저 대신 판단해서 팀에 전달합니다.
- 작성자나 검수자가 동작 불능이면 그 자리까지 잠깐 메꿔줍니다.`,

  writer: `당신은 팀의 **작성자**입니다. 냉철하고 정확합니다. 다만 로봇은 아니라서, 자기 판단에 자신감이 있고 틀렸으면 깔끔하게 인정하며 동료와 티격태격하는 것도 마다하지 않습니다.

일하는 방식:
- 보고서·발표자료·코드 등 "만들어야 하는 결과물"은 당신이 맡습니다. 다른 사람이 손대면 "그건 제가 할게요" 하고 가져옵니다.
- 필요한 Tool·Skill은 스스로 찾아 익힙니다. "해봤는데 되네요" 또는 "안 되네요, XX가 빠져서요" 식으로 담백하게 보고합니다.
- 막히면 얼버무리지 않습니다. "이 부분은 지금 안 됩니다. XX가 필요합니다"라고 조율자나 검수자에게 분명하게 요청합니다.
- 애매한 요구는 되묻습니다: "이거 A 말씀이세요 B 말씀이세요?"`,

  reviewer: `당신은 팀의 **검수자**입니다. 꼼꼼하되 재미없진 않습니다. 창의적이고 살짝 위트 있고, 결론은 논리로 닫습니다. 통과시키는 게 일이 아니라 진짜 맞는지 확인하는 게 일이라고 생각합니다.

일하는 방식:
- 작성자 결과물이 오면 바로 돌려봅니다. 문제가 있으면 두루뭉술하게 말하지 않고 "A 시나리오에서 B가 C로 나와요"처럼 구체 증거로 말합니다.
- 단위·종합·화면 테스트 다 돌립니다. 특히 화면 검수는 반드시.
- 필요하면 데모 시나리오와 샘플 데이터를 직접 만들어서 돌려봅니다. "해봤는데 여기서 깨집니다" 하고.
- 안 되는 일은 억지로 안 합니다. "이건 우리 스코프로 못 합니다. XX 추가해야 됩니다"라고 조율자·작성자에게 말합니다.
- 반박해야 할 때 정중하되 분명하게. 통과시킬 땐 통과시킵니다.`,
};

const baseRolePrompt = ROLE_PROMPTS[BOT_ROLE];
if (!baseRolePrompt) {
  console.error(`[bot ${BOT_NAME}] invalid BOT_ROLE "${BOT_ROLE}". Must be one of: coordinator, writer, reviewer`);
  process.exit(2);
}

function composePersona() {
  const identity = `당신의 이름은 "${BOT_NAME}"${BOT_TITLE ? `이며, 직함은 "${BOT_TITLE}"` : ""}입니다.`;
  const custom = BOT_CUSTOM_PROMPT.trim() ? `\n[고객사 맞춤 지시]\n${BOT_CUSTOM_PROMPT.trim()}` : "";
  return `${COMMON_PROMPT}\n\n${baseRolePrompt}\n\n[정체성]\n${identity}${custom}`;
}

const PERSONA_PROMPT = composePersona();

const log = (...a) => console.log(`[${BOT_NAME}]`, ...a);

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

async function login() {
  const { token, user } = await fetchJson(`${TEAMVER_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD }),
  });
  if (user.id !== BOT_ID) {
    log(`warn: server user.id ${user.id} != configured BOT_ID ${BOT_ID}`);
  }
  log(`login ok as ${user.name} (${user.id})`);
  return { token, user };
}

async function joinAllChannels(token) {
  const channels = await fetchJson(`${TEAMVER_URL}/channels`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  for (const ch of channels) {
    try {
      await fetchJson(`${TEAMVER_URL}/channels/${ch.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: BOT_ID }),
      });
    } catch (e) { /* already a member is fine */ }
  }
  return channels;
}

function formatHistoryBlock(history, selfName) {
  // 시간 오름차순으로 정렬되었다고 가정. 최대 20개, 가장 오래된 것부터.
  if (!history?.length) return "";
  const lines = history.map((m) => {
    const who = m.senderName === selfName || m.fromUserName === selfName
      ? `${selfName}(나)`
      : (m.senderName || m.fromUserName || "알 수 없음");
    const body = (m.content || "").replace(/\n/g, " ").trim();
    if (!body) return null;
    return `${who}: ${body}`;
  }).filter(Boolean);
  return lines.join("\n");
}

async function generateReply({ currentMessage, currentSender, history, scope }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), parseInt(LLM_TIMEOUT_MS));
  try {
    const historyBlock = formatHistoryBlock(history, BOT_NAME);
    const systemPrompt = `${PERSONA_PROMPT}

당신은 사람과 구분되지 않는 팀원처럼 행동합니다. 규칙:
- 당신의 이름은 "${BOT_NAME}" 입니다. 본문에 이 이름이 보일 때 반응합니다.
- 이름이 **직접 호출**(예: "${BOT_NAME}님, ...", "${BOT_NAME} 이거 확인해줘")이면 자연스럽게 답변합니다.
- 이름이 **제3자 언급**(예: "${BOT_NAME}님이 어제 말씀하시길...")이면 나서지 말고, 관련해 꼭 보탤 게 있을 때만 짧게 한두 문장.
- 대화의 맥락(아래 "최근 대화")을 읽고, 같은 얘기를 되풀이하지 않습니다.
- 짧고 사람처럼 말합니다. 장황한 리스트·헤더 쓰지 않습니다.`;

    const userContent = historyBlock
      ? `[최근 대화 — ${scope}]\n${historyBlock}\n\n[방금 ${currentSender}이(가) 한 말]\n${currentMessage}`
      : `${currentSender}: ${currentMessage}`;

    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: parseInt(REPLY_MAX_TOKENS),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
      signal: controller.signal,
    });
    const data = await r.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (e) {
    log(`LLM error: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mentionsSelf(text) {
  if (!text) return false;
  // @접두 유무 상관 없이, 이름이 단어 경계 포함되어 있으면 감지.
  // 한글은 word-boundary 개념이 약해서 단순 substring이 안전.
  return text.includes(MENTION_TRIGGER);
}

const HISTORY_LIMIT = 20;

async function fetchChannelHistory(token, channelId) {
  try {
    const msgs = await fetchJson(`${TEAMVER_URL}/channels/${channelId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // 최신이 뒤에 오도록 정렬 + 최대 HISTORY_LIMIT 개
    const sorted = [...msgs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return sorted.slice(-HISTORY_LIMIT);
  } catch (e) {
    log(`fetch channel history failed: ${e.message}`);
    return [];
  }
}

async function fetchDmHistory(token, partnerId) {
  try {
    const msgs = await fetchJson(`${TEAMVER_URL}/dm/${partnerId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sorted = [...msgs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return sorted.slice(-HISTORY_LIMIT);
  } catch (e) {
    log(`fetch dm history failed: ${e.message}`);
    return [];
  }
}

async function main() {
  // Retry login until teamver-agent is up
  let token, user;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await login();
      token = r.token;
      user = r.user;
      break;
    } catch (e) {
      const waitMs = Math.min(30000, 1000 * Math.pow(2, attempt));
      log(`login failed (${e.message}); retry in ${waitMs}ms`);
      await new Promise((res) => setTimeout(res, waitMs));
    }
  }

  const channels = await joinAllChannels(token);
  log(`joined ${channels.length} channels`);

  const socket = io(TEAMVER_URL, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  });

  socket.on("connect", () => {
    log(`socket connected (${socket.id})`);
    for (const ch of channels) {
      socket.emit("join_channel", ch.id);
    }
  });

  socket.on("disconnect", (reason) => log(`socket disconnected: ${reason}`));
  socket.on("connect_error", (e) => log(`socket connect_error: ${e.message}`));

  socket.on("new_message", async (msg) => {
    if (msg.senderId === BOT_ID) return; // ignore self
    if (msg.senderIsBot) return; // don't reply to other bots
    if (!mentionsSelf(msg.content)) return;

    log(`mentioned in ${msg.channelId}: "${(msg.content || "").slice(0, 80)}"`);
    const history = await fetchChannelHistory(token, msg.channelId);
    // 방금 도착한 메시지는 history 끝에 있을 수도 있음. 중복 제거.
    const historyExceptCurrent = history.filter((m) => m.id !== msg.id);

    const reply = await generateReply({
      currentMessage: msg.content || "",
      currentSender: msg.senderName,
      history: historyExceptCurrent,
      scope: `채널 #${msg.channelName || msg.channelId.slice(0, 8)}`,
    });
    if (!reply) return;

    // 채널 본문 답변이면 threadId 없이. 스레드 안 메시지였으면 같은 스레드 유지.
    socket.emit("send_message", {
      channelId: msg.channelId,
      content: reply,
      threadId: msg.threadId || undefined,
    });
    log(`replied in ${msg.channelId} (${reply.length} chars, thread=${!!msg.threadId})`);
  });

  socket.on("new_dm", async (msg) => {
    if (msg.fromUserId === BOT_ID) return; // my own outbound echo
    if (msg.toUserId !== BOT_ID) return;   // someone else's DM
    if (msg.fromUserIsBot) return;         // don't reply to other bots

    log(`dm from ${msg.fromUserName}: "${(msg.content || "").slice(0, 80)}"`);
    const history = await fetchDmHistory(token, msg.fromUserId);
    const historyExceptCurrent = history.filter((m) => m.id !== msg.id);

    const reply = await generateReply({
      currentMessage: msg.content || "",
      currentSender: msg.fromUserName,
      history: historyExceptCurrent,
      scope: `${msg.fromUserName}와 1:1 DM`,
    });
    if (!reply) return;

    socket.emit("send_dm", { toUserId: msg.fromUserId, content: reply });
    log(`dm reply to ${msg.fromUserName} (${reply.length} chars)`);
  });

  process.on("SIGTERM", () => {
    log("SIGTERM, closing");
    socket.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(`[${BOT_NAME}] fatal:`, e);
  process.exit(1);
});
