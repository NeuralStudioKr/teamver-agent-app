const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('ta_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  login: (email: string, password: string) =>
    request<any>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) =>
    request<any>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  me: () => request<any>('/auth/me'),
  deleteAccount: (password: string) =>
    request<any>('/auth/me', { method: 'DELETE', body: JSON.stringify({ password }) }),

  getWorkspace: () => request<any>('/workspace'),
  updateWorkspace: (data: any) => request<any>('/workspace', { method: 'PATCH', body: JSON.stringify(data) }),
  uploadLogo: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const token = getToken()
    return fetch(`${BASE}/workspace/logo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(r => r.json())
  },

  getChannels: () => request<any[]>('/channels'),
  createChannel: (name: string, description?: string) =>
    request<any>('/channels', { method: 'POST', body: JSON.stringify({ name, description }) }),
  getMessages: (channelId: string) => request<any[]>(`/channels/${channelId}/messages`),
  getChannelMembers: (channelId: string) => request<any[]>(`/channels/${channelId}/members`),
  inviteChannelMember: (channelId: string, userId: string) =>
    request<any>(`/channels/${channelId}/members`, { method: 'POST', body: JSON.stringify({ userId }) }),
  getMembers: () => request<any[]>('/members'),

  getThreadReplies: (messageId: string) => request<any[]>(`/messages/${messageId}/replies`),
  addReaction: (messageId: string, emoji: string) =>
    request<any>(`/messages/${messageId}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) }),

  getDmConversations: () => request<any[]>('/dm/conversations'),
  getDmMessages: (userId: string) => request<any[]>(`/dm/${userId}/messages`),
  sendDmMessage: (userId: string, content: string) =>
    request<any>(`/dm/${userId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),

  uploadFile: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const token = getToken()
    return fetch(`${BASE}/files/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(r => r.json())
  },
}

export function saveToken(token: string) { localStorage.setItem('ta_token', token) }
export function clearToken() { localStorage.removeItem('ta_token') }
export function getApiBase() { return BASE }
