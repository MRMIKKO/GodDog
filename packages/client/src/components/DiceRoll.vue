<script setup lang="ts">
/**
 * 掷骰动画弹层 —— 头出二庄阶段
 * 四家依次滚动骰子，停在 rolls 结果上，高亮先出者（firstSeat），下一家为庄。
 * 动画结束后 emit('done')，由父级切到正式对局。
 */
import { ref, onMounted, computed } from 'vue'
import { diceAsset } from '@/assets/tiles'
import { useSound } from '@/composables/useSound'

const props = defineProps<{
  /** 各座位骰子点数 1-6 */
  rolls: Record<number, number>
  /** 先出座位 */
  firstSeat: number
  /** 我的座位（用于"我"标识） */
  mySeat: number
  /** 座位昵称表 */
  names: Record<number, string>
}>()

const emit = defineEmits<{ done: [] }>()

const { play } = useSound()

/** 每家当前显示的点数（滚动时随机跳动，最终落到结果） */
const shown = ref<Record<number, number>>({ 0: 1, 1: 1, 2: 1, 3: 1 })
const settled = ref<Record<number, boolean>>({ 0: false, 1: false, 2: false, 3: false })
const revealResult = ref(false)

const bankerSeat = computed(() => (props.firstSeat + 1) % 4)

const seats = [0, 1, 2, 3]

function rollOne(seat: number): Promise<void> {
  return new Promise((resolve) => {
    play('diceRoll', { seat })
    const target = props.rolls[seat] ?? 1
    let ticks = 0
    const total = 10 + seat * 2
    const timer = window.setInterval(() => {
      shown.value = { ...shown.value, [seat]: 1 + Math.floor(Math.random() * 6) }
      ticks += 1
      if (ticks >= total) {
        window.clearInterval(timer)
        shown.value = { ...shown.value, [seat]: target }
        settled.value = { ...settled.value, [seat]: true }
        resolve()
      }
    }, 70)
  })
}

onMounted(async () => {
  // 依次滚动四家，制造紧张感
  for (const seat of seats) {
    await rollOne(seat)
  }
  revealResult.value = true
  // 结果展示停留后通知父级
  window.setTimeout(() => emit('done'), 1800)
})
</script>

<template>
  <div class="dic">
    <div class="dic_panel">
      <h3 class="dic_panel_title">掷骰定庄</h3>
      <div class="dic_panel_grid">
        <div
          v-for="seat in seats"
          :key="seat"
          class="dic_panel_grid_cell"
          :class="{
            'is-first': revealResult && seat === firstSeat,
            'is-banker': revealResult && seat === bankerSeat,
          }"
        >
          <img class="dic_panel_grid_cell_die" :src="diceAsset(shown[seat])" :alt="`${shown[seat]}`" />
          <span class="dic_panel_grid_cell_name">
            {{ names[seat] ?? `座位${seat + 1}` }}{{ seat === mySeat ? '（你）' : '' }}
          </span>
          <span v-if="revealResult && seat === firstSeat" class="dic_panel_grid_cell_tag tag-first">先出</span>
          <span v-else-if="revealResult && seat === bankerSeat" class="dic_panel_grid_cell_tag tag-banker">庄</span>
        </div>
      </div>
      <p v-if="revealResult" class="dic_panel_hint">
        {{ names[firstSeat] ?? '先手' }} 先出，{{ names[bankerSeat] ?? '下家' }} 坐庄
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dic {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-toast);
  animation: dic-fade 0.25s ease;

  &_panel {
    width: 320px;
    background: linear-gradient(180deg, var(--color-felt), var(--color-felt-deep));
    border: 1.5px solid var(--color-gold);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
    padding: 22px 20px 18px;

    &_title {
      text-align: center;
      font-size: 20px;
      color: var(--color-gold);
      letter-spacing: 4px;
      margin-bottom: 18px;
    }

    &_grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;

      &_cell {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 12px 8px;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.22);
        transition:
          box-shadow 0.3s ease,
          background 0.3s ease,
          transform 0.3s ease;

        &_die {
          width: 46px;
          height: 46px;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
        }

        &_name {
          font-size: 12px;
          color: var(--color-text-dim);
        }

        &_tag {
          position: absolute;
          top: -8px;
          right: -6px;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 9px;
          border-radius: 999px;

          &.tag-first {
            color: var(--color-ink);
            background: var(--color-gold-light);
          }

          &.tag-banker {
            color: var(--color-text);
            background: var(--color-red);
          }
        }

        &.is-first {
          background: rgba(212, 175, 55, 0.18);
          box-shadow: 0 0 0 1.5px var(--color-gold);
          transform: translateY(-2px);
        }

        &.is-banker {
          background: rgba(178, 34, 34, 0.2);
          box-shadow: 0 0 0 1.5px rgba(178, 34, 34, 0.7);
        }
      }
    }

    &_hint {
      margin-top: 16px;
      text-align: center;
      font-size: 13px;
      color: var(--color-gold-light);
    }
  }
}

@keyframes dic-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
