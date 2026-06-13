<script setup lang="ts">
/**
 * 玩家座位牌 —— 显示昵称、欢乐豆、栋数、连线/准备状态、庄家标记
 */
import { ref, watch, computed } from 'vue'
import type { PlayerState } from '@goddog/shared'

const props = defineProps<{
  player: PlayerState | null
  position: 'bottom' | 'top' | 'left' | 'right'
  isBanker?: boolean
  isTurn?: boolean
  ready?: boolean
  waiting?: boolean
  isMe?: boolean
}>()

const dongPop = ref(false)
const dongs = computed(() => props.player?.dongs ?? 0)
watch(dongs, (n, o) => {
  if (n <= o) return
  dongPop.value = true
  setTimeout(() => { dongPop.value = false }, 550)
})
</script>

<template>
  <div
    class="set"
    :class="[`set--${position}`, { 'set--turn': isTurn, 'set--offline': player && !player.connected, 'set--me': isMe }]"
  >
    <div class="set_avatar">
      <span class="set_avatar_txt">{{ player?.nickname?.[0] ?? '空' }}</span>
      <span v-if="isBanker" class="set_avatar_banker">庄</span>
      <!-- 出牌轮次脉冲环 -->
      <span v-if="isTurn" class="set_avatar_ring" />
    </div>
    <div class="set_info">
      <div class="set_info_name">{{ player?.nickname ?? '等待加入' }}</div>
      <div v-if="player" class="set_info_meta">
        <span v-if="waiting" class="set_info_meta_ready" :class="{ 'is-ready': ready }">
          {{ ready ? '已准备' : '未准备' }}
        </span>
        <template v-else>
          <span class="set_info_meta_dong" :class="{ 'is-pop': dongPop }">{{ player.dongs }} 栋</span>
          <span class="set_info_meta_hand">手牌 {{ player.handCount }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.set {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 999px;
  border: 1.5px solid transparent;
  transition: border-color 0.2s ease;

  &--turn {
    border-color: var(--color-gold);
    box-shadow:
      0 0 16px rgba(212, 175, 55, 0.55),
      0 0 32px rgba(212, 175, 55, 0.2);
    background: rgba(0, 0, 0, 0.45);
  }

  &--me {
    border-color: rgba(245, 236, 216, 0.2);
  }

  &--offline {
    opacity: 0.5;
  }

  &--left,
  &--right {
    flex-direction: column;
    text-align: center;
  }

@keyframes set-ring-pulse {
  0%, 100% { transform: scale(1);    opacity: 1;    }
  50%       { transform: scale(1.22); opacity: 0.55; }
}

@keyframes dong-pop {
  0%   { transform: scale(1);    color: var(--color-gold-light); }
  40%  { transform: scale(1.75); color: var(--color-gold);       }
  70%  { transform: scale(0.9);  }
  100% { transform: scale(1);    color: var(--color-gold-light); }
}

  &_avatar {
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--color-felt-light), var(--color-felt));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    &_txt {
      font-size: 18px;
      font-weight: 700;
      color: var(--color-gold-light);
    }

    &_banker {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--color-red);
      color: #fff;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
    }

    &_ring {
      position: absolute;
      inset: -5px;
      border-radius: 50%;
      border: 2px solid var(--color-gold-light);
      box-shadow:
        0 0 10px rgba(240, 217, 138, 0.7),
        inset 0 0 8px rgba(240, 217, 138, 0.25);
      animation: set-ring-pulse 1.1s ease-in-out infinite;
      pointer-events: none;
    }
  }

  &_info {
    &_name {
      font-size: 13px;
      font-weight: 600;
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &_meta {
      display: flex;
      gap: 8px;
      font-size: 11px;
      color: var(--color-text-dim);
      margin-top: 2px;

      &_dong {
        color: var(--color-gold-light);
        transition: color 0.2s;
        display: inline-block;

        &.is-pop {
          animation: dong-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      }

      &_ready {
        color: var(--color-text-dim);

        &.is-ready {
          color: #6ee787;
        }
      }
    }
  }
}
</style>
