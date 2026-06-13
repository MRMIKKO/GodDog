/**
 * 认证路由
 * - POST /auth/guest    游客登录（无 guestId 则创建，赠送欢乐豆）
 * - POST /auth/refresh  刷新 access token
 * - POST /auth/bind     绑定正式账号（用户名+密码）
 * - POST /auth/login    已绑定账号登录
 * - GET  /auth/me       当前用户信息
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { prisma } from '../db.js'
import { config } from '../config.js'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './jwt.js'
import { requireAuth } from './middleware.js'

const guestSchema = z.object({
  guestId: z.string().min(8).max(64).optional(),
  nickname: z.string().min(1).max(16).optional(),
})

const bindSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, '用户名仅允许字母、数字、下划线'),
  password: z.string().min(6).max(64),
})

const loginSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(6).max(64),
})

const refreshTtlSeconds = (days: number) => days * 24 * 60 * 60

export async function authRoutes(app: FastifyInstance): Promise<void> {
  async function issueTokens(user: {
    id: string
    guestId: string
    isAdmin: boolean
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await signAccessToken({
      sub: user.id,
      guestId: user.guestId,
      isAdmin: user.isAdmin,
    })
    const refreshToken = await signRefreshToken({ sub: user.id, jti: randomUUID() })
    return { accessToken, refreshToken }
  }

  function setRefreshCookie(reply: import('fastify').FastifyReply, token: string): void {
    reply.setCookie('refresh_token', token, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      path: '/auth',
      maxAge: refreshTtlSeconds(config.jwt.refreshTtlDays),
    })
  }

  // 游客登录 / 注册
  app.post('/auth/guest', async (req, reply) => {
    const body = guestSchema.parse(req.body ?? {})
    const guestId = body.guestId ?? randomUUID()

    let user = await prisma.user.findUnique({ where: { guestId } })
    if (!user) {
      const nickname = body.nickname?.trim() || `豆友${guestId.slice(0, 4)}`
      user = await prisma.user.create({
        data: {
          guestId,
          nickname,
          beans: config.signupBeans,
        },
      })
      await prisma.beanLog.create({
        data: {
          userId: user.id,
          amount: config.signupBeans,
          balance: user.beans,
          type: 'signup',
          memo: '注册赠送',
        },
      })
    }

    const tokens = await issueTokens(user)
    setRefreshCookie(reply, tokens.refreshToken)
    return {
      accessToken: tokens.accessToken,
      guestId: user.guestId,
      user: publicUser(user),
    }
  })

  // 刷新 access token
  app.post('/auth/refresh', async (req, reply) => {
    const token = (req.cookies as Record<string, string | undefined>)?.refresh_token
    if (!token) return reply.code(401).send({ error: '缺少刷新令牌' })
    try {
      const payload = await verifyRefreshToken(token)
      const user = await prisma.user.findUnique({ where: { id: payload.sub } })
      if (!user) return reply.code(401).send({ error: '用户不存在' })
      const tokens = await issueTokens(user)
      setRefreshCookie(reply, tokens.refreshToken)
      return { accessToken: tokens.accessToken, user: publicUser(user) }
    } catch {
      return reply.code(401).send({ error: '刷新令牌无效或已过期' })
    }
  })

  // 绑定正式账号（在游客身份基础上升级）
  app.post('/auth/bind', { preHandler: requireAuth }, async (req, reply) => {
    const body = bindSchema.parse(req.body)
    const userId = req.user!.sub

    const existing = await prisma.user.findUnique({ where: { username: body.username } })
    if (existing) return reply.code(409).send({ error: '用户名已被占用' })

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.code(404).send({ error: '用户不存在' })
    if (user.isBound) return reply.code(409).send({ error: '该账号已绑定，无法重复绑定' })

    const passwordHash = await bcrypt.hash(body.password, 12)
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { username: body.username, passwordHash, isBound: true },
    })
    return { user: publicUser(updated) }
  })

  // 已绑定账号登录（换设备/清缓存后找回）
  app.post('/auth/login', async (req, reply) => {
    const body = loginSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { username: body.username } })
    if (!user || !user.passwordHash) {
      return reply.code(401).send({ error: '用户名或密码错误' })
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash)
    if (!ok) return reply.code(401).send({ error: '用户名或密码错误' })

    const tokens = await issueTokens(user)
    setRefreshCookie(reply, tokens.refreshToken)
    return { accessToken: tokens.accessToken, guestId: user.guestId, user: publicUser(user) }
  })

  // 当前用户
  app.get('/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } })
    if (!user) return reply.code(404).send({ error: '用户不存在' })
    return { user: publicUser(user) }
  })
}

/** 对外暴露的安全用户字段（不含密码哈希） */
function publicUser(u: {
  id: string
  nickname: string
  avatar: string | null
  beans: number
  isAdmin: boolean
  isBound: boolean
  username: string | null
}) {
  return {
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar,
    beans: u.beans,
    isAdmin: u.isAdmin,
    isBound: u.isBound,
    username: u.username,
  }
}
