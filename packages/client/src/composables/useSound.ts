/**
 * 音效系统 —— 预留接口（action sounds 口子）
 * 第一期不接入真实音频文件，仅留事件触发钩子；后期把 sources 填上即可生效。
 *
 * 用法：
 *   const { play } = useSound()
 *   play('playCard')
 *   play('playZun', { comboKey: 'wen_zun' })  // 牌型配音可按 comboKey 细分
 */

import { ref } from 'vue'

/** 音效事件类型（覆盖出牌、场景、结算等触发点） */
export type SoundEvent =
  | 'dealCard' // 发牌
  | 'playCard' // 普通出牌
  | 'passCard' // 垫牌
  | 'winDong' // 赢一栋
  | 'gameWin' // 结牌胜利
  | 'playZun' // 出尊牌（可按 comboKey 细分文尊/武尊配音）
  | 'playQuad' // 出四张牌型
  | 'daoKam' // 倒Kam
  | 'tingji' // 仃鸡
  | 'diceRoll' // 掷骰
  | 'sceneAmbient' // 场景氛围音

export interface SoundContext {
  /** 牌型键，用于细分配音（如 wen_zun / quad_tian_jiu） */
  comboKey?: string
  /** 座位号，用于方位声像（预留） */
  seat?: number
}

/** 音效资源表：后期把每个事件映射到音频文件 URL 即可启用 */
const sources: Partial<Record<SoundEvent, string>> = {
  // dealCard: '/sounds/deal.mp3',
  // playZun: '/sounds/zun.mp3',
}

const enabled = ref(true)
const audioCache = new Map<string, HTMLAudioElement>()

export function useSound() {
  function setEnabled(v: boolean): void {
    enabled.value = v
  }

  function play(event: SoundEvent, _ctx?: SoundContext): void {
    if (!enabled.value) return
    const src = sources[event]
    if (!src) {
      // 尚未配置音频，静默跳过（保留口子）
      return
    }
    let audio = audioCache.get(src)
    if (!audio) {
      audio = new Audio(src)
      audioCache.set(src, audio)
    }
    void audio.play().catch(() => {
      /* 浏览器自动播放策略可能拦截，忽略 */
    })
  }

  /** 运行时注册/覆盖音效资源（便于后期热配） */
  function register(event: SoundEvent, url: string): void {
    sources[event] = url
  }

  return { play, register, setEnabled, enabled }
}
