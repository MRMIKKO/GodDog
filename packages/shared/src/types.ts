/**
 * 共享类型定义 —— 前后端公用
 */

import type { TileSuit } from './tiles.js'

/** 已发到玩家手中的牌实例（带唯一 id） */
export interface Card {
  /** 唯一实例 id，例如 'wen_tian#0' */
  id: string
  /** 牌种逻辑键 */
  logicKey: string
  suit: TileSuit
  rank: number
  point?: number
}

/** 牌型门类 —— 严格同类压同类 */
export type ComboType =
  | 'single_wen'
  | 'single_wu'
  | 'pair_wen'
  | 'pair_wu'
  | 'pair_wen_wu'
  | 'triple_wen'
  | 'triple_wu'
  | 'quad_wen_wu'
  | 'zun_wen'
  | 'zun_wu'

/** 识别后的牌型组合 */
export interface Combo {
  type: ComboType
  /** 细分键（如 tian_jiu / pair_wen_gaojiaoqi / wen_zun） */
  comboKey: string
  /** 比较分组：仅相同分组之间可比大小 */
  compareGroup: string
  /** 组内比较力（严格大于才可压制） */
  power: number
  /** 牌数 */
  size: number
  /** 组成的牌 */
  cards: Card[]
}

/** 出牌动作类型 */
export type PlayActionType = 'play' | 'pass'

/** 游戏阶段 */
export type GamePhase = 'waiting' | 'dice' | 'playing' | 'settling' | 'finished'

/** 单个玩家在一局中的状态 */
export interface PlayerState {
  seat: number
  userId: string
  nickname: string
  /** 手牌数量（对其他玩家只暴露数量） */
  handCount: number
  /** 本局已赢栋数 */
  dongs: number
  /** 是否已失去结牌资格 */
  eliminated: boolean
  /** 是否在线 */
  connected: boolean
}
