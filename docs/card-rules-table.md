# 天九规则对照表（程序用）

本文档把牌面、组合、压制关系、特殊结算拆成表格，方便后续直接转成规则配置或判定逻辑。

## 0. 适用范围

- 玩法：打天九（吃栋型）
- 人数：4 人
- 手牌：每人 8 张
- 目标：赢最后一栋，并满足结牌条件
- 本局固定规则：
  - 文武尊启用
  - 同类压同类，文武不混压
  - 结牌至少 1 栋
  - 空栋不加赔
  - 庄家固定加倍
  - 连庄倍数递增，无封顶
  - Kam 启用：公共分池初始 40 分，每圈结一方支付 4 分
  - 不启用贺尊 / 贺四 / 例牌

---

## 1. 牌面定义表

### 1.1 文牌

| 逻辑键 | 显示名 | 文件名 | 文牌序位 | 说明 |
|---|---|---|---:|---|
| wen_tian | 天 | 天.svg | 11 | 文牌最大 |
| wen_di | 地 | 地.svg | 10 |  |
| wen_ren | 仁 | 仁.svg | 9 |  |
| wen_e | 鹅 | 鹅.svg | 8 |  |
| wen_mei | 梅 | 梅.svg | 7 |  |
| wen_changshan | 长山 | 长山.svg | 6 |  |
| wen_bandeng | 板凳 | 板凳.svg | 5 |  |
| wen_futou | 斧头 | 斧头.svg | 4 |  |
| wen_pingfeng | 平峰 | 平峰.svg | 3 |  |
| wen_gaojiaoqi | 高脚七 | 高脚七.svg | 2 |  |
| wen_bishiliu | 鼻屎六 | 鼻屎六.svg | 1 | 文牌最小 |

### 1.2 武牌

| 逻辑键 | 显示名 | 文件名 | 点级 | 武牌序位 | 说明 |
|---|---|---|---:|---:|---|
| wu_jiudian_a | 九点A | 九点A.svg | 9 | 6 | 与九点B同级 |
| wu_jiudian_b | 九点B | 九点B.svg | 9 | 6 | 与九点A同级 |
| wu_badian_a | 八点A | 八点A.svg | 8 | 5 | 与八点B同级 |
| wu_badian_b | 八点B | 八点B.svg | 8 | 5 | 与八点A同级 |
| wu_qidian_a | 七点A | 七点A.svg | 7 | 4 | 与七点B同级 |
| wu_qidian_b | 七点B | 七点B.svg | 7 | 4 | 与七点A同级 |
| wu_liudian | 六点 | 六点.svg | 6 | 3 | 可用于武尊压制文尊 |
| wu_wudian_a | 五点A | 五点A.svg | 5 | 2 | 与五点B同级 |
| wu_wudian_b | 五点B | 五点B.svg | 5 | 2 | 与五点A同级 |
| wu_sandian | 三点 | 三点.svg | 3 | 1 | 最小武点 |

### 1.3 数量规则

| 类别 | 实际张数 | 说明 |
|---|---:|---|
| 文牌 | 22 | 11 种 × 每种 2 张 |
| 武牌 | 10 | 10 张，A/B 只区分图案 |
| 总牌数 | 32 |  |

---

## 2. 组合分类表

### 2.1 组合门类

| comboType | 组合名称 | 适用牌数 | 说明 |
|---|---|---:|---|
| single_wen | 单文 | 1 | 任意 1 张文牌 |
| single_wu | 单武 | 1 | 任意 1 张武牌 |
| pair_wen | 文对 | 2 | 同文名两张 |
| pair_wu | 武对 | 2 | 同点位两张 |
| pair_wen_wu | 文武对 | 2 | 文 + 武固定搭配 |
| triple_wen | 三文 | 3 | 一对文牌 + 一张武牌 |
| triple_wu | 三武 | 3 | 一张文牌 + 两张武牌 |
| quad_wen_wu | 四文武 | 4 | 一对文牌 + 两张武牌 |
| zun_wen | 文尊 | 2 | 双鼻屎六 |
| zun_wu | 武尊 | 2 | 三点 + 六点 |

### 2.2 组合优先级

只允许在同一 comboType 内比较大小。

| 门类 | 内部比较规则 |
|---|---|
| single_wen | 只和单文比较 |
| single_wu | 只和单武比较 |
| pair_wen | 只和文对比较 |
| pair_wu | 只和武对比较 |
| pair_wen_wu | 只和文武对比较 |
| triple_wen | 只和三文比较 |
| triple_wu | 只和三武比较 |
| quad_wen_wu | 只和四文武比较 |
| zun_wen | 只和文尊比较 |
| zun_wu | 只和武尊比较 |

---

## 3. 组合明细表

### 3.1 单张

| comboType | comboKey | 组成 | 备注 |
|---|---|---|---|
| single_wen | single_wen | 任意 1 张文牌 | 例如：天、地、仁、鹅… |
| single_wu | single_wu | 任意 1 张武牌 | 例如：九点A、六点、三点… |

### 3.2 双张

| comboType | comboKey | 组成 | 备注 |
|---|---|---|---|
| pair_wen | pair_wen_tian | 天 + 天 | 文对，以下同理 |
| pair_wen | pair_wen_di | 地 + 地 |  |
| pair_wen | pair_wen_ren | 仁 + 仁 |  |
| pair_wen | pair_wen_e | 鹅 + 鹅 |  |
| pair_wen | pair_wen_mei | 梅 + 梅 |  |
| pair_wen | pair_wen_changshan | 长山 + 长山 |  |
| pair_wen | pair_wen_bandeng | 板凳 + 板凳 |  |
| pair_wen | pair_wen_futou | 斧头 + 斧头 |  |
| pair_wen | pair_wen_pingfeng | 平峰 + 平峰 |  |
| pair_wen | pair_wen_gaojiaoqi | 高脚七 + 高脚七 |  |
| pair_wen | pair_wen_bishiliu | 鼻屎六 + 鼻屎六 | 文尊基础牌型 |
| pair_wu | pair_wu_9 | 九点A + 九点B | 同点位配对 |
| pair_wu | pair_wu_8 | 八点A + 八点B |  |
| pair_wu | pair_wu_7 | 七点A + 七点B |  |
| pair_wu | pair_wu_5 | 五点A + 五点B |  |
| pair_wen_wu | tian_jiu | 天 + 任一九点 | 天九 |
| pair_wen_wu | di_ba | 地 + 任一八点 | 地八 |
| pair_wen_wu | ren_qi | 仁 + 任一七点 | 人七 |
| pair_wen_wu | e_wu | 鹅 + 任一五点 | 鹅五 |
| zun_wen | wen_zun | 鼻屎六 + 鼻屎六 | 文尊 |
| zun_wu | wu_zun | 三点 + 六点 | 武尊 |

### 3.3 三张

| comboType | comboKey | 组成 | 备注 |
|---|---|---|---|
| triple_wen | triple_tian_jiu | 天 + 天 + 任一九点 | 三文天九 |
| triple_wen | triple_di_ba | 地 + 地 + 任一八点 | 三文地八 |
| triple_wen | triple_ren_qi | 仁 + 仁 + 任一七点 | 三文人七 |
| triple_wen | triple_e_wu | 鹅 + 鹅 + 任一五点 | 三文鹅五 |
| triple_wu | triple_tian_jiu | 天 + 九点A + 九点B | 三武天九 |
| triple_wu | triple_di_ba | 地 + 八点A + 八点B | 三武地八 |
| triple_wu | triple_ren_qi | 仁 + 七点A + 七点B | 三武人七 |
| triple_wu | triple_e_wu | 鹅 + 五点A + 五点B | 三武鹅五 |

### 3.4 四张

| comboType | comboKey | 组成 | 备注 |
|---|---|---|---|
| quad_wen_wu | quad_tian_jiu | 天 + 天 + 九点A + 九点B | 四天九 |
| quad_wen_wu | quad_di_ba | 地 + 地 + 八点A + 八点B | 四地八 |
| quad_wen_wu | quad_ren_qi | 仁 + 仁 + 七点A + 七点B | 四人七 |
| quad_wen_wu | quad_e_wu | 鹅 + 鹅 + 五点A + 五点B | 四鹅五 |

---

## 4. 压制关系表

### 4.1 单张压制

| 当前牌型 | 可压制对象 | 说明 |
|---|---|---|
| 单文 | 更小单文 | 严格按文牌序位压制 |
| 单武 | 更小单武 | 严格按武牌序位压制 |

### 4.2 文武对压制

| 当前牌型 | 可压制对象 | 说明 |
|---|---|---|
| 天九 | 更小天九 | 只和天九比 |
| 地八 | 更小地八 | 只和地八比 |
| 人七 | 更小人七 | 只和人七比 |
| 鹅五 | 更小鹅五 | 只和鹅五比 |

### 4.3 尊牌压制

| 当前牌型 | 可压制对象 | 说明 |
|---|---|---|
| 武尊 | 无 | 武尊先出，天下无敌 |
| 文尊 | 双高脚七 | 只有双高脚七可压制文尊 |

---

## 5. 结算规则表

### 5.1 基础结算

| 项目 | 规则 |
|---|---|
| 结牌条件 | 必须赢最后一栋，且本局至少有 1 栋 |
| 基准栋数 | 4 栋 |
| 0 栋 | 不加赔 |
| 庄家 | 固定 x2 |
| 连庄 | 递增，无封顶 |

### 5.2 最后一圈特殊结算

| 触发条件 | 结果 |
|---|---|
| 最后一圈以最小单文鼻屎六直接结 | X2 倍结算 |
| 最后一圈以最小单武三点直接结 | X2 倍结算 |
| 最后一圈以文武尊胜利 | X2 倍结算 |
| 最后一圈单文被高脚七压制 | 按“文尊被双高脚七压制”结算 |
| 最后一圈单武被六点压制 | 按“文尊被双高脚七压制”结算 |
| 最后一圈文尊被双高脚七压制 | 按“文尊被双高脚七压制”结算 |

### 5.3 文尊被双高脚七压制的结算

| 项目 | 规则 |
|---|---|
| 被压制方 | 向压制方支付双倍结算 |
| 其他玩家结算 | 由被压制方一并负责 |
| 适用场景 | 文尊被双高脚七压制，以及所有映射到该规则的最后一圈特殊压制 |

### 5.4 Kam 与 倒Kam

| 项目 | 规则 |
|---|---|
| Kam | 公共分池，初始 40 分 |
| 每圈结算 | 每一圈结一方，胜利方需向 Kam 支付 4 分 |
| 倒Kam | 可将 Kam 的分数全部拿走 |
| 倒Kam触发 | 最后胜利（结）且本局拥有 6 栋或以上；或四张牌型出牌并直接成立（如四天九、四地八、四人七、四鹅五） |
| 四张被压制 | 被压制方失去 Kam，并触发仃鸡结算 |
| 四张被压制后结算 | 按仃鸡规则执行双倍与其他玩家结算责任 |

---

## 6. 程序建议字段

| 字段 | 示例 | 含义 |
|---|---|---|
| displayName | 高脚七 | UI 显示名 |
| logicKey | wen_gaojiaoqi | 稳定逻辑键 |
| comboType | pair_wen_wu | 组合门类 |
| comboKey | tian_jiu | 组合唯一键 |
| compareRank | 4 | 同类内比较顺位 |
| specialRule | last_round_x2 | 特殊结算标记 |

---

## 7. 直接给程序的最小判断顺序

1. 先判断是不是合法组合。
2. 再判断是不是同类可压。
3. 再判断是不是尊牌或最后一圈特殊结算。
4. 最后再走基础结算。

---

## 8. 备注

- 这个文档是面向程序的“规则表”，不再解释玩法背景。
- 如果后续你再校正牌名或结算口径，只需要改这里的表，不用改旧的教学文档。
