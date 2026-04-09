import type { FastifyInstance } from 'fastify'
import { store } from '../services/store.js'

export async function dmRoutes(app: FastifyInstance) {
  app.get('/dm/conversations', { onRequest: [app.authenticate] }, async (req) => {
    const { id: userId, workspaceId } = (req as any).user
    return store.getDmConversations(workspaceId, userId)
  })

  app.get('/dm/:userId/messages', { onRequest: [app.authenticate] }, async (req) => {
    const { id: currentUserId, workspaceId } = (req as any).user
    const { userId } = req.params as any
    return store.getDmMessages(workspaceId, currentUserId, userId)
  })

  app.post('/dm/:userId/messages', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id: currentUserId, workspaceId, isBot, name } = (req as any).user
    const { userId } = req.params as any
    const { content } = req.body as any
    if (!content?.trim()) return reply.status(400).send({ error: '내용 필요' })
    const message = await store.createDmMessage(workspaceId, currentUserId, userId, content.trim())
    
    // 자동 AI 응답 없음 — OpenClaw 인스턴스들이 직접 소켓으로 참여
    return message
  })
}
