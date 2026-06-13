/**
 * 服务端游戏内部状态类型
 */

import type { Card, GamePhase } from '@goddog/shared'

/** 座位上的玩家 */
export interface SeatPlayer {
  seat: number
  userId: string
  nickname: string
  beans: number
  ready: boolean
  connected: boolean
  /** socket id（用于私有推送） */
  socketId: string | null
}

/** 一栋中某玩家的出牌记录 */
export interface TrickPlay {
  seat: number
  action: 'play' | 'pass'
  cards: Card[]
}

/** 房间维度的状态（跨局保留 Kam 池与连庄信息） */
export interface RoomMeta {
  roomCode: string
  hostUserId: string
  phase: GamePhase
  /** Kam 公共分池 */
  kamPool: number
  /** 当前庄家座位（-1 表示未定） */
  bankerSeat: number
  /** 连庄倍数 */
  bankerStreakMultiplier: number
  /** 局序号 */
  roundNo: number
}
