/**
 * 管理员路由 —— 欢乐豆充值与用户查询
 * 受 requireAdmin 保护；另支持 X-Admin-Key 头作为带外管理通道。
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { config } from '../config.js'
import { requireAdmin } from '../auth/middleware.js'

const rechargeSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().refine((n) => n !== 0, '充值额不能为 0'),
  memo: z.string().max(100).optional(),
})

const querySchema = z.object({
  keyword: z.string().max(40).optional(),
})

/** 管理鉴权：管理员 JWT 或带外 X-Admin-Key */
async function adminGuard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKey = req.headers['x-admin-key']
  if (typeof apiKey === 'string' && apiKey === config.adminApiKey) {
    return
  }
  await requireAdmin(req, reply)
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // 查询用户列表 / 搜索
  app.get('/admin/users', { preHandler: adminGuard }, async (req) => {
    const { keyword } = querySchema.parse(req.query ?? {})
    const users = await prisma.user.findMany({
      where: keyword
        ? {
            OR: [
              { nickname: { contains: keyword } },
              { username: { contains: keyword } },
              { guestId: { contains: keyword } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        guestId: true,
        nickname: true,
        username: true,
        beans: true,
        isBound: true,
        createdAt: true,
      },
    })
    return { users }
  })

  // 充值 / 扣减欢乐豆（原子事务）
  app.post('/admin/recharge', { preHandler: adminGuard }, async (req, reply) => {
    const body = rechargeSchema.parse(req.body)

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: body.userId } })
      if (!user) return null
      const newBalance = user.beans + body.amount
      if (newBalance < 0) {
        throw new Error('扣减后余额不能为负')
      }
      const updated = await tx.user.update({
        where: { id: body.userId },
        data: { beans: newBalance },
      })
      await tx.beanLog.create({
        data: {
          userId: user.id,
          amount: body.amount,
          balance: newBalance,
          type: 'recharge',
          memo: body.memo ?? '管理员充值',
        },
      })
      return updated
    })

    if (!result) return reply.code(404).send({ error: '用户不存在' })
    return { userId: result.id, beans: result.beans }
  })

  // 查询某用户的欢乐豆流水
  app.get('/admin/users/:id/logs', { preHandler: adminGuard }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const logs = await prisma.beanLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { logs }
  })
}
