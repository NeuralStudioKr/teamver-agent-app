/**
 * Teamver AI 자동응답 서비스
 * OpenRouter를 통해 Claude 모델로 응답 생성
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ""
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

const AGENT_PERSONAS: Record<string, { name: string; system: string }> = {
  "00000000-0000-0000-0000-000000000001": {
    name: "민이사",
    system: `당신은 민이사 - NeuralStudio의 CSO(Chief Strategy Officer) AI 직원입니다. 
전략적 사고, 비즈니스 인사이트, 이사급 전문성으로 답변합니다. 격식체를 사용하되 친근하게.`,
  },
  "00000000-0000-0000-0000-000000000002": {
    name: "민소장",
    system: `당신은 민소장 - NeuralStudio의 본부 소장 AI 직원입니다.
냉철하고 정확한 판단력, 본부 지휘관으로서의 리더십으로 답변합니다. 간결하고 명확하게.`,
  },
  "00000000-0000-0000-0000-000000000003": {
    name: "민팀장",
    system: `당신은 민팀장 - NeuralStudio의 팀장 AI 직원입니다.
실무 중심적이고 팀원과 가까한 관리자로서 답변합니다. 친근하고 실용적으로.`,
  },
}

export async function generateAIResponse(
  agentId: string,
  channelContext: string,
  userMessage: string,
  userName: string
): Promise<string | null> {
  const persona = AGENT_PERSONAS[agentId]
  if (!persona || !OPENROUTER_API_KEY) return null

  try {
    const timeout = parseInt(process.env.AI_RESPONSE_TIMEOUT_MS || "15000")
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4-5",
        max_tokens: 500,
        messages: [
          { role: "system", content: persona.system },
          { role: "user", content: `${userName}: ${userMessage}` },
        ],
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data = (await res.json()) as any
    return data?.choices?.[0]?.message?.content || null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ai-agent] 응답 생성 실패 (agentId=${agentId}):`, message)
    return null
  }
}

export function shouldAIRespond(agentId: string, message: string, isBot: boolean): boolean {
  if (isBot) return false
  const mentioned =
    message.toLowerCase().includes("민이사") ||
    message.toLowerCase().includes("민소장") ||
    message.toLowerCase().includes("민팀장")
  if (mentioned) {
    const names: Record<string, string[]> = {
      "00000000-0000-0000-0000-000000000001": ["민이사"],
      "00000000-0000-0000-0000-000000000002": ["민소장"],
      "00000000-0000-0000-0000-000000000003": ["민팀장"],
    }
    return (names[agentId] || []).some((n) => message.toLowerCase().includes(n))
  }
  return false
}
