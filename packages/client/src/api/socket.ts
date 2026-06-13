/**
 * Socket.io 客户端封装 —— 单例连接，带 JWT 鉴权与自动重连
 */

import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@goddog/shared'

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: GameSocket | null = null

export function connectSocket(token: string): GameSocket {
  if (socket) {
    socket.auth = { token }
    if (!socket.connected) socket.connect()
    return socket
  }
  socket = io({
    path: '/socket.io',
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
  })
  return socket
}

export function getSocket(): GameSocket | null {
  return socket
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}

/** Promise 化的 emit + ack */
export function emitAck<T = undefined>(
  event: keyof ClientToServerEvents,
  payload?: unknown,
): Promise<{ ok: boolean; error?: string; data?: T }> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, error: '未连接服务器' })
    const cb = (res: { ok: boolean; error?: string; data?: T }) => resolve(res)
    if (payload === undefined) {
      ;(socket.emit as (e: string, cb: unknown) => void)(event, cb)
    } else {
      ;(socket.emit as (e: string, p: unknown, cb: unknown) => void)(event, payload, cb)
    }
  })
}
