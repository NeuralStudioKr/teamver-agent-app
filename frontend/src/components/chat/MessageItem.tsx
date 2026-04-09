'use client'
import { useState } from 'react'
import { MessageSquare, Smile } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface Props {
  message: any
  currentUserId?: string
  apiBase: string
  onThread: () => void
  onReaction: (emoji: string) => void
  emojiList: string[]
}

export default function MessageItem({ message: msg, currentUserId, apiBase, onThread, onReaction, emojiList }: Props) {
  const [showActions, setShowActions] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const isMe = msg.senderId === currentUserId

  return (
    <div
      className="group flex items-start gap-3 px-2 py-1 rounded-lg hover:bg-accent/30 transition-colors relative"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowEmoji(false) }}
    >
      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
        {msg.senderName?.[0] ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold">{msg.senderName}</span>
          {msg.senderIsBot && <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">AI</span>}
          <span className="text-xs text-muted-foreground">
            {format(new Date(msg.createdAt), 'HH:mm', { locale: ko })}
          </span>
        </div>
        {msg.content && <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{msg.content}</p>}
        {msg.fileUrl && msg.fileType?.startsWith('image/') ? (
          <img src={`${apiBase}${msg.fileUrl}`} className="mt-1 rounded-lg max-w-sm max-h-64 object-cover border border-border" alt={msg.fileName} />
        ) : msg.fileUrl ? (
          <a href={`${apiBase}${msg.fileUrl}`} target="_blank" className="mt-1 inline-flex items-center gap-2 bg-accent rounded-lg px-3 py-1.5 text-sm hover:bg-accent/80">
            📎 {msg.fileName}
          </a>
        ) : null}
        {/* Reactions */}
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
        {/* Thread count */}
        {msg.replyCount > 0 && (
          <button onClick={onThread} className="mt-1 text-xs text-primary hover:underline flex items-center gap-1">
            <MessageSquare size={12} /> {msg.replyCount}개의 답글
          </button>
        )}
      </div>

      {/* Actions */}
      {showActions && (
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
        </div>
      )}
    </div>
  )
}
