/**
 * 房间管理器 —— 进程内内存维护所有房间与对局生命周期
 * 单实例部署；如需横向扩展再引入 Redis 适配。
 */

import { customAlphabet } from 'nanoid'
import {
  type PlayerState,
  type RoomStatePayload,
  type RoundEndPayload,
  settle,
  type PlayerSettleInput,
} from '@goddog/shared'
import { GameRound } from './engine.js'
import type { RoomMeta, SeatPlayer } from './types.js'
import { prisma } from '../db.js'

/** 6 位大写字母+数字房间码（去除易混淆字符） */
const genCode = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6)

const SEATS = 4

export interface Room {
  meta: RoomMeta
  seats: (SeatPlayer | null)[]
  round: GameRound | null
}

class RoomManager {
  private rooms = new Map<string, Room>()
  /** userId -> roomCode，便于断线重连定位 */
  private userRoom = new Map<string, string>()

  createRoom(hostUserId: string): Room {
    let code = genCode()
    while (this.rooms.has(code)) code = genCode()
    const room: Room = {
      meta: {
        roomCode: code,
        hostUserId,
        phase: 'waiting',
        kamPool: 40,
        bankerSeat: -1,
        bankerStreakMultiplier: 1,
        roundNo: 0,
      },
      seats: [null, null, null, null],
      round: null,
    }
    this.rooms.set(code, room)
    return room
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code)
  }

  getUserRoom(userId: string): Room | undefined {
    const code = this.userRoom.get(userId)
    return code ? this.rooms.get(code) : undefined
  }

  /** 加入房间，返回分配的座位号；满员或异常返回错误 */
  joinRoom(
    code: string,
    player: { userId: string; nickname: string; beans: number; socketId: string },
  ): { ok: true; seat: number; room: Room } | { ok: false; error: string } {
    const room = this.rooms.get(code)
    if (!room) return { ok: false, error: '房间不存在' }

    // 已在房间内 → 重连，更新 socketId
    const existing = room.seats.find((s) => s?.userId === player.userId)
    if (existing) {
      existing.socketId = player.socketId
      existing.connected = true
      this.userRoom.set(player.userId, code)
      return { ok: true, seat: existing.seat, room }
    }

    if (room.meta.phase !== 'waiting') {
      return { ok: false, error: '游戏已开始，无法加入' }
    }
    const seatIdx = room.seats.findIndex((s) => s === null)
    if (seatIdx < 0) return { ok: false, error: '房间已满' }

    room.seats[seatIdx] = {
      seat: seatIdx,
      userId: player.userId,
      nickname: player.nickname,
      beans: player.beans,
      ready: false,
      connected: true,
      socketId: player.socketId,
    }
    this.userRoom.set(player.userId, code)
    return { ok: true, seat: seatIdx, room }
  }

  leaveRoom(userId: string): Room | undefined {
    const room = this.getUserRoom(userId)
    if (!room) return undefined
    const seat = room.seats.find((s) => s?.userId === userId)
    if (seat) {
      // 游戏中仅标记离线，等待重连；等待中则移除座位
      if (room.meta.phase === 'waiting') {
        room.seats[seat.seat] = null
      } else {
        seat.connected = false
        seat.socketId = null
      }
    }
    this.userRoom.delete(userId)
    if (room.meta.phase === 'waiting' && room.seats.every((s) => s === null)) {
      this.rooms.delete(room.meta.roomCode)
    }
    return room
  }

  markDisconnected(socketId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      const seat = room.seats.find((s) => s?.socketId === socketId)
      if (seat) {
        seat.connected = false
        seat.socketId = null
        return room
      }
    }
    return undefined
  }

  setReady(userId: string, ready: boolean): Room | undefined {
    const room = this.getUserRoom(userId)
    if (!room) return undefined
    const seat = room.seats.find((s) => s?.userId === userId)
    if (seat) seat.ready = ready
    return room
  }

  /** 是否满足开局条件：4 座位全满且全部准备 */
  canStart(room: Room): boolean {
    return room.seats.every((s) => s !== null && s.ready && s.connected)
  }

  /** 开始新一局 */
  startRound(room: Room, prevWinnerSeat: number): { firstSeat: number; bankerSeat: number; diceRolls: Record<number, number> } {
    const nicknames = room.seats.map((s) => s!.nickname)
    const round = new GameRound(nicknames)
    const res = round.start(prevWinnerSeat)
    room.round = round
    room.meta.phase = 'playing'
    room.meta.bankerSeat = res.bankerSeat
    room.meta.roundNo += 1
    return res
  }

  /** 构造房间公开状态 */
  roomState(room: Room): RoomStatePayload {
    return {
      roomCode: room.meta.roomCode,
      phase: room.meta.phase,
      hostSeat: room.seats.findIndex((s) => s?.userId === room.meta.hostUserId),
      seats: room.seats.map((s, i) => ({
        seat: i,
        userId: s?.userId ?? null,
        nickname: s?.nickname ?? null,
        beans: s?.beans ?? null,
        ready: s?.ready ?? false,
        connected: s?.connected ?? false,
      })),
    }
  }

  /** 玩家公开状态（用于游戏视图） */
  playerStates(room: Room): PlayerState[] {
    const round = room.round
    return room.seats.map((s, i) => ({
      seat: i,
      userId: s?.userId ?? '',
      nickname: s?.nickname ?? '',
      handCount: round?.hands[i]?.length ?? 0,
      dongs: round?.dongs[i] ?? 0,
      eliminated: false,
      connected: s?.connected ?? false,
    }))
  }

  /**
   * 结算一局：计算分数、持久化欢乐豆与对局记录、更新房间元信息。
   */
  async settleRound(room: Room): Promise<RoundEndPayload> {
    const round = room.round
    if (!round || !round.outcome) throw new Error('当前没有可结算的对局')
    const outcome = round.outcome

    const players: PlayerSettleInput[] = room.seats.map((s) => ({
      seat: s!.seat,
      dongs: outcome.dongs[s!.seat] ?? 0,
      isBanker: s!.seat === room.meta.bankerSeat,
    }))

    const result = settle({
      players,
      winnerSeat: outcome.winnerSeat,
      bankerStreakMultiplier: room.meta.bankerStreakMultiplier,
      kamPool: room.meta.kamPool,
      tingji: outcome.tingjiLoserSeat !== undefined,
      tingjiLoserSeat: outcome.tingjiLoserSeat,
      quadDirectWin: outcome.quadDirectWin,
    })

    // 更新连庄：胜方为原庄则连庄递增，否则重置为 1
    const winnerWasBanker = outcome.winnerSeat === room.meta.bankerSeat
    room.meta.bankerStreakMultiplier = winnerWasBanker
      ? room.meta.bankerStreakMultiplier + 1
      : 1
    room.meta.kamPool = result.kamPool

    // 持久化：欢乐豆变动 + 对局记录（事务）
    await prisma.$transaction(async (tx) => {
      for (const s of room.seats) {
        if (!s) continue
        const delta = result.deltas[s.seat] ?? 0
        const user = await tx.user.update({
          where: { id: s.userId },
          data: { beans: { increment: delta } },
        })
        s.beans = user.beans
        if (delta !== 0) {
          await tx.beanLog.create({
            data: {
              userId: s.userId,
              amount: delta,
              balance: user.beans,
              type: 'game',
              memo: `${room.meta.roomCode} 第${room.meta.roundNo}局`,
            },
          })
        }
        await tx.gameRecord.create({
          data: {
            userId: s.userId,
            roomCode: room.meta.roomCode,
            roundNo: room.meta.roundNo,
            dongs: outcome.dongs[s.seat] ?? 0,
            scoreChange: delta,
            isBanker: s.seat === room.meta.bankerSeat,
            isWinner: s.seat === outcome.winnerSeat,
          },
        })
      }
    })

    room.meta.phase = 'settling'
    // 重置准备状态，等待下一局
    for (const s of room.seats) if (s) s.ready = false

    return {
      winnerSeat: outcome.winnerSeat,
      deltas: result.deltas,
      dongs: outcome.dongs,
      kamPool: result.kamPool,
      daoKam: result.daoKam,
      tingji: result.tingji,
      nextBankerSeat: outcome.winnerSeat,
    }
  }

  get seatCount(): number {
    return SEATS
  }
}

export const roomManager = new RoomManager()
