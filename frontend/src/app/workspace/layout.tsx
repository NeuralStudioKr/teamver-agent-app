'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { WorkspaceContext } from '@/lib/WorkspaceContext'
import Sidebar from '@/components/layout/Sidebar'

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [workspace, setWorkspace] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [channels, setChannels] = useState<any[]>([])
  const [activeChannel, setActiveChannel] = useState('')
  const [socket, setSocket] = useState<any>(null)

  useEffect(() => {
    const token = localStorage.getItem('ta_token')
    if (!token) { router.replace('/login'); return }

    Promise.all([api.me(), api.getWorkspace(), api.getChannels(), api.getMembers()])
      .then(([user, ws, chs, mems]) => {
        setCurrentUser(user)
        setWorkspace(ws)
        setChannels(chs)
        setMembers(mems)
        if (chs.length > 0) setActiveChannel(chs[0].id)

        const s = getSocket(token)
        setSocket(s)
        chs.forEach(ch => s.emit('join_channel', ch.id))
      })
      .catch(() => { localStorage.removeItem('ta_token'); router.replace('/login') })

    return () => disconnectSocket()
  }, [])

  const handleChannelSelect = useCallback((channelId: string) => {
    setActiveChannel(channelId)
    router.push('/workspace')
  }, [router])

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    )
  }

  return (
    <WorkspaceContext.Provider value={{ activeChannel, setActiveChannel, socket, currentUser, workspace, members }}>
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar
          workspace={workspace}
          channels={channels}
          members={members}
          activeChannel={activeChannel}
          onChannelSelect={handleChannelSelect}
          currentUser={currentUser}
          onChannelsUpdate={setChannels}
        />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </main>
      </div>
    </WorkspaceContext.Provider>
  )
}
