import { io, Socket } from 'socket.io-client'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
let socket: Socket | null = null

export function getSocket(token: string): Socket {
  if (!socket) {
    socket = io(BASE, { auth: { token }, autoConnect: true, reconnectionAttempts: 5 })
  }
  return socket
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null }
}
