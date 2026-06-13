<script setup lang="ts">
/**
 * 吃栋庆典覆层 —— 替代 toast，以全屏舞台动画呈现吃栋结果
 */
import { ref, onMounted } from 'vue'
import { gsap } from 'gsap'
import type { DongWonPayload } from '@goddog/shared'

defineProps<{
  dong: DongWonPayload
  winnerName: string
  /** 赢家当前累计栋数（含本栋） */
  totalDongs: number
}>()

const emit = defineEmits<{ dismiss: [] }>()

const rootEl = ref<HTMLElement | null>(null)

onMounted(() => {
  const root = rootEl.value
  if (!root) return

  const banner = root.querySelector<HTMLElement>('.dow_banner')
  const badge = root.querySelector<HTMLElement>('.dow_badge')
  const rays = root.querySelectorAll<HTMLElement>('.dow_ray')

  const tl = gsap.timeline({ onComplete: () => emit('dismiss') })

  tl.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.15 })
  tl.fromTo(
    banner,
    { scale: 0.42, y: 32, opacity: 0 },
    { scale: 1, y: 0, opacity: 1, duration: 0.42, ease: 'back.out(2)' },
    '-=0.05',
  )
  tl.fromTo(
    rays,
    { scale: 0, opacity: 0.9 },
    {
      scale: 2.6,
      opacity: 0,
      duration: 0.65,
      stagger: { each: 0.04, from: 'random' },
      ease: 'power1.out',
    },
    '-=0.3',
  )
  tl.fromTo(
    badge,
    { scale: 0.25, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.36, ease: 'elastic.out(1.2, 0.5)' },
    '-=0.5',
  )
  tl.to({}, { duration: 1.35 })
  tl.to(root, { opacity: 0, duration: 0.28 })
})
</script>

<template>
  <div ref="rootEl" class="dow" @click="emit('dismiss')">
    <div class="dow_bg" />
    <div class="dow_stage">
      <!-- 放射光线 -->
      <div class="dow_rays" aria-hidden="true">
        <span
          v-for="i in 8"
          :key="i"
          class="dow_ray"
          :style="{ '--rot': `${(i - 1) * 45}deg` }"
        />
      </div>

      <!-- 主要文字牌 -->
      <div class="dow_banner">
        <div class="dow_banner_name">{{ winnerName }}</div>
        <div class="dow_banner_label">吃 栋！</div>
        <div v-if="dong.winningCombo?.type" class="dow_banner_combo">
          {{ dong.winningCombo.type }}
        </div>
      </div>

      <!-- 当前栋数徽章 -->
      <div class="dow_badge">
        <span class="dow_badge_num">{{ totalDongs }}</span>
        <span class="dow_badge_txt">栋</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dow {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: all;

  &_bg {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
  }

  &_stage {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  /* 放射线容器 */
  &_rays {
    position: absolute;
    width: 280px;
    height: 280px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  &_ray {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 2px;
    height: 130px;
    background: linear-gradient(to bottom, rgba(240, 217, 138, 0.95) 0%, transparent 100%);
    transform-origin: 50% 0%;
    transform: rotate(var(--rot)) translateX(-50%);
    border-radius: 1px;
  }

  /* 主牌 */
  &_banner {
    position: relative;
    text-align: center;
    padding: 18px 36px 20px;
    background: linear-gradient(160deg, #1a6b51 0%, #0b3d2e 100%);
    border: 2px solid var(--color-gold);
    border-radius: 18px;
    box-shadow:
      0 0 48px rgba(212, 175, 55, 0.45),
      0 20px 48px rgba(0, 0, 0, 0.65);
    min-width: 220px;

    /* 顶部金光条 */
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 10%;
      width: 80%;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--color-gold-light), transparent);
      border-radius: 1px;
    }

    &_name {
      font-size: 18px;
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: 6px;
      letter-spacing: 1px;
    }

    &_label {
      font-size: 40px;
      font-weight: 900;
      color: var(--color-gold-light);
      text-shadow:
        0 0 24px rgba(240, 217, 138, 0.9),
        0 2px 6px rgba(0, 0, 0, 0.6);
      letter-spacing: 8px;
      line-height: 1;
    }

    &_combo {
      margin-top: 10px;
      display: inline-block;
      font-size: 12px;
      color: var(--color-gold);
      background: rgba(212, 175, 55, 0.14);
      border: 1px solid rgba(212, 175, 55, 0.35);
      padding: 3px 14px;
      border-radius: 999px;
      letter-spacing: 1px;
    }
  }

  /* 栋数徽章 */
  &_badge {
    display: flex;
    align-items: baseline;
    gap: 4px;
    background: var(--color-gold);
    color: var(--color-ink);
    padding: 6px 22px;
    border-radius: 999px;
    box-shadow: 0 4px 16px rgba(212, 175, 55, 0.55);

    &_num {
      font-size: 30px;
      font-weight: 900;
      line-height: 1;
    }

    &_txt {
      font-size: 14px;
      font-weight: 700;
    }
  }
}
</style>
