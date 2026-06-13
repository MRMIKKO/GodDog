import { describe, it, expect } from 'vitest'
import { detectCombo } from '../src/combos.js'
import type { Card } from '../src/types.js'
import { TILE_DEF_MAP } from '../src/tiles.js'

/** 测试辅助：按 logicKey 造一张牌 */
function tile(logicKey: string, copy = 0): Card {
  const def = TILE_DEF_MAP[logicKey]
  if (!def) throw new Error(`未知牌 ${logicKey}`)
  return { id: `${logicKey}#${copy}`, logicKey, suit: def.suit, rank: def.rank, point: def.point }
}

describe('detectCombo - 单张', () => {
  it('单文', () => {
    const c = detectCombo([tile('wen_tian')])
    expect(c?.type).toBe('single_wen')
    expect(c?.power).toBe(11)
  })
  it('单武', () => {
    const c = detectCombo([tile('wu_jiudian_a')])
    expect(c?.type).toBe('single_wu')
    expect(c?.power).toBe(6)
  })
})

describe('detectCombo - 双张', () => {
  it('文尊（双鼻屎六）优先于文对', () => {
    const c = detectCombo([tile('wen_bishiliu', 0), tile('wen_bishiliu', 1)])
    expect(c?.type).toBe('zun_wen')
  })
  it('武尊（三点+六点）', () => {
    const c = detectCombo([tile('wu_sandian'), tile('wu_liudian')])
    expect(c?.type).toBe('zun_wu')
  })
  it('文对', () => {
    const c = detectCombo([tile('wen_tian', 0), tile('wen_tian', 1)])
    expect(c?.type).toBe('pair_wen')
    expect(c?.power).toBe(11)
  })
  it('武对（九点A+九点B）', () => {
    const c = detectCombo([tile('wu_jiudian_a'), tile('wu_jiudian_b')])
    expect(c?.type).toBe('pair_wu')
  })
  it('文武对-天九', () => {
    const c = detectCombo([tile('wen_tian'), tile('wu_jiudian_a')])
    expect(c?.type).toBe('pair_wen_wu')
    expect(c?.comboKey).toBe('tian_jiu')
  })
  it('文武对-鹅五', () => {
    const c = detectCombo([tile('wen_e'), tile('wu_wudian_a')])
    expect(c?.comboKey).toBe('e_wu')
  })
  it('非法双张：天+八点不是文武对', () => {
    expect(detectCombo([tile('wen_tian'), tile('wu_badian_a')])).toBeNull()
  })
})

describe('detectCombo - 三张/四张', () => {
  it('三文天九', () => {
    const c = detectCombo([tile('wen_tian', 0), tile('wen_tian', 1), tile('wu_jiudian_a')])
    expect(c?.type).toBe('triple_wen')
    expect(c?.power).toBe(4)
  })
  it('三武天九', () => {
    const c = detectCombo([tile('wen_tian'), tile('wu_jiudian_a'), tile('wu_jiudian_b')])
    expect(c?.type).toBe('triple_wu')
  })
  it('四天九', () => {
    const c = detectCombo([
      tile('wen_tian', 0),
      tile('wen_tian', 1),
      tile('wu_jiudian_a'),
      tile('wu_jiudian_b'),
    ])
    expect(c?.type).toBe('quad_wen_wu')
    expect(c?.comboKey).toBe('quad_tian_jiu')
  })
  it('非法三张', () => {
    expect(detectCombo([tile('wen_tian'), tile('wen_di'), tile('wu_jiudian_a')])).toBeNull()
  })
})
