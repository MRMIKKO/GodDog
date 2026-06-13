/**
 * 牌型识别 —— 从一组牌识别出合法牌型组合
 * 规则依据 docs/card-rules-table.md 第 2~3 节
 */

import type { Card, Combo } from './types.js'
import { WEN_WU_PAIRS } from './tiles.js'

/** 文牌对的 rank 排序（用于三文/四文武跨子类比较；天九 > 地八 > 人七 > 鹅五） */
function wenWuPairRank(wenLogicKey: string): number | null {
  return WEN_WU_PAIRS[wenLogicKey]?.rank ?? null
}

function isWen(c: Card): boolean {
  return c.suit === 'wen'
}
function isWu(c: Card): boolean {
  return c.suit === 'wu'
}

function sortByRankDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => b.rank - a.rank)
}

/**
 * 识别牌型。无法识别（非法组合）返回 null。
 */
export function detectCombo(input: Card[]): Combo | null {
  if (!input || input.length < 1 || input.length > 4) return null
  const cards = sortByRankDesc(input)
  const size = cards.length

  switch (size) {
    case 1:
      return detectSingle(cards)
    case 2:
      return detectDouble(cards)
    case 3:
      return detectTriple(cards)
    case 4:
      return detectQuad(cards)
    default:
      return null
  }
}

function detectSingle(cards: Card[]): Combo | null {
  const c = cards[0]
  if (isWen(c)) {
    return {
      type: 'single_wen',
      comboKey: 'single_wen',
      compareGroup: 'single_wen',
      power: c.rank,
      size: 1,
      cards,
    }
  }
  return {
    type: 'single_wu',
    comboKey: 'single_wu',
    compareGroup: 'single_wu',
    power: c.rank,
    size: 1,
    cards,
  }
}

function detectDouble(cards: Card[]): Combo | null {
  const [a, b] = cards
  const wens = cards.filter(isWen)
  const wus = cards.filter(isWu)

  // 文尊：双鼻屎六（优先于普通文对）
  if (wens.length === 2 && a.logicKey === 'wen_bishiliu' && b.logicKey === 'wen_bishiliu') {
    return {
      type: 'zun_wen',
      comboKey: 'wen_zun',
      compareGroup: 'zun_wen',
      power: 1,
      size: 2,
      cards,
    }
  }

  // 武尊：三点 + 六点
  if (wus.length === 2) {
    const keys = new Set([a.logicKey, b.logicKey])
    if (keys.has('wu_sandian') && keys.has('wu_liudian')) {
      return {
        type: 'zun_wu',
        comboKey: 'wu_zun',
        compareGroup: 'zun_wu',
        power: 1,
        size: 2,
        cards,
      }
    }
  }

  // 文对：同文名两张
  if (wens.length === 2 && a.logicKey === b.logicKey) {
    return {
      type: 'pair_wen',
      comboKey: `pair_${a.logicKey}`,
      compareGroup: 'pair_wen',
      power: a.rank,
      size: 2,
      cards,
    }
  }

  // 武对：同点级两张（九/八/七/五）
  if (wus.length === 2 && a.point !== undefined && a.point === b.point) {
    return {
      type: 'pair_wu',
      comboKey: `pair_wu_${a.point}`,
      compareGroup: 'pair_wu',
      power: a.rank,
      size: 2,
      cards,
    }
  }

  // 文武对：天九/地八/人七/鹅五
  if (wens.length === 1 && wus.length === 1) {
    const wen = wens[0]
    const wu = wus[0]
    const def = WEN_WU_PAIRS[wen.logicKey]
    if (def && wu.point === def.wuPoint) {
      return {
        type: 'pair_wen_wu',
        comboKey: def.comboKey,
        // 文武对：只和同一子类比较（天九只和天九比）→ compareGroup 含 comboKey
        compareGroup: `pair_wen_wu_${def.comboKey}`,
        power: def.rank,
        size: 2,
        cards,
      }
    }
  }

  return null
}

function detectTriple(cards: Card[]): Combo | null {
  const wens = cards.filter(isWen)
  const wus = cards.filter(isWu)

  // 三文：一对文牌 + 一张武牌（天天+九点 等）
  if (wens.length === 2 && wus.length === 1) {
    const [w1, w2] = wens
    if (w1.logicKey === w2.logicKey) {
      const def = WEN_WU_PAIRS[w1.logicKey]
      if (def && wus[0].point === def.wuPoint) {
        return {
          type: 'triple_wen',
          comboKey: `triple_${def.comboKey}`,
          compareGroup: 'triple_wen',
          power: def.rank,
          size: 3,
          cards,
        }
      }
    }
  }

  // 三武：一张文牌 + 两张同点级武牌（天+九点A+九点B 等）
  if (wens.length === 1 && wus.length === 2) {
    const wen = wens[0]
    const [u1, u2] = wus
    const def = WEN_WU_PAIRS[wen.logicKey]
    if (def && u1.point === def.wuPoint && u2.point === def.wuPoint && u1.point !== undefined) {
      return {
        type: 'triple_wu',
        comboKey: `triple_${def.comboKey}`,
        compareGroup: 'triple_wu',
        power: def.rank,
        size: 3,
        cards,
      }
    }
  }

  return null
}

function detectQuad(cards: Card[]): Combo | null {
  const wens = cards.filter(isWen)
  const wus = cards.filter(isWu)

  // 四文武：一对文牌 + 两张同点级武牌（天天+九点A+九点B 等）
  if (wens.length === 2 && wus.length === 2) {
    const [w1, w2] = wens
    const [u1, u2] = wus
    if (w1.logicKey === w2.logicKey) {
      const def = WEN_WU_PAIRS[w1.logicKey]
      if (
        def &&
        u1.point === def.wuPoint &&
        u2.point === def.wuPoint &&
        u1.point !== undefined &&
        wenWuPairRank(w1.logicKey) !== null
      ) {
        return {
          type: 'quad_wen_wu',
          comboKey: `quad_${def.comboKey}`,
          compareGroup: 'quad_wen_wu',
          power: def.rank,
          size: 4,
          cards,
        }
      }
    }
  }

  return null
}

/** 判断一组牌是否为合法牌型 */
export function isValidCombo(cards: Card[]): boolean {
  return detectCombo(cards) !== null
}
