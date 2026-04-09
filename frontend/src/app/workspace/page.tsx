'use client'
import { useWorkspace } from '@/lib/WorkspaceContext'
import ChatArea from '@/components/chat/ChatArea'
import { getApiBase } from '@/lib/api'

export default function WorkspacePage() {
  const { activeChannel, socket, currentUser, workspace } = useWorkspace()
  return (
    <ChatArea
      channelId={activeChannel}
      socket={socket}
      currentUser={currentUser}
      apiBase={getApiBase()}
    />
  )
}
