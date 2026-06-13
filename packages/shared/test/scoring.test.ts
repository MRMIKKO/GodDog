import { describe, it, expect } from 'vitest'
import { settle, DEFAULT_SCORING_CONFIG } from '../src/scoring.js'
import type { SettlementInput } from '../src/scoring.js'

function baseInput(overrides: Partial<SettlementInput> = {}): SettlementInput {
  return {
    players: [
      { seat: 0, dongs: 5, isBanker: true },
      { seat: 1, dongs: 2, isBanker: false },
      { seat: 2, dongs: 1, isBanker: false },
      { seat: 3, dongs: 0, isBanker: false },
    ],
    winnerSeat: 0,
    bankerStreakMultiplier: 1,
    kamPool: 40,
    ...overrides,
  }
}

describe('settle - 基础结算', () => {
  it('赢家进账等于输家总支出（零和，含 Kam 支付前）', () => {
    const r = settle(baseInput({ winnerSeat: 1, kamPool: 40 }))
    // 普通结牌赢家向 Kam 支付 4，因此 deltas 总和 = -4（流入 Kam）
    const total = Object.values(r.deltas).reduce((a, b) => a + b, 0)
    expect(total).toBe(-DEFAULT_SCORING_CONFIG.kamPayPerRound)
    expect(r.kamPool).toBe(44)
  })

  it('庄家赢加倍 x2', () => {
    const normal = settle(baseInput({ winnerSeat: 1 })) // 非庄赢
    const banker = settle(baseInput({ winnerSeat: 0 })) // 庄家赢
    expect(banker.deltas[0]).toBeGreaterThan(normal.deltas[1])
  })

  it('0 栋不加赔，仍支付基础单位', () => {
    const r = settle(baseInput({ winnerSeat: 1 }))
    // 座位3为0栋，非庄，连庄倍1 → 仅基础单位 1
    expect(r.deltas[3]).toBe(-1)
  })
})

describe('settle - 倒Kam', () => {
  it('结牌且 >= 6 栋触发倒Kam，拿走整池', () => {
    const r = settle(
      baseInput({
        players: [
          { seat: 0, dongs: 6, isBanker: true },
          { seat: 1, dongs: 1, isBanker: false },
          { seat: 2, dongs: 1, isBanker: false },
          { seat: 3, dongs: 0, isBanker: false },
        ],
        winnerSeat: 0,
        kamPool: 40,
      }),
    )
    expect(r.daoKam).toBe(true)
    expect(r.kamPool).toBe(0)
  })

  it('四张牌型直接成立触发倒Kam', () => {
    const r = settle(baseInput({ quadDirectWin: true }))
    expect(r.daoKam).toBe(true)
    expect(r.kamPool).toBe(0)
  })
})

describe('settle - 仃鸡', () => {
  it('被压制方双倍支付并负责他人结算', () => {
    const r = settle(
      baseInput({
        winnerSeat: 0,
        tingji: true,
        tingjiLoserSeat: 1,
      }),
    )
    // 被压制方（座位1）承担最重，其余输家净支出被转移
    expect(r.tingji).toBe(true)
    expect(r.deltas[2]).toBe(0)
    expect(r.deltas[3]).toBe(0)
    expect(r.deltas[1]).toBeLessThan(0)
  })
})
