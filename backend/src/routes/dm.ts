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
    
    // AI 응답
    if (!isBot) {
      const recipient = await store.getUserById(userId)
      if (recipient?.isBot) {
        const { generateAIResponse } = await import('../services/ai-agent.js')
        const io = (app as any).io
        setTimeout(async () => {
          const response = await generateAIResponse(userId, 'dm', content.trim(), name)
          if (!response) return
          const aiMsg = await store.createDmMessage(workspaceId, userId, currentUserId, response)
          if (io) io.to(`dm:${currentUserId}`).emit('new_dm', aiMsg)
        }, 1000 + Math.random() * 2000)
      }
    }
    return message
  })
}
