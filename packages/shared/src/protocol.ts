/**
 * Socket.io 事件协议 —— 前后端共用的事件名与负载类型
 */

import type { Card, Combo, GamePhase, PlayerState } from './types.js'

/** 出牌动作 */
export interface PlayPayload {
  /** 出牌的牌实例 id 列表 */
  cardIds: string[]
  /** 'play' 打牌压制 / 'pass' 垫牌 */
  action: 'play' | 'pass'
}

/** 台面上某一手已出的牌 */
export interface TablePlay {
  seat: number
  action: 'play' | 'pass'
  /** 打牌时公开的牌；垫牌时为牌背（cards 为空，仅暴露数量 count） */
  cards: Card[]
  count: number
  /** 是否为当前栋的最大牌 */
  isLeader: boolean
}

/** 发给某玩家的私有视图（含其完整手牌） */
export interface PlayerView {
  phase: GamePhase
  roomCode: string
  /** 我的座位 */
  mySeat: number
  /** 我的手牌（仅自己可见） */
  myHand: Card[]
  /** 全部玩家公开状态 */
  players: PlayerState[]
  /** 当前轮到出牌的座位 */
  turnSeat: number
  /** 庄家座位 */
  bankerSeat: number
  /** 连庄倍数 */
  bankerStreakMultiplier: number
  /** 当前这一栋已出的牌 */
  currentTrick: TablePlay[]
  /** 当前栋需要跟的张数（0 表示我是先手可自由出 1-4 张） */
  requiredCount: number
  /** Kam 公共分池 */
  kamPool: number
  /** 当前栋序号 */
  trickNo: number
}

/** 一栋结束广播 */
export interface DongWonPayload {
  trickNo: number
  winnerSeat: number
  /** 该栋赢得的最大牌型 */
  winningCombo: Combo | null
  /** 本栋4人完整出牌记录（含牌面），供客户端冻结展示 */
  trickPlays: TablePlay[]
}

/** 一局结算广播 */
export interface RoundEndPayload {
  winnerSeat: number
  /** 各座位欢乐豆变动 */
  deltas: Record<number, number>
  /** 各座位本局栋数 */
  dongs: Record<number, number>
  kamPool: number
  daoKam: boolean
  tingji: boolean
  /** 下一局庄家 */
  nextBankerSeat: number
}

/** 客户端 -> 服务端事件 */
export interface ClientToServerEvents {
  'room:join': (data: { roomCode: string }, ack: (res: AckResult) => void) => void
  'room:leave': (ack?: (res: AckResult) => void) => void
  'room:ready': (data: { ready: boolean }, ack?: (res: AckResult) => void) => void
  'game:dice_roll': (ack?: (res: AckResult) => void) => void
  'game:play': (data: PlayPayload, ack: (res: AckResult) => void) => void
  'game:sync': (ack: (res: AckResult<PlayerView>) => void) => void
}

/** 服务端 -> 客户端事件 */
export interface ServerToClientEvents {
  'room:state': (data: RoomStatePayload) => void
  'game:view': (data: PlayerView) => void
  'game:played': (data: TablePlay & { nextTurnSeat: number }) => void
  'game:dice_result': (data: { rolls: Record<number, number>; firstSeat: number }) => void
  'game:dong_won': (data: DongWonPayload) => void
  'game:round_end': (data: RoundEndPayload) => void
  'game:error': (data: { message: string }) => void
}

/** 房间公开状态 */
export interface RoomStatePayload {
  roomCode: string
  phase: GamePhase
  seats: Array<{
    seat: number
    userId: string | null
    nickname: string | null
    beans: number | null
    ready: boolean
    connected: boolean
  }>
  hostSeat: number
}

/** 通用 ack 返回 */
export interface AckResult<T = undefined> {
  ok: boolean
  error?: string
  data?: T
}
