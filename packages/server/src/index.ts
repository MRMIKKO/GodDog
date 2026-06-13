/**
 * 服务端入口 —— 启动 Fastify + Socket.io，处理优雅退出
 */

import './env.js' // 必须最先执行：加载 .env 到 process.env
import { Server as SocketServer } from 'socket.io'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@goddog/shared'
import { buildApp } from './app.js'
import { config } from './config.js'
import { disconnectDb } from './db.js'
import { registerGameSocket, type SocketData } from './game/socket.js'

async function main(): Promise<void> {
  const app = await buildApp()

  // Socket.io 挂载到 Fastify 的 HTTP server
  const io = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(app.server, {
    cors: {
      origin: config.corsOrigins,
      credentials: true,
    },
  })
  registerGameSocket(io)

  await app.listen({ port: config.port, host: config.host })
  app.log.info(`天九至尊服务端已启动 :${config.port}`)

  const shutdown = async (signal: string) => {
    app.log.info(`收到 ${signal}，正在优雅退出…`)
    io.close()
    await app.close()
    await disconnectDb()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('服务端启动失败：', err)
  process.exit(1)
})
