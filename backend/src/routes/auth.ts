import type { FastifyInstance } from 'fastify'
import { store } from '../services/store.js'

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const { name, email, password, workspaceId = '00000000-0000-0000-0000-000000000000' } = req.body as any
    if (!name || !email || !password) return reply.status(400).send({ error: '필수 필드 누락' })
    try {
      const user = await store.createUser(workspaceId, name, email, password)
      const token = app.jwt.sign({ id: user.id, workspaceId: user.workspaceId, email: user.email, name: user.name, isBot: user.isBot })
      return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, isBot: user.isBot } }
    } catch (e: any) {
      return reply.status(400).send({ error: e.message })
    }
  })

  app.post('/auth/login', async (req, reply) => {
    const { email, password, workspaceId = '00000000-0000-0000-0000-000000000000' } = req.body as any
    const user = await store.getUserByEmail(workspaceId, email)
    if (!user || !(await store.verifyPassword(user, password))) return reply.status(401).send({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' })
    const token = app.jwt.sign({ id: user.id, workspaceId: user.workspaceId, email: user.email, name: user.name, isBot: user.isBot })
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, isBot: user.isBot } }
  })

  app.get('/auth/me', { onRequest: [app.authenticate] }, async (req) => {
    const u = (req as any).user
    const user = await store.getUserById(u.id)
    return user ? { id: user.id, name: user.name, email: user.email, role: user.role, isBot: user.isBot } : null
  })

  app.delete('/auth/me', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id, workspaceId } = (req as any).user
    const { password } = req.body as any
    const user = await store.getUserById(id)
    if (!user) return reply.status(404).send({ error: '사용자 없음' })
    if (!await store.verifyPassword(user, password)) return reply.status(401).send({ error: '비밀번호가 올바르지 않습니다.' })
    await store.deleteUser(id)
    return { ok: true }
  })
}
