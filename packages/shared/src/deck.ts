/**
 * 牌堆生成、洗牌与发牌 —— 服务端权威逻辑使用
 */

import type { Card } from './types.js'
import { ALL_TILE_DEFS } from './tiles.js'

/** 生成完整 32 张牌堆（带唯一实例 id） */
export function createDeck(): Card[] {
  const deck: Card[] = []
  for (const def of ALL_TILE_DEFS) {
    for (let i = 0; i < def.copies; i++) {
      deck.push({
        id: `${def.logicKey}#${i}`,
        logicKey: def.logicKey,
        suit: def.suit,
        rank: def.rank,
        point: def.point,
      })
    }
  }
  return deck
}

/**
 * 简单可种子化伪随机数生成器（mulberry32）。
 * 服务端用密码学随机种子初始化，保证不可预测；测试可用固定种子复现。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates 洗牌（不修改原数组） */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 发牌：4 人，每人 8 张。
 * @returns 长度为 4 的二维数组，hands[seat] 为该座位手牌
 */
export function deal(deck: Card[], players = 4, perPlayer = 8): Card[][] {
  if (deck.length < players * perPlayer) {
    throw new Error('牌堆数量不足，无法发牌')
  }
  const hands: Card[][] = Array.from({ length: players }, () => [])
  for (let i = 0; i < players * perPlayer; i++) {
    hands[i % players].push(deck[i])
  }
  return hands
}
