import { describe, it, expect } from 'vitest'
import { detectCombo } from '../src/combos.js'
import { canBeat } from '../src/rules.js'
import type { Card, Combo } from '../src/types.js'
import { TILE_DEF_MAP } from '../src/tiles.js'

function tile(logicKey: string, copy = 0): Card {
  const def = TILE_DEF_MAP[logicKey]
  if (!def) throw new Error(`未知牌 ${logicKey}`)
  return { id: `${logicKey}#${copy}`, logicKey, suit: def.suit, rank: def.rank, point: def.point }
}

function combo(...keys: Array<[string, number?]>): Combo {
  const cards = keys.map(([k, c]) => tile(k, c ?? 0))
  const detected = detectCombo(cards)
  if (!detected) throw new Error('测试牌型非法')
  return detected
}

describe('canBeat - 单张', () => {
  it('大文压小文', () => {
    expect(canBeat(combo(['wen_tian']), combo(['wen_di']))).toBe(true)
  })
  it('小文压不过大文', () => {
    expect(canBeat(combo(['wen_di']), combo(['wen_tian']))).toBe(false)
  })
  it('文武不混压：单武压不过单文', () => {
    expect(canBeat(combo(['wu_jiudian_a']), combo(['wen_bishiliu']))).toBe(false)
  })
})

describe('canBeat - 同 rank 先出为大', () => {
  it('九点A 与 九点B 同级，无法压制（只能垫牌）', () => {
    expect(canBeat(combo(['wu_jiudian_b']), combo(['wu_jiudian_a']))).toBe(false)
    expect(canBeat(combo(['wu_jiudian_a']), combo(['wu_jiudian_b']))).toBe(false)
  })
  it('天九A 与 天九B 同级，无法压制', () => {
    const a = combo(['wen_tian'], ['wu_jiudian_a'])
    const b = combo(['wen_tian'], ['wu_jiudian_b'])
    expect(canBeat(a, b)).toBe(false)
    expect(canBeat(b, a)).toBe(false)
  })
})

describe('canBeat - 文武对只和同子类比', () => {
  it('天九压不过地八（不同子类）', () => {
    const tianjiu = combo(['wen_tian'], ['wu_jiudian_a'])
    const diba = combo(['wen_di'], ['wu_badian_a'])
    expect(canBeat(tianjiu, diba)).toBe(false)
    expect(canBeat(diba, tianjiu)).toBe(false)
  })
})

describe('canBeat - 三文按文牌对 rank 排序', () => {
  it('三文天九压制三文地八', () => {
    const tianjiu = combo(['wen_tian', 0], ['wen_tian', 1], ['wu_jiudian_a'])
    const diba = combo(['wen_di', 0], ['wen_di', 1], ['wu_badian_a'])
    expect(canBeat(tianjiu, diba)).toBe(true)
    expect(canBeat(diba, tianjiu)).toBe(false)
  })
  it('三文压不过三武（同类规则）', () => {
    const tripleWen = combo(['wen_tian', 0], ['wen_tian', 1], ['wu_jiudian_a'])
    const tripleWu = combo(['wen_e'], ['wu_wudian_a'], ['wu_wudian_b'])
    expect(canBeat(tripleWen, tripleWu)).toBe(false)
  })
})

describe('canBeat - 尊牌', () => {
  it('武尊天下无敌，任何牌压不过', () => {
    const wuzun = combo(['wu_sandian'], ['wu_liudian'])
    const pairTian = combo(['wen_tian', 0], ['wen_tian', 1])
    expect(canBeat(pairTian, wuzun)).toBe(false)
  })
  it('文尊只能被双高脚七压制', () => {
    const wenzun = combo(['wen_bishiliu', 0], ['wen_bishiliu', 1])
    const gaojiaoqi = combo(['wen_gaojiaoqi', 0], ['wen_gaojiaoqi', 1])
    const pairTian = combo(['wen_tian', 0], ['wen_tian', 1])
    expect(canBeat(gaojiaoqi, wenzun)).toBe(true)
    expect(canBeat(pairTian, wenzun)).toBe(false)
  })
})
