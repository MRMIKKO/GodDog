/**
 * 游戏实时状态 —— 私有视图、出牌、结算
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  PlayerView,
  RoundEndPayload,
  DongWonPayload,
  TablePlay,
} from '@goddog/shared'
import { emitAck } from '@/api/socket'

export const useGameStore = defineStore('game', () => {
  const view = ref<PlayerView | null>(null)
  const roundEnd = ref<RoundEndPayload | null>(null)
  const lastDong = ref<DongWonPayload | null>(null)
  const diceResult = ref<{ rolls: Record<number, number>; firstSeat: number } | null>(null)

  /** 是否轮到我出牌 */
  const isMyTurn = computed(
    () => view.value !== null && view.value.turnSeat === view.value.mySeat,
  )

  // ── 出牌视图队列 ──────────────────────────────────────────────────────────
  // 他人出牌时逐步呈现（VIEW_STEP_MS 间隔）；每栋结束后冻结满4人桌面 TRICK_HOLD_MS。
  const VIEW_STEP_MS = 380
  const TRICK_HOLD_MS = 2200

  const _pendingViews: PlayerView[] = []
  let _pendingClear: PlayerView | null = null
  let _viewTimer: number | null = null

  // 冻结显示：来自 dong_won 的完整4人出牌记录，用于桌面静止展示
  let _freezeData: { trickPlays: TablePlay[]; winnerSeat: number } | null = null
  const frozenTrick    = ref<TablePlay[] | null>(null)
  const frozenWinnerSeat = ref<number>(-1)

  function _applyView(v: PlayerView): void {
    view.value = v
    roundEnd.value = null
  }

  function _clearFreeze(): void {
    frozenTrick.value = null
    frozenWinnerSeat.value = -1
  }

  /** 队列已空，若有待处理的"换栋"视图则启动冻结倒计时 */
  function _startHold(): void {
    if (!_pendingClear) return
    const clearView = _pendingClear
    _pendingClear = null
    if (_freezeData?.trickPlays.length) {
      frozenTrick.value = _freezeData.trickPlays
      frozenWinnerSeat.value = _freezeData.winnerSeat
      _freezeData = null
    }
    _viewTimer = window.setTimeout(() => {
      _viewTimer = null
      _clearFreeze()
      _applyView(clearView)
    }, TRICK_HOLD_MS)
  }

  function _drainViewQueue(): void {
    const next = _pendingViews.shift()
    if (!next) {
      _viewTimer = null
      _startHold()
      return
    }
    _applyView(next)
    _viewTimer = window.setTimeout(_drainViewQueue, VIEW_STEP_MS)
  }

  function setView(v: PlayerView): void {
    const cur = view.value

    // 检测"换栋/结局"清空视图：新视图无牌 且 trickNo 前进 或 进入结算阶段
    const isClearView =
      cur !== null &&
      cur.phase !== 'settling' &&
      v.currentTrick.length === 0 &&
      (v.phase === 'settling' || v.trickNo !== cur.trickNo)

    if (isClearView) {
      _pendingClear = v
      // 队列空且未在计时 → 立即启动冻结；队列在跑 → 排空后自动触发
      if (_viewTimer === null && _pendingViews.length === 0) {
        _startHold()
      } else if (_viewTimer !== null && _pendingViews.length === 0) {
        // 正在冻结计时中（上一个 hold）— 中断旧计时，以新数据重启
        clearTimeout(_viewTimer)
        _viewTimer = null
        _startHold()
      }
      return
    }

    // 检测同一栋内他人出牌（渐进展示）
    const isProgressive =
      cur !== null &&
      v.phase === 'playing' &&
      v.trickNo === cur.trickNo &&
      v.currentTrick.length > cur.currentTrick.length
    const isMyOwnPlay = isProgressive && v.currentTrick.at(-1)?.seat === v.mySeat

    if (!isProgressive || isMyOwnPlay) {
      // 立即应用：换局 / 重连 / 先手 / 自己出牌
      _pendingViews.length = 0
      _pendingClear = null
      if (_viewTimer !== null) { clearTimeout(_viewTimer); _viewTimer = null }
      // 若有未应用的清空视图，先跳过（已被新局面取代）
      _clearFreeze()
      _applyView(v)
      return
    }

    // 他人出牌 → 入队渐进呈现
    _pendingViews.push(v)
    if (_viewTimer === null) _drainViewQueue()
  }

  function setRoundEnd(r: RoundEndPayload | null): void {
    roundEnd.value = r
  }

  function setDongWon(d: DongWonPayload): void {
    lastDong.value = d
    // 保存完整出牌供冻结展示
    _freezeData = { trickPlays: d.trickPlays ?? [], winnerSeat: d.winnerSeat }
  }

  function setDice(d: { rolls: Record<number, number>; firstSeat: number } | null): void {
    diceResult.value = d
  }

  async function play(
    cardIds: string[],
    action: 'play' | 'pass',
  ): Promise<{ ok: boolean; error?: string }> {
    return emitAck('game:play', { cardIds, action })
  }

  function reset(): void {
    _pendingViews.length = 0
    _pendingClear = null
    _freezeData = null
    if (_viewTimer !== null) { clearTimeout(_viewTimer); _viewTimer = null }
    _clearFreeze()
    view.value = null
    roundEnd.value = null
    lastDong.value = null
    diceResult.value = null
  }

  return {
    view,
    roundEnd,
    lastDong,
    diceResult,
    frozenTrick,
    frozenWinnerSeat,
    isMyTurn,
    setView,
    setRoundEnd,
    setDongWon,
    setDice,
    play,
    reset,
  }
})
