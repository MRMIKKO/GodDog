/**
 * 计分结算 —— 规则依据 docs/rules.md 第 8 节、docs/card-rules-table.md 第 5 节
 *
 * 已定版规则：
 * - 以 4 栋为基准，少于 4 栋按差额赔付
 * - 0 栋：不加赔
 * - 庄家固定加倍 x2
 * - 连庄倍数递增，无封顶
 * - Kam 公共分池初始 40，每圈结一方向 Kam 支付 4
 * - 倒Kam：结牌且本局 >= 6 栋，或四张牌型直接成立 → 拿走整个 Kam 池
 * - 仃鸡：被压制方双倍支付并负责他人结算
 *
 * 说明：基础每栋赔付的“单位分值”为可配置参数 unit，便于后续调表。
 */

/** 结算配置（可参数化，便于后续调整） */
export interface ScoringConfig {
  /** 基准栋数 */
  baseDongs: number
  /** 每栋差额的基础分值单位 */
  unit: number
  /** 庄家倍数 */
  bankerMultiplier: number
  /** 每圈胜方向 Kam 支付的分数 */
  kamPayPerRound: number
  /** 倒Kam 的栋数门槛 */
  daoKamDongThreshold: number
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  baseDongs: 4,
  unit: 1,
  bankerMultiplier: 2,
  kamPayPerRound: 4,
  daoKamDongThreshold: 6,
}

/** 单个玩家本局结算输入 */
export interface PlayerSettleInput {
  seat: number
  /** 本局赢得的栋数 */
  dongs: number
  /** 是否庄家 */
  isBanker: boolean
}

/** 本局结算输入 */
export interface SettlementInput {
  players: PlayerSettleInput[]
  /** 结牌（胜利）玩家座位 */
  winnerSeat: number
  /** 当前连庄倍数（首庄为 1，连庄递增 2、3 …） */
  bankerStreakMultiplier: number
  /** 当前 Kam 池分数 */
  kamPool: number
  /** 是否触发仃鸡（被压制结算）。被压制方座位见 tingjiLoserSeat */
  tingji?: boolean
  /** 仃鸡中被压制方座位（需双倍支付并负责他人结算） */
  tingjiLoserSeat?: number
  /** 是否由四张牌型直接成立（影响倒Kam 判定） */
  quadDirectWin?: boolean
}

/** 结算结果 */
export interface SettlementResult {
  /** 每个座位的欢乐豆变动 */
  deltas: Record<number, number>
  /** Kam 池变动后的新值 */
  kamPool: number
  /** 是否触发倒Kam */
  daoKam: boolean
  /** 是否触发仃鸡 */
  tingji: boolean
}

/**
 * 计算单个输家对赢家的基础赔付额。
 * - 0 栋：不加赔，仅支付基础单位
 * - 1~baseDongs 栋：按差额 (baseDongs - dongs) * unit 赔付
 * - >= baseDongs 栋：仍按基础单位（赢家通吃，差额为 0 时支付 1 单位）
 */
function basePayment(loserDongs: number, cfg: ScoringConfig): number {
  if (loserDongs <= 0) return cfg.unit
  const diff = Math.max(0, cfg.baseDongs - loserDongs)
  return (diff + 1) * cfg.unit
}

/**
 * 结算一局。
 */
export function settle(
  input: SettlementInput,
  cfg: ScoringConfig = DEFAULT_SCORING_CONFIG,
): SettlementResult {
  const deltas: Record<number, number> = {}
  for (const p of input.players) deltas[p.seat] = 0

  const winner = input.players.find((p) => p.seat === input.winnerSeat)
  if (!winner) {
    throw new Error(`结算输入异常：未找到胜方座位 ${input.winnerSeat}`)
  }

  const losers = input.players.filter((p) => p.seat !== input.winnerSeat)

  // 倒Kam 判定：结牌且本局 >= 阈值栋数，或四张牌型直接成立
  const daoKam =
    winner.dongs >= cfg.daoKamDongThreshold || input.quadDirectWin === true

  // 倍数：庄家 x2，叠加连庄递增倍数
  const winnerBankerMul = winner.isBanker ? cfg.bankerMultiplier : 1
  const streakMul = Math.max(1, input.bankerStreakMultiplier)

  for (const loser of losers) {
    let pay = basePayment(loser.dongs, cfg)

    // 庄家参与时加倍（庄赢则输家加倍付，庄输则庄家加倍付）
    const bankerMul = loser.isBanker || winner.isBanker ? winnerBankerMul : 1
    pay *= bankerMul * streakMul

    // 仃鸡：被压制方双倍支付
    if (input.tingji && input.tingjiLoserSeat === loser.seat) {
      pay *= 2
    }

    deltas[loser.seat] -= pay
    deltas[winner.seat] += pay
  }

  // 仃鸡：被压制方还需负责其他输家的赔付（替其他输家承担）
  let tingji = false
  if (input.tingji && input.tingjiLoserSeat !== undefined) {
    tingji = true
    const scapegoat = input.tingjiLoserSeat
    for (const loser of losers) {
      if (loser.seat === scapegoat) continue
      // 把其他输家的支出转移到被压制方
      const transferred = -deltas[loser.seat]
      deltas[loser.seat] += transferred
      deltas[scapegoat] -= transferred
    }
  }

  // Kam 结算
  let kamPool = input.kamPool
  if (daoKam) {
    // 倒Kam：胜方拿走整个 Kam 池
    deltas[winner.seat] += kamPool
    kamPool = 0
  } else {
    // 普通结牌：胜方向 Kam 池支付固定分数
    deltas[winner.seat] -= cfg.kamPayPerRound
    kamPool += cfg.kamPayPerRound
  }

  return { deltas, kamPool, daoKam, tingji }
}
