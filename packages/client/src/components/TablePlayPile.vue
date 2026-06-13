<script setup lang="ts">
/**
 * 台面出牌区 —— 展示某玩家已出的一手牌（打牌正面 / 垫牌牌背）
 */
import TileCard from './TileCard.vue'
import type { TablePlay } from '@goddog/shared'

defineProps<{
  play: TablePlay
  /** 出牌玩家昵称，传入则显示名字标签 */
  playerName?: string
}>()
</script>

<template>
  <div class="tbp" :class="{ 'tbp--leader': play.isLeader, 'tbp--pass': play.action === 'pass' }">
    <!-- 玩家名 + 动作标签 -->
    <div v-if="playerName" class="tbp_who">
      <span
        class="tbp_who_act"
        :class="play.action === 'play' ? 'tbp_who_act--play' : 'tbp_who_act--pass'"
      >
        {{ play.action === 'play' ? '出' : '垫' }}
      </span>
      <span class="tbp_who_name">{{ playerName }}</span>
      <!-- 当前最大牌皇冠 -->
      <span v-if="play.isLeader && play.action === 'play'" class="tbp_who_crown">♛</span>
    </div>

    <!-- 牌面 -->
    <div class="tbp_cards">
      <template v-if="play.action === 'play'">
        <TileCard
          v-for="c in play.cards"
          :key="c.id"
          :card="c"
          :scale="0.62"
        />
      </template>
      <template v-else>
        <TileCard v-for="i in play.count" :key="i" face-down :scale="0.62" />
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tbp {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 6px 4px;
  border-radius: 10px;
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease;
  animation: tbp-in 0.28s ease;

  &--leader {
    background: rgba(212, 175, 55, 0.14);
    box-shadow:
      0 0 0 1.5px rgba(212, 175, 55, 0.7),
      0 0 16px rgba(212, 175, 55, 0.25);
  }

  &--pass {
    opacity: 0.75;
  }

  &_who {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 110px;

    &_act {
      font-size: 10px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 4px;
      line-height: 1.4;
      flex-shrink: 0;

      &--play {
        background: rgba(212, 175, 55, 0.25);
        color: var(--color-gold-light);
        border: 1px solid rgba(212, 175, 55, 0.4);
      }

      &--pass {
        background: rgba(245, 236, 216, 0.1);
        color: var(--color-text-dim);
        border: 1px solid rgba(245, 236, 216, 0.2);
      }
    }

    &_name {
      font-size: 11px;
      color: var(--color-text-dim);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &_crown {
      font-size: 12px;
      color: var(--color-gold);
      flex-shrink: 0;
      filter: drop-shadow(0 0 4px rgba(212, 175, 55, 0.8));
    }
  }

  &_cards {
    display: flex;
    gap: 2px;
  }
}

@keyframes tbp-in {
  from {
    opacity: 0;
    transform: translateY(-16px) scale(0.88);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
