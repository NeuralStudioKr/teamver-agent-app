'use client'
import { useState } from 'react'
import { api, getApiBase } from '@/lib/api'

// `drive:/폴더/파일.ext` 형태 토큰을 클릭 가능한 링크로 분해.
// 매칭: drive: 다음에 / 로 시작하는 비공백 시퀀스.
export function renderWithDriveLinks(content: string): any[] {
  const re = /drive:(\/\S*)/g
  const nodes: any[] = []
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) nodes.push(content.slice(last, m.index))
    const p = m[1] || '/'
    nodes.push(<DriveLink key={`dl-${key++}`} path={p} />)
    last = m.index + m[0].length
  }
  if (last < content.length) nodes.push(content.slice(last))
  return nodes
}

export function DriveLink(props: any) {
  const path: string = props.path
  const [busy, setBusy] = useState(false)
  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r: any = await api.resolveDrivePath(path)
      if (r?.type === 'file') {
        if (r.file_url) {
          window.open(`${getApiBase()}${r.file_url}`, '_blank')
        } else {
          const w = window.open('', '_blank')
          if (w) {
            w.document.title = r.name
            w.document.body.innerText = r.content || ''
          }
        }
      } else if (r?.type === 'folder') {
        alert(`폴더: ${r.path}\n(드라이브 탭에서 열기)`)
      }
    } catch {
      alert(`경로를 찾을 수 없음: drive:${path}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      onClick={handleClick}
      className="inline-flex items-baseline gap-0.5 font-mono text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 align-baseline"
      disabled={busy}
      title="드라이브에서 열기"
    >
      drive:{path}
    </button>
  )
}
