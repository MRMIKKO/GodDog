/**
 * 单局游戏状态机 —— 权威逻辑，所有出牌均在此二次校验（反作弊）
 * 依赖 @goddog/shared 的牌型识别与压制规则。
 */

import {
  type Card,
  type Combo,
  type PlayerView,
  type TablePlay,
  type PlayerState,
  detectCombo,
  canBeat,
  createDeck,
  shuffle,
  deal,
  mulberry32,
} from '@goddog/shared'
import { randomInt } from 'node:crypto'
import type { TrickPlay } from './types.js'

const SEATS = 4
const HAND_SIZE = 8

export interface RoundStartResult {
  bankerSeat: number
  firstSeat: number
  diceRolls: Record<number, number>
}

export interface RoundOutcome {
  winnerSeat: number
  dongs: Record<number, number>
  /** 末栋是否四张牌型直接成立（未被压制） */
  quadDirectWin: boolean
  /** 仃鸡：被压制方座位（无则 undefined） */
  tingjiLoserSeat?: number
}

/**
 * 一局对局。座位固定 0-3，出牌顺序为座位递增（逆时针）取模。
 */
export class GameRound {
  readonly nicknames: string[]
  hands: Card[][] = []
  dongs: number[] = [0, 0, 0, 0]
  bankerSeat = -1
  /** 当前先手（本栋首位出牌者） */
  turnSeat = -1
  /** 当前栋的出牌记录 */
  currentTrick: TrickPlay[] = []
  /** 当前栋需要跟的张数（0 = 先手自由出） */
  requiredCount = 0
  /** 当前栋最大牌型与持有座位 */
  bestCombo: Combo | null = null
  bestSeat = -1
  trickNo = 0
  finished = false
  outcome: RoundOutcome | null = null
  /** 上次 play() 调用中结算的栋信息；未结算则为 null */
  lastDong: { trickNo: number; winnerSeat: number; winningCombo: Combo | null } | null = null
  /** 本栋完整4人出牌记录（resolveTrick 时保存），供广播 trickPlays */
  lastTrick: TablePlay[] | null = null
  /** 末栋胜出牌型（用于结算判定） */
  private lastWinningCombo: Combo | null = null
  /** 末栋是否发生仃鸡式压制 */
  private lastTrickTingjiLoser: number | undefined

  constructor(nicknames: string[]) {
    if (nicknames.length !== SEATS) throw new Error('必须 4 人开局')
    this.nicknames = nicknames
  }

  /**
   * 开局：发牌 + 确定庄家与先手。
   * @param prevWinnerSeat 上局结牌者座位；首局传 -1 走头出二庄。
   */
  start(prevWinnerSeat: number): RoundStartResult {
    const seed = randomInt(0, 2 ** 31)
    const deck = shuffle(createDeck(), mulberry32(seed))
    this.hands = deal(deck, SEATS, HAND_SIZE)

    const diceRolls: Record<number, number> = {}
    if (prevWinnerSeat < 0) {
      // 首局：随机一名玩家摇骰 → 点数定头出 → 下一家为庄
      const roller = randomInt(0, SEATS)
      const d1 = randomInt(1, 7)
      const d2 = randomInt(1, 7)
      const sum = d1 + d2
      diceRolls[roller] = sum
      const firstSeat = (roller + (sum - 1)) % SEATS
      this.turnSeat = firstSeat
      this.bankerSeat = (firstSeat + 1) % SEATS
    } else {
      // 非首局：上局结牌者为庄，庄家先出
      this.bankerSeat = prevWinnerSeat
      this.turnSeat = prevWinnerSeat
    }

    this.trickNo = 1
    this.requiredCount = 0
    this.currentTrick = []
    this.bestCombo = null
    this.bestSeat = -1
    this.finished = false
    this.outcome = null

    return { bankerSeat: this.bankerSeat, firstSeat: this.turnSeat, diceRolls }
  }

  /** 取出某座位手牌中指定 id 的牌（不修改手牌，仅查找） */
  private pickCards(seat: number, cardIds: string[]): Card[] | null {
    const hand = this.hands[seat]
    const found: Card[] = []
    for (const id of cardIds) {
      const card = hand.find((c) => c.id === id)
      if (!card || found.includes(card)) return null
      found.push(card)
    }
    return found
  }

  private removeCards(seat: number, cards: Card[]): void {
    const ids = new Set(cards.map((c) => c.id))
    this.hands[seat] = this.hands[seat].filter((c) => !ids.has(c.id))
  }

  /**
   * 处理一次出牌动作。返回错误信息字符串，成功返回 null。
   */
  play(seat: number, cardIds: string[], action: 'play' | 'pass'): string | null {
    if (this.finished) return '本局已结束'
    if (seat !== this.turnSeat) return '还没轮到你出牌'

    const cards = this.pickCards(seat, cardIds)
    if (!cards) return '出牌包含非法或不存在的牌'

    const isLeader = this.requiredCount === 0
    // 每次合法出牌前重置；若本次推进触发 resolveTrick，则会被重新赋值
    this.lastDong = null
    this.lastTrick = null

    if (isLeader) {
      // 先手：必须是合法牌型，1-4 张
      if (action !== 'play') return '先手必须打牌'
      const combo = detectCombo(cards)
      if (!combo) return '不是合法牌型'
      this.requiredCount = combo.size
      this.bestCombo = combo
      this.bestSeat = seat
      this.currentTrick = [{ seat, action: 'play', cards }]
      this.removeCards(seat, cards)
      this.advanceTurn()
      return null
    }

    // 跟牌：张数必须一致
    if (cards.length !== this.requiredCount) return `必须出 ${this.requiredCount} 张`

    if (action === 'play') {
      const combo = detectCombo(cards)
      if (!combo) return '不是合法牌型'
      if (!this.bestCombo || !canBeat(combo, this.bestCombo)) {
        return '该牌无法压制当前最大牌，只能垫牌'
      }
      this.bestCombo = combo
      this.bestSeat = seat
      this.currentTrick.push({ seat, action: 'play', cards })
    } else {
      // 垫牌：任意同张数的牌
      this.currentTrick.push({ seat, action: 'pass', cards })
    }
    this.removeCards(seat, cards)
    this.advanceTurn()
    return null
  }

  /** 推进到下一位；若一栋已满 4 人则结算该栋 */
  private advanceTurn(): void {
    if (this.currentTrick.length >= SEATS) {
      this.resolveTrick()
      return
    }
    this.turnSeat = (this.turnSeat + 1) % SEATS
  }

  /** 结算一栋 */
  private resolveTrick(): void {
    const winnerSeat = this.bestSeat
    // 在清除当前栋状态前保存完整出牌（4人），供客户端冻结展示
    this.lastTrick = this.currentTrick.map(p => ({
      seat: p.seat,
      action: p.action,
      cards: p.action === 'play' ? [...p.cards] : [],
      count: p.cards.length,
      isLeader: p.seat === winnerSeat && p.action === 'play',
    }))
    // 在清除当前栋状态前保存结果，供 socket.ts 读取并广播 game:dong_won
    this.lastDong = { trickNo: this.trickNo, winnerSeat, winningCombo: this.bestCombo }
    this.dongs[winnerSeat] += 1
    const isLastTrick = this.hands.every((h) => h.length === 0)

    if (isLastTrick) {
      this.lastWinningCombo = this.bestCombo
      this.detectLastTrickTingji()
      this.finish(winnerSeat)
      return
    }

    // 进入下一栋，赢家先手
    this.trickNo += 1
    this.turnSeat = winnerSeat
    this.requiredCount = 0
    this.bestCombo = null
    this.bestSeat = -1
    this.currentTrick = []
  }

  /**
   * 末栋仃鸡检测（best-effort，依据 docs 明确列出的压制关系）：
   * - 最小单文(鼻屎六) 被 高脚七 压制
   * - 最小单武(三点) 被 六点 压制
   * - 文尊 被 双高脚七 压制
   * - 四张牌型 被压制
   * 被压制方 = 本栋先手（被人压过去的一方）。
   */
  private detectLastTrickTingji(): void {
    const trick = this.currentTrick
    if (trick.length === 0) return
    const leader = trick[0]
    if (leader.action !== 'play') return
    const leaderCombo = detectCombo(leader.cards)
    if (!leaderCombo) return

    // 先手未被压制（自己赢）则无仃鸡
    if (this.bestSeat === leader.seat) return

    const winnerCombo = this.bestCombo
    if (!winnerCombo) return

    const k = leaderCombo.comboKey
    const wk = winnerCombo.comboKey
    let tingji = false

    // 最小单文被高脚七压制
    if (leaderCombo.type === 'single_wen' && k === 'single_wen') {
      if (leaderCombo.cards[0].logicKey === 'wen_bishiliu' && wk === 'single_wen') {
        if (winnerCombo.cards[0].logicKey === 'wen_gaojiaoqi') tingji = true
      }
    }
    // 最小单武被六点压制
    if (leaderCombo.type === 'single_wu') {
      if (
        leaderCombo.cards[0].logicKey === 'wu_sandian' &&
        winnerCombo.cards[0]?.logicKey === 'wu_liudian'
      ) {
        tingji = true
      }
    }
    // 文尊被双高脚七压制
    if (leaderCombo.type === 'zun_wen' && winnerCombo.comboKey === 'pair_wen_gaojiaoqi') {
      tingji = true
    }
    // 四张牌型被压制
    if (leaderCombo.type === 'quad_wen_wu') {
      tingji = true
    }

    if (tingji) this.lastTrickTingjiLoser = leader.seat
  }

  private finish(winnerSeat: number): void {
    this.finished = true
    const quadDirectWin =
      this.lastWinningCombo?.type === 'quad_wen_wu' && this.bestSeat === winnerSeat &&
      this.lastTrickTingjiLoser === undefined &&
      // 先手即赢家，说明四张未被压制
      this.currentTrick[0]?.seat === winnerSeat
    this.outcome = {
      winnerSeat,
      dongs: { 0: this.dongs[0], 1: this.dongs[1], 2: this.dongs[2], 3: this.dongs[3] },
      quadDirectWin: Boolean(quadDirectWin),
      tingjiLoserSeat: this.lastTrickTingjiLoser,
    }
  }

  /** 生成发给某座位的私有视图 */
  getView(seat: number, players: PlayerState[], roomCode: string, kamPool: number): PlayerView {
    const trick: TablePlay[] = this.currentTrick.map((p) => ({
      seat: p.seat,
      action: p.action,
      cards: p.action === 'play' ? p.cards : [],
      count: p.cards.length,
      isLeader: p.seat === this.bestSeat && p.action === 'play',
    }))

    return {
      phase: this.finished ? 'settling' : 'playing',
      roomCode,
      mySeat: seat,
      myHand: this.hands[seat] ?? [],
      players,
      turnSeat: this.turnSeat,
      bankerSeat: this.bankerSeat,
      bankerStreakMultiplier: 1,
      currentTrick: trick,
      requiredCount: this.requiredCount,
      kamPool,
      trickNo: this.trickNo,
    }
  }
}
