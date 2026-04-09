import type { FastifyInstance } from 'fastify'
import path from 'path'
import fs from 'fs'

const UPLOADS_DIR = '/tmp/uploads'

export async function fileRoutes(app: FastifyInstance) {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

  app.post('/files/upload', { onRequest: [app.authenticate] }, async (req, reply) => {
    const data = await req.file()
    if (!data) return reply.status(400).send({ error: '파일 없음' })
    
    const ext = path.extname(data.filename)
    const id = Date.now() + '-' + Math.random().toString(36).slice(2)
    const filename = `${id}${ext}`
    const filepath = path.join(UPLOADS_DIR, filename)
    
    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(filepath)
      data.file.pipe(ws)
      ws.on('finish', resolve)
      ws.on('error', reject)
    })
    
    return {
      url: `/uploads/${filename}`,
      name: data.filename,
      type: data.mimetype,
    }
  })
}
