/**
 * 牌面/骰子素材映射 —— 通过 Vite glob 导入 ../../assets 下的 SVG
 * 以 logicKey -> 资源 URL 的形式暴露。
 */

import { TILE_DEF_MAP } from '@goddog/shared'

// 文牌、武牌、骰子 SVG（eager 拿到 URL）
const wenModule = import.meta.glob('../../../../assets/cards/wen/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const wuModule = import.meta.glob('../../../../assets/cards/wu/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const diceModule = import.meta.glob('../../../../assets/dice/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** 文件名（含扩展）-> URL */
function indexByFileName(mod: Record<string, string>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [path, url] of Object.entries(mod)) {
    const name = path.split('/').pop()!
    map[name] = url
  }
  return map
}

const wenByFile = indexByFileName(wenModule)
const wuByFile = indexByFileName(wuModule)
const diceByFile = indexByFileName(diceModule)

/** 根据牌的 logicKey 取素材 URL */
export function tileAsset(logicKey: string): string {
  const def = TILE_DEF_MAP[logicKey]
  if (!def) return ''
  const byFile = def.suit === 'wen' ? wenByFile : wuByFile
  return byFile[def.fileName] ?? ''
}

/** 根据骰子点数（1-6）取素材 URL */
export function diceAsset(point: number): string {
  return diceByFile[`${point}.svg`] ?? ''
}
