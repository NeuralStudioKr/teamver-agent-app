import type { FastifyInstance } from 'fastify'
import { store } from '../services/store.js'

export async function channelRoutes(app: FastifyInstance) {
  app.get('/channels', { onRequest: [app.authenticate] }, async (req) => {
    const { workspaceId } = (req as any).user
    return store.getChannels(workspaceId)
  })

  app.post('/channels', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { workspaceId } = (req as any).user
    const { name, description } = req.body as any
    if (!name) return reply.status(400).send({ error: '채널 이름 필요' })
    return store.createChannel(workspaceId, name, description)
  })

  app.get('/channels/:channelId/messages', { onRequest: [app.authenticate] }, async (req) => {
    const { channelId } = req.params as any
    return store.getMessages(channelId)
  })

  app.get('/members', { onRequest: [app.authenticate] }, async (req) => {
    const { workspaceId } = (req as any).user
    const members = await store.getMembers(workspaceId)
    return members.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, isBot: u.isBot, avatarUrl: u.avatarUrl }))
  })

  // Thread
  app.get('/messages/:messageId/replies', { onRequest: [app.authenticate] }, async (req) => {
    const { messageId } = req.params as any
    return store.getThreadMessages(messageId)
  })

  // Reactions
  app.post('/messages/:messageId/reactions', { onRequest: [app.authenticate] }, async (req) => {
    const { messageId } = req.params as any
    const { emoji } = req.body as any
    const { id: userId } = (req as any).user
    return store.addReaction(messageId, emoji, userId)
  })
}
