export interface Workspace {
  id: string
  name: string
  slug: string
  logoUrl?: string
  primaryColor: string
  createdAt: Date
}

export interface User {
  id: string
  workspaceId: string
  name: string
  email: string
  passwordHash: string
  role: string
  avatarUrl?: string
  isBot: boolean
  createdAt: Date
}

export interface Channel {
  id: string
  workspaceId: string
  name: string
  description?: string
  isPrivate: boolean
  memberCount?: number
  createdAt: Date
}

export interface Message {
  id: string
  channelId: string
  threadId?: string
  senderId?: string
  senderName: string
  senderIsBot: boolean
  content?: string
  fileUrl?: string
  fileName?: string
  fileType?: string
  reactions: Record<string, string[]>
  replyCount: number
  createdAt: Date
}

export interface DmMessage {
  id: string
  workspaceId: string
  fromUserId?: string
  toUserId?: string
  fromUserName: string
  fromUserIsBot: boolean
  content?: string
  fileUrl?: string
  fileName?: string
  isRead: boolean
  createdAt: Date
}
