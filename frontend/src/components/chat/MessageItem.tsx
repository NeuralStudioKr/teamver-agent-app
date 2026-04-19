'use client'
import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Smile, Pencil, Trash2, X, Check } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { renderWithDriveLinks } from './DriveLinks'

interface Props {
  message: any
  currentUserId?: string
  apiBase: string
  onThread: () => void
  onReaction: (emoji: string) => void
  onEdit?: (messageId: string, content: string) => void
  onDelete?: (messageId: string) => void
  emojiList: string[]
}

export default function MessageItem({ message: msg, currentUserId, apiBase, onThread, onReaction, onEdit, onDelete, emojiList }: Props) {
  const [showActions, setShowActions] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const isMe = msg.senderId === currentUserId

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus()
      editRef.current.setSelectionRange(editRef.current.value.length, editRef.current.value.length)
    }
  }, [editing])

  const startEdit = () => {
    setEditing(true)
    setEditDraft(msg.content || '')
    setShowActions(false)
  }

  const submitEdit = () => {
    const trimmed = editDraft.trim()
    if (!trimmed || trimmed === (msg.content || '').trim()) { setEditing(false); return }
    onEdit?.(msg.id, trimmed)
    setEditing(false)
  }

  const handleDelete = () => {
    onDelete?.(msg.id)
    setConfirmDelete(false)
    setShowActions(false)
  }

  return (
    <div
      className="group flex items-start gap-3 px-2 py-1 rounded-lg hover:bg-accent/30 transition-colors relative"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowEmoji(false); setConfirmDelete(false) }}
    >
      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
        {msg.senderName?.[0] ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold">{msg.senderName}</span>
          {msg.senderIsBot && <span className="text-xs bg-primary/10 text-primary/70 px-1.5 py-0.5 rounded-full">AI</span>}
          <span className="text-xs text-muted-foreground">
            {format(new Date(msg.createdAt), 'HH:mm', { locale: ko })}
          </span>
        </div>

        {editing ? (
          <div className="mt-1">
            <textarea
              ref={editRef}
              value={editDraft}
              onChange={e => setEditDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit() }
                if (e.key === 'Escape') setEditing(false)
              }}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-ring min-h-[40px] max-h-40"
              rows={2}
            />
            <div className="flex items-center gap-2 mt-1">
              <button onClick={submitEdit} className="text-xs text-primary hover:underline flex items-center gap-1"><Check size={12} />저장</button>
              <button onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:underline flex items-center gap-1"><X size={12} />취소</button>
              <span className="text-xs text-muted-foreground">Enter 저장 · Esc 취소</span>
            </div>
          </div>
        ) : (
          <>
            {msg.content && <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{renderWithDriveLinks(msg.content)}</p>}
          </>
        )}

        {msg.fileUrl && msg.fileType?.startsWith('image/') ? (
          <img src={`${apiBase}${msg.fileUrl}`} className="mt-1 rounded-lg max-w-sm max-h-64 object-cover border border-border" alt={msg.fileName} />
        ) : msg.fileUrl ? (
          <a href={`${apiBase}${msg.fileUrl}`} target="_blank" className="mt-1 inline-flex items-center gap-2 bg-accent rounded-lg px-3 py-1.5 text-sm hover:bg-accent/80">
            📎 {msg.fileName}
          </a>
        ) : null}

        {Object.keys(msg.reactions || {}).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(msg.reactions).map(([emoji, users]: [string, any]) => (
              <button
                key={emoji}
                onClick={() => onReaction(emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  (users as string[]).includes(currentUserId || '')
                    ? 'bg-primary/20 border-primary/30 text-primary'
                    : 'bg-accent border-border hover:bg-accent/80'
                }`}
              >
                {emoji} <span>{(users as string[]).length}</span>
              </button>
            ))}
          </div>
        )}

        {msg.replyCount > 0 && (
          <button onClick={onThread} className="mt-1 text-xs text-primary hover:underline flex items-center gap-1">
            <MessageSquare size={12} /> {msg.replyCount}개의 답글
          </button>
        )}
      </div>

      {/* Actions bar */}
      {showActions && !editing && (
        <div className="absolute right-2 top-0 flex items-center gap-1 bg-card border border-border rounded-lg px-1.5 py-1 shadow-lg">
          <div className="relative">
            <button onClick={() => setShowEmoji(v => !v)} className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
              <Smile size={14} />
            </button>
            {showEmoji && (
              <div className="absolute right-0 top-full mt-1 flex gap-1 bg-card border border-border rounded-lg p-1.5 shadow-lg z-10">
                {emojiList.map(e => (
                  <button key={e} onClick={() => { onReaction(e); setShowEmoji(false) }} className="text-base hover:scale-125 transition-transform p-0.5">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={onThread} className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
            <MessageSquare size={14} />
          </button>
          {isMe && onEdit && (
            <button onClick={startEdit} title="수정" className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
              <Pencil size={14} />
            </button>
          )}
          {isMe && onDelete && (
            <div className="relative">
              <button onClick={() => setConfirmDelete(v => !v)} title="삭제" className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-destructive">
                <Trash2 size={14} />
              </button>
              {confirmDelete && (
                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg p-2 shadow-lg z-10 min-w-[120px]">
                  <p className="text-xs text-muted-foreground mb-2">삭제하시겠습니까?</p>
                  <div className="flex gap-1">
                    <button onClick={handleDelete} className="flex-1 text-xs px-2 py-1 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90">삭제</button>
                    <button onClick={() => setConfirmDelete(false)} className="flex-1 text-xs px-2 py-1 border border-border rounded hover:bg-accent/50">취소</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
