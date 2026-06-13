/**
 * 认证中间件 —— Fastify preHandler，校验 access token
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import { verifyAccessToken, type AccessPayload } from './jwt.js'

declare module 'fastify' {
  interface FastifyRequest {
    user?: AccessPayload
  }
}

/** 从 Authorization 头或 cookie 提取 access token */
function extractToken(req: FastifyRequest): string | null {
  const auth = req.headers.authorization
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7)
  }
  const cookieToken = (req.cookies as Record<string, string | undefined>)?.access_token
  return cookieToken ?? null
}

/** 必须登录 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = extractToken(req)
  if (!token) {
    await reply.code(401).send({ error: '未认证' })
    return
  }
  try {
    req.user = await verifyAccessToken(token)
  } catch {
    await reply.code(401).send({ error: 'token 无效或已过期' })
  }
}

/** 必须管理员 */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(req, reply)
  if (reply.sent) return
  if (!req.user?.isAdmin) {
    await reply.code(403).send({ error: '需要管理员权限' })
  }
}
