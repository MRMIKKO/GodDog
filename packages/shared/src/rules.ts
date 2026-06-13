/**
 * 压制规则 —— 判断 attacker 牌型能否压制 defender 牌型
 * 规则依据 docs/card-rules-table.md 第 4 节
 *
 * 核心约定（已与桌规确认）：
 * - 严格同类压同类，文武不混压
 * - 同 rank 出牌：先出为大，后者无法压制，只能垫牌（严格大于，不可等于）
 * - 武尊先出天下无敌，不可被压制
 * - 文尊先出，只有双高脚七可压制
 */

import type { Combo } from './types.js'

/** 双高脚七的 comboKey（用于压制文尊） */
const PAIR_GAOJIAOQI_KEY = 'pair_wen_gaojiaoqi'

/**
 * attacker 能否压制 defender（当前台面最大牌）。
 * 跟牌张数必须一致（由调用方保证 attacker.size === defender.size）。
 */
export function canBeat(attacker: Combo, defender: Combo): boolean {
  // 张数不同不可压制
  if (attacker.size !== defender.size) return false

  // 武尊：天下无敌，任何牌都压不过
  if (defender.type === 'zun_wu') return false

  // 文尊：只有双高脚七可压制
  if (defender.type === 'zun_wen') {
    return attacker.type === 'pair_wen' && attacker.comboKey === PAIR_GAOJIAOQI_KEY
  }

  // 攻方为尊牌但守方非对应尊牌 —— 不能跨类压制
  if (attacker.type === 'zun_wu' || attacker.type === 'zun_wen') {
    return false
  }

  // 普通比较：必须同一比较分组，且严格大于
  if (attacker.compareGroup !== defender.compareGroup) return false
  return attacker.power > defender.power
}

/**
 * 判断 attacker 是否为合法跟牌（可压制或可垫牌）。
 * - 张数一致即可垫牌
 * - 能压制则可打牌
 */
export function isLegalFollow(attacker: Combo, defender: Combo): boolean {
  return attacker.size === defender.size
}
