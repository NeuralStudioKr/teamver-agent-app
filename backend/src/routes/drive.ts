import type { FastifyInstance } from 'fastify'
import { pool } from '../services/db.js'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

const DRIVE_DIR = '/tmp/drive'

// 경로는 항상 '/' 로 시작하고 trailing slash 없음. 루트 폴더 내부는 '/folder', 중첩은 '/a/b'.
// 루트(파일/폴더가 어떤 폴더에도 안 들어간 상태)는 빈 문자열 ''.
function joinPath(parentPath: string, name: string): string {
  const clean = name.replace(/\//g, '_').trim()
  if (!parentPath) return `/${clean}`
  return `${parentPath}/${clean}`
}

function normalizePath(p: string): string {
  if (!p || p === '/') return ''
  let out = p.trim()
  if (!out.startsWith('/')) out = `/${out}`
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1)
  return out
}

export async function driveRoutes(app: FastifyInstance) {
  if (!fs.existsSync(DRIVE_DIR)) fs.mkdirSync(DRIVE_DIR, { recursive: true })

  // ─── 폴더 ────────────────────────────────────────────────────────────────

  // 자식 폴더 목록 (parent_id 없으면 루트)
  app.get('/drive/folders', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user
    const { parent_id } = req.query as any
    const result = await pool.query(
      `SELECT * FROM drive_folders
       WHERE workspace_id = $1 AND parent_id IS NOT DISTINCT FROM $2
       ORDER BY name`,
      [user.workspaceId, parent_id || null]
    )
    return result.rows
  })

  // 폴더 생성
  app.post('/drive/folders', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user
    const { name, parent_id } = req.body as any
    if (!name || !String(name).trim()) return reply.status(400).send({ error: '폴더 이름 필요' })

    let parentPath = ''
    if (parent_id) {
      const parent = await pool.query(
        `SELECT path FROM drive_folders WHERE id = $1 AND workspace_id = $2`,
        [parent_id, user.workspaceId]
      )
      if (!parent.rows[0]) return reply.status(404).send({ error: '상위 폴더를 찾을 수 없음' })
      parentPath = parent.rows[0].path
    }

    const folderPath = joinPath(parentPath, name)
    try {
      const result = await pool.query(
        `INSERT INTO drive_folders
           (id, workspace_id, parent_id, name, path, created_by_id, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [uuidv4(), user.workspaceId, parent_id || null, name.trim(), folderPath, user.id, user.name]
      )
      reply.status(201)
      return result.rows[0]
    } catch (err: any) {
      if (err.code === '23505') return reply.status(409).send({ error: '같은 이름의 폴더가 이미 존재함' })
      throw err
    }
  })

  // 폴더 rename / move
  app.patch('/drive/folders/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as any
    const { name, parent_id } = req.body as any

    const existing = await pool.query(
      `SELECT * FROM drive_folders WHERE id = $1 AND workspace_id = $2`,
      [id, user.workspaceId]
    )
    if (!existing.rows[0]) return reply.status(404).send({ error: '폴더 없음' })

    const newName = name?.trim() || existing.rows[0].name
    const newParentId = parent_id !== undefined ? parent_id : existing.rows[0].parent_id

    if (newParentId === id) return reply.status(400).send({ error: '자기 자신을 상위로 지정할 수 없음' })

    let parentPath = ''
    if (newParentId) {
      const parent = await pool.query(
        `SELECT path FROM drive_folders WHERE id = $1 AND workspace_id = $2`,
        [newParentId, user.workspaceId]
      )
      if (!parent.rows[0]) return reply.status(404).send({ error: '상위 폴더 없음' })
      if (parent.rows[0].path.startsWith(existing.rows[0].path + '/')) {
        return reply.status(400).send({ error: '하위 폴더를 상위로 지정할 수 없음' })
      }
      parentPath = parent.rows[0].path
    }

    const newPath = joinPath(parentPath, newName)
    const oldPath = existing.rows[0].path

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `UPDATE drive_folders
         SET name = $1, parent_id = $2, path = $3, updated_at = NOW()
         WHERE id = $4`,
        [newName, newParentId || null, newPath, id]
      )
      // 자손 path 재계산 (prefix 교체)
      await client.query(
        `UPDATE drive_folders
         SET path = $1 || substring(path from ${oldPath.length + 1})
         WHERE workspace_id = $2 AND path LIKE $3`,
        [newPath, user.workspaceId, oldPath + '/%']
      )
      await client.query('COMMIT')
    } catch (err: any) {
      await client.query('ROLLBACK')
      if (err.code === '23505') return reply.status(409).send({ error: '같은 이름의 폴더가 이미 존재함' })
      throw err
    } finally {
      client.release()
    }

    const updated = await pool.query(`SELECT * FROM drive_folders WHERE id = $1`, [id])
    return updated.rows[0]
  })

  // 폴더 삭제. 기본: 내부 파일은 루트(folder_id=NULL)로 이동, 하위 폴더는 CASCADE. recursive=true 면 파일까지 전부 제거.
  app.delete('/drive/folders/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as any
    const { recursive } = req.query as any

    const existing = await pool.query(
      `SELECT * FROM drive_folders WHERE id = $1 AND workspace_id = $2`,
      [id, user.workspaceId]
    )
    if (!existing.rows[0]) return reply.status(404).send({ error: '폴더 없음' })

    if (recursive === 'true') {
      // 자신 + 자손 폴더의 파일을 조회해서 디스크 정리 후 일괄 삭제
      const descIds = await pool.query(
        `SELECT id FROM drive_folders
         WHERE workspace_id = $1 AND (id = $2 OR path LIKE $3)`,
        [user.workspaceId, id, existing.rows[0].path + '/%']
      )
      const ids = descIds.rows.map((r: any) => r.id)
      const files = await pool.query(
        `SELECT file_url FROM drive_files WHERE folder_id = ANY($1::uuid[])`,
        [ids]
      )
      for (const f of files.rows) {
        if (f.file_url) {
          const filename = path.basename(f.file_url)
          const filepath = path.join(DRIVE_DIR, filename)
          if (fs.existsSync(filepath)) fs.unlinkSync(filepath)
        }
      }
      await pool.query(`DELETE FROM drive_files WHERE folder_id = ANY($1::uuid[])`, [ids])
    }
    // 폴더 삭제 (parent_id CASCADE 로 하위 폴더 자동 삭제, 파일은 folder_id SET NULL → 루트 이동)
    await pool.query(`DELETE FROM drive_folders WHERE id = $1`, [id])
    return { success: true }
  })

  // ─── 트리 ────────────────────────────────────────────────────────────────

  // workspace 전체 폴더 + 파일 메타 (트리 구성은 클라이언트에서)
  app.get('/drive/tree', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user
    const folders = await pool.query(
      `SELECT id, parent_id, name, path, created_by_id, created_by_name, created_at, updated_at
       FROM drive_folders WHERE workspace_id = $1 ORDER BY path`,
      [user.workspaceId]
    )
    const files = await pool.query(
      `SELECT id, folder_id, name, mime_type, size, file_url,
              created_by_id, created_by_name, tags, description, created_at, updated_at
       FROM drive_files WHERE workspace_id = $1 ORDER BY name`,
      [user.workspaceId]
    )
    return { folders: folders.rows, files: files.rows }
  })

  // 경로로 파일/폴더 해석 — 봇이 `drive:/A/B/file.ext` 를 받아 id 를 알아낼 때 사용
  app.get('/drive/resolve', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user
    const raw = (req.query as any).path
    if (!raw) return reply.status(400).send({ error: 'path 쿼리 필요' })
    const p = normalizePath(String(raw))

    // 먼저 폴더로 해석 시도
    const folder = await pool.query(
      `SELECT * FROM drive_folders WHERE workspace_id = $1 AND path = $2`,
      [user.workspaceId, p]
    )
    if (folder.rows[0]) return { type: 'folder', ...folder.rows[0] }

    // 파일로 해석: 마지막 '/' 기준으로 폴더 path + 파일 name 분리. 루트 파일은 '/filename.ext' 형태.
    const lastSlash = p.lastIndexOf('/')
    const folderPath = lastSlash <= 0 ? '' : p.slice(0, lastSlash)
    const fileName = p.slice(lastSlash + 1)

    let folderId: string | null = null
    if (folderPath) {
      const parent = await pool.query(
        `SELECT id FROM drive_folders WHERE workspace_id = $1 AND path = $2`,
        [user.workspaceId, folderPath]
      )
      if (!parent.rows[0]) return reply.status(404).send({ error: '경로 없음' })
      folderId = parent.rows[0].id
    }
    const file = await pool.query(
      `SELECT * FROM drive_files
       WHERE workspace_id = $1 AND name = $2 AND folder_id IS NOT DISTINCT FROM $3`,
      [user.workspaceId, fileName, folderId]
    )
    if (!file.rows[0]) return reply.status(404).send({ error: '파일 없음' })
    return { type: 'file', ...file.rows[0] }
  })

  // ─── 파일 ────────────────────────────────────────────────────────────────

  // 파일 목록 조회 (folder_id 로 필터링 가능. 미지정 시 기존처럼 전체)
  app.get('/drive/files', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user
    const { search, tag, folder_id, root } = req.query as any

    let query = `
      SELECT id, workspace_id, folder_id, name, mime_type, size, content, file_url,
             created_by_id, created_by_name, tags, description,
             created_at, updated_at
      FROM drive_files
      WHERE workspace_id = $1
    `
    const params: any[] = [user.workspaceId]

    if (root === 'true') {
      query += ` AND folder_id IS NULL`
    } else if (folder_id) {
      query += ` AND folder_id = $${params.length + 1}`
      params.push(folder_id)
    }
    if (search) {
      query += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`
      params.push(`%${search}%`)
    }
    if (tag) {
      query += ` AND $${params.length + 1} = ANY(tags)`
      params.push(tag)
    }
    query += ` ORDER BY updated_at DESC`

    const result = await pool.query(query, params)
    return result.rows
  })

  // 단일 파일 조회
  app.get('/drive/files/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as any
    const result = await pool.query(
      `SELECT * FROM drive_files WHERE id = $1 AND workspace_id = $2`,
      [id, user.workspaceId]
    )
    if (!result.rows[0]) return reply.status(404).send({ error: '파일을 찾을 수 없습니다' })
    return result.rows[0]
  })

  // 텍스트/MD 파일 생성 (AI/사용자). folder_id 로 위치 지정.
  app.post('/drive/files', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user
    const { name, content, mime_type, tags, description, folder_id } = req.body as any
    if (!name) return reply.status(400).send({ error: '파일 이름 필요' })

    if (folder_id) {
      const ok = await pool.query(`SELECT 1 FROM drive_folders WHERE id = $1 AND workspace_id = $2`, [folder_id, user.workspaceId])
      if (!ok.rows[0]) return reply.status(404).send({ error: '지정한 폴더 없음' })
    }

    const mimeType = mime_type || 'text/markdown'
    const size = Buffer.byteLength(content || '', 'utf8')
    const result = await pool.query(
      `INSERT INTO drive_files
         (id, workspace_id, folder_id, name, mime_type, size, content, created_by_id, created_by_name, tags, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [uuidv4(), user.workspaceId, folder_id || null, name, mimeType, size, content || '', user.id, user.name, tags || [], description || '']
    )
    reply.status(201)
    return result.rows[0]
  })

  // 파일 업로드 (바이너리). multipart 필드 folder_id 로 위치 지정.
  app.post('/drive/upload', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user
    const parts = req.parts()

    let fileData: any = null
    let meta: Record<string, string> = {}

    for await (const part of parts) {
      if (part.type === 'file') {
        const ext = path.extname(part.filename)
        const fileId = uuidv4()
        const filename = `${fileId}${ext}`
        const filepath = path.join(DRIVE_DIR, filename)
        const chunks: Buffer[] = []
        for await (const chunk of part.file) chunks.push(chunk)
        const buf = Buffer.concat(chunks)
        fs.writeFileSync(filepath, buf)
        fileData = {
          originalName: part.filename,
          mimetype: part.mimetype,
          size: buf.length,
          fileUrl: `/drive/static/${filename}`,
        }
      } else {
        meta[part.fieldname] = (part as any).value
      }
    }

    if (!fileData) return reply.status(400).send({ error: '파일 없음' })

    const folderId = meta.folder_id || null
    if (folderId) {
      const ok = await pool.query(`SELECT 1 FROM drive_folders WHERE id = $1 AND workspace_id = $2`, [folderId, user.workspaceId])
      if (!ok.rows[0]) return reply.status(404).send({ error: '지정한 폴더 없음' })
    }

    const result = await pool.query(
      `INSERT INTO drive_files
         (id, workspace_id, folder_id, name, mime_type, size, file_url, created_by_id, created_by_name, tags, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        uuidv4(),
        user.workspaceId,
        folderId,
        meta.name || fileData.originalName,
        fileData.mimetype,
        fileData.size,
        fileData.fileUrl,
        user.id,
        user.name,
        meta.tags ? JSON.parse(meta.tags) : [],
        meta.description || '',
      ]
    )
    reply.status(201)
    return result.rows[0]
  })

  // 파일 수정 (내용/메타 업데이트, folder_id 변경으로 이동 지원)
  app.patch('/drive/files/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as any
    const { name, content, tags, description, folder_id } = req.body as any

    const existing = await pool.query(
      `SELECT * FROM drive_files WHERE id = $1 AND workspace_id = $2`,
      [id, user.workspaceId]
    )
    if (!existing.rows[0]) return reply.status(404).send({ error: '파일을 찾을 수 없습니다' })

    if (folder_id) {
      const ok = await pool.query(`SELECT 1 FROM drive_folders WHERE id = $1 AND workspace_id = $2`, [folder_id, user.workspaceId])
      if (!ok.rows[0]) return reply.status(404).send({ error: '지정한 폴더 없음' })
    }

    const size = content !== undefined ? Buffer.byteLength(content, 'utf8') : existing.rows[0].size
    const newFolderId = folder_id === undefined ? existing.rows[0].folder_id : (folder_id || null)

    const result = await pool.query(
      `UPDATE drive_files
       SET name = COALESCE($1, name),
           content = COALESCE($2, content),
           size = $3,
           tags = COALESCE($4, tags),
           description = COALESCE($5, description),
           folder_id = $6,
           updated_at = NOW()
       WHERE id = $7 AND workspace_id = $8
       RETURNING *`,
      [name, content, size, tags, description, newFolderId, id, user.workspaceId]
    )
    return result.rows[0]
  })

  // 파일 삭제
  app.delete('/drive/files/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as any
    const existing = await pool.query(
      `SELECT * FROM drive_files WHERE id = $1 AND workspace_id = $2`,
      [id, user.workspaceId]
    )
    if (!existing.rows[0]) return reply.status(404).send({ error: '파일을 찾을 수 없습니다' })

    const file = existing.rows[0]
    if (file.file_url) {
      const filename = path.basename(file.file_url)
      const filepath = path.join(DRIVE_DIR, filename)
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath)
    }

    await pool.query(`DELETE FROM drive_files WHERE id = $1`, [id])
    return { success: true }
  })

  // 바이너리 파일 서빙
  app.get('/drive/static/:filename', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { filename } = req.params as any
    const filepath = path.join(DRIVE_DIR, filename)
    if (!fs.existsSync(filepath)) return reply.status(404).send({ error: '파일 없음' })
    return reply.sendFile(filename, DRIVE_DIR)
  })
}
