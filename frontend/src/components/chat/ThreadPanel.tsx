'use client'
import { useState, useRef, useEffect } from 'react'
import { X, Send } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface Props {
  thread: any
  currentUser: any
  apiBase: string
  onClose: () => void
  onReply: (content: string) => void
  socket: any
  channelId: string
}

export default function ThreadPanel({ thread, currentUser, apiBase, onClose, onReply, socket, channelId }: Props) {
  const [replies, setReplies] = useState<any[]>(thread.replies || [])
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [replies])

  useEffect(() => {
    if (!socket) return
    const handler = ({ threadId, message }: any) => {
      if (threadId === thread.id) setReplies(prev => prev.find(m => m.id === message.id) ? prev : [...prev, message])
    }
    socket.on('thread_reply', handler)
    return () => socket.off('thread_reply', handler)
  }, [socket, thread.id])

  const send = () => {
    if (!text.trim()) return
    onReply(text.trim())
    setText('')
  }

  return (
    <div className="w-80 flex-shrink-0 border-l border-border flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="font-semibold text-sm">스레드</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded"><X size={16} /></button>
      </div>

      {/* Original message */}
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
            {thread.senderName?.[0]}
          </div>
          <div>
            <div className="flex items-baseline gap-1.5 mb-0.5">
              <span className="text-sm font-semibold">{thread.senderName}</span>
              <span className="text-xs text-muted-foreground">{format(new Date(thread.createdAt), 'HH:mm', { locale: ko })}</span>
            </div>
            <p className="text-sm text-foreground/80">{thread.content}</p>
          </div>
        </div>
        <div className="mt-2 ml-9 text-xs text-muted-foreground">{replies.length}개의 답글</div>
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {replies.map(reply => (
          <div key={reply.id} className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {reply.senderName?.[0]}
            </div>
            <div>
              <div className="flex items-baseline gap-1.5 mb-0.5">
                <span className="text-xs font-semibold">{reply.senderName}</span>
                <span className="text-xs text-muted-foreground">{format(new Date(reply.createdAt), 'HH:mm', { locale: ko })}</span>
              </div>
              <p className="text-sm text-foreground/80">{reply.content}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 focus-within:border-ring/50">
          <input
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground outline-none"
            placeholder="답글 달기..."
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          />
          <button onClick={send} disabled={!text.trim()} className="w-6 h-6 rounded bg-primary disabled:opacity-30 flex items-center justify-center hover:bg-primary/80 transition-colors">
            <Send size={12} className="text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  )
}
