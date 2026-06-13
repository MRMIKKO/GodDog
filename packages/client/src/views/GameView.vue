<script setup lang="ts">
/**
 * 游戏牌桌主视图 —— 4 人座位 + 台面 + 手牌 + 出牌控制 + 结算
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { gsap } from 'gsap'
import { detectCombo, canBeat, type Card } from '@goddog/shared'
import { useAuthStore } from '@/stores/auth'
import { useRoomStore } from '@/stores/room'
import { useGameStore } from '@/stores/game'
import { useSound } from '@/composables/useSound'
import PlayerSeat from '@/components/PlayerSeat.vue'
import TileCard from '@/components/TileCard.vue'
import TablePlayPile from '@/components/TablePlayPile.vue'
import DiceRoll from '@/components/DiceRoll.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const room = useRoomStore()
const game = useGameStore()

const { roomState } = storeToRefs(room)
const { view, roundEnd, isMyTurn, diceResult, lastDong, frozenTrick, frozenWinnerSeat } = storeToRefs(game)
const { play } = useSound()

const roomCode = route.params.roomCode as string
const selected = ref<Set<string>>(new Set())
const actionError = ref('')

/** 手牌容器（发牌动画用） */
const handEl = ref<HTMLElement | null>(null)

const isWaiting = computed(() => roomState.value?.phase === 'waiting')
const mySeat = computed(() => view.value?.mySeat ?? roomState.value?.seats.findIndex((s) => s.userId === auth.user?.id) ?? 0)

/** Kam 分池显示：开局前默认 40 */
const kamDisplay = computed(() => view.value?.kamPool ?? 40)

/** 座位 -> 昵称 映射（掷骰弹层用） */
const seatNames = computed<Record<number, string>>(() => {
  const map: Record<number, string> = {}
  for (let s = 0; s < 4; s++) {
    map[s] = playerBySeat(s)?.nickname ?? roomSeatInfo(s)?.nickname ?? `座位${s + 1}`
  }
  return map
})

/** 掷骰动画显隐：收到 diceResult 时弹出，动画结束后收起 */
const showDice = ref(false)
watch(diceResult, (d) => {
  if (d) showDice.value = true
})
function onDiceDone() {
  showDice.value = false
  game.setDice(null)
  void dealHand()
}

// ─── 吃栋原地动画（浮字 + 头像闪光，无任何弹窗）─────────────────────────────

/** 每个方位的 arena slot DOM 引用 */
const arenaSlotTop    = ref<HTMLElement | null>(null)
const arenaSlotLeft   = ref<HTMLElement | null>(null)
const arenaSlotRight  = ref<HTMLElement | null>(null)
const arenaSlotBottom = ref<HTMLElement | null>(null)

function arenaSlotByPos(pos: 'top' | 'left' | 'right' | 'bottom'): HTMLElement | null {
  return { top: arenaSlotTop, left: arenaSlotLeft, right: arenaSlotRight, bottom: arenaSlotBottom }[pos]?.value ?? null
}

watch(lastDong, async (d) => {
  if (!d) return
  const pos = seatPositionOf(d.winnerSeat)
  if (!pos) return
  await nextTick()
  const slot = arenaSlotByPos(pos)
  if (!slot) return

  // ① slot 区域金色闪光
  gsap.fromTo(
    slot,
    { boxShadow: '0 0 0px rgba(212,175,55,0)' },
    {
      boxShadow: '0 0 0 2px rgba(212,175,55,0.85), 0 0 28px rgba(212,175,55,0.45)',
      duration: 0.2,
      yoyo: true,
      repeat: 3,
      ease: 'power2.inOut',
      onComplete: () => gsap.set(slot, { clearProps: 'boxShadow' }),
    },
  )

  // ② 在 slot 内动态创建浮字 "+1栋"，动画结束后自删
  const floater = document.createElement('span')
  floater.textContent = '+1栋'
  floater.className = 'gam_dong_floater'
  slot.style.position = 'relative'
  slot.appendChild(floater)
  gsap.fromTo(
    floater,
    { opacity: 1, y: 0, scale: 0.7 },
    {
      opacity: 0,
      y: -54,
      scale: 1.15,
      duration: 1.0,
      ease: 'power2.out',
      onComplete: () => floater.remove(),
    },
  )
})

// ─── 行动气泡（浮字提示当前谁做了什么动作）────────────────────────────────────

interface ActionBubble {
  seat: number
  action: 'play' | 'pass'
  /** 方位 */
  pos: 'top' | 'left' | 'right' | 'bottom'
}
const actionBubble = ref<ActionBubble | null>(null)
let bubbleTimer: number | null = null

watch(
  () => view.value?.currentTrick?.length,
  (newLen, oldLen) => {
    if (!newLen || !oldLen || newLen <= oldLen) return
    const trick = view.value?.currentTrick
    if (!trick?.length) return
    const latest = trick[trick.length - 1]
    // 自己的出牌不显示气泡（已知道自己打了什么）
    if (latest.seat === view.value?.mySeat) return
    const pos = seatPositionOf(latest.seat)
    if (!pos) return
    actionBubble.value = { seat: latest.seat, action: latest.action, pos }
    if (bubbleTimer) clearTimeout(bubbleTimer)
    bubbleTimer = window.setTimeout(() => {
      actionBubble.value = null
    }, 900)
  },
)

/** 轮到我出牌时，对手牌区做一次金色脉冲 */
watch(isMyTurn, async (on) => {
  if (!on || isWaiting.value) return
  await nextTick()
  const el = handEl.value
  if (!el) return
  gsap.fromTo(
    el,
    { filter: 'drop-shadow(0 0 0px rgba(212,175,55,0))' },
    {
      filter: 'drop-shadow(0 0 12px rgba(212,175,55,0.7))',
      duration: 0.38,
      yoyo: true,
      repeat: 1,
      ease: 'power2.inOut',
      onComplete: () => gsap.set(el, { clearProps: 'filter' }),
    },
  )
})

onUnmounted(() => {
  if (bubbleTimer) clearTimeout(bubbleTimer)
})

/** 根据 seat 编号得出当前用户视角的方位 */
function seatPositionOf(seat: number): 'top' | 'left' | 'right' | 'bottom' | null {
  const base = mySeat.value
  const diff = ((seat - base) + 4) % 4
  if (diff === 0) return 'bottom'
  if (diff === 1) return 'right'
  if (diff === 2) return 'top'
  if (diff === 3) return 'left'
  return null
}

/** 当前栋中指定 seat 的出牌记录（冻结期间使用 frozenTrick） */
const isTrickFrozen = computed(() => frozenTrick.value !== null)
function trickBySeat(seat: number) {
  const live = view.value?.currentTrick.find((p) => p.seat === seat) ?? null
  if (live) return live
  if (isTrickFrozen.value) return frozenTrick.value!.find((p) => p.seat === seat) ?? null
  return null
}

/** 座位重映射：让"我"始终在底部，其余顺时针分布到 right/top/left */
function seatAt(position: 'bottom' | 'right' | 'top' | 'left'): number {
  const base = mySeat.value
  const offset = { bottom: 0, right: 1, top: 2, left: 3 }[position]
  return (base + offset) % 4
}

function playerBySeat(seat: number) {
  return view.value?.players.find((p) => p.seat === seat) ?? null
}

function roomSeatInfo(seat: number) {
  return roomState.value?.seats.find((s) => s.seat === seat) ?? null
}

/** 等待阶段我的准备状态 */
const myReady = computed(() => roomSeatInfo(mySeat.value)?.ready ?? false)

/** 我的手牌 */
const myHand = computed<Card[]>(() => view.value?.myHand ?? [])

/** 当前选中的牌组成的牌型 */
const selectedCombo = computed(() => {
  const cards = myHand.value.filter((c) => selected.value.has(c.id))
  if (cards.length === 0) return null
  return detectCombo(cards)
})

/** 能否打牌（压制当前最大牌或先手合法） */
const canPlay = computed(() => {
  if (!isMyTurn.value || !view.value) return false
  const combo = selectedCombo.value
  if (!combo) return false
  // 先手：任意合法牌型
  if (view.value.requiredCount === 0) return true
  // 跟牌：张数一致且能压制台面最大牌
  if (combo.size !== view.value.requiredCount) return false
  const leader = view.value.currentTrick.find((t) => t.isLeader)
  if (!leader || leader.action !== 'play') return false
  const leaderCombo = detectCombo(leader.cards)
  if (!leaderCombo) return false
  return canBeat(combo, leaderCombo)
})

/** 能否垫牌（张数一致即可，先手不可垫） */
const canPass = computed(() => {
  if (!isMyTurn.value || !view.value) return false
  if (view.value.requiredCount === 0) return false
  return selected.value.size === view.value.requiredCount
})

function toggleCard(card: Card) {
  if (!isMyTurn.value) return
  const s = new Set(selected.value)
  if (s.has(card.id)) s.delete(card.id)
  else s.add(card.id)
  selected.value = s
  actionError.value = ''
  // 轻触觉反馈（移动端）
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8)
}

/** 手牌区滑动手势：上滑出牌 / 下滑取消选择 */
const touchStartY = ref(0)
const touchStartX = ref(0)
function onHandTouchStart(e: TouchEvent) {
  const t = e.changedTouches[0]
  touchStartY.value = t.clientY
  touchStartX.value = t.clientX
}
function onHandTouchEnd(e: TouchEvent) {
  const t = e.changedTouches[0]
  const dy = t.clientY - touchStartY.value
  const dx = t.clientX - touchStartX.value
  // 仅纵向滑动（排除横向滑动误触）
  if (Math.abs(dy) < 48 || Math.abs(dx) > Math.abs(dy)) return
  if (dy < 0) {
    // 上滑：能出则出，否则尝试垫牌
    if (canPlay.value) void doPlay('play')
    else if (canPass.value) void doPlay('pass')
  } else {
    // 下滑：清空选择
    selected.value = new Set()
  }
}

async function doReady() {
  await room.setReady(!myReady.value)
}

async function doPlay(action: 'play' | 'pass') {
  actionError.value = ''
  const ids = [...selected.value]
  const combo = selectedCombo.value
  const res = await game.play(ids, action)
  if (!res.ok) {
    actionError.value = res.error ?? '出牌失败'
    return
  }
  // 出牌音效：尊/四张特殊配音，其余普通
  if (action === 'pass') {
    play('passCard')
  } else if (combo) {
    const key = combo.comboKey
    if (key.includes('zun')) play('playZun', { comboKey: key })
    else if (combo.size === 4) play('playQuad', { comboKey: key })
    else play('playCard', { comboKey: key })
  }
  selected.value = new Set()
}

async function leaveRoom() {
  await room.leave()
  game.reset()
  router.replace({ name: 'lobby' })
}

// 新一局开始时清空选择
watch(
  () => view.value?.trickNo,
  () => {
    selected.value = new Set()
  },
)

/** 发牌动画：从台面中心错位滑入手牌 */
async function dealHand(): Promise<void> {
  await nextTick()
  const el = handEl.value
  if (!el) return
  const tiles = Array.from(el.children) as HTMLElement[]
  if (tiles.length === 0) return
  gsap.killTweensOf(tiles)
  gsap.fromTo(
    tiles,
    { y: -180, x: () => gsap.utils.random(-40, 40), rotateZ: () => gsap.utils.random(-12, 12), opacity: 0 },
    {
      y: 0,
      x: 0,
      rotateZ: 0,
      opacity: 1,
      duration: 0.42,
      ease: 'back.out(1.4)',
      stagger: 0.06,
      onStart: () => play('dealCard'),
    },
  )
}

// 结算后继续准备下一局
async function nextRound() {
  game.setRoundEnd(null)
  await room.setReady(true)
}

/** 结算类型：决定弹层主题与文案 */
const resultKind = computed<'daoKam' | 'tingji' | 'normal'>(() => {
  if (!roundEnd.value) return 'normal'
  if (roundEnd.value.daoKam) return 'daoKam'
  if (roundEnd.value.tingji) return 'tingji'
  return 'normal'
})

const resultTitle = computed(() => {
  switch (resultKind.value) {
    case 'daoKam':
      return '倒 Kam！'
    case 'tingji':
      return '仃鸡'
    default:
      return '本局结束'
  }
})

/** 我是否为本局赢家 */
const iWon = computed(() => roundEnd.value != null && roundEnd.value.winnerSeat === mySeat.value)

const resultCardEl = ref<HTMLElement | null>(null)
watch(roundEnd, async (r) => {
  if (!r) return
  await nextTick()
  const el = resultCardEl.value
  if (!el) return
  gsap.fromTo(
    el,
    { scale: 0.7, y: 24, opacity: 0 },
    { scale: 1, y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.5)' },
  )
  // 各分数行依次淡入
  const rows = el.querySelectorAll('.gam_result_card_row')
  gsap.fromTo(
    rows,
    { x: -16, opacity: 0 },
    { x: 0, opacity: 1, duration: 0.3, stagger: 0.07, delay: 0.15, ease: 'power2.out' },
  )
})

onMounted(() => {
  // 进入页面若无视图，尝试同步（重连场景）
  if (!view.value && !roomState.value) {
    void room.join(roomCode)
  }
})
</script>

<template>
  <div class="gam">
    <!-- 顶部信息条 -->
    <header class="gam_bar">
      <button class="gam_bar_leave" @click="leaveRoom">‹ 离开</button>
      <div class="gam_bar_code">房间 {{ roomCode }}</div>
      <div class="gam_bar_kam">Kam {{ kamDisplay }}</div>
    </header>

    <!-- 对家（top） -->
    <div class="gam_seat gam_seat--top">
      <PlayerSeat
        :player="playerBySeat(seatAt('top'))"
        :position="'top'"
        :is-banker="view?.bankerSeat === seatAt('top')"
        :is-turn="view?.turnSeat === seatAt('top')"
        :ready="roomSeatInfo(seatAt('top'))?.ready"
        :waiting="isWaiting"
      />
    </div>

    <!-- 左右侧家 -->
    <div class="gam_seat gam_seat--left">
      <PlayerSeat
        :player="playerBySeat(seatAt('left'))"
        :position="'left'"
        :is-banker="view?.bankerSeat === seatAt('left')"
        :is-turn="view?.turnSeat === seatAt('left')"
        :ready="roomSeatInfo(seatAt('left'))?.ready"
        :waiting="isWaiting"
      />
    </div>
    <div class="gam_seat gam_seat--right">
      <PlayerSeat
        :player="playerBySeat(seatAt('right'))"
        :position="'right'"
        :is-banker="view?.bankerSeat === seatAt('right')"
        :is-turn="view?.turnSeat === seatAt('right')"
        :ready="roomSeatInfo(seatAt('right'))?.ready"
        :waiting="isWaiting"
      />
    </div>

    <!-- 中央台面 -->
    <div class="gam_table">
      <!-- 等待阶段 -->
      <div v-if="isWaiting" class="gam_table_wait">
        <p class="gam_table_wait_txt">等待玩家准备…</p>
        <p class="gam_table_wait_sub">
          {{ roomState?.seats.filter((s) => s.userId).length ?? 0 }} / 4 人
        </p>
      </div>

      <!-- 空间化台面：4 方位出牌区 -->
      <div v-else class="gam_arena">
        <!-- ① 对家（top）出牌区 -->
        <div
          ref="arenaSlotTop"
          class="gam_arena_slot gam_arena_slot--top"
          :class="{
            'is-turn': view?.turnSeat === seatAt('top') && !isTrickFrozen,
            'is-winner': isTrickFrozen && frozenWinnerSeat === seatAt('top'),
          }"
        >
          <Transition name="bubble">
            <span
              v-if="actionBubble?.pos === 'top'"
              class="gam_arena_bubble"
              :class="actionBubble.action === 'play' ? 'is-play' : 'is-pass'"
            >{{ actionBubble.action === 'play' ? '出牌！' : '垫牌' }}</span>
          </Transition>
          <TablePlayPile
            v-if="trickBySeat(seatAt('top'))"
            :play="trickBySeat(seatAt('top'))!"
            :player-name="playerBySeat(seatAt('top'))?.nickname"
          />
          <div v-else-if="view?.turnSeat === seatAt('top') && !isTrickFrozen" class="gam_arena_thinking">
            <span /><span /><span />
          </div>
        </div>

        <!-- ② 左家出牌区 -->
        <div
          ref="arenaSlotLeft"
          class="gam_arena_slot gam_arena_slot--left"
          :class="{
            'is-turn': view?.turnSeat === seatAt('left') && !isTrickFrozen,
            'is-winner': isTrickFrozen && frozenWinnerSeat === seatAt('left'),
          }"
        >
          <Transition name="bubble">
            <span
              v-if="actionBubble?.pos === 'left'"
              class="gam_arena_bubble"
              :class="actionBubble.action === 'play' ? 'is-play' : 'is-pass'"
            >{{ actionBubble.action === 'play' ? '出牌！' : '垫牌' }}</span>
          </Transition>
          <TablePlayPile
            v-if="trickBySeat(seatAt('left'))"
            :play="trickBySeat(seatAt('left'))!"
            :player-name="playerBySeat(seatAt('left'))?.nickname"
          />
          <div v-else-if="view?.turnSeat === seatAt('left') && !isTrickFrozen" class="gam_arena_thinking">
            <span /><span /><span />
          </div>
        </div>

        <!-- ③ 中心装饰 -->
        <div class="gam_arena_center">
          <div class="gam_arena_center_disc">
            <span class="gam_arena_center_no">第{{ view?.trickNo ?? 1 }}栋</span>
          </div>
        </div>

        <!-- ④ 右家出牌区 -->
        <div
          ref="arenaSlotRight"
          class="gam_arena_slot gam_arena_slot--right"
          :class="{
            'is-turn': view?.turnSeat === seatAt('right') && !isTrickFrozen,
            'is-winner': isTrickFrozen && frozenWinnerSeat === seatAt('right'),
          }"
        >
          <Transition name="bubble">
            <span
              v-if="actionBubble?.pos === 'right'"
              class="gam_arena_bubble"
              :class="actionBubble.action === 'play' ? 'is-play' : 'is-pass'"
            >{{ actionBubble.action === 'play' ? '出牌！' : '垫牌' }}</span>
          </Transition>
          <TablePlayPile
            v-if="trickBySeat(seatAt('right'))"
            :play="trickBySeat(seatAt('right'))!"
            :player-name="playerBySeat(seatAt('right'))?.nickname"
          />
          <div v-else-if="view?.turnSeat === seatAt('right') && !isTrickFrozen" class="gam_arena_thinking">
            <span /><span /><span />
          </div>
        </div>

        <!-- ⑤ 自己（bottom）出牌区 -->
        <div
          ref="arenaSlotBottom"
          class="gam_arena_slot gam_arena_slot--bottom"
          :class="{
            'is-turn': isMyTurn && !isTrickFrozen,
            'is-winner': isTrickFrozen && frozenWinnerSeat === mySeat,
          }"
        >
          <Transition name="bubble">
            <span
              v-if="actionBubble?.pos === 'bottom'"
              class="gam_arena_bubble"
              :class="actionBubble.action === 'play' ? 'is-play' : 'is-pass'"
            >{{ actionBubble.action === 'play' ? '出牌！' : '垫牌' }}</span>
          </Transition>
          <TablePlayPile
            v-if="trickBySeat(mySeat)"
            :play="trickBySeat(mySeat)!"
            :player-name="playerBySeat(mySeat)?.nickname"
          />
        </div>
      </div>
    </div>

    <!-- 我（bottom） -->
    <div class="gam_self" :class="{ 'gam_self--myturn': isMyTurn && !isWaiting }">
      <div class="gam_self_seat">
        <PlayerSeat
          :player="playerBySeat(mySeat)"
          :position="'bottom'"
          :is-banker="view?.bankerSeat === mySeat"
          :is-turn="isMyTurn"
          :is-me="true"
          :ready="myReady"
          :waiting="isWaiting"
        />
      </div>

      <!-- 轮到你出牌提示条 -->
      <Transition name="turn-slide">
        <div v-if="isMyTurn && !isWaiting" class="gam_self_turn">
          <span class="gam_self_turn_line" />
          <span class="gam_self_turn_label">你的回合</span>
          <span class="gam_self_turn_line" />
        </div>
      </Transition>

      <!-- 手牌 -->
      <div
        ref="handEl"
        class="gam_self_hand"
        @touchstart.passive="onHandTouchStart"
        @touchend.passive="onHandTouchEnd"
      >
        <TileCard
          v-for="card in myHand"
          :key="card.id"
          :card="card"
          :selectable="isMyTurn"
          :selected="selected.has(card.id)"
          @toggle="toggleCard"
        />
      </div>

      <!-- 出牌控制 -->
      <div class="gam_self_ctrl">
        <template v-if="isWaiting">
          <button class="btn_gold" @click="doReady">
            {{ myReady ? '取消准备' : '准备' }}
          </button>
        </template>
        <template v-else>
          <span v-if="selectedCombo" class="gam_self_ctrl_combo">{{ selectedCombo.type }}</span>
          <button class="btn_ghost" :disabled="!canPass" @click="doPlay('pass')">垫牌</button>
          <button class="btn_gold" :disabled="!canPlay" @click="doPlay('play')">出牌</button>
        </template>
      </div>
      <p v-if="isMyTurn && !isWaiting" class="gam_self_hint">上滑出牌 · 下滑取消</p>
      <p v-if="actionError" class="gam_self_err">{{ actionError }}</p>
    </div>

    <!-- 掷骰定庄动画 -->
    <DiceRoll
      v-if="showDice && diceResult"
      :rolls="diceResult.rolls"
      :first-seat="diceResult.firstSeat"
      :my-seat="mySeat"
      :names="seatNames"
      @done="onDiceDone"
    />

    <!-- 结算弹层 -->
    <Transition name="fade">
      <div v-if="roundEnd" class="gam_result" :class="`gam_result--${resultKind}`">
        <div ref="resultCardEl" class="gam_result_card">
          <div v-if="resultKind === 'daoKam'" class="gam_result_card_glow" />
          <h2 class="gam_result_card_title">{{ resultTitle }}</h2>
          <p v-if="iWon" class="gam_result_card_banner">恭喜你结牌获胜</p>
          <div class="gam_result_card_rows">
            <div
              v-for="p in view?.players ?? []"
              :key="p.seat"
              class="gam_result_card_row"
              :class="{ 'is-winner': p.seat === roundEnd.winnerSeat }"
            >
              <span class="gam_result_card_row_name">{{ p.nickname }}</span>
              <span class="gam_result_card_row_dong">{{ roundEnd.dongs[p.seat] ?? 0 }} 栋</span>
              <span
                class="gam_result_card_row_delta"
                :class="(roundEnd.deltas[p.seat] ?? 0) >= 0 ? 'pos' : 'neg'"
              >
                {{ (roundEnd.deltas[p.seat] ?? 0) >= 0 ? '+' : '' }}{{ roundEnd.deltas[p.seat] ?? 0 }}
              </span>
            </div>
          </div>
          <button class="btn_gold gam_result_card_next" @click="nextRound">准备下一局</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.gam {
  position: relative;
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: radial-gradient(ellipse at center, var(--color-felt-light), var(--color-felt-deep));

  &_bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    z-index: var(--z-overlay);

    &_leave {
      background: transparent;
      color: var(--color-text);
      font-size: 15px;
    }

    &_code {
      font-size: 14px;
      color: var(--color-text-dim);
      letter-spacing: 2px;
    }

    &_kam {
      font-size: 14px;
      font-weight: 700;
      color: var(--color-gold-light);
      background: rgba(0, 0, 0, 0.3);
      padding: 4px 14px;
      border-radius: 999px;
    }
  }

  &_seat {
    position: absolute;
    z-index: var(--z-cards);

    &--top {
      top: 56px;
      left: 50%;
      transform: translateX(-50%);
    }

    &--left {
      top: 42%;
      left: 8px;
    }

    &--right {
      top: 42%;
      right: 8px;
    }
  }

  &_table {
    display: flex;
    align-items: stretch;
    justify-content: center;
    padding: 0 4px;
    overflow: hidden;

    &_wait {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;

      &_txt {
        font-size: 18px;
        color: var(--color-gold-light);
      }

      &_sub {
        margin-top: 8px;
        font-size: 14px;
        color: var(--color-text-dim);
      }
    }
  }

  /* 空间化出牌区（与 &_table 同层，class="gam_arena" 放于 gam 直接子级） */
  &_arena {
      width: 100%;
      display: grid;
      grid-template-areas:
        '. top .'
        'left center right'
        '. bottom .';
      grid-template-columns: 1fr 56px 1fr;
      grid-template-rows: 1fr 56px 1fr;
      gap: 6px;
      padding: 4px;

      &_slot {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        border-radius: 10px;
        position: relative;
        min-height: 80px;
        padding: 6px 4px;
        transition: background 0.2s ease;

        &--top    { grid-area: top; }
        &--left   { grid-area: left; align-items: flex-end; }
        &--right  { grid-area: right; align-items: flex-start; }
        &--bottom { grid-area: bottom; }

        &.is-turn {
          background: rgba(212, 175, 55, 0.07);
          box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.25);
        }
        &.is-winner {
          background: rgba(212, 175, 55, 0.15);
          box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.7), 0 0 24px rgba(212, 175, 55, 0.35);
          border-radius: 10px;
        }
      }

      /* 行动气泡："出牌！" / "垫牌" */
      &_bubble {
        position: absolute;
        top: -6px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 12px;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: 999px;
        white-space: nowrap;
        pointer-events: none;
        z-index: 2;
        letter-spacing: 0.5px;

        &.is-play {
          background: rgba(212, 175, 55, 0.9);
          color: var(--color-ink);
          box-shadow: 0 2px 10px rgba(212, 175, 55, 0.5);
        }

        &.is-pass {
          background: rgba(245, 236, 216, 0.18);
          color: var(--color-text-dim);
          border: 1px solid rgba(245, 236, 216, 0.25);
        }
      }

      /* 思考中点阵 */
      &_thinking {
        display: flex;
        gap: 5px;
        align-items: center;
        padding: 8px;

        span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(212, 175, 55, 0.55);
          animation: arena-dot-bounce 1.2s ease-in-out infinite;

          &:nth-child(2) { animation-delay: 0.2s; }
          &:nth-child(3) { animation-delay: 0.4s; }
        }
      }

      /* 中心装饰圆盘 */
      &_center {
        grid-area: center;
        display: flex;
        align-items: center;
        justify-content: center;

        &_disc {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(212, 175, 55, 0.18), rgba(0, 0, 0, 0.3));
          border: 1px solid rgba(212, 175, 55, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        &_no {
          font-size: 10px;
          color: var(--color-gold);
          font-weight: 700;
          text-align: center;
          line-height: 1.3;
          white-space: pre-line;
        }
      }
    }

  &_self {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 16px;

    &_seat {
      align-self: flex-start;
      margin-left: 12px;
    }

    /* 「你的回合」提示条 */
    &_turn {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 0 16px;

      &_line {
        flex: 1;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.55));

        &:last-child {
          background: linear-gradient(270deg, transparent, rgba(212, 175, 55, 0.55));
        }
      }

      &_label {
        font-size: 11px;
        font-weight: 800;
        color: var(--color-gold-light);
        letter-spacing: 4px;
        white-space: nowrap;
        animation: turn-shimmer 1.6s ease-in-out infinite;
      }
    }

    &_hand {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 4px;
      min-height: var(--tile-h);
      padding: 0 8px;
      border-radius: 12px;
      transition: box-shadow 0.3s ease;
    }

    &_ctrl {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 4px;

      &_combo {
        font-size: 12px;
        color: var(--color-gold-light);
        background: rgba(0, 0, 0, 0.3);
        padding: 4px 10px;
        border-radius: 999px;
      }
    }

    &_hint {
      font-size: 11px;
      color: var(--color-text-dim);
      letter-spacing: 1px;
    }

    &_err {
      color: var(--color-red);
      font-size: 12px;
    }

    /* 轮到我出牌 — 底栏整体亮起 */
    &--myturn &_hand {
      box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.3), 0 -4px 20px rgba(212, 175, 55, 0.18);
    }

    &--myturn &_ctrl .btn_gold {
      box-shadow: 0 0 14px rgba(212, 175, 55, 0.45);
    }
  }

  /* 吃栋浮字 —— 由 JS 动态插入，无需 scoped hack */
  &_dong_floater {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 18px;
    font-weight: 900;
    color: var(--color-gold-light);
    text-shadow:
      0 0 14px rgba(240, 217, 138, 0.9),
      0 2px 4px rgba(0, 0, 0, 0.6);
    pointer-events: none;
    white-space: nowrap;
    z-index: 50;
    will-change: transform, opacity;
  }

  &_result {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-toast);
    &_card {
      position: relative;
      overflow: hidden;
      width: 300px;
      background: linear-gradient(180deg, var(--color-felt), var(--color-felt-deep));
      border: 1.5px solid var(--color-gold);
      border-radius: var(--radius-panel);
      box-shadow: var(--shadow-panel);
      padding: 24px;

      &_glow {
        position: absolute;
        inset: -50% -50% auto;
        height: 200%;
        background: radial-gradient(circle at 50% 0%, rgba(240, 217, 138, 0.35), transparent 60%);
        pointer-events: none;
        animation: result-glow 2.4s ease-in-out infinite;
      }

      &_title {
        position: relative;
        text-align: center;
        font-size: 24px;
        color: var(--color-gold);
        margin-bottom: 20px;
      }

      &_banner {
        position: relative;
        text-align: center;
        font-size: 13px;
        color: var(--color-gold-light);
        margin: -10px 0 16px;
      }

      &_rows {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      &_row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.2);
        font-size: 14px;

        &.is-winner {
          background: rgba(212, 175, 55, 0.18);
          box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.5);
        }

        &_delta {
          font-weight: 700;

          &.pos {
            color: #6ee787;
          }
          &.neg {
            color: #ff7b72;
          }
        }
      }

      &_next {
        position: relative;
        width: 100%;
        margin-top: 20px;
      }
    }

    &--daoKam &_card {
      border-color: var(--color-gold-light);
      box-shadow:
        var(--shadow-panel),
        0 0 32px rgba(240, 217, 138, 0.45);
    }

    &--daoKam &_card_title {
      color: var(--color-gold-light);
      text-shadow: 0 0 14px rgba(240, 217, 138, 0.6);
    }

    &--tingji &_card {
      border-color: var(--color-red);
      box-shadow:
        var(--shadow-panel),
        0 0 28px rgba(178, 34, 34, 0.4);
    }

    &--tingji &_card_title {
      color: #ff7b72;
    }
  }
}

@keyframes turn-shimmer {
  0%, 100% { opacity: 0.75; text-shadow: none; }
  50%       { opacity: 1;    text-shadow: 0 0 14px rgba(240, 217, 138, 0.85); }
}

/* 你的回合条入场/离场 */
.turn-slide-enter-active {
  animation: turn-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.turn-slide-leave-active {
  animation: turn-out 0.18s ease forwards;
}

@keyframes turn-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes turn-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}

@keyframes result-glow {
  0%,
  100% {
    opacity: 0.55;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(6px);
  }
}

@keyframes arena-dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.55; }
  40%           { transform: translateY(-6px); opacity: 1; }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 行动气泡入场/离场 */
.bubble-enter-active {
  animation: bubble-in 0.22s ease;
}
.bubble-leave-active {
  animation: bubble-out 0.2s ease forwards;
}

@keyframes bubble-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(0.75); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}
@keyframes bubble-out {
  from { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  to   { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.8); }
}
</style>
