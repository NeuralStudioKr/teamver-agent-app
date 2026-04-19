'use client'
import { useState, useEffect, useRef } from 'react'
import { api, getApiBase } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  FileText, File, ImageIcon, Upload, Plus, Search,
  Trash2, Edit3, Download, X, ChevronLeft, Eye, Save,
  Folder, FolderPlus, Link as LinkIcon, Home
} from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 rounded text-sm font-mono">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/^---$/gm, '<hr class="border-border my-3" />')
    .replace(/\n\n/g, '</p><p class="mb-2">')
    .replace(/\n/g, '<br />')
}

function getMimeIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon size={16} className="text-blue-400" />
  if (mimeType === 'application/pdf') return <File size={16} className="text-red-400" />
  return <FileText size={16} className="text-green-400" />
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

interface DriveFile {
  id: string
  folder_id?: string | null
  name: string
  mime_type: string
  size: number
  content?: string
  file_url?: string
  created_by_name: string
  tags: string[]
  description: string
  created_at: string
  updated_at: string
}

interface DriveFolder {
  id: string
  parent_id: string | null
  name: string
  path: string // 예: '/폴더A/폴더B'
  created_by_name: string
  created_at: string
}

// 클립보드 복사 (https 이외 환경에서도 동작하도록 fallback)
async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand('copy')
    return true
  } finally {
    document.body.removeChild(ta)
  }
}

export default function DrivePanel() {
  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null) // null = 루트
  const [selected, setSelected] = useState<DriveFile | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editName, setEditName] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newTags, setNewTags] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered')

  const loadAll = async () => {
    setLoading(true)
    try {
      const tree = await api.getDriveTree()
      setFolders(tree.folders || [])
      setFiles(tree.files || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const currentFolder = currentFolderId
    ? folders.find(f => f.id === currentFolderId) || null
    : null
  const currentPath = currentFolder?.path || ''

  // 현재 폴더의 자식 폴더/파일
  const childFolders = folders.filter(f => (f.parent_id || null) === currentFolderId)
  const childFiles = files.filter(f => (f.folder_id || null) === currentFolderId)

  // 검색 필터 (이름/설명/태그)
  const q = search.trim().toLowerCase()
  const visFolders = q
    ? childFolders.filter(f => f.name.toLowerCase().includes(q))
    : childFolders
  const visFiles = q
    ? childFiles.filter(f =>
        f.name.toLowerCase().includes(q) ||
        (f.description || '').toLowerCase().includes(q) ||
        (f.tags || []).some(t => t.toLowerCase().includes(q))
      )
    : childFiles

  // breadcrumb: 현재 폴더 체인
  const breadcrumb: DriveFolder[] = []
  {
    let cur = currentFolder
    while (cur) {
      breadcrumb.unshift(cur)
      cur = cur.parent_id ? (folders.find(f => f.id === cur!.parent_id) || null) : null
    }
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const copyPath = async (p: string) => {
    const full = `drive:${p}`
    const ok = await copyText(full)
    showToast(ok ? `경로 복사됨: ${full}` : '복사 실패')
  }

  const filePath = (f: DriveFile): string => {
    const folder = f.folder_id ? folders.find(x => x.id === f.folder_id) : null
    const prefix = folder ? folder.path : ''
    return `${prefix}/${f.name}`
  }

  const handleSelect = async (file: DriveFile) => {
    try {
      const full = await api.getDriveFile(file.id)
      setSelected(full)
    } catch {
      setSelected(file)
    }
    setEditing(false)
  }

  const handleEdit = () => {
    if (!selected) return
    setEditContent(selected.content || '')
    setEditName(selected.name)
    setEditing(true)
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await api.updateDriveFile(selected.id, { name: editName, content: editContent })
      setSelected(updated)
      setFiles(prev => prev.map(f => f.id === updated.id ? { ...f, name: updated.name, updated_at: updated.updated_at } : f))
      setEditing(false)
    } catch {}
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('파일을 삭제하시겠습니까?')) return
    await api.deleteDriveFile(id)
    setFiles(prev => prev.filter(f => f.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const file = await api.createDriveFile({
        name: newName,
        content: newContent,
        tags: newTags.split(',').map(t => t.trim()).filter(Boolean),
        description: newDesc,
        folder_id: currentFolderId,
      })
      setFiles(prev => [file, ...prev])
      setShowNewModal(false)
      setNewName(''); setNewContent(''); setNewTags(''); setNewDesc('')
      handleSelect(file)
    } catch {}
    setSaving(false)
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    setSaving(true)
    try {
      const folder = await api.createDriveFolder(newFolderName.trim(), currentFolderId)
      setFolders(prev => [...prev, folder])
      setNewFolderName('')
      setShowNewFolderModal(false)
    } catch (e: any) {
      alert(e?.message || '폴더 생성 실패')
    }
    setSaving(false)
  }

  const handleDeleteFolder = async (folder: DriveFolder) => {
    const recursive = confirm(
      `폴더 "${folder.name}" 을(를) 삭제합니다.\n\n` +
      `확인: 하위 폴더/파일까지 전부 삭제\n취소: 폴더만 삭제 (내부 파일은 루트로 이동)`
    )
    try {
      await api.deleteDriveFolder(folder.id, recursive)
      // 트리 갱신
      await loadAll()
      if (currentFolderId === folder.id) setCurrentFolderId(folder.parent_id)
    } catch (e: any) {
      alert(e?.message || '폴더 삭제 실패')
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await api.uploadDriveFile(file, { folder_id: currentFolderId })
      setFiles(prev => [result, ...prev])
      handleSelect(result)
    } catch {}
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDownload = () => {
    if (!selected) return
    if (selected.file_url) {
      window.open(`${getApiBase()}${selected.file_url}`, '_blank')
      return
    }
    const blob = new Blob([selected.content || ''], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = selected.name
    a.click(); URL.revokeObjectURL(url)
  }

  const isText = (f: DriveFile) => !f.file_url && (f.mime_type?.startsWith('text/') || f.mime_type === 'application/json')
  const isImage = (f: DriveFile) => f.mime_type?.startsWith('image/')

  return (
    <div className="flex h-full relative">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 border-r border-border flex flex-col h-full">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <File size={16} className="text-primary" />
            <span className="font-semibold text-sm">드라이브</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowNewFolderModal(true)}
              className="p-1.5 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
              title="새 폴더"
            >
              <FolderPlus size={14} />
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="p-1.5 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
              title="새 문서 작성"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
              title="파일 업로드"
            >
              {uploading ? <span className="text-xs">...</span> : <Upload size={14} />}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} accept="*/*" />
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="px-3 py-2 border-b border-border flex items-center gap-1 text-xs overflow-x-auto">
          <button
            onClick={() => setCurrentFolderId(null)}
            className={cn('p-1 rounded hover:bg-accent/50 flex items-center gap-1',
              !currentFolderId ? 'text-foreground font-medium' : 'text-muted-foreground')}
            title="루트"
          >
            <Home size={12} /> 루트
          </button>
          {breadcrumb.map((f) => (
            <span key={f.id} className="flex items-center gap-1 text-muted-foreground">
              <span>/</span>
              <button
                onClick={() => setCurrentFolderId(f.id)}
                className={cn('px-1 rounded hover:bg-accent/50',
                  currentFolderId === f.id ? 'text-foreground font-medium' : 'text-muted-foreground')}
              >
                {f.name}
              </button>
            </span>
          ))}
          <span className="flex-1" />
          <button
            onClick={() => copyPath(currentPath || '/')}
            className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground"
            title="현재 경로 복사 (drive:/...)"
          >
            <LinkIcon size={12} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="현재 폴더에서 검색..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary border border-border rounded-md outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Folder + File list */}
        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="text-center text-xs text-muted-foreground py-8">로딩 중...</div>
          ) : visFolders.length === 0 && visFiles.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">
              {currentFolderId ? '빈 폴더' : '파일이 없습니다'}
            </div>
          ) : (
            <>
              {visFolders.map(folder => (
                <div key={folder.id}
                  className={cn('group flex items-start gap-2.5 px-3 py-2 hover:bg-accent/50 transition-colors')}
                >
                  <button
                    onClick={() => setCurrentFolderId(folder.id)}
                    className="flex items-start gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <Folder size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{folder.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{folder.created_by_name}</div>
                    </div>
                  </button>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); copyPath(folder.path) }}
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      title="폴더 경로 복사"
                    >
                      <LinkIcon size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder) }}
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
                      title="폴더 삭제"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {visFiles.map(file => (
                <div key={file.id}
                  className={cn('group flex items-start gap-2.5 px-3 py-2 hover:bg-accent/50 transition-colors',
                    selected?.id === file.id ? 'bg-accent/70' : '')}
                >
                  <button
                    onClick={() => handleSelect(file)}
                    className="flex items-start gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <div className="mt-0.5 flex-shrink-0">{getMimeIcon(file.mime_type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{file.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {file.created_by_name} · {formatSize(file.size)}
                      </div>
                      {file.tags?.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {file.tags.slice(0, 3).map(t => (
                            <span key={t} className="text-xs px-1 py-0 rounded bg-primary/10 text-primary">#{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); copyPath(filePath(file)) }}
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      title="파일 경로 복사"
                    >
                      <LinkIcon size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <File size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {currentFolder ? `"${currentFolder.name}" 폴더` : '드라이브'} — 파일을 선택하거나 새로 만드세요
              </p>
              <p className="text-xs mt-2 opacity-70">
                업로드/새 문서/새 폴더는 <span className="font-mono">{currentPath || '/'}</span> 에 저장됩니다
              </p>
              <div className="flex gap-2 justify-center mt-4">
                <button
                  onClick={() => setShowNewFolderModal(true)}
                  className="text-xs px-4 py-2 border border-border rounded-lg hover:bg-accent/50 transition-colors flex items-center gap-1.5"
                >
                  <FolderPlus size={13} /> 새 폴더
                </button>
                <button
                  onClick={() => setShowNewModal(true)}
                  className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                >
                  <Plus size={13} /> 새 문서
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs px-4 py-2 border border-border rounded-lg hover:bg-accent/50 transition-colors flex items-center gap-1.5"
                >
                  <Upload size={13} /> 파일 업로드
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent/50">
                <ChevronLeft size={16} />
              </button>
              <div className="flex-1 min-w-0">
                {editing ? (
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="font-semibold text-sm bg-secondary border border-border rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-primary w-full max-w-sm"
                  />
                ) : (
                  <h2 className="font-semibold text-sm truncate">{selected.name}</h2>
                )}
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="font-mono">drive:{filePath(selected)}</span>
                  <button
                    onClick={() => copyPath(filePath(selected))}
                    className="p-0.5 rounded hover:bg-accent/50 hover:text-foreground"
                    title="경로 복사"
                  >
                    <LinkIcon size={10} />
                  </button>
                  <span>·</span>
                  <span>{selected.created_by_name}</span>
                  <span>·</span>
                  <span>{formatSize(selected.size)}</span>
                  <span>·</span>
                  <span>{format(new Date(selected.updated_at), 'yyyy.MM.dd HH:mm', { locale: ko })}</span>
                  {selected.tags?.length > 0 && (
                    <>
                      <span>·</span>
                      {selected.tags.map(t => (
                        <span key={t} className="px-1.5 py-0 rounded bg-primary/10 text-primary text-xs">#{t}</span>
                      ))}
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isText(selected) && (
                  <>
                    {editing ? (
                      <>
                        <button onClick={() => setEditing(false)}
                          className="text-xs px-2 py-1 rounded border border-border hover:bg-accent/50 transition-colors flex items-center gap-1">
                          <X size={12} /> 취소
                        </button>
                        <button onClick={handleSave} disabled={saving}
                          className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1 disabled:opacity-50">
                          <Save size={12} /> {saving ? '저장 중...' : '저장'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setViewMode(v => v === 'rendered' ? 'raw' : 'rendered')}
                          className="text-xs px-2 py-1 rounded border border-border hover:bg-accent/50 transition-colors flex items-center gap-1 text-muted-foreground">
                          <Eye size={12} /> {viewMode === 'rendered' ? '원문' : '렌더'}
                        </button>
                        <button onClick={handleEdit}
                          className="p-1.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors">
                          <Edit3 size={14} />
                        </button>
                      </>
                    )}
                  </>
                )}
                <button onClick={handleDownload}
                  className="p-1.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors">
                  <Download size={14} />
                </button>
                <button onClick={() => handleDelete(selected.id)}
                  className="p-1.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {isImage(selected) && selected.file_url ? (
                <div className="flex justify-center">
                  <img src={`${getApiBase()}${selected.file_url}`} alt={selected.name}
                    className="max-w-full rounded-lg shadow" />
                </div>
              ) : isText(selected) ? (
                editing ? (
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="w-full h-full min-h-[400px] bg-secondary border border-border rounded-lg p-4 text-sm font-mono outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                ) : (
                  viewMode === 'rendered' && selected.name.endsWith('.md') ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: `<p class="mb-2">${renderMarkdown(selected.content || '')}</p>` }}
                    />
                  ) : (
                    <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-foreground">
                      {selected.content}
                    </pre>
                  )
                )
              ) : selected.file_url ? (
                <div className="flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground">
                  {getMimeIcon(selected.mime_type)}
                  <p className="text-sm">{selected.name}</p>
                  <button onClick={handleDownload}
                    className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5">
                    <Download size={13} /> 다운로드
                  </button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">미리보기를 지원하지 않는 파일 형식입니다.</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* New folder modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl w-full max-w-sm mx-4 shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="font-semibold text-sm flex items-center gap-2"><FolderPlus size={14} /> 새 폴더</h3>
              <button onClick={() => setShowNewFolderModal(false)} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent/50">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-xs text-muted-foreground">
                위치: <span className="font-mono">{currentPath || '/'}</span>
              </div>
              <input
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder() }}
                placeholder="폴더 이름"
                autoFocus
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setShowNewFolderModal(false)}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent/50 transition-colors">
                취소
              </button>
              <button onClick={handleCreateFolder} disabled={saving || !newFolderName.trim()}
                className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
                {saving ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New file modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl mx-4 shadow-xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="font-semibold text-sm flex items-center gap-2"><FileText size={14} /> 새 문서 작성</h3>
              <button onClick={() => setShowNewModal(false)} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent/50">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div className="text-xs text-muted-foreground">
                위치: <span className="font-mono">{currentPath || '/'}</span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">파일 이름 *</label>
                <input
                  value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="보고서.md"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">설명</label>
                <input
                  value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="파일에 대한 간단한 설명"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">태그 (쉼표로 구분)</label>
                <input
                  value={newTags} onChange={e => setNewTags(e.target.value)}
                  placeholder="보고서, AI협업, 기획"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">내용 (Markdown 지원)</label>
                <textarea
                  value={newContent} onChange={e => setNewContent(e.target.value)}
                  rows={12}
                  placeholder="# 제목&#10;&#10;내용을 작성하세요..."
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setShowNewModal(false)}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent/50 transition-colors">
                취소
              </button>
              <button onClick={handleCreate} disabled={saving || !newName.trim()}
                className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                <Save size={13} /> {saving ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
