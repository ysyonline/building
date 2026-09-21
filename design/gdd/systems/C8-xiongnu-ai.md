# C8 匈奴 AI 系统 · GDD

> **状态**：v1.0.1-draft（2026-09-21）｜ GW-P2-005 ｜ GDD 撰写序列 #6
> **产出**：design-strategist-2
> **上游依据**：`design/game-concept-planA-turnbased.md` 定稿 v1.0（决策①「AI 弱则崩」风险/§6 四兵种克制表/§7 MVP 四兵种口径）｜ `design/systems-breakdown.md` v1.0（C8 一句话职责=意图脚本+目标评分、硬依赖 C2·C9、§6.2 督队裁定含用户扩展性附加约束）｜ `design/gdd/systems/F2-phase-scheduler.md` v1.0.2（§2.2 B③ 计划生成窗口、C② 速度序、§3.3 plans_ready 事件）｜ `design/gdd/systems/C1-pathfinding-movement.md` v1.0.5（MoveOrder/MoveReport/MoveQuery/reachable、BLOCKED_TOP、C1-E15 冲车不进 C1）｜ `design/gdd/systems/C2-units.md` v1.1.1（§2.3 四兵种行为面、§2.4 双资源经济、§2.5 架梯 E1、§2.6 AuraStrategy 框架、§3.6 hasAura/UnitStatsQuery）｜ `design/gdd/systems/C3-defense-facilities.md` v1.0.3（§6.1 firePreview/canFire、§2.1 设施作攻击目标）｜ `design/gdd/systems/C4-siege-phase.md` v1.0.1（§3.2 facility_volley 事件契约、§7.2 C8 消费面）｜ `design/gdd/systems/C5-combat-resolution.md` v1.1（§3.3 expectedMods/previewStrike、§10 OQ-4 走廊掩体口径）｜ `design/spikes/graybox-f1-report.md` v1.0（A* 0.037ms 均值、全相位<50ms 性能预算）
> **范围红线**：本文只裁 C8——意图脚本消费与权重注入、目标价值评分框架（含确定性 tie-break）、四兵种行为契约（云梯/冲车/骑射手/督队）、计划生成窗口与确定性纪律、C10 AUTO 同轨消费接口、C11 士气 hook 预留。**不写**波次构成与入场时刻表（C9 职责，本文只消费其产物）、托管决策逻辑（C10 与 C8 同轨消费 F2 AUTO 槽，不另写一套）、单位属性/移动执行/伤害结算（C2/C1/C5）、士气系统实现（C11 Alpha）、任何数值定值（全落 F3 表）。
> **对齐状态**：与 F1 v1.4.3 / F2 v1.0.2 / C1 v1.0.5 / C2 v1.1.1 / C3 v1.0.3 / C4 v1.0.1 / C5 v1.1 逐份对表零冲突（§7/§9）；两项前置走查结论入 §9——走查一（C5 OQ-4 走廊掩体口径）判定消费面自洽可销账；走查二（C4 §6.2 敌床弩装填节拍情报）裁定 MVP 不消费装填节拍做预测走位，C4 该契约行超范围、建议回派主理人收口；**C5 v1.2 联裁关闭 OQ-2（射程=`horseArcher.range`、吃高度修正、梯上单位入命中集），本文消费面零改动确认（2026-09-21 销账，§10 OQ-2）**。

---

## 0. 八节导航

1. [概述](#1-概述) ｜ 2. [机制](#2-机制) ｜ 3. [数据](#3-数据) ｜ 4. [公式](#4-公式) ｜ 5. [边缘情况](#5-边缘情况) ｜ 6. [UI 接口](#6-ui-接口) ｜ 7. [依赖](#7-依赖) ｜ 8. [验收标准](#8-验收标准) ｜ 附 [§9 前置契约与 OQ 三态清单（含两项走查结论）] ／ [§10 开放问题] ／ [§11 变更记录]

---

## 1. 概述

### 1.1 职责定义

C8 是匈奴（攻方）的**决策引擎**：在每回合 B 相位（`F2.planning B③`）为每个在场与入场匈奴单位产出一份**确定性计划**（`UnitPlan`），计划经 F2 的 C 相位 AUTO 槽路由、通过 C1/C5 公开 API 执行（与守方托管 C10 同轨、无特权）。C8 不寻路博弈、不实时反应——它依据**意图脚本**（本波主攻/佯攻/齐攻，由 C9 波次构成携带）与**目标评分**（帅帐/戍卒/设施/通路价值 − 自身代价）一次性生成全部单位计划。

一句话：**把「这帮匈奴这回合该干什么」变成一份可重放、可解释、可迭代评分的计划表。**

### 1.2 设计目标与支柱/风险挂钩

| 支柱/定稿项 | C8 落点 |
|---|---|
| 概念稿决策①「AI 弱则崩」 | C8 用「意图脚本+目标评分」而非真寻路博弈；评分框架按**可替换策略+数据驱动**设计，留足实现侧迭代空间（用户风险优先原则）；禁硬编码数值与分支 |
| 概念稿 §6 克制表「无万能解」 | 四兵种各按行为契约选目标：云梯攀城消耗高度、冲车破结构、骑射骚扰点杀、督队光环引导——评分引导而非脚本锁死，避免单一套路被反制后全盘崩 |
| 决策④ 匈奴仅 AI | C8 是匈奴唯一决策者；无守方 AI，评分中「守方」仅作为目标/威胁数据源（C2/C5 查询），不被 C8 反向操控 |
| P4「濒危险胜」 | 意图脚本让压力曲线可读：主攻波集中破口、佯攻波拉扯火力、齐攻波同步登城——玩家可预判「这波要冲哪」 |
| 督队裁定 §6.2（含用户扩展性约束） | MVP 督队=**光环增益（只读消费 C2.7）+ 高价值目标引导**；连锁溃退留 Alpha 士气系统；光环/士气相关逻辑按可替换策略设计、接口预留完整、禁硬编码 |

### 1.3 非目标（Non-goals）

- ❌ 波次编排（哪波来多少兵、何时入场）→ **C9**（本文消费其 `WaveManifest`，不定义）。
- ❌ 托管决策（守方单位 AUTO 怎么打）→ **C10**（与 C8 同轨消费 F2 AUTO 槽，本文不另写决策逻辑；C8 产出的 `UnitPlan` 结构即 C10 也须消费的契约）。
- ❌ 移动执行/寻路算法 → **C1**（C8 调 `C1.applyMoveOrder` / `reachable`，不实现路径）。
- ❌ 伤害/命中/克制数值 → **C5/F3**（C8 只消费 `expectedMods`/`previewStrike` 做评分，不算伤害）。
- ❌ 单位属性/架梯资格/光环计算 → **C2/F3**（C8 只读 `hasAura`/`UnitStatsQuery` 等）。
- ❌ 士气/溃退系统实现 → **C11（Alpha）**（本文只留 `ScoringHook` 预留位，零硬编码）。
- ❌ 任何数值定值 → **F3 表宿主**（评分权重/代价系数全在 `ai-scripts.json` 等表，正文零硬编码）。

### 1.4 关键裁定速览（TL;DR）

| # | 裁定 | 一句话 |
|---|---|---|
| A | 计划生成窗口 | `C8.generatePlans()` 在 **F2 B③** 一次性调用，消费当前快照+本回合 `WaveManifest`，产出全员 `UnitPlan[]`；可达性评估在 **ACTIVE ∧ BOTH** 边图上（F1 §2.4.2，DEFENDER_ONLY 边对匈奴不可见） |
| B | 同轨无特权 | `UnitPlan` 经 F2 C 相位 AUTO 槽逐单位路由，执行走与 C10 完全相同的 C1 `MoveOrder` + C5 `strike` API；C8 不持有任何绕过 API 的执行通道 |
| C | 评分框架可替换 | 价值函数 = 数据驱动权重 × 目标/代价项 + 可扩展 `ScoringHook[]`；MVP 仅注册 `PresenceAuraHook`（读 C2.7），`MoraleHook` 占位返回 0；禁 `if(morale)` 硬编码 |
| D | 意图脚本注入 | C9 `WaveManifest.intentTag ∈ {MAIN_ASSAULT, FEINT, COORDINATED}` → 查 `intent-scripts.json` 得 `IntentWeights` → 注入评分（主攻提破口权重、佯攻提分散拉扯、齐攻提同步登城） |
| E | 四兵种行为契约 | 云梯（架梯=动态连接器+攀爬）、冲车（锚点推进，经 C2 实体契约而非 C1）、骑射（L0 机动骚扰，消费走廊掩体口径）、督队（光环跟随+高价值引导，attackCapable=false 不进攻） |
| F | 确定性 | 纯函数评分 + 显式字典序 tie-break，无 RNG（F4 仅预留难度噪声钩子）；同（快照，波次，种子）→ 同计划，可重放 |
| G | 性能预算 | `generatePlans()` 单次调用对齐 C1 全相位<50ms 预算；快照 O(N≤400) + 每单位 `reachable`(<2ms) + `expectedMods`，≤80 单位总耗落在预算内（数值 ⚠ F3 宿主） |
| H | 走查二裁定 | **不消费 `facility_volley` 装填节拍做预测走位**——匈奴无「预知」守方齐射节奏的特权；床弩威胁只经 C3 `firePreview`（静态射界，已知要塞知识）评分 |

---

## 2. 机制

### 2.1 计划生成总流程（F2 B③ 入口）

```
B① 波次入场：C9 落单位（F1 placeUnit，匈奴出生端）
B② 可见性更新：MVP 全图可见
B③ C8.generatePlans(turn, snapshot, waveManifest)：
    ① 读取本回合 WaveManifest（C9 产物）：units[]、intentTag、spawnEdge
    ② 取 IntentWeights = intentScriptTable[intentTag]（F3，可选 per-(level,wave) 覆盖）
    ③ 取全局 ScoringWeightSet（F3：目标价值/代价系数）
    ④ 对每个匈奴单位 u（ACTIVE∧BOTH 可达图）：
       - 计算 reachable(u)（C1 Dijkstra 泛洪）
       - 枚举候选目标/候选落点（帅帐/戍卒/设施/连接器通路）
       - 对每个候选算 Score(u, candidate) = 目标价值 − 代价 + 意图权重 + Σ ScoringHook
       - 取最高分候选，生成 UnitPlan（移动序列 + 可选行动）
    ⑤ 输出 UnitPlan[]，发 plans_ready（F2 B→C 迁移）
C 相位：F2 按速度序逐单位开 AUTO 槽 → 执行 UnitPlan（经 C1/C5 API）
```

- **每回合生成一次**：计划只描述**接下来一个 C 相位**的行动（与 F2「每单位每相位恰一槽」同粒度）；多回合长线（如先架梯次回合爬）由每回合重算自然衔接（读快照判断「附近是否已有可用梯」）。
- **状态只读**：C8 不写任何世界状态，只产计划；所有执行副作用归 C1/C5/C2 白名单。
- **确定性**：流程内无随机源；并列最高分按 §4.4 tie-break 取唯一解。

### 2.2 意图脚本层（消费 C9，注入评分）

C8 **不定义**波次构成，只定义「如何消费」：

| 字段（C8 从 C9 读取） | 类型 | 说明 |
|---|---|---|
| `waveId` | string | 波次标识 |
| `units[]` | UnitId[] | 本波入场+在场单位集合 |
| `intentTag` | `'MAIN_ASSAULT' \| 'FEINT' \| 'COORDINATED'` | 本波意图（C9 编排产出） |
| `spawnEdge` | 枚举 | 入场端（匈奴来向，F1 enemySpawns） |

意图 → 权重映射（**F3 `intent-scripts.json`，数据驱动，禁硬编码**）：

| intentTag | 评分侧重（权重注入方向） | MVP 行为直觉 |
|---|---|---|
| `MAIN_ASSAULT` 主攻 | 提升「帅帐/登城破口」目标价值；降低分散惩罚；促进兵力集中单一 breach | 压上一处，掏墙顶 |
| `FEINT` 佯攻 | 提升「暴露/可见但低价值点」的吸引力；提升分散度项；降低对帅帐的执念 | 多点佯动拉床弩/礌石火力，真主攻另波 |
| `COORDINATED` 齐攻 | 提升「同步登城」协同项（多梯同回合攀爬的额外加成）；压平单兵最优、抬升齐步 | 多梯同拍上墙，制造堵口压力峰 |

- **主键**：`intentTag` 通用映射；**可选覆盖**：`(levelId, waveId)` 粒度覆盖（教学关可弱化 FEINT 强度）。表中键全 F3 宿主，调意图强度=改表不改码。
- **注入方式**：`IntentWeights` 是一组对 `ScoringWeightSet` 的乘/加修正（见 §4.3），在评分时叠加，不替换基础权重。

### 2.3 目标评分层（价值函数）

对每个单位 u 的每个候选目标/落点 c，评分：

```
Score(u, c) = Σ_target  w_target · Value_target(u, c)        // 正项：目标价值
             − Σ_cost     w_cost   · Cost_cost(u, c)          // 负项：自身代价
             + IntentBias(u, c, intentTag)                   // 意图注入（§4.3）
             + Σ hook.score(u, c)                            // 可扩展 hook（§2.6）
```

**目标价值项**（正）：

| 目标类 | 价值来源 | 消费接口 |
|---|---|---|
| 帅帐 beacon | 失守即胜的终局价值（最高权重） | F1 beacon 坐标 + C5 可达性 |
| 戍卒 garrison | 清除堵口单位的战术价值（中高） | C2 `aliveDefendersIn` / `unitAt` |
| 设施 facility | 床弩/礌石威胁源的清除价值（中） | C3 `facilitiesAt` / `canFire` |
| 连接器通路 | 「已存在可用梯/坡道」的通路价值（登城前置） | F1 `getActiveConnectors(LADDER)` + `canBoard` |

**自身代价项**（负）：

| 代价类 | 含义 | 消费接口 |
|---|---|---|
| 暴露 exposure | 落点是否落在床弩射界/可被集火（C5 `expectedMods` 暴露分量） | C5 `expectedMods` |
| 绕路 detour | 到候选目标的路径长度超基准的额外消耗 | C1 `reachable` 代价 |
| 拥挤 congestion | 候选落点邻近已拥挤（多单位抢同格/同梯）的扣分 | F1 `occupancyOf` |

- 全部 `w_*` 系数与 `Value_*` 基准落在 F3 `ai-scripts.json`（数值全 ⚠ 工作假设，待灰盒）。
- **可重放**：纯函数 + 确定性 tie-break（§4.4），无 RNG（F4 仅预留难度噪声钩子，MVP 不启用）。

### 2.4 四兵种行为契约

| 兵种 | 计划内容（UnitPlan） | 关键约束（消费上游契约） |
|---|---|---|
| **云梯步兵** `ladder_infantry` | ①若目标墙段无可用梯且本单位未架过梯 → 选点架梯（E1）；②次回合/已有梯 → 攀爬至顶 → 墙顶近战攻击设施/戍卒 | 架梯需 AP≥1 ∧ MP≥climb(2)（C2 §2.5）；每波每单位至多 1 架；架设回合不可再攀爬（自然互斥）；选点偏好 FRONTAL>AXIAL、优先守军火力薄弱垛口（F1 §2.4.3 / C2 §2.5）；攀爬经 C1 `canClimb`→`applyMoveOrder` |
| **冲车** `ram_chariot` | 锚点推进至 GATE/墙前 → 撞击（AP）破结构；不进 C1 寻路 | **经 C2 实体契约的锚点推进**（C2 裁定 C / C1-E15：冲车 footprint=NONE、完全不进 C1、锚点格占 1 槽、移动语义归 C2）；`immuneToMeleeInteract=true` 使其不可被近战但仍可被床弩走廊命中（C5-E5）；C8 发 `RamAdvancePlan`（锚点目标格）而非 `MoveOrder` |
| **骑射手** `horse_archer` | L0 机动至墙下射程内 → 远程点杀墙顶戍卒/暴露单位；规避床弩射界 | `layerAccess=[0]` 永不上墙（C1 §2.3）；射程键 `horseArcher.range`（F3，C5 OQ-2 已闭——键位已定值待灰盒，本文消费 `previewStrike`/`expectedMods`）；**走廊掩体口径消费见走查一**：骑射自身在地面无 PARAPET 掩体，其射击对墙顶目标按目标格掩体结算 |
| **督队** `warlord_escort` | 随队推进（落后攻击锋线、保持光环覆盖）、不主动进攻；引导附近匈奴单位评分偏向高价值目标 | `attackCapable=false`（C2 §2.3，MVP 不输出）；只读消费 `hasAura(u)` + C2.7 modifiers（威胁/行动优先级）；「高价值目标引导」MVP 解释见 §2.5 |

#### 2.5 督队「高价值单体目标引导」MVP 解释（含上游张力声明）

- **C2 §2.6 原文「C8 AI 反向权重：守方 AI 优先点杀督队」在 MVP 不成立**——MVP 无守方 AI（决策④ 匈奴仅 AI），该表述预设了 Alpha 守方侧或士气场景，属跨阶段表述。本文**不沿用该反向口径**，改采与 MVP 自洽的解释：
- **MVP 落点**：督队是匈奴的**目标锚点**——
  1. **光环引导**：督队附近（C2.7 半径 r 内）匈奴单位的评分获 `actionPriority`/`threat` 增益（C8 经 `PresenceAuraHook` 只读消费 C2.7 合成值），即「督队在则攻势更猛」；
  2. **高价值目标偏向**：当战场存在督队时，C8 对本波评分注入「偏向帅帐/戍卒集群」的高价值目标权重（intent 叠加 `leadWeight`），表达督队「维持攻势、压向要害」的指挥语义；
  3. **护送布局**：评分对督队自身施加更高 exposure 惩罚（避免督队白白送死），使其他单位自然形成「锋线在前、督队在后」的阵型。
- **张力回传**：C2 §2.6 的「守方 AI 优先点杀督队」表述与 MVP 范围矛盾，列入 §9 三态清单「回派主理人」项，建议 C2 在 Alpha 士气系统落地时统一措辞（届时该反向权重归 C11/C10 消费 `hasAura`，与本文预留 `MoraleHook` 衔接）。

### 2.6 评分扩展性框架（用户「禁硬编码」约束的正式兑现）

**三层解耦**（与 C2 §2.6 AuraStrategy 同源纪律）：

```ts
// 层1：可扩展评分钩子接口（C8 持有，C11 可整体注册新实例）
interface ScoringHook {
  id: string;                                 // 表驱动选择，禁 if(kind==='morale') 硬编码
  score(ctx: ScoringContext): number;        // 纯函数：返回对该候选的附加分
}
// 层2：上下文（数据契约，士气中立）
interface ScoringContext {
  unit: UnitSnapshot; target: TargetCandidate;
  auraMods?: StatModifier[];                  // C2.7 合成值（仅 PRESENCE 通道，MVP）
  turn: number;
}
// 层3：MVP 注册实例
const PresenceAuraHook: ScoringHook = { id: 'presence-v1', score: (ctx) => /* 读 C2.7 modifiers 合成 */ 0 };
const MoraleHook: ScoringHook = { id: 'morale-v1', score: () => 0 };  // Alpha 占位：返回 0、无逻辑
```

**纪律条款（验收直接引用）**：
1. C8 评分核心循环**不出现**「士气」「溃退」「morale」字样——`MoraleHook` 是不透明占位，MVP 恒返回 0；
2. 所有意图/权重数值走 F3 表，代码**零兵种名/零意图名硬编码**（查表 `intentScriptTable[intentTag]`）；
3. 新增评分维度=注册新 `ScoringHook` 或加 `intent-scripts.json` 键，不碰核心公式；
4. demo 调优回填=只动 F3 表参数，两侧接口不动。

---

## 3. 数据

> 引擎无关 TS。C8 自身仅持「本回合生成的 `UnitPlan[]`」短期数据（不持久化；F5 存档不涉及 AI 计划，计划每回合重算）。数值全在 F3 表。

### 3.1 计划产物（UnitPlan，C10 同轨消费契约）

```ts
interface UnitPlan {
  unitId: UnitId;
  faction: 'ATTACKER';                        // 恒 ATTACKER，F2 据此路由 AUTO
  steps: PlanStep[];                           // 按 MP/AP 经济排序的执行序列
  intentTag: IntentTag;                       // 透传，供 P4 意图指示
}
type PlanStep =
  | { kind: 'RAISE_LADDER'; targetWallCell: CellId }   // 云梯步兵专属（C2 §2.5 E1）
  | { kind: 'MOVE'; target: CellId; mode: 'AUTO' }     // 经 C1 applyMoveOrder（冲车除外）
  | { kind: 'RAM_ADVANCE'; anchorTarget: CellId }      // 冲车专属（C2 实体契约，非 C1）
  | { kind: 'CLIMB'; connectorId: ConnectorId }        // 经 C1 canClimb→applyMoveOrder
  | { kind: 'ATTACK'; target: UnitId | FacilityId };   // 经 C5 strike（C2 §2.4.1 资格已过）
```

- **与 C10 同轨**：`MOVE`/`CLIMB`/`ATTACK` 三类经与 C10 完全相同的 C1 `MoveOrder`(mode='AUTO') + C5 `strike` API；`RAISE_LADDER`/`RAM_ADVANCE` 为兵种专属动作（云梯=经 C2 架梯白名单、冲车=经 C2 实体契约），C10 AUTO 处理同兵种时走完全相同的分支——**结构上无 AI 特权**。
- **冲车例外的正当性**：C2 裁定 C / C1-E15 规定冲车不进 C1 寻路，故 `RAM_ADVANCE` 走 C2 实体契约而非 `MoveOrder`；这是上游契约的必然结果，非 C8 特权，C10 处理冲车时亦同此路径。

### 3.2 意图与评分表（F3 宿主，本文零硬编码）

| 键 | 含义 | 宿主表 | 消费方 |
|---|---|---|---|
| `intent-scripts.json` | intentTag→IntentWeights 映射（+可选 (level,wave) 覆盖） | ai-scripts.json（C8 新建） | C8 §2.2 |
| `ai-scripts.json::targetWeights` | 帅帐/戍卒/设施/通路 目标价值权重 | 同上 | C8 §2.3 |
| `ai-scripts.json::costWeights` | 暴露/绕路/拥挤 代价系数 | 同上 | C8 §2.3 |
| `intent-scripts.json::leadWeight` | 督队在场时的高价值目标偏向 | 同上 | C8 §2.5 |
| `ai-scripts.json::planBudgetMs` | 计划生成性能预算（P95 上限） | 同上 | C8 §4.6 |

### 3.3 对外只读查询接口（C8Query，供 §6 契约/调试）

```ts
interface C8Query {
  currentIntent(): IntentTag;                 // 本波意图（P4 指示用）
  planFor(unitId: UnitId): UnitPlan | null;   // 调试/重放核查
  lastScoreDump(unitId: UnitId): ScoreBreakdown[];  // 逐项评分（调试 overlay/P4 可解释）
}
interface ScoreBreakdown { candidate: TargetCandidate; targetVal: number; costVal: number; intentBias: number; hookVals: number[]; total: number; }
```

### 3.4 与 C1/C2/C3/C5 的读写边界

| 数据 | C8 权限 | 说明 |
|---|---|---|
| 世界状态 | 只读（F1 `snapshot` / C2 `UnitStatsQuery` / C3 `FacilityQuery` / C5 `ResolutionQuery`） | C8 不写任何 mutation |
| `UnitPlan[]` | C8 产出，F2 消费 | 短期，不持久 |
| 执行副作用 | 经 C1/C5 API 间接产生 | C8 只下达指令，不落地 |

---

## 4. 公式

> 统一格式：编号 ｜ 名称 ｜ 变量与单位 ｜ 表达式 ｜ 消费方。数值基准一律标「F3 表宿主」。

- `C8.1 ｜ 目标价值：Value(u,c) = w_beacon·beaconVal(c) + w_garrison·garrisonVal(u,c) + w_facility·facilityVal(c) + w_path·pathVal(u,c) ｜ 各项基准 F3；beaconVal 最高、pathVal 为登城前置 ｜ 消费方：C8/P4`
- `C8.2 ｜ 自身代价：Cost(u,c) = c_exposure·exposure(u,c) + c_detour·detour(u,c) + c_congestion·congestion(u,c) ｜ exposure 消费 C5.expectedMods 暴露分量、detour 消费 C1.reachable 代价、congestion 消费 F1.occupancyOf ｜ 消费方：C8`
- `C8.3 ｜ 意图注入：IntentBias(u,c,t) = Σ_k δ_k(t)·Bias_k(u,c) ｜ δ_k 来自 intent-scripts.json[intentTag]（或 (level,wave) 覆盖）；主攻提 beaconVal/pathVal、佯攻提 dispersion、齐攻提 simultaneity ｜ 消费方：C8`
- `C8.4 ｜ 显式 tie-break：并列最高分候选取序 (Score↓, candidateCellId 字典序, unitId 字典序) ｜ 与 C1 §2.6-2 字典序纪律同源，确定性硬约束 ｜ 消费方：C8/X5`
- `C8.5 ｜ 计划确定性：plan(turn) = f(snapshot(turn), waveManifest(turn), F3 表, F4 种子) 且 f 无内部随机 ⇒ 同输入逐字节同计划 ｜ F4 仅预留难度噪声钩子（MVP 不启用）｜ 消费方：F5/X5`
- `C8.6 ｜ 性能预算：genCost = O(N·|U|)（N≤400 快照、|U|≤80 单位），单轮 generatePlans P95 < planBudgetMs（F3，初值 ⚠ 对齐 C1 全相位<50ms，建议 ≤10ms 量级）｜ 消费方：实现/性能验收`
- `C8.7 ｜ 督队引导：leadBias(u,c) = hasAura(leadUnit)? leadWeight·highValueTargetVal(c) : 0 ｜ hasAura 消费 C2 §3.6；highValueTargetVal 取 beacon/garrison 集群项 ｜ 消费方：C8`
- `C8.8 ｜ 冲车锚点推进：RamAdvance 目标 = argmin_{g∈gateCells} pathDist(u, g)（普通单格申请经 C2 实体契约，非 C1 A*）｜ 威胁评估含 C3 firePreview 射界 ｜ 消费方：C8/C2`

---

## 5. 边缘情况

> 裁定者=本文；执行语义归 C1/C2/C5。格式：编号｜场景｜裁定｜消费方。

### A. 计划生成与执行错位

- **C8-E1｜生成计划后、执行前世界变化**（如 B③ 后又有 C9 补入场）：计划基于 B③ 快照，C 相位执行时若目标已消失 → 执行层（C1/C5）按各自「结算瞬间复核」返回失败/MISS，C8 不回滚重算（与 F2/C5 瞬时复核同源）。下一次回合 B③ 自然修正。
- **C8-E2｜BLOCKED_TOP 留梯等待**：云梯兵攀爬遇顶满 → C1 返回 `BLOCKED_TOP`；C8 该单位计划标记为「继续等/换梯」——下回合同逻辑重算；等待期间暴露修正归 C5（攀爬联动，C1 §2.4）。C8 不因 BLOCKED_TOP 改全局策略。
- **C8-E3｜目标格满员（C1-E7）**：`MoveOrder` 目标满 → `REJECTED`；C8 下次重算选次优候选（tie-break 已保证确定性），不智能降级落旁格（与 C1-E7 口径一致：降级破坏预期）。

### B. 兵种特殊场景

- **C8-E4｜云梯兵无合法架梯点**：F1 `getActiveConnectors` + 邻接无合法 V5 墙段（极少见，关卡校验 V11 保底可达）→ C8 退化为「向最近坡道/GATE 推进」计划，不卡死。
- **C8-E5｜冲车被围死（C2-E5）**：`immuneToMeleeInteract` 使围堵只封移动不封撞击；C8 仍发 `RamAdvance` 至最近可达 GATE/墙前，若全不可达则原地蓄势（计划=无移动+待击），不报错。
- **C8-E6｜骑射手射程内无墙顶目标**：退化为「机动至威胁最小且可见的地面待机位」或追猎残留戍卒；不强行爬墙（layerAccess 限制天然拒绝）。
- **C8-E7｜督队阵亡（C2-E9 光环消失）**：C8 下回合评分不再含该 `PresenceAuraHook` 增益，自然降级——无硬编码士气逻辑。

### C. 确定性与性能

- **C8-E8｜同种子重放**：同（存档态, 波次, 种子）→ `UnitPlan[]` 逐字节一致（含 tie-break）；F5 读档后首个 B③ 重算即得同计划。
- **C8-E9｜超大波次性能**：≤80 单位 ×（快照 O(N)+reachable<2ms+expectedMods）远低于 C1 全相位<50ms 预算；若未来超预算，调 `planBudgetMs` 或缓存 reachable（F3 键，结构不变）。
- **C8-E10｜先手结算优先**：C8 计划不假设执行时序（顺序由 F2 速度序决定）；计划内仅描述「本单位本槽动作」，跨单位协同（齐攻同步）靠 intentTag 同步权重实现，不依赖执行序。

### D. 跨文档

- **C8-E11｜守方全灭（F2-E7）**：床弩仍自动守燧（C4）；C8 评分中「设施威胁」项仍存在，匈奴仍可优先拆床弩，但无戍卒堵口时登城代价骤降——评分自然导向直取帅帐。
- **C8-E12｜走查二边界（明确裁定）**：C8 **不消费** `facility_volley` 的装填节拍（`reloadTurns` 隐藏守方配置）做预测走位；床弩威胁只经 C3 `firePreview`/`canFire`（静态射界，已知要塞）。`facility_volley` 事件在 MVP 仅作**可选粗信号**挂 `MoraleHook` 同类扩展位（默认不读），精确「趁装填冲梯」明确出 MVP 范围（见 §9 走查二 + C4 §6.2 回派）。

---

## 6. UI 接口

### 6.1 C8 暴露给 UI 层的数据

| UI 元素 | 数据来源 | 语义 |
|---|---|---|
| 本波意图指示 | `C8Query.currentIntent()` | P4 顶部旗标「本波：主攻/佯攻/齐攻」（朱砂/米白语义，决策④ 可读化） |
| 计划预览 overlay（调试/教学） | `planFor` / `lastScoreDump` | 开发期显示每单位目标连线 + 评分分解；教学关可降级为「匈奴意图箭头」 |
| 评分热力（调试） | `ScoreBreakdown[]` | 候选格着色（高价值暖色/高暴露冷色），供平衡轮核验评分自洽 |

### 6.2 接口契约（对外承诺，下游 GDD 引用）

| 契约 | 提供方→消费方 | 内容 | 状态 |
|---|---|---|---|
| 计划生成入口 | C8→F2 | `generatePlans(turn, snapshot, waveManifest): UnitPlan[]`；B③ 调用，发 `plans_ready` | ✅ 本文定义（F2 §2.2 B③ 消费） |
| 计划执行同轨 | C8↔C10 | `UnitPlan` 结构（§3.1）即 C10 AUTO 消费契约；MOVE/CLIMB/ATTACK 经 C1/C5、RAISE_LADDER/RAM_ADVANCE 经 C2 实体契约 | ✅ 对称无特权 |
| 波次消费 | C9→C8 | `WaveManifest{units, intentTag, spawnEdge}`（C9 产物） | ⚠ C9 规划中（序列 #8），接口签名本文章节 §2.2 先行定义，C9 落地对齐 |
| 意图脚本表 | F3→C8 | `intent-scripts.json` / `ai-scripts.json`（权重宿主） | ✅ 键定，值 ⚠ 待灰盒 |
| 评分查询消费 | C1/C2/C3/C5→C8 | `reachable`/`UnitStatsQuery`/`firePreview`/`expectedMods`/`snapshot` | ✅ 各上游已定稿 |
| 士气 hook 预留 | C8→C11(Alpha) | `ScoringHook` 接口 + `MoraleHook` 占位（返回 0） | ✅ 结构就绪，MVP 无消费者 |

### 6.3 输入约束

C8 全自动、无玩家输入入口（匈奴仅 AI，决策④）；P3 不得向 C8 注入指令。调试 overlay 只读，不反向驱动计划。

---

## 7. 依赖

### 7.1 上游依赖（C8 需要）

| 依赖 | 类型 | 说明 |
|---|---|---|
| F1 地形 v1.4.3 | 结构与可达图 | `snapshot`/`getActiveConnectors`/`occupancyOf`；ACTIVE∧BOTH 边图过滤（匈奴不可见 DEFENDER_ONLY 边） |
| F2 相位 v1.0.2 | 生成窗口 | B③ 调 `generatePlans`、C 相位 AUTO 槽路由、`plans_ready` 事件、速度序（C8 计划不假设序） |
| C1 寻路 v1.0.5 | 执行+查询 | `applyMoveOrder`(AUTO)/`reachable`/`canClimb`/`MoveReport`(BLOCKED_TOP) |
| C2 单位 v1.1.1 | 属性+实体契约 | `UnitStatsQuery`/`hasAura`/架梯 E1/冲车实体契约（锚点推进）；四兵种行为面数据 |
| C3 设施 v1.0.3 | 威胁查询 | `firePreview`/`canFire`/`facilitiesAt`（床弩射界评分、设施作目标） |
| C5 结算 v1.1 | 修正查询 | `expectedMods`/`previewStrike`（暴露/掩体评分，走查一消费面） |
| C9 波次（规划中） | 波次产物 | `WaveManifest`（意图/构成）——**本文消费，不定义** |
| F3 数值表 | 数值宿主 | `intent-scripts.json`/`ai-scripts.json` 全部权重 |
| F4 确定性随机 | 纪律 | MVP 评分为纯函数无 RNG；难度噪声钩子预留 |

### 7.2 下游消费者（依赖 C8）

| 消费方 | 消费内容 | 对应 GDD |
|---|---|---|
| F2 相位 | `generatePlans` 产物 + `plans_ready` | 已落盘 v1.0.2（B③） |
| C10 托管 | `UnitPlan` 同轨消费契约 | 序列 #8（对称无特权） |
| P4 HUD | 本波意图指示 + 计划预览 | — |
| C11 士气(Alpha) | `ScoringHook` 预留位 | Alpha |
| X5 模拟器 | 确定性重放（同输入同计划） | Alpha |

---

## 8. 验收标准

### 8.1 结构与数据验收（GDD 层）

- [ ] SC-1：意图脚本消费接口（§2.2）、目标评分价值函数（§2.3/§4.1-4.3）、四兵种行为契约（§2.4/§2.5）、`UnitPlan` 结构（§3.1）全部定义且数值零硬编码（全 F3）。
- [ ] SC-2：与 F1 v1.4.3/F2 v1.0.2/C1 v1.0.5/C2 v1.1.1/C3 v1.0.3/C4 v1.0.1/C5 v1.1 契约零冲突（§7 逐条）。
- [ ] SC-3：冲车「不进 C1、经 C2 实体契约锚点推进」在 `UnitPlan.RAM_ADVANCE` 显式建模，与 C2 裁定 C/C1-E15 一致。
- [ ] SC-4：`ScoringHook` 扩展性框架落定，`MoraleHook` 占位返回 0、核心循环无 morale 硬编码（用户扩展性约束兑现）。
- [ ] SC-5：督队 MVP 解释（§2.5）与 C2 §2.6 用户附加约束一致，张力回派项入 §9。

### 8.2 行为验收（实现层，可自动化）

- [ ] BE-1：确定性重放——同（存档态, 波次, 种子）→ `UnitPlan[]` 逐字节一致（含 §4.4 tie-break 断言）。
- [ ] BE-2：意图注入可测——同战场下 MAIN_ASSAULT 计划的破口集中度 > FEINT（分散度项生效），COORDINATED 多梯同步攀爬数 > 其他意图。
- [ ] BE-3：四兵种契约——云梯兵成功架梯→攀爬→墙顶攻击链路；冲车锚点推进至 GATE 并撞击；骑射手 L0 射程内点杀且不爬墙；督队随队不主动进攻且附近单位获评分增益。
- [ ] BE-4：走查二合规——`generatePlans` 不读取 `facility_volley.reloadTurns` 类隐藏守方配置做预测走位（静态分析/断言：计划只依赖 `firePreview` 静态射界）。
- [ ] BE-5：性能——单轮 `generatePlans` P95 < `planBudgetMs`（对齐 C1 全相位<50ms），≤80 单位不超预算。
- [ ] BE-6：BLOCKED_TOP/目标满员/目标消失等中断场景不卡死、下回合自修正（E1/E2/E3）。

### 8.3 玩法判据（供灰盒可玩性轮）

- [ ] PL-1：「AI 弱则崩」风险缓解可感知——意图脚本让三关压力曲线差异明显（教学关弱意图、高潮关齐攻峰），且评分框架支持快速调权重迭代（改 F3 表）。
- [ ] PL-2：玩家能预判「这波匈奴冲哪」（P4 意图指示 + 评分引导的集中破口可读）。
- [ ] PL-3：四兵种行为可区分——云梯攀城、冲车破门、骑射骚扰、督队光环增益在试玩中各成立，无「只会冲脸」的崩坏感。
- [ ] PL-4：`MoraleHook` 占位演练——注册一个返回非零的假 morale hook，评分即时受影响、核心代码零改动（证明扩展性非空话）。

### 8.4 数值初值汇总（全部 F3 `ai-scripts.json`/`intent-scripts.json` 宿主，工作假设标注 ⚠）

| 键 | 初值 ⚠ | 说明 |
|---|---|---|
| `w_beacon` | 高 ⚠ | 帅帐终局价值最高 |
| `w_garrison` | 中高 ⚠ | 清堵口单位 |
| `w_facility` | 中 ⚠ | 床弩/礌石威胁源 |
| `w_path` | 中 ⚠ | 登城通路前置 |
| `c_exposure/c_detour/c_congestion` | 各 ⚠ | 代价系数，灰盒标定 |
| `intent-scripts` | MAIN/FEINT/COORDINATED 三组 ⚠ | 意图乘加修正 |
| `leadWeight` | ⚠ | 督队高价值偏向 |
| `planBudgetMs` | ≤10ms ⚠ | 对齐 C1 <50ms |

---

## 9. 前置契约与 OQ 三态清单（含两项走查结论）

### 9.1 承接转派三态清单（交叉走查挂账逐项处置）

| # | 来源 | 条目 | 处置（三态） |
|---|---|---|---|
| 1 | C5 §10 OQ-4 | 骑射手走廊掩体口径（「格在谁脚下谁吃」是否自洽） | **走查一：确认销账**——见 §9.3 走查一结论 |
| 2 | C4 §6.2 / §7.2 | 敌床弩装填节拍情报（`facility_volley`）消费面 | **走查二：裁定超范围，回派主理人**——见 §9.4 走查二结论 |
| 3 | C2 §2.6 | 督队「守方 AI 优先点杀督队」反向口径 | **回派主理人**：该表述预设 Alpha 守方 AI/士气场景，与 MVP 匈奴仅 AI 矛盾；本文 §2.5 采用自洽解释，建议 C2 在 Alpha 落地时统一措辞（届时反向权重归 C11/C10 消费 `hasAura`，与本文 `MoraleHook` 衔接）（挂账确认 2026-09-21 主理人批准） |
| 4 | C9（规划中） | `WaveManifest` 接口定义 | **半销账（本文主裁接口，C9 落地对齐）**：`intentTag`/`units`/`spawnEdge` 三字段本文 §2.2 先行定义；C9 落盘时按此签名对齐，非悬空 |
| 5 | C10（规划中） | `UnitPlan` 同轨消费 | **销账（本文主裁结构）**：§3.1 `UnitPlan` 即 C10 AUTO 消费契约；对称无特权，C10 落盘时按此对齐 |
| 6 | F1 §2.4.2 | 匈奴可达图 = ACTIVE∧BOTH 边过滤 | **销账（确认消费）**：C8 计划生成可达性评估严格在该边图上运行（§2.1/§7.1），DEFENDER_ONLY 边对匈奴不可见 |
| 7 | C5-E5 | 冲车可被床弩走廊命中 | **销账（确认消费）**：冲车威胁评估含 C3 `firePreview` 射界（§2.4/§4.8），与 C5-E5「床弩目标集含冲车」一致 |

### 9.2 程基岩性能预算对齐（spike 消费）

- graybox-f1-report v1.0：`A* 0.037ms` 均值、全相位批量≤78 单位<50ms → C8 单次 `generatePlans` 预算对齐（§4.6 `planBudgetMs`），O(N·|U|) 量级在 MVP 规模（N≤400, |U|≤80）内恒有裕度。

### 9.3 走查一结论：C5 OQ-4 走廊掩体口径在 C8 消费面核验

- **口径复述（C5 §10 OQ-4 / §2.4）**：掩体=PARAPET 格标签，「格在谁脚下谁吃」——掩体修正只对**站在 PARAPET 格上的单位**生效，跨层不追溯（地面匈奴不因「墙上有垛口」而获掩体）。
- **C8 消费面核验**：C8 的暴露/掩体评分**逐候选格**调用 `C5.expectedMods(target)` / `previewStrike`，其 `cover` 分量由目标所在格 kind 决定——匈奴单位在地面（h=0）评估自身暴露时 `expectedMods` 自然不含 PARAPET 掩体；匈奴射击墙顶戍卒时，戍卒的 `cover` 由其自身 PARAPET 格决定（跨层不追溯，匈奴在地面不「借」墙顶掩体）。评分循环**以候选格为单位、不跨层合并**，故新造口径在 C8 侧**天然不产生歧义**。
- **骑射手走廊专项**：骑射手恒 h=0（C1 §2.3 layerAccess），其自身暴露评分永不含掩体；其输出火力对墙顶目标的减伤由目标格 PARAPET 标签承载（与射手兵种无关）——C8 无需为骑射手写任何掩体特判。
- **三态判定**：**确认销账**——C5 OQ-4 在 C8 评分消费面自洽、无新增裁决需求；建议主理人派发 C5 将 OQ-4 状态置为「销账（格在谁脚下谁吃，C8 逐格 expectedMods 消费天然不追溯跨层掩体）」。C8 侧零结构改动。

### 9.4 走查二结论：C4 §6.2 敌床弩节拍情报消费面裁定

- **问题**：C4 §6.2「齐射事件｜C4→…C8｜敌床弩装填节拍情报（『趁装填冲梯』决策面，经事件流只读，零新接口）」暗示 C8 可消费 `facility_volley` 的装填节拍做「趁装填冲梯」式走位。
- **裁定**：**MVP 不消费 `facility_volley` 装填节拍做预测走位**，理由如下：
  1. **公平性/不对称张力**：概念稿 P1「一墙之隔两种战争」+ 决策①「AI 弱则崩」风险优先——若匈奴能精确预知守方 `reloadTurns`（隐藏守方配置）做完美躲闪/卡窗口冲梯，则守方器械相位（C4）的「装填空窗」机制被 AI 全知破解，玩家「器械先于人员」的节拍优势归零，玩法崩坏。
  2. **已知要塞知识 vs 预测内部状态**：匈奴作为攻方，**知道墙上有床弩、知道其射界**——这是合理的静态要塞知识，经 C3 `firePreview`/`canFire`（射界查询）评分完全合法（C8 §2.4 已消费）；但**预测「下一发何时来」需要读取守方 reloadTurns 内部计时**，属不该赋予意图脚本 AI 的全知。
  3. **MVP 范围**：「趁装填冲梯」是精细微操博弈，超出 MVP 匈奴「意图脚本+目标评分」定位；精确卡窗口留作 Alpha 难度档/或可解释行为，不作为 MVP 默认。
- **C8 实际消费面**：床弩威胁**只经 C3 静态射界查询**（`firePreview` 走廊目标集）计入 `c_exposure`；`facility_volley` 事件在 MVP **不进入评分路径**。`facility_volley` 仍可经事件流被 X5 重放/P4 演出消费，但**非 C8 决策输入**。
- **三态判定**：**回派主理人**——C4 §6.2 该行「敌床弩装填节拍情报（『趁装填冲梯』决策面）」对 MVP 超范围，建议主理人派发 C4 将该契约行收窄为「C8 消费床弩静态射界（`firePreview`）做威胁评分；装填节拍不进 MVP 评分，留 Alpha 难度档扩展位」，并与本文 §9.4 裁定对齐。C8 侧已按此实现（§2.4/E12/BE-4）。

---

## 10. 开放问题

| # | 问题 | 影响方 | 建议关闭时点 |
|---|---|---|---|
| OQ-1 | `intent-scripts.json` / `ai-scripts.json` 全部权重初值（§8.4 表） | C8/平衡轮 | 灰盒可玩性轮统一标定 |
| OQ-2 | ~~骑射手远程射击模型（射程键 `horseArcher.range`、是否吃高度修正、可否打梯上单位）——C5 OQ-2 同题~~ | ~~C5/C8~~ | **已关闭（C5 v1.2 联裁，GW-P2-008，主裁=文策渊；C8 消费面确认 2026-09-21）**：射程=`horseArcher.range`，与床弩走廊同构（仰射=h=0 发射的同层轴向格序列，C5 §2.2.1/C5.10）；吃高度修正——heightDiff 恒 ≤0 低打高惩罚按 C5.3 既有合成自动适用，零新键；梯上单位同权入命中集（逻辑位置=梯底格＋exposedMod ladder）。本文 §2.4 骑射手行为契约零改动成立（键名/previewStrike/expectedMods 消费面/走查一掩体口径全部相容），§2.4 行括注「C5 OQ-2 待定」随本销账刷新为「键位已定，值待灰盒」；range 数值留灰盒（C5 §8.4/OQ-1 承接） |
| OQ-3 | 齐攻意图的「同步登城」协同项如何量化（多梯同回合攀爬加成公式） | C8/平衡轮 | 灰盒轮（PL-1 联测） |
| OQ-4 | 督队 `leadWeight` 与光环半径 r 的平衡联动（C2.7 r 与 C8 引导强度） | C2/C8 | 灰盒轮 |
| OQ-5 | 难度档扩展：Alpha 是否启用 F4 难度噪声钩子 / 「趁装填冲梯」作为高难档行为 | C8/C11 | Alpha 启动评审 |

---

## 11. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0-draft | 2026-09-21 | 首版（GW-P2-005 序列 #6）：意图脚本消费接口（intentTag→IntentWeights 注入评分）/目标价值评分框架（帅帐·戍卒·设施·通路 + 暴露·绕路·拥挤代价 + 显式字典序 tie-break）/四兵种行为契约（云梯架梯动态连接器、冲车锚点推进经 C2 实体契约不进 C1、骑射 L0 骚扰消费走廊掩体、督队光环只读+高价值引导）/UnitPlan 同轨 C10 AUTO 消费结构/ScoringHook 扩展性框架（MoraleHook 占位禁硬编码）/确定性重放与性能预算对齐 C1<50ms；两项前置走查结论入 §9（走查一 C5 OQ-4 确认销账、走查二 C4 facility_volley 节拍裁定超范围回派主理人）；督队 C2 §2.6 反向口径张力回派项入 §9 |
| v1.0.1-draft | 2026-09-21 | GW-P2-008 合流批，OQ-2 销账，主理人授权 -2 执行：§10 OQ-2 行照录 C5 v1.2 联裁结论关闭；§2.4 骑射手行括注「C5 OQ-2 待定」刷新为「已闭——键位已定值待灰盒」；header 对齐状态补 C5 v1.2 消费确认半句。零实质设计变更（消费面逐词对照确认） |
