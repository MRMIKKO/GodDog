/**
 * HTTP API 封装 —— 走 Vite 代理 /api -> :3000
 * access token 内存保存，附加到 Authorization 头。
 */

let accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

interface RequestOptions {
  method?: string
  body?: unknown
  auth?: boolean
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const hasBody = opts.body !== undefined
  if (hasBody) headers['Content-Type'] = 'application/json'
  if (opts.auth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `请求失败 (${res.status})`)
  }
  return data as T
}

export interface PublicUser {
  id: string
  nickname: string
  avatar: string | null
  beans: number
  isAdmin: boolean
  isBound: boolean
  username: string | null
}

export const api = {
  guestLogin: (guestId?: string, nickname?: string) =>
    request<{ accessToken: string; guestId: string; user: PublicUser }>('/auth/guest', {
      method: 'POST',
      body: { guestId, nickname },
      auth: false,
    }),

  refresh: () =>
    request<{ accessToken: string; user: PublicUser }>('/auth/refresh', {
      method: 'POST',
      auth: false,
    }),

  me: () => request<{ user: PublicUser }>('/auth/me'),

  bind: (username: string, password: string) =>
    request<{ user: PublicUser }>('/auth/bind', {
      method: 'POST',
      body: { username, password },
    }),

  login: (username: string, password: string) =>
    request<{ accessToken: string; guestId: string; user: PublicUser }>('/auth/login', {
      method: 'POST',
      body: { username, password },
      auth: false,
    }),

  createRoom: () => request<{ roomCode: string }>('/rooms', { method: 'POST' }),

  getRoom: (code: string) => request<{ state: unknown }>(`/rooms/${code}`),
}
