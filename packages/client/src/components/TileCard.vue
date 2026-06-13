<script setup lang="ts">
/**
 * 单张牌组件 —— 支持正面（SVG）/牌背、选中态、禁用态
 */
import { computed } from 'vue'
import type { Card } from '@goddog/shared'
import { tileAsset } from '@/assets/tiles'

const props = withDefaults(
  defineProps<{
    card?: Card | null
    /** 是否牌背朝上 */
    faceDown?: boolean
    /** 是否选中（上移高亮） */
    selected?: boolean
    /** 是否可点击 */
    selectable?: boolean
    /** 是否置灰禁用 */
    disabled?: boolean
    /** 缩放比例 */
    scale?: number
  }>(),
  { faceDown: false, selected: false, selectable: false, disabled: false, scale: 1 },
)

const emit = defineEmits<{ toggle: [card: Card] }>()

const src = computed(() => (props.card ? tileAsset(props.card.logicKey) : ''))

function onClick() {
  if (props.selectable && !props.disabled && props.card) {
    emit('toggle', props.card)
  }
}
</script>

<template>
  <div
    class="tle"
    :class="{
      'tle--down': faceDown,
      'tle--selected': selected,
      'tle--disabled': disabled,
      'tle--selectable': selectable && !disabled,
    }"
    :style="{ transform: `scale(${scale})` }"
    @click="onClick"
  >
    <div v-if="faceDown" class="tle_back" />
    <img v-else-if="src" class="tle_face" :src="src" :alt="card?.logicKey" draggable="false" />
  </div>
</template>

<style scoped lang="scss">
.tle {
  width: var(--tile-w);
  height: var(--tile-h);
  border-radius: var(--radius-card);
  background: var(--color-ivory);
  box-shadow: var(--shadow-card);
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    filter 0.16s ease;
  flex-shrink: 0;
  overflow: hidden;

  &_face {
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }

  &_back {
    width: 100%;
    height: 100%;
    border-radius: var(--radius-card);
    background:
      repeating-linear-gradient(
        45deg,
        rgba(212, 175, 55, 0.25),
        rgba(212, 175, 55, 0.25) 4px,
        transparent 4px,
        transparent 8px
      ),
      linear-gradient(135deg, var(--color-felt-light), var(--color-felt-deep));
    border: 2px solid var(--color-gold);
  }

  &--selectable {
    cursor: pointer;

    &:active {
      transform: translateY(-4px) scale(1);
    }
  }

  &--selected {
    transform: translateY(-18px);
    box-shadow:
      0 0 0 2px var(--color-gold),
      0 8px 18px rgba(0, 0, 0, 0.5);
  }

  &--disabled {
    filter: grayscale(0.6) brightness(0.7);
  }
}
</style>
