/**
 * Fastify 应用工厂 —— 注册安全中间件与路由
 */

import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { ZodError } from 'zod'
import { config } from './config.js'
import { authRoutes } from './auth/routes.js'
import { adminRoutes } from './admin/routes.js'
import { roomRoutes } from './rooms/routes.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isProd
      ? true
      : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } },
    trustProxy: true,
  })

  // 安全 HTTP 头
  await app.register(helmet, {
    contentSecurityPolicy: false, // H5 前端单独部署，API 不需要 CSP
  })

  // CORS 白名单
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  })

  // Cookie（httpOnly refresh token）
  await app.register(cookie)

  // 全局限流（防暴力请求）
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  })

  // 统一错误处理
  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: '参数校验失败', details: err.flatten() })
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message })
    }
    app.log.error(err)
    return reply.code(500).send({ error: '服务器内部错误' })
  })

  // 健康检查
  app.get('/health', async () => ({ ok: true, ts: Date.now() }))

  // 业务路由
  await app.register(authRoutes)
  await app.register(adminRoutes)
  await app.register(roomRoutes)

  return app
}
