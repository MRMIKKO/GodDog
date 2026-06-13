/**
 * 牌面定义 —— 数据源对应 docs/card-rules-table.md 与 docs/card-combinations.md
 * 所有牌名以 assets/cards 下实际文件为准。
 */

export type TileSuit = 'wen' | 'wu'

/** 静态牌面定义（牌种） */
export interface TileDef {
  /** 稳定逻辑键，用于规则计算 */
  logicKey: string
  /** UI 显示名（中文） */
  displayName: string
  /** 素材文件名 */
  fileName: string
  /** 文牌 / 武牌 */
  suit: TileSuit
  /** 同类内部比较序位（大到小，数值越大越大） */
  rank: number
  /** 武牌点级（用于尊牌识别）；文牌为 undefined */
  point?: number
  /** 牌堆中的实际张数 */
  copies: number
}

/** 文牌：11 种，每种 2 张 */
export const WEN_TILES: TileDef[] = [
  { logicKey: 'wen_tian', displayName: '天', fileName: '天.svg', suit: 'wen', rank: 11, copies: 2 },
  { logicKey: 'wen_di', displayName: '地', fileName: '地.svg', suit: 'wen', rank: 10, copies: 2 },
  { logicKey: 'wen_ren', displayName: '仁', fileName: '仁.svg', suit: 'wen', rank: 9, copies: 2 },
  { logicKey: 'wen_e', displayName: '鹅', fileName: '鹅.svg', suit: 'wen', rank: 8, copies: 2 },
  { logicKey: 'wen_mei', displayName: '梅', fileName: '梅.svg', suit: 'wen', rank: 7, copies: 2 },
  {
    logicKey: 'wen_changshan',
    displayName: '长山',
    fileName: '长山.svg',
    suit: 'wen',
    rank: 6,
    copies: 2,
  },
  {
    logicKey: 'wen_bandeng',
    displayName: '板凳',
    fileName: '板凳.svg',
    suit: 'wen',
    rank: 5,
    copies: 2,
  },
  { logicKey: 'wen_futou', displayName: '斧头', fileName: '斧头.svg', suit: 'wen', rank: 4, copies: 2 },
  {
    logicKey: 'wen_pingfeng',
    displayName: '平峰',
    fileName: '平峰.svg',
    suit: 'wen',
    rank: 3,
    copies: 2,
  },
  {
    logicKey: 'wen_gaojiaoqi',
    displayName: '高脚七',
    fileName: '高脚七.svg',
    suit: 'wen',
    rank: 2,
    copies: 2,
  },
  {
    logicKey: 'wen_bishiliu',
    displayName: '鼻屎六',
    fileName: '鼻屎六.svg',
    suit: 'wen',
    rank: 1,
    copies: 2,
  },
]

/** 武牌：10 张，A/B 仅区分图案，不区分大小 */
export const WU_TILES: TileDef[] = [
  {
    logicKey: 'wu_jiudian_a',
    displayName: '九点A',
    fileName: '九点A.svg',
    suit: 'wu',
    rank: 6,
    point: 9,
    copies: 1,
  },
  {
    logicKey: 'wu_jiudian_b',
    displayName: '九点B',
    fileName: '九点B.svg',
    suit: 'wu',
    rank: 6,
    point: 9,
    copies: 1,
  },
  {
    logicKey: 'wu_badian_a',
    displayName: '八点A',
    fileName: '八点A.svg',
    suit: 'wu',
    rank: 5,
    point: 8,
    copies: 1,
  },
  {
    logicKey: 'wu_badian_b',
    displayName: '八点B',
    fileName: '八点B.svg',
    suit: 'wu',
    rank: 5,
    point: 8,
    copies: 1,
  },
  {
    logicKey: 'wu_qidian_a',
    displayName: '七点A',
    fileName: '七点A.svg',
    suit: 'wu',
    rank: 4,
    point: 7,
    copies: 1,
  },
  {
    logicKey: 'wu_qidian_b',
    displayName: '七点B',
    fileName: '七点B.svg',
    suit: 'wu',
    rank: 4,
    point: 7,
    copies: 1,
  },
  {
    logicKey: 'wu_liudian',
    displayName: '六点',
    fileName: '六点.svg',
    suit: 'wu',
    rank: 3,
    point: 6,
    copies: 1,
  },
  {
    logicKey: 'wu_wudian_a',
    displayName: '五点A',
    fileName: '五点A.svg',
    suit: 'wu',
    rank: 2,
    point: 5,
    copies: 1,
  },
  {
    logicKey: 'wu_wudian_b',
    displayName: '五点B',
    fileName: '五点B.svg',
    suit: 'wu',
    rank: 2,
    point: 5,
    copies: 1,
  },
  {
    logicKey: 'wu_sandian',
    displayName: '三点',
    fileName: '三点.svg',
    suit: 'wu',
    rank: 1,
    point: 3,
    copies: 1,
  },
]

/** 全部 21 种牌定义 */
export const ALL_TILE_DEFS: TileDef[] = [...WEN_TILES, ...WU_TILES]

/** logicKey -> TileDef 索引 */
export const TILE_DEF_MAP: Record<string, TileDef> = Object.fromEntries(
  ALL_TILE_DEFS.map((t) => [t.logicKey, t]),
)

/** 牌堆总张数：文牌 22 + 武牌 10 = 32 */
export const TOTAL_TILE_COUNT = ALL_TILE_DEFS.reduce((sum, t) => sum + t.copies, 0)

/** 文武对的文牌->武点搭配（天九/地八/人七/鹅五） */
export const WEN_WU_PAIRS: Record<string, { wuPoint: number; comboKey: string; rank: number }> = {
  wen_tian: { wuPoint: 9, comboKey: 'tian_jiu', rank: 4 },
  wen_di: { wuPoint: 8, comboKey: 'di_ba', rank: 3 },
  wen_ren: { wuPoint: 7, comboKey: 'ren_qi', rank: 2 },
  wen_e: { wuPoint: 5, comboKey: 'e_wu', rank: 1 },
}
