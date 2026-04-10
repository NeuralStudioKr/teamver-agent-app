/**
 * teamver → Slack 채널 브릿지
 * 사용자(비봇) 메시지 수신 시 Slack #teamver-agent 채널로 알림을 보내
 * OpenClaw 인스턴스들이 teamver 메시지를 수신할 수 있게 합니다.
 */

const SLACK_BOT_TOKEN = process.env.SLACK_BRIDGE_TOKEN || ''
const SLACK_CHANNEL_ID = process.env.SLACK_BRIDGE_CHANNEL_ID || ''

async function postToSlack(text: string) {
  if (!SLACK_BOT_TOKEN || !SLACK_CHANNEL_ID) return

  fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      channel: SLACK_CHANNEL_ID,
      text,
    }),
  }).catch(err => console.warn(`[webhook] Slack 전송 실패:`, err.message))
}

export async function notifyNewMessage(params: {
  channelId: string
  channelName: string
  senderId: string
  senderName: string
  senderIsBot: boolean
  content: string
  messageId: string
}) {
  const { channelName, senderName, content } = params
  const text = `[teamver #${channelName}] *${senderName}*: ${content.slice(0, 500)}`
  await postToSlack(text)
}

export async function notifyNewDm(params: {
  fromUserId: string
  fromUserName: string
  toUserId: string
  content: string
  messageId: string
}) {
  const { fromUserName, content } = params
  const text = `[teamver DM] *${fromUserName}*: ${content.slice(0, 500)}`
  await postToSlack(text)
}
