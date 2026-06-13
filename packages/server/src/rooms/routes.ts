/**
 * 房间 REST 路由 —— 创建房间 / 查询房间状态
 * 实时交互（加入、出牌等）走 Socket.io。
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.js'
import { prisma } from '../db.js'
import { roomManager } from '../game/manager.js'

export async function roomRoutes(app: FastifyInstance): Promise<void> {
  // 创建房间
  app.post('/rooms', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } })
    if (!user) return reply.code(404).send({ error: '用户不存在' })
    const room = roomManager.createRoom(user.id)
    return { roomCode: room.meta.roomCode, state: roomManager.roomState(room) }
  })

  // 查询房间状态
  app.get('/rooms/:code', { preHandler: requireAuth }, async (req, reply) => {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.params)
    const room = roomManager.getRoom(code.toUpperCase())
    if (!room) return reply.code(404).send({ error: '房间不存在' })
    return { state: roomManager.roomState(room) }
  })
}
