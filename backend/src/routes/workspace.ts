import type { FastifyInstance } from 'fastify'
import { store } from '../services/store.js'
import path from 'path'
import fs from 'fs'

export async function workspaceRoutes(app: FastifyInstance) {
  app.get('/workspace', { onRequest: [app.authenticate] }, async (req) => {
    const { workspaceId } = (req as any).user
    return store.getWorkspace(workspaceId)
  })

  app.patch('/workspace', { onRequest: [app.authenticate] }, async (req) => {
    const { workspaceId } = (req as any).user
    const { name, primaryColor } = req.body as any
    return store.updateWorkspace(workspaceId, { name, primaryColor })
  })

  app.post('/workspace/logo', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { workspaceId } = (req as any).user
    const data = await req.file()
    if (!data) return reply.status(400).send({ error: '파일 없음' })
    
    const uploadsDir = '/tmp/uploads'
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
    
    const ext = path.extname(data.filename)
    const filename = `logo-${workspaceId}${ext}`
    const filepath = path.join(uploadsDir, filename)
    
    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(filepath)
      data.file.pipe(ws)
      ws.on('finish', resolve)
      ws.on('error', reject)
    })
    
    const logoUrl = `/uploads/${filename}`
    const workspace = await store.updateWorkspace(workspaceId, { logoUrl })
    return { logoUrl, workspace }
  })
}
