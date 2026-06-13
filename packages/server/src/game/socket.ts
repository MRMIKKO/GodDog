/**
 * Socket.io 游戏事件处理 —— 实时对局通信
 * 连接时通过 JWT 鉴权；所有出牌在服务端引擎二次校验。
 */

import type { Server, Socket } from 'socket.io'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  AckResult,
  PlayerView,
  DongWonPayload,
} from '@goddog/shared'
import { verifyAccessToken } from '../auth/jwt.js'
import { prisma } from '../db.js'
import { roomManager, type Room } from './manager.js'

interface SocketData {
  userId: string
  nickname: string
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>
type GameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>

export type { SocketData }

export function registerGameSocket(io: GameServer): void {
  // 鉴权中间件
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined
      if (!token) return next(new Error('未认证'))
      const payload = await verifyAccessToken(token)
      const user = await prisma.user.findUnique({ where: { id: payload.sub } })
      if (!user) return next(new Error('用户不存在'))
      socket.data.userId = user.id
      socket.data.nickname = user.nickname
      next()
    } catch {
      next(new Error('鉴权失败'))
    }
  })

  io.on('connection', (socket) => {
    registerHandlers(io, socket)
  })
}

function registerHandlers(io: GameServer, socket: GameSocket): void {
  const userId = socket.data.userId

  /**
   * 某些刷新/重连路径下，客户端可能未及时 room:join，导致 seat.socketId 过期。
   * 在用户任一有效事件到达时，尽快把座位绑定到当前 socket。
   */
  function bindLatestSocket(room: Room): void {
    const seat = room.seats.find((s) => s?.userId === userId)
    if (!seat) return
    seat.socketId = socket.id
    seat.connected = true
  }

  /**
   * 出牌频率限速（防刷）——滑动窗口：每 `RATE_WINDOW_MS` 内最多 `RATE_MAX` 次。
   * 正常对局每栋一次出牌，远低于此阈值；超限多为脚本刷请求。
   */
  const RATE_WINDOW_MS = 3000
  const RATE_MAX = 8
  const playTimestamps: number[] = []
  function rateLimited(): boolean {
    const now = Date.now()
    while (playTimestamps.length && now - playTimestamps[0] > RATE_WINDOW_MS) {
      playTimestamps.shift()
    }
    if (playTimestamps.length >= RATE_MAX) return true
    playTimestamps.push(now)
    return false
  }

  /** 向房间所有在线玩家分别推送其私有游戏视图 */
  function broadcastViews(room: Room): void {
    if (!room.round) return
    const players = roomManager.playerStates(room)
    for (const seat of room.seats) {
      if (!seat || !seat.socketId) continue
      const view: PlayerView = room.round.getView(
        seat.seat,
        players,
        room.meta.roomCode,
        room.meta.kamPool,
      )
      view.bankerStreakMultiplier = room.meta.bankerStreakMultiplier
      io.to(seat.socketId).emit('game:view', view)
    }
  }

  function broadcastRoomState(room: Room): void {
    io.to(room.meta.roomCode).emit('room:state', roomManager.roomState(room))
  }

  /** 满足开局条件则自动开局 */
  function maybeStart(room: Room): void {
    if (room.meta.phase !== 'waiting' && room.meta.phase !== 'settling') return
    if (!roomManager.canStart(room)) return
    const prevWinner = room.meta.phase === 'settling' ? room.meta.bankerSeat : -1
    const res = roomManager.startRound(room, prevWinner)
    io.to(room.meta.roomCode).emit('game:dice_result', {
      rolls: res.diceRolls,
      firstSeat: res.firstSeat,
    })
    broadcastRoomState(room)
    broadcastViews(room)
  }

  // 加入房间
  socket.on('room:join', async (data, ack) => {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return ack({ ok: false, error: '用户不存在' })
    const res = roomManager.joinRoom(data.roomCode.toUpperCase(), {
      userId: user.id,
      nickname: user.nickname,
      beans: user.beans,
      socketId: socket.id,
    })
    if (!res.ok) return ack({ ok: false, error: res.error })

    await socket.join(res.room.meta.roomCode)
    ack({ ok: true })
    broadcastRoomState(res.room)
    // 重连进行中的对局则补发视图
    if (res.room.round && !res.room.round.finished) broadcastViews(res.room)
  })

  // 离开房间
  socket.on('room:leave', (ack) => {
    const room = roomManager.leaveRoom(userId)
    if (room) {
      void socket.leave(room.meta.roomCode)
      broadcastRoomState(room)
    }
    ack?.({ ok: true })
  })

  // 准备 / 取消准备
  socket.on('room:ready', (data, ack) => {
    const room = roomManager.setReady(userId, data.ready)
    if (!room) return ack?.({ ok: false, error: '不在任何房间' })
    bindLatestSocket(room)
    ack?.({ ok: true })
    broadcastRoomState(room)
    maybeStart(room)
  })

  // 出牌 / 垫牌
  socket.on('game:play', async (data, ack) => {
    if (rateLimited()) return ack({ ok: false, error: '操作过于频繁，请稍后再试' })
    const room = roomManager.getUserRoom(userId)
    if (!room || !room.round) return ack({ ok: false, error: '当前无进行中的对局' })
    bindLatestSocket(room)
    const seat = room.seats.find((s) => s?.userId === userId)
    if (!seat) return ack({ ok: false, error: '不在座位上' })

    const err = room.round.play(seat.seat, data.cardIds, data.action)
    if (err) return ack({ ok: false, error: err })
    ack({ ok: true })

    const lastDong = room.round.lastDong
    if (lastDong) {
      const dongPayload: DongWonPayload = {
        trickNo: lastDong.trickNo,
        winnerSeat: lastDong.winnerSeat,
        winningCombo: lastDong.winningCombo,
        trickPlays: room.round.lastTrick ?? [],
      }
      io.to(room.meta.roomCode).emit('game:dong_won', dongPayload)
    }

    broadcastViews(room)

    // 一局结束 → 结算
    if (room.round.finished) {
      try {
        const result = await roomManager.settleRound(room)
        io.to(room.meta.roomCode).emit('game:round_end', result)
        broadcastRoomState(room)
      } catch (e) {
        io.to(room.meta.roomCode).emit('game:error', {
          message: e instanceof Error ? e.message : '结算失败',
        })
      }
    }
  })

  // 主动同步视图
  socket.on('game:sync', (ack: (res: AckResult<PlayerView>) => void) => {
    const room = roomManager.getUserRoom(userId)
    if (!room || !room.round) return ack({ ok: false, error: '无对局' })
    bindLatestSocket(room)
    const seat = room.seats.find((s) => s?.userId === userId)
    if (!seat) return ack({ ok: false, error: '不在座位上' })
    const players = roomManager.playerStates(room)
    const view = room.round.getView(seat.seat, players, room.meta.roomCode, room.meta.kamPool)
    view.bankerStreakMultiplier = room.meta.bankerStreakMultiplier
    ack({ ok: true, data: view })
  })

  // 断线
  socket.on('disconnect', () => {
    const room = roomManager.markDisconnected(socket.id)
    if (room) broadcastRoomState(room)
  })
}
