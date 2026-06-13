# 天九牌名与牌型组合说明（按 assets/cards 定义）

本文档用于统一前后端命名与判定逻辑。所有牌名以 `assets/cards` 下实际文件为准。

## 1. 文件来源与命名约定

- 文牌目录：`assets/cards/wen`
- 武牌目录：`assets/cards/wu`
- 其他文件：`assets/cards/throw.svg`（可作为抛牌/牌背动效素材），`.DS_Store` 忽略。

建议程序层统一使用两套字段：

1. `displayName`：用于 UI 显示（中文名）
2. `logicKey`：用于规则计算（稳定英文键）

---

## 2. 文牌（11种）

| displayName | fileName | logicKey | rankWen（大到小） |
|---|---|---|---|
| 天 | 天.svg | wen_tian | 11 |
| 地 | 地.svg | wen_di | 10 |
| 仁 | 仁.svg | wen_ren | 9 |
| 鹅 | 鹅.svg | wen_e | 8 |
| 梅 | 梅.svg | wen_mei | 7 |
| 长山 | 长山.svg | wen_changshan | 6 |
| 板凳 | 板凳.svg | wen_bandeng | 5 |
| 斧头 | 斧头.svg | wen_futou | 4 |
| 平峰 | 平峰.svg | wen_pingfeng | 3 |
| 高脚七 | 高脚七.svg | wen_gaojiaoqi | 2 |
| 鼻屎六 | 鼻屎六.svg | wen_bishiliu | 1 |

说明：
- 文牌在规则上是每种两张；素材层只有一张图，实例化时按数量复制即可。

---

## 3. 武牌（10张）

| displayName | fileName | logicKey | pointClass | rankWu（大到小） |
|---|---|---|---|---|
| 九点A | 九点A.svg | wu_jiudian_a | 9 | 6 |
| 九点B | 九点B.svg | wu_jiudian_b | 9 | 6 |
| 八点A | 八点A.svg | wu_badian_a | 8 | 5 |
| 八点B | 八点B.svg | wu_badian_b | 8 | 5 |
| 七点A | 七点A.svg | wu_qidian_a | 7 | 4 |
| 七点B | 七点B.svg | wu_qidian_b | 7 | 4 |
| 六点 | 六点.svg | wu_liudian | 6 | 3 |
| 五点A | 五点A.svg | wu_wudian_a | 5 | 2 |
| 五点B | 五点B.svg | wu_wudian_b | 5 | 2 |
| 三点 | 三点.svg | wu_sandian | 3 | 1 |

说明：
- A/B 只区分图案，不区分同点位大小（如九点A与九点B同级）。
- 三点与六点用于武尊组合（丁三+二四）。

---

## 4. 牌型门类（严格同类压同类）

你当前定版规则：同类压同类，文武不混压。

建议门类 `comboType`：

1. `single_wen`：单文牌
2. `single_wu`：单武牌
3. `pair_wen`：文对（同文名两张）
4. `pair_wu`：武对（同点位两张，如九点A+九点B）
5. `pair_wen_wu`：文武对（天九/地八/人七/鹅五）
6. `triple_wen`：三文牌
7. `triple_wu`：三武牌
8. `quad_wen_wu`：四文武牌
9. `zun_wen`：文尊（双鼻屎六）
10. `zun_wu`：武尊（三点+六点）

比较规则建议：
- 只能在同 `comboType` 内比较大小。
- `zun_wen` 只按双鼻屎六识别。
- `zun_wu` 只按三点+六点识别。

---

## 5. 全部组合定义（用于规则引擎）

## 5.1 单张

1. 单文：任意 1 张文牌
2. 单武：任意 1 张武牌

## 5.2 双张

1. 文对（`pair_wen`）
- 同文名两张：
- 天天、地地、仁仁、鹅鹅、梅梅、长山长山、板凳板凳、斧头斧头、平峰平峰、高脚七高脚七、鼻屎六鼻屎六

2. 武对（`pair_wu`）
- 同点位成对：
- 九点A+九点B、八点A+八点B、七点A+七点B、五点A+五点B

3. 文武对（`pair_wen_wu`）
- 天九：天 + 任一九点
- 地八：地 + 任一八点
- 人七：仁 + 任一七点
- 鹅五：鹅 + 任一五点

4. 尊牌（双张特殊）
- 文尊（`zun_wen`）：鼻屎六 + 鼻屎六
- 武尊（`zun_wu`）：三点 + 六点

尊牌结算补充（已确认）：
- 文尊与武尊基础结算倍率一致。
- 武尊先出：天下无敌，不可被压制。
- 文尊先出：只有双高脚七可压制。
- 若文尊被双高脚七压制：
  - 被压制方需向压制方支付双倍结算。
  - 被压制方同时负责其他玩家的结算。

最后一圈特殊结算（已确认）：
- 如果最后一圈由以下方式直接胜出（结），可按 X2 倍结算：
  - 最小单文：鼻屎六
  - 最小单武：三点
  - 文武尊胜利
- 如果最后一圈发生以下压制关系，则结算方式与“文尊被双高脚七压制”一致（统称‘仃鸡’）：
  - 最小单文被高脚七压制
  - 最小单武被六点压制
  - 文尊被双高脚七压制
- 上述“被压制”的一方：
  - 需向压制方支付双倍结算。
  - 负责其他玩家的结算。

Kam / 倒Kam 结算（已确认）：
- Kam 为公共分池，初始 40 分。
- 每一圈结一方（胜利方），需要向 Kam 支付 4 分。
- 倒Kam：可将 Kam 的分数全部拿走。
- 触发倒Kam的条件：
  - 最后胜利（结）且本局拥有 6 栋或以上。
  - 四张牌型出牌并直接成立，例如四天九、四地八、四人七、四鹅五。
- 四张牌型若被压制：
  - 被压制方失去 Kam。
  - 同时触发仃鸡结算。
  - 按仃鸡规则执行双倍与其他玩家结算责任。

## 5.3 三张

1. 三文牌（`triple_wen`）
- 三文天九：天+天+任一九点
- 三文地八：地+地+任一八点
- 三文人七：仁+仁+任一七点
- 三文鹅五：鹅+鹅+任一五点

2. 三武牌（`triple_wu`）
- 三武天九：天+九点A+九点B
- 三武地八：地+八点A+八点B
- 三武人七：仁+七点A+七点B
- 三武鹅五：鹅+五点A+五点B

## 5.4 四张

1. 四文武牌（`quad_wen_wu`）
- 四天九：天+天+九点A+九点B
- 四地八：地+地+八点A+八点B
- 四人七：仁+仁+七点A+七点B
- 四鹅五：鹅+鹅+五点A+五点B

## 5.5 映射索引表

| comboType | 组合范围 | 说明 |
|---|---|---|
| single_wen | single_wen | 任意单文 |
| single_wu | single_wu | 任意单武 |
| pair_wen | pair_wen_* | 全部文对 |
| pair_wu | pair_wu_* | 全部武对 |
| pair_wen_wu | tian_jiu / di_ba / ren_qi / e_wu | 全部文武对 |
| triple_wen | triple_* | 全部三文 |
| triple_wu | triple_* | 全部三武 |
| quad_wen_wu | quad_* | 全部四张文武牌 |
| zun_wen | wen_zun | 文尊 |
| zun_wu | wu_zun | 武尊 |

---

## 6. 推荐数据结构（草案）

```json
{
  "tile": {
    "id": "wu_jiudian_a",
    "category": "wu",
    "displayName": "九点A",
    "file": "assets/cards/wu/九点A.svg",
    "rank": 6,
    "pointClass": 9
  },
  "combo": {
    "comboType": "pair_wen_wu",
    "comboKey": "tian_jiu",
    "tiles": ["wen_tian", "wu_jiudian_a"],
    "compareRank": 4
  }
}
```

---

## 7. 校正结果（已确认）

1. 文牌“仁/鹅/长山/平峰/鼻屎六”的写法与本地口径一致。
2. 文武对固定叫法为“天九/地八/人七/鹅五”。
3. 三文/三武/四文武优先级按“天九 > 地八 > 人七 > 鹅五”。
4. 文武尊基础结算效果一致，但有以下差异：
  - 武尊先出，天下无敌。
  - 文尊先出，只有双高脚七可压制。
  - 文尊被压制时，被压制方需向压制方支付双倍结算，并负责其他玩家的结算。
5. Kam / 倒Kam 以及四张牌型被压制后的仃鸡结算，已在本文件第 5 节补齐。

如需，我可以基于本页内容继续生成可直接落库的 JSON 规则配置（含文尊被压制结算分支）。