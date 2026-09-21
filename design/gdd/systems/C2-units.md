# C2 单位系统 · GDD

> **状态**：v1.1.2-draft（2026-09-21）｜ GW-P2-002 ｜ GDD 撰写序列 #4（C2∥C3 可并行，本文 C2）
> **产出**：文策渊（design-strategist-2）
> **上游依据**：`design/gdd/systems/F1-terrain-grid.md` v1.4.2（占位容量 R1 结论/占用状态机/承载模型/E1·E2·E7 边缘裁定）｜ `design/gdd/systems/C1-pathfinding-movement.md` v1.0.4（MP 语义/攀爬时序/层位许可 flag 归属/MoveReport 契约）｜ `design/game-concept-planA-turnbased.md` §6 兵种克制表｜ `design/systems-breakdown.md` §6.2 督队裁定（含用户扩展性附加约束）
> **范围红线**：本文只裁 C2——兵种数据契约、属性容器、占用与生命状态、行动经济、MVP 督队光环的**可替换策略框架**。**不写**：移动执行（C1）、伤害/命中/克制的结算数值（C5）、匈奴决策（C8）、士气和连锁溃退（C11 Alpha）、设施（C3）。
> **对齐状态**：spike 未落盘；本文不涉及实现选型，无 spike 挂点；与 F1/C1 的契约冲突按 §10 清单流转，不单方改对方契约。

---

## 0. 八节导航

1. [概述](#1-概述) ｜ 2. [机制](#2-机制) ｜ 3. [数据](#3-数据) ｜ 4. [公式](#4-公式) ｜ 5. [边缘情况](#5-边缘情况) ｜ 6. [UI 接口](#6-ui-接口) ｜ 7. [依赖](#7-依赖) ｜ 8. [验收标准](#8-验收标准) ｜ 附 [§9 跨 GDD 契约履行清单](#9-跨-gdd-契约履行清单) ／ [§10 开放问题](#10-开放问题) ／ [§11 变更记录](#11-变更记录)

---

## 1. 概述

### 1.1 职责定义

C2 是全部单位的**属性容器与行为契约**：定义戍卒与四种匈奴兵（云梯步兵/冲车/骑射手/督队）的数据结构、状态生命周期、行动经济（MP＋行动点 AP）、层位许可/footprint 等给 C1 的接口签名，以及 MVP 督队光环的策略化框架。C2 **是数据的家**：路径执行问 C1，结算问 C5，决策问 C8——C2 只保证「单位是什么、能什么、死了会怎样」有唯一权威答案。

一句话：**把「一个兵」变成一份可配置、可查询、可死亡、可扩展的数据实体。**

### 1.2 设计目标与支柱挂钩

| 支柱/裁定 | C2 落点 |
|---|---|
| P1「一墙之隔，两种战争」 | 守方戍卒与匈奴兵**不同基类行为面**（守方无 MP 依赖的待命结算、攻方全 MP 驱动），拒绝镜像数据模型 |
| P2「高度即力量·占位先于火力」 | 攻方 infantry 的核心战术价值=登顶落位（占 PARAPET）；占位语义严格消费 F1 §4.4（capOcc=1、逻辑位置=梯底格）与 C1 §2.4 攀爬时序 |
| P4「濒危险胜」 | 戍卒可阵亡且不可免费复活（X2 半永久继承的痛感来源）；匈奴兵种作为波次资源被消耗 |
| **督队裁定 §6.2** | MVP 督队=**光环增益＋高价值单体目标**；光环/士气逻辑按**可替换策略**设计、接口预留完整、**禁止硬编码**（用户附加约束，本文 §2.6 正式框架） |

### 1.3 非目标（Non-goals）

- ❌ 士气条、溃退判定、督队「士气锁」连锁 → C11（Alpha）。本文只留 §2.6 策略挂点。
- ❌ 攻击公式、命中/伤害数值、克制系数、梯上暴露修正值 → C5/F3。
- ❌ 匈奴兵「何时架梯、冲谁」→ C8；托管「保不保单位」→ C10。
- ❌ 设施（床弩/礌石）——它们不是单位 → C3（戍卒**小队**是单位，归本文）。
- ❌ 移动的执行与寻路 → C1（本文只提供 MP/layerAccess/footprint）。

### 1.4 关键裁定速览（TL;DR）

| # | 裁定 | 一句话 |
|---|---|---|
| A | 兵种集合 | MVP 五数据档：戍卒小队（守）/云梯步兵、冲车、骑射手、督队（攻）；全部字段走 F3 表（`units.json`），代码零兵种名硬编码 |
| B | 行动经济 | 双资源：MP（移动，C1 消费）＋ AP（行动：攻击/架梯/投放，C5/C4 消费）；**移动后同轮可攻击**（若 AP≥1 且目标在射程）；AP 不累计，MP 不累计 |
| C | **OQ-1/OQ-3 关闭（承接 F1/C1）** | 冲车=**不占格**的巨型结构攻击实体：持 `footprint=NONE`，占攻击锚点格 1 槽但**不可被近战交互、不参与容量竞速**；堵门玩法因此不受冲车体积破坏 |
| D | 生命模型 | 单体 HP；戍卒小队=MVP 唯一「多体」：以「小队 1 单位」占格（容量槽 1，非 4 人 4 槽），内部 HP 池表达减员，小队≠同格堆叠（RFC 裁定②不受影响） |
| E | 督队光环 | **策略接口** `AuraStrategy`：MVP 内置 `PresenceAura`（威慑增益，数值 F3 表）；光环查询只消费 F1 公开接口（snapshot/邻接），对士气零依赖；C11 接入=替换策略实现，结构零改动 |
| F | 死亡语义 | 攻方死亡→出图＋C9 缴获记账挂点；守方戍卒死亡→永久损失（X2 继承）；死亡原子清占位（经 F1 removeUnit，INV3 兜底） |
| G | 交付给 C1 的接口 | `UnitCombatStats`：`MP(u)/AP(u)/layerAccess(u)/footprint(u)/canBoard(u,c)` 签名本文章节 §3.6 定稿——C1 §6.2 契约表「⚠ 待 C2 定签名」行就此关闭 |

---

## 2. 机制

### 2.1 单位生命周期

```
UNDEFINED → DEPLOYED → ENGAGED → (ELIMINATED | WITHDRAWN)
              ↑部署        ↓
              └── 每轮相位重置 ←┘（MP/AP 回满，状态效果结算）
```

| 状态 | 含义 | 占位 | 进入/离开 |
|---|---|---|---|
| `UNDEFINED` | 未部署（守方预备队/攻方波次队列） | 无（OFFBOARD，F1 §2.6）（与 DEPLOYED∧OFFBOARD 组合态区分：后者=已购，见表下注） | C7 部署→DEPLOYED；C9 入场→DEPLOYED |
| `DEPLOYED` | 在场上待命 | IN_CELL（占格槽） | 每攻防相位开始全量重置 MP/AP |
| `ENGAGED` | 本轮已行动（攻击/攀爬/移动后标记） | 同上 | 行动结束→回 DEPLOYED（同轮不再手动行动） |
| `ELIMINATED` | 死亡 | 清空（经 F1 removeUnit） | 终态；攻方出图，守方入 X2 抚恤记账 |
| `WITHDRAWN` | 攻方主动撤退（Alpha 才开放，MVP 预留枚举） | 清空 | 不进 MVP 校验 |

- 状态机由 C2 持有，**占位迁移全部经 F1 写白名单**（placeUnit/moveUnit/removeUnit），C2 不直改 occupantIds——INV1/INV3 的纪律同 F1 §3.8。
- **组合态注记（X-1，GW-P2-008 互审合流批采纳）**：`DEPLOYED ∧ placement=OFFBOARD`（F1 §2.6）=**已购未上场**（C7 撤回预备队——A 相位可零费再部署；不入行动序/C8 计划域，本来就不在场上，零行为面新增）；与 `UNDEFINED`（=未购买，A 相位部署须先经 C6 charge）以「是否已支付」划界——「已购 vs 未购」的分界=C6 charge 是否发生，非新增状态枚举。「复用 WITHDRAWN」方案经主理人终裁否决（WITHDRAWN=攻方离场终态域，与「可逆占位回撤」类别不同）。X2 记账语义无损：OFFBOARD 残队=幸存者，不进 garrisonCasualties。
- 每轮 MP/AP 重置时点：**F2 事件 `combat_phase_started`（B→C 相位迁移时发出，F2 §3.3 事件表）驱动 `resetPhaseResources()`**——C① MP 重置（F2 §2.4 时序）即此事件；AP 同点重置（F2 行动槽模型对 1 AP 兼容，F2.2）。v1.0.1 已按 F2 v1.0 落盘版对齐事件名，OQ-1（F2 相位时点）关闭。

### 2.2 守方：戍卒小队

- **定位**：墙顶/垛口一线战斗位，近战堵击主体，**可阵亡**。
- **小队=1 个单位实体**：占格槽 1（PARAPET 容量 1=一小队；RAMPART_WALK 容量 2=可并立两小队），内部以 `squadHP`（1 个 HP 池）表达减员，不拆个体——与 F1 §2.5.3「同格多单位」语义无冲突（小队内部不是「同格多单位」）。
- **堵垛口行为**：占据 PARAPET 槽位本身即堵击（F1.11 登顶判定=「顶格满」）；戍卒在垛口的攻击结算归 C5（近战互殴、滚木礌石投放协助归 C3/C4）。
- **层位许可** `[0,1,2]`（唯一可进烽燧顶的战斗位——帅帐护卫语义）；MP 工作假设 3、AP 工作假设 1（**F3 宿主，工作假设仅供灰盒**）。

### 2.3 攻方四兵种（行为面摘要，克制逻辑归 C5/C8）

| 兵种 | 定位（概念稿 §6） | 关键字段档 | 行为契约要点 |
|---|---|---|---|
| 云梯步兵 | 多点攀城、消耗高度优势 | MP 3｜AP 1｜layerAccess [0,1]｜footprint NONE | 全游戏唯一 `canBoardLadder=true`；架梯指令（E1）与攀爬（C1 §2.4）是其两大动作；怕垂直打击（滚木礌石，C3） |
| 冲车 | 撞门/撞墙，破结构 | MP 2｜AP 1（撞击）｜layerAccess [0]｜**footprint NONE（裁定 C）** | 结构攻击实体：锚点格占 1 槽、不可被近战交互；对 GATE/墙体的伤害归 C5（R2 穿透列无关）；怕火与重械（C3） |
| 骑射手 | 远程骚扰、点杀戍卒 | MP 5｜AP 1（射击）｜layerAccess [0]｜footprint NONE | 永不上墙（layerAccess 无 1/2，C1 §2.3「马不上墙」的执行面）；射击距离/命中归 C5 |
| 狼骑督队 | MVP：光环增益＋高价值单体目标 | MP 4｜AP 1｜layerAccess [0]｜footprint NONE | **不直接输出**：光环（§2.6）＋自身为高赏格目标（击杀奖励数值归 C6 表）；Alpha 挂 C11 士气锁 |

> MP 数值全部为**工作假设**（C1 §2.1 同源），表宿主 F3 `units.json`，灰盒期可调；C1 OQ-2 中的基准值疑问就此收口。

### 2.4 行动经济（MP × AP 双资源）

- **MP**：移动专用，C1 消费（C1.9 扣费），每攻防相位开始重置，不累计不预支。
- **AP**：行动专用，消费场景=攻击（C5）与架梯（E1，云梯步兵专属）；每相位重置，AP≥1 才可行动。
- **设施操作不消耗 AP**：滚木礌石投放、床弩锁定/射击均为 C3 设施指令（投放=自由指令不占行动槽，C3 §2.3/§2.5 裁定），与单位 AP 经济**完全解耦**——人力约束（crewAlive）是设施侧的施放前提，不是单位侧的 AP 消耗。v1.0 首版此处的「滚木投放读戍卒 AP」系笔误，v1.1.0 修正（C3 交叉互审对表结果，与 C3 §2.5「设施不占单位行动槽」口径一致）。
- **移动-攻击自由序**：同一轮内「先动后打 / 先打后动 / 只动 / 只打」皆可，约束仅两条——MP/AP 各自够用；**攻击发起后本轮 MP 清零**（防止「打一枪满场跑」，占位先于火力的行动面；清零规则表宿主 F3 键 `mpZeroOnAttack`，MVP=true，Alpha 可调）。此裁定同时关闭 C1 OQ-2 后半问。
- 托管（C10）与手动共用同一行动 API，无特权（C1 §6.2 同源纪律）。

### 2.4.1 攻击与目标（含「攻击设施」分支，回应 C3-E5）

- **攻击发起**：`act(u, 攻击) ⇔ AP(u) ≥ 1 ∧ attackCapable(u) ∧ 目标资格通过`；资格判定在 C2（本节），命中/伤害在 C5。攻击发起后锁足（C2.4），同轮先攻击后移动被禁（C2-E8）。
- **目标两类**（C3-E5 对表裁定）：
  - **单位目标**：target=UnitId，资格=敌阵营单位（含 ON_CONNECTOR 取逻辑位置格）在近战可及范围内；「近战可及」=同格或四邻格（表宿主 F3 键 `meleeReach`，MVP=1）；梯上单位的被近战资格恒成立（其逻辑位置=梯底格）。`immuneToMeleeInteract=true` 的单位（冲车）不可作为近战目标。
  - **设施目标**：target=FacilityId（C3-E5 场景：床弩格被登城匈奴攻击），资格=**近战单位与设施同格或相邻**（同 `meleeReach`）∧ 设施 state ≠ DESTROYED；伤害走 C5 `applyDamage(facilityId, n)` 入口（C3 §6.2 契约）。设施目标判定不读 `immuneToMeleeInteract`（该旗标只管单位域）。
- **督队光环与目标选择（互审重点②口径确认，双方互认）**：光环 modifiers（C2.7）**只作用于单位**——影响 C5 单位受击/威胁与 C8 目标评分；**设施不受光环**——C3 的床弩目标选择、投放判定、射击资格不读任何 modifiers/hasAura。与 C3 v1.0 同口径成文。

### 2.4.2 存活状态查询（回应 C3 §3.4「目标单位存活状态」与 crewAlive 的只读依赖）

C2 向设施侧（C3）与结算侧（C5）提供存活/在场权威只读查询，签名并入 §3.6 UnitStatsQuery：

```ts
// 增补进 UnitStatsQuery（v1.1.0）：
  isAlive(u: UnitId): boolean;              // state ≠ ELIMINATED（crewAlive 逐单位判定原语）
  aliveDefendersIn(cellIds: readonly CellId[]): UnitId[];  // 指定格集上的存活守方单位列表
  unitAt(cellId: CellId): readonly UnitId[];                // 格上全部在场单位（ON_CONNECTOR 取逻辑位置格）
```

边界纪律：C2 只出**单位域原语**（isAlive/aliveDefendersIn/unitAt），「投放大须邻域有兵」这类设施语义由 C3 用原语＋F1 getAdjacency 自行组装（其 C3.5 crewAlive 定义不动）——与 F1「占位模型对士气中立」同源的职责隔离：单位不懂设施、设施不懂单位、F1 两套账居中。

### 2.5 架梯动作（云梯步兵专属，F1 E1 的 C2 侧收口）

```
前置：unit.kind=LADDER_INFANTRY ∧ AP≥1 ∧ MP≥climb 消耗（2）
选址：目标墙面格须满足 F1 V5 合法（to=PARAPET 或 RAMPART_WALK 的空位连接器）；
     梯底格=推进方向邻接 GROUND 格（F1 E1），**不要求梯底有空槽**
执行：经 F1 addConnector 生成 LADDER（connKind=LADDER, orient 由选址决定,
     status=ACTIVE, lifetime.createdTurn=当前回合, currentHp=F3 ladderHp）
     ＋扣 AP1＋单位迁至梯底格（正常 IN_CELL 占槽）
约束：每波每单位至多架 1 架；架设回合该单位不得再攀爬（AP 已耗尽，自然约束无需特判）
```

- F1 §5-E1「待澄清归 C8/C2」的选址约束清单就此收口：**约束在 C2（本节），候选点评估在 C8**（AI 偏好归 C8 GDD）；F1 无需新增查询 API（用 `getActiveConnectors(LADDER)`＋邻接即可）。
- 礌石砸梯（F1 OQ-2）：`currentHp` 由 C5/C3 写入，`addConnector/destroyConnector` 已在 F1 写白名单，C2 只在梯毁时接收坠落回调（E2 链）。

### 2.6 督队光环：可替换策略框架（用户附加约束的正式兑现）

**约束重述**（systems-breakdown §6.2 裁定结果）：MVP 期督队=光环增益＋高价值单体目标；「先杀督队引发连锁溃退」留作 Alpha 士气系统回收点；光环/士气相关逻辑按**可替换策略**设计，接口预留完整，**禁止硬编码**，demo 验证后可能按实测调优回填。

**框架设计（三层解耦）**：

```ts
// 层1：策略接口（C2 持有，C11 可整体替换实现）
interface AuraStrategy {
  id: string;                                  // 策略标识，表驱动选择，禁 if(kind==='督队') 硬编码
  computeAura(source: UnitId, ctx: AuraContext): AuraEffect;   // 纯函数：给定上下文算光环
  onSourceRemoved(source: UnitId, ctx: AuraContext): void;     // 光源死亡/离场时的清理钩子
}

// 层2：上下文与效果（数据契约，士气中立）
interface AuraContext {
  self: UnitSnapshot;                          // 光源单位快照
  nearby: UnitSnapshot[];                      // 邻近单位快照（半径与筛选=策略内部逻辑，
                                               // 实现消费 F1 snapshot()/getAdjacency，半径 r 表宿主 F3）
  turn: number;
}
interface AuraEffect {
  targets: UnitId[];                           // 受益/受慑单位
  modifiers: StatModifier[];                   // {stat: 'threat'|'actionPriority'|'moveMp', delta: number}
                                               // delta 全部 F3 表宿主；stat 枚举开放注册，不封死
  channel: 'PRESENCE' | 'MORALE';              // MVP 恒 PRESENCE（威慑/优先级）；
                                               // MORALE 通道为 C11 预留，MVP 无消费者、C2 不解析
}

// 层3：内置策略（MVP 唯一实现，C11 的 Alpha 实现为第二实例）
const PresenceAura: AuraStrategy = { id: 'presence-v1', ... }  // 威慑增益：提升邻近匈奴威胁评分/行动优先级
```

**纪律条款（验收直接引用）**：
1. C2 核心循环**不出现**「士气」「溃退」「morale」字样——光环是唯一合法接面，`channel: MORALE` 数据对 MVP 而言是不透明载荷；
2. 督队数据档**不带**士气字段（C11 接入时走 `units.json` 加列＋策略注册表加行，无结构迁移）；
3. 策略选择表驱动：`unitTemplate.auraStrategyId → strategyRegistry[id]`，替换/调优=改表不改码；
4. 光环作用范围（格半径 r、目标筛选「同阵营且非光源」）是 PresenceAura 的内部策略参数，**不是 C2 全局规则**——Alpha 换士气策略时半径/筛选可完全不同；
5. demo 调优回填路径：只动 `presence-v1` 参数（F3 表）或注册 `presence-v2` 新策略，两侧接口不动。

**高价值单体目标**：督队赏格（击杀奖励粮饷）是 C6 经济表字段；「高价值」的目标评估侧（C8 AI 反向权重：守方 AI 优先点杀督队）归 C8/C10 消费 `auraStrategyId` 存在与否判断，C2 提供只读查询 `hasAura(u): boolean`。

### 2.7 死亡与清场语义

- **统一入口**：HP≤0 → C2 校验 → 经 F1 `removeUnit`（原子清占位/承载，INV3）→ 状态 ELIMINATED → 发死亡事件（C6 缴获/C9 波次计数/P1 演出订阅）。
- **梯上死亡**：occupancy 清空→连接器即时可用（F1 E3/C1-E2 同源），无额外处理。
- **守方戍卒死亡**：入 X2 继承账本（抚恤/重募成本归 C6/X2），MVP 关卡内**不可复活**——「濒危险胜」的资源痛感来源。
- **攻方兵死亡**：出图＋按 C6 表计缴获；波次计数器减（C9 消费死亡事件）。
- **冲车死亡**：因其不占格竞速，清场只需清锚点格槽位＋攻击状态；被毁时不产生路障（与 E5 云梯残骸不占格同源哲学）。

---

## 3. 数据

### 3.1 单位实体（Unit，引擎无关 TS）

```ts
interface Unit {
  id: UnitId;
  templateId: UnitTemplateId;      // 'garrison_squad' | 'ladder_infantry' | 'ram_chariot' | 'horse_archer' | 'warlord_escort'
  faction: 'DEFENDER' | 'ATTACKER';
  state: UnitLifecycle;            // §2.1 状态机
  hp: number;                      // 当前 HP（戍卒小队=squadHP 池，同字段）
  mp: number;                      // 当前 MP（相位重置；C1 扣减回写）
  ap: number;                      // 当前 AP（相位重置）
  placement: UnitPlacement;        // F1 §2.6：IN_CELL | ON_CONNECTOR | OFFBOARD
  cellId?: CellId;                 // placement=IN_CELL 时有效（ON_CONNECTOR 时=F1 逻辑位置=梯底格）
  auraStrategyId?: string;         // 仅有光环的单位非空（MVP 唯督队），表驱动，禁硬编码判断
  controlMode: 'MANUAL' | 'AUTO';  // 行动槽路由数据（F2 消费）；默认：ATTACKER 恒 AUTO，DEFENDER 默认 MANUAL 可切
  flags: UnitFlags;                // §3.3 行为旗标
}
```

### 3.2 单位模板（UnitTemplate，表宿主 F3 `units.json`）

```ts
interface UnitTemplate {
  id: UnitTemplateId;
  faction: Faction;
  baseHp: number;                  // 初值见 §2.2/§2.3 表，F3 宿主
  baseMp: number;                  // 同上（C1 消费）
  baseAp: number;                  // 同上
  layerAccess: Height[];           // C1 §2.3 消费，本文裁定各兵种值
  footprint: 'NONE';               // MVP 全部 NONE（裁定 C）；类型预留 'RECT_1x2'（Alpha 大体型）
  canBoardLadder: boolean;         // MVP 唯 ladder_infantry=true
  attackCapable: boolean;          // 督队 MVP=false（不直接输出）
  auraStrategyId?: string;         // MVP 唯 warlord_escort='presence-v1'
  meta: { nameKey: string; descKey: string };   // 文案锚点（P3 支柱/教学）
}
```

> 表内容（数值基准）归 F3；本表是**结构权威**。`units.json` 新增兵种=加行，代码零改动。

### 3.3 行为旗标（UnitFlags，给 C1/C5/C8 的消费面）

| 旗标 | 类型 | 消费方 | 说明 |
|---|---|---|---|
| `layerAccess` | Height[] | C1 §2.3 | 层位许可（上文） |
| `footprint` | 枚举 | C1 路径校验 | MVP 恒 NONE；C1 OQ-1 扩展位就此关闭为「不需要」（裁定 C） |
| `canBoardLadder` | bool | C1 canClimb 预检 | 攀爬发起的资格线 |
| `attackCapable` | bool | C5/C10 | 行动菜单过滤 |
| `isStructureTarget` | bool | C5/C3 | 冲车=true（可被城墙弩炮 Alpha 特攻等），戍卒/匈奴步兵=false |
| `immuneToMeleeInteract` | bool | C5/C1 | 冲车=true：不可被近战交互、不参与容量竞速（锚点格仍占槽） |

### 3.4 C2 持有的写操作白名单

`deploy(UNDEFINED→DEPLOYED)/ enterField(攻方入场)/ resetPhaseResources(MP/AP 回满)/ applyDamage(转发 C5 结果)/ eliminate(§2.7)/ setPlacement(经 F1)/ attachAura/ detachAura`。全部带校验+事件，纪律同 F1 §3.8（F5 存档的 C2 部分=单位列表全量序列化）。

### 3.5 与 F1/C1/C5 的读写边界

| 数据 | C2 权限 | 说明 |
|---|---|---|
| cell 占位（occupantIds） | 经 F1 mutation | C2 不直改（INV 纪律） |
| connector.occupancy | 经 F1 mutation（攀爬登记由 C1→F1） | C2 只读查询 placement |
| hp/mp/ap | C2 独占写 | C5 伤害经 applyDamage 转发；C1 扣 MP 经回写接口 |
| template 表 | 只读（F3 加载） | 热更新走表（demo 调优） |

### 3.6 交付 C1 的接口签名（UnitCombatStats，关闭 C1 §6.2 ⚠ 行）

```ts
interface UnitStatsQuery {
  MP(u: UnitId): number;                     // 当前 MP（C1.9 扣费回写经 applyMpDelta）
  AP(u: UnitId): number;                     // 当前 AP（攻击前检查，C5 消费）
  speed(u: UnitId): number;                  // 速度序排序键（F2 C① 消费，值 F3 宿主）
  actionDone(u: UnitId): boolean;            // 行动经济报告（F2 行动槽关闭判据：AP 耗尽 ∨ 显式放弃）
  controlMode(u: UnitId): 'MANUAL' | 'AUTO'; // F2 槽路由（C10.resolveSlot 消费）
  setActionDone(u: UnitId, done: boolean): void; // 放弃/行动结束回写（P3「结束行动」→C2，F2 槽关闭）
  layerAccess(u: UnitId): readonly Height[];
  footprint(u: UnitId): 'NONE';
  canBoardLadder(u: UnitId): boolean;
  hasAura(u: UnitId): boolean;               // C8/C10 目标评估
  isAlive(u: UnitId): boolean;               // C3/C5 存活判定原语（§2.4.2）
  aliveDefendersIn(cellIds: readonly CellId[]): UnitId[];  // C3 crewAlive 组装原语（§2.4.2）
  unitAt(cellId: CellId): readonly UnitId[]; // 格上在场单位查询（§2.4.2）
  applyMpDelta(u: UnitId, d: number): void;  // C1 扣费回写唯一入口
  resetPhaseResources(): void;               // F2 combat_phase_started 事件驱动
}
// 注：speed/actionDone/controlMode/setActionDone 四方法即 F2 §6.2 契约表「⚠ 待 C2 GDD 定签名」与
// F2 OQ-1 的关闭交付——接口语义 F2 已锁，此处为签名定稿。
// isAlive/aliveDefendersIn/unitAt 三方法为 C3 交叉互审对表交付（C3 §3.4 读写边界表挂账项），v1.1.0。
```

---

## 4. 公式

> 统一格式：编号 ｜ 名称 ｜ 变量与单位 ｜ 表达式 ｜ 消费方。数值基准一律标「F3 表宿主」。

- `C2.1 ｜ 相位重置：MP(u) ← baseMp(template(u))；AP(u) ← baseAp(template(u)) ｜ F2 攻防相位开始事件驱动 ｜ 表宿主 F3`
- `C2.2 ｜ 伤害转发：hp'(u) = max(0, hp(u) − dmg) ｜ dmg 由 C5 结算产出，C2 不解释 ｜ 触发 eliminate ⇔ hp'=0`
- `C2.3 ｜ 歼灭判定：ELIMINATE(u) ⇔ hp(u) = 0 ｜ 原子：清占位(F1)+状态迁移+事件，无中间态`
- `C2.4 ｜ 攻击后锁足：mp'(u) = 0 ｜ ⇔ 本轮已发起攻击 ∧ mpZeroOnAttack=true ｜ 表宿主 F3（MVP=true）`
- `C2.5 ｜ 行动合法性：act(u, a) ⇔ AP(u) ≥ a.cost ∧ a 的目标预检通过（各自系统）｜ AP 不累计`
- `C2.6 ｜ 光环作用域（PresenceAura 内部，非 C2 全局）：targets = {v | dist(u,v) ≤ r ∧ faction(v)=faction(u) ∧ v≠u} ｜ r 表宿主 F3；dist 消费 F1 邻接跳数（BFS≤r），不消费 C8`
- `C2.7 ｜ 光环修正合成：eff(v) = Σ modifiers∈activeAuras(v)（同类 stat 相加，超上限截断规则归 C5 表）｜ 消费方 C5/C8`
- `C2.8 ｜ 架梯资格：canRaiseLadder(u) ⇔ kind(u)=LADDER_INFANTRY ∧ AP(u)≥1 ∧ MP(u)≥moveCost.climb ｜ 消费方 C1（攀爬发起预检复用 C1.7）`

### 4.1 不变量（可单测）

- INV-C2-1：`∀u: 0 ≤ hp(u) ≤ baseHp(template(u))`。
- INV-C2-2：`placement(u)=IN_CELL ⇒ cellId(u) ∈ F1 格集合 ∧ u ∈ F1.occupantIds(cellId(u))`——C2 状态与 F1 占位**强一致**（对拍判据）。
- INV-C2-3：`ELIMINATED(u) ⇒ u ∉ 任何 F1 容器`（无幽灵引用）。
- INV-C2-4：`hasAura(u) ⇔ template(u).auraStrategyId ≠ undefined`（策略表驱动一致）。
- INV-C2-5：C2 源码与 `units.json` 中均不出现「morale/士气」业务字段（策略框架纯净性，可用静态扫描断言）。

---

## 5. 边缘情况

> 裁定者=本文；数值归 C5/C6，位移归 F1，执行归 C1。格式：编号｜场景｜裁定｜消费方。

### A. 攀爬与承载（与 F1/C1 严格同源）

- **C2-E1｜梯毁坠落（F1 E2 / C1-E1 的 C2 侧）**：C2 收 F1 坠落回调 → 单位 placement: ON_CONNECTOR→IN_CELL（落位格=F1 裁定的 from 或顺延格）→ 伤害数值由 C5 结算回填 hp。C2 不计算落点、不算伤害，只做状态迁移与**死亡连锁检查**（坠落后 hp≤0 → 走 §2.7 歼灭）。
- **C2-E2｜留梯等待中被击杀**：与常规死亡同链路（F1 removeUnit 清 occupancy）；无「尸体堵梯」中间态。
- **C2-E3｜云梯步兵在梯上时己方梯被己方单位架设限制**：不存在的场景——架梯需 AP≥1，梯上单位 AP 已在攀爬时消耗（C1 §2.4②），自然互斥，无特判。

### B. 占位与容量

- **C2-E4｜戍卒小队减员不改变占格**：squadHP 1→0.4 仍占 1 槽（PARAPET 照旧堵死）；「残队让位」只能是玩家显式移动指令。减员后的战力折扣归 C5 表（键 `squadHpPowerCurve`，F3 宿主）。
- **C2-E5｜冲车锚点格被围**：冲车不可被近战交互（immuneToMeleeInteract=true），围堵它只封锁其移动，不封锁其撞击——「堵门 vs 撞门」的二换一权衡成立，堵门玩法不被冲车体积破坏（裁定 C 的玩法面）。
- **C2-E6｜骑射手被困垛口**（理论场景）：layerAccess=[0] 使其根本无法进入 h≥1——不存在此场景（C1 §2.3 层位过滤保证）。唯一入口是 C7 部署校验拒绝非法部署位。
- **C2-E7｜部署到已占格**：C7 部署指令经 F1 canPlace 预检，满格拒绝；C2 收 deploy 请求时二次校验（防时序差），拒绝则状态停留 UNDEFINED 并回执错误（C7 GDD 消费）。

### C. 生命周期与经济

- **C2-E8｜单位在同相位内先移动后攻击**：合法（§2.4）；攻击后 MP 清零（C2.4），若 MP 已为 0 无副作用。先攻击后移动：**禁止**（锁足前置），C10/C8 下单时按此排序。
- **C2-E9｜督队死亡时光环消失的结算时序**：onSourceRemoved 钩子先于死亡事件广播完成——同相位后续单位的 modifier 合成（C2.7）已不含死者光环；C5 若已按旧值结算不回溯（先手结算优先，与 F1 E8 同哲学）。
- **C2-E10｜架梯后梯底格被友军占满**：合法（F1 E1 裁定架设不要求空槽）；该梯仍可用（攀爬者从梯底格周边格发起？——**否**：攀爬发起须站在 from 格（C1 §2.4①），from 满员时同格友军先动走即腾出；极端满员下该梯本波搁置，AI 选址偏好（C8）会规避此浪费）。
- **C2-E11｜攻方单位出场端回收**：MVP 无攻方撤退（WITHDRAWN 不启用）；波次结束仍存活的攻方单位保留在场（围城继续语义），下一波 MP/AP 照常重置。清场只发生在 ELIMINATED。
- **C2-E12｜存档/读档**：单位列表全量序列化（含 placement/auraStrategyId）；读档后 INV-C2-2/3 全量校验，不一致即拒绝读档（脏档防线）。

### D. 策略框架鲁棒性

- **C2-E13｜auraStrategyId 指向不存在的策略**：加载期报错拒绝启动（与 F1 V13 未注册枚举同纪律）——禁止静默降级，防「光环悄悄失效」的隐性平衡漂移。
- **C2-E14｜PresenceAura 半径 r=0 或超图尺寸**：r=0 视为「仅自身」合法（无目标时 targets 空，效果为无操作）；r 超界按图尺寸截断，不报错（表调参自由度）。
- **C2-E15｜同格多光环叠加**：C2.7 直接累加；是否设收益递减归 C5/C8 平衡表（键位预留 `auraDiminishing`），MVP 不启用。
- **C2-E16｜C11 接入预演（Alpha）**：新策略 `morale-v1` 注册→督队 template.auraStrategyId 换 id→`units.json` 加 morale 列（C11 表）→C2 结构零改动。此条写入验收（§8.3-PL4），证明「接口预留完整」不是空话。

---

## 6. UI 接口

### 6.1 F2/C2 暴露给 UI 层的数据

- 单位选中面板：hp/mp/ap 三环、template 名称（meta.nameKey）、旗标衍生的行动菜单（attackCapable/canBoardLadder 过滤按钮灰显）；
- 督队光环可视化：施放范围圈（r 格半径，F1 邻接换算世界坐标）＋受益单位描边（色值归 P1 灰盒规范，语义=`PRESENCE` 通道）；光环 UI 与未来 C11 士气 UI 共用挂点（channel 字段区分），MVP 不画士气条；
- 死亡反馈事件流（P1 演出/P4 战报）；留梯等待指示复用 C1 §6.1。

### 6.2 接口契约（对外承诺，下游 GDD 引用）

| 契约 | 提供方→消费方 | 内容 | 状态 |
|---|---|---|---|
| 单位属性接口 | C2→C1 | §3.6 UnitStatsQuery（MP/AP/layerAccess/footprint/canBoardLadder/applyMpDelta）——**关闭 C1 §6.2「⚠ 待 C2 定签名」行** | ✅ |
| 速度序/槽路由数据 | C2→F2 | `speed(u)` / `actionDone(u)` / `controlMode(u)` / `setActionDone`（§3.6）——**关闭 F2 §6.2「⚠ 待 C2 定签名」行与 F2 OQ-1** | ✅ v1.0.1 |
| 伤害转发 | C5→C2 | applyDamage(u, dmg, source?)，C2 负责死亡连锁 | ✅ |
| 行动经济 | C2→C5/C4/C10 | AP 检查＋C2.4 锁足规则；攻击后禁移动 | ✅（数值 C5 表） |
| 光环数据 | C2→C8/C10/C5 | hasAura() + AuraEffect.modifiers 合成结果（C2.7） | ✅ MVP=PRESENCE 通道 |
| 士气预留 | C2→C11(Alpha) | AuraStrategy 整体替换＋channel: MORALE 透传＋units.json 加列位 | ✅ 结构就绪，MVP 无消费者 |
| 死亡事件 | C2→C6/C9/P1/P4 | eliminate 事件 {unitId, killer?, cause} | ✅ |
| 层位部署校验 | C7→C2 | deploy(zone, templateId) 合法性（layerAccess∩zone.h 非空＋容量） | ✅ C7 v1.0 §2.9-D1~D4 五闸清单履行；组合态（DEPLOYED∧OFFBOARD）再部署同走五闸 |
| MP/AP 基准值 | F3→C2 | units.json（本文 §2.2/§2.3 工作假设为初值） | ✅ 键定，值 F3 宿主 |
| 存活/在场原语 | C2→C3/C5 | `isAlive / aliveDefendersIn / unitAt`（§2.4.2）——**关闭 C3 §3.4 挂账签名** | ✅ v1.1.0 |
| 攻击资格（含设施目标） | C2→C5/C3 | §2.4.1：近战可及 `meleeReach`、immuneToMeleeInteract 单位域过滤、设施目标资格判定 | ✅ v1.1.0 |
| 光环-设施口径 | C2↔C3 互认 | 光环 modifiers 只作用单位，设施目标选择/投放/射击不读光环 | ✅ 双文互认（C2 §2.4.1 / C3 v1.0） |

### 6.3 输入约束（传递 P3）

行动菜单/目标选择全部以 UnitId+CellId 寻址；「攀爬」按钮调 C1 `canClimb` 而非 C2 本地判断（资格线两处都有时以 C1 为准——它是执行方）。P3 不得从单位面板直接改 hp/mp/ap（只读展示，写入口只在 §3.4 白名单）。

---

## 7. 依赖

### 7.1 上游依赖（C2 需要）

| 依赖 | 类型 | 说明 |
|---|---|---|
| F1 地形网格 | 结构契约 | 占位容量（R1）/承载模型（§4.4）/占用状态机（§2.6）/E1·E2·E7 裁定/写白名单 mutation |
| C1 寻路移动 | 行为契约 | MP 消费语义/攀爬时序/BLOCKED_TOP 留梯/MoveReport（§2.4 锁足与其执行报告对齐） |
| F3 数值表 | 数值宿主 | `units.json`（新建：本文模板结构）＋`grid-capacity.json` 容量键＋`mpZeroOnAttack`/`auraRadius` 等键 |
| F2 相位调度 | 时序契约 | `combat_phase_started` 事件（B→C 迁移，F2 §3.3）驱动 §2.1 重置——**v1.0.1 已对齐，OQ-1 关闭** |
| C5 攻防结算 | 结算契约 | 伤害产出→applyDamage；光环 modifiers 合成消费（C2.7 下游） |
| F4 确定性随机 | 纪律 | MVP C2 无随机（光环计算纯函数）；预留下 |

### 7.2 下游消费者（依赖 C2）

| 消费方 | 消费内容 | 对应 GDD |
|---|---|---|
| C1 寻路移动 | UnitStatsQuery（§3.6）——**C1 §6.2 ⚠ 行就此关闭** | 已落盘 v1.0.1，无需改动 |
| C5 攻防结算 | hp/AP/isStructureTarget/immunity 旗标、光环 modifiers | 序列 #5 |
| C8 匈奴 AI | 全部单位快照（snapshot）、hasAura（督队目标权重）、架梯候选约束（§2.5） | 序列 #6 |
| C9 波次编排 | templateId 构兵、死亡事件计数、入场 enterField | 序列 #8 |
| C10 托管微操 | 行动菜单合法性、锁足规则、光环权重 | 序列 #8 |
| C11 士气（Alpha） | AuraStrategy 替换点＋MORALE 通道 | Alpha |
| C6 经济 | 死亡缴获/督队赏格事件 | 序列 #7 |
| P3/P4 | §6.1 全部 UI 语义 | — |
| F5 存档 | 单位列表序列化契约（§5-C2-E12） | — |

### 7.3 与并行 GDD 的协调记录

- C1（design-strategist，v1.0.1）：其 §6.2 契约表「MP/许可/footprint ⚠ 待 C2 定接口签名」由本文 §3.6 关闭；其 OQ-1（冲车 footprint）由本文裁定 C 关闭（结论：C1 无需扩展，footprint 恒 NONE）；其 OQ-2（MP 基准/移动-行动经济）由本文 §2.4 关闭。**C1 文件本体不动**（结论对 C1 无结构性影响），记录于本文变更日志。
- F2（design-strategist，v1.0 已落盘）：相位时点——**OQ-1 关闭**：C2 §2.1 事件名对齐 `combat_phase_started`（F2 §3.3 B→C 迁移事件），语义与原假设一致，零冲突。

---

## 8. 验收标准

### 8.1 结构与数据验收（GDD 层）

- [ ] SC-1：五兵种模板、UnitStatsQuery 签名、行为旗标全部定义且数值零硬编码（§2.2/§2.3/§3.2/§3.6）。
- [ ] SC-2：督队裁定（MVP 光环+高价值目标/连锁溃退留 Alpha）与可替换策略五条纪律逐条落实（§2.6），`AuraStrategy` 接口对 C11 完整可用。
- [ ] SC-3：F1 契约零冲突（capOcc=1/逻辑位置=梯底格/E1·E2·E7 转接/INV 纪律）；C1 契约零冲突（锁足/攀爬资格/BLOCKED_TOP 消费）。
- [ ] SC-4：三个承接 OQ 关闭（F1 OQ-3 冲车占格、C1 OQ-1 footprint、C1 OQ-2 行动经济）且方向与上游文档兼容。

### 8.2 行为验收（实现层，可自动化）

- [ ] BE-1：INV-C2-1…5 全部单测通过，含「C2 状态 × F1 占位」对拍（随机部署/移动/死亡 fuzz 1 万次）。
- [ ] BE-2：架梯→攀爬→留梯→梯毁坠落→死亡连锁全链路（C2-E1/E3/C2.3）无中间态泄漏，与 C1 BE-3 联测。
- [ ] BE-3：锁足规则——攻击后同轮移动指令被拒且报告语义正确（C2.4，C8/C10 联测前置）。
- [ ] BE-4：光环生效/光源死亡清理（C2-E9）时序正确：同相位后续结算不含死者光环、已结算不回溯。
- [ ] BE-5：策略框架纯净性静态检查通过（INV-C2-5：无 morale 硬编码）＋`morale-v1` 假策略注册演练可运行（C2-E16 演示）。
- [ ] BE-6：读档校验（C2-E12）：篡改档（幽灵引用/占位不一致）被拒。

### 8.3 玩法判据（供 GW-P2-003 评审与灰盒）

- [ ] PL-1：戍卒小队堵垛口（1 槽）＋匈奴留梯（C1 PL-1 联动）在灰盒可复现；残队不让位（C2-E4）行为符合预期。
- [ ] PL-2：督队光环在场时匈奴波次压迫感可感知（C8 优先级权重联动）、被击杀时增益消失可感知——「先杀督队」的战术直觉在无士气系统下已经成立。
- [ ] PL-3：骑射手全程无法登城（C1-E14 联动）且 AI 不做无效登城尝试（C8 消费 layerAccess）。
- [ ] PL-4：C11 接入演练（C2-E16）走查通过——替换策略实现不改 C2 代码一行（评审现场演示项）。
- [ ] PL-5：冲车堵门交互（C2-E5）：围堵冲车不防撞击的权衡在灰盒可玩出来。

### 8.4 数值初值汇总（全部 F3 `units.json` 宿主，工作假设标注 ⚠）

| templateId | baseHp | baseMp | baseAp | layerAccess | canBoardLadder | attackCapable | aura |
|---|---|---|---|---|---|---|---|
| garrison_squad | 100 ⚠ | 3 ⚠ | 1 | [0,1,2] | ✓ | ✓ | — |
| ladder_infantry | 60 ⚠ | 3 ⚠ | 1 | [0,1] | ✓ | ✓ | — |
| ram_chariot | 200 ⚠ | 2 ⚠ | 1 | [0] | ✗ | ✓（仅撞击） | — |
| horse_archer | 50 ⚠ | 5 ⚠ | 1 | [0] | ✗ | ✓ | — |
| warlord_escort | 80 ⚠ | 4 ⚠ | 1 | [0] | ✗ | ✗（MVP） | presence-v1 ⚠（r、delta 值待 C5/C8 平衡轮） |

---

## 9. 跨 GDD 契约履行清单（本文对外部文档承诺的关闭/回填）

| # | 来源 | 条目 | 本文处置 |
|---|---|---|---|
| 1 | C1 §6.2 | MP/许可/footprint 接口签名 ⚠ | **关闭**（§3.6 定稿，C1 无需改文） |
| 2 | C1 OQ-1（承接 F1 OQ-3） | 冲车 footprint 与占格 | **关闭**（裁定 C：不占格结构实体，C1-E15 的「两种兼容」取分支 A 不触发） |
| 3 | C1 OQ-2 | MP 基准值＋移动-行动经济 | **关闭**（§2.4 双资源＋锁足；基准值 ⚠ 工作假设入 §8.4） |
| 4 | F1 §5-E1 | 架梯选址约束归 C2 | **收口**（§2.5：约束在 C2，偏好评估归 C8，F1 零新增 API） |
| 5 | F1 §11.2 OQ-3 | 冲车是否占格 | **关闭**（同 #2，方向：不占格） |
| 6 | F1 §6.2 士气中立行 | 光环查询复用现有接口 | **履行**（C2.6 只消费 F1 snapshot/邻接，零新增） |
| 7 | F2（v1.0 落盘） | 相位重置事件名/时序 | **关闭**（对齐 `combat_phase_started`）；附带交付：§3.6 增补 speed/actionDone/controlMode/setActionDone 关闭 F2 §6.2 ⚠ 行与 F2 OQ-1 |

---

## 10. 开放问题

| # | 问题 | 影响方 | 建议关闭时点 |
|---|---|---|---|
| OQ-1 | ~~F2 相位事件名与 MP/AP 重置时点~~ | ~~F2~~ | **已关闭（v1.0.1）**：对齐 `combat_phase_started`（F2 §3.3），语义一致零冲突 |
| OQ-2 | 光环 modifiers 的 stat 枚举最终集合（threat/actionPriority/moveMp 初版）与合成上限 | C5/C8 | C5 GDD（序列 #5） |
| OQ-3 | 戍卒小队减员战力曲线 `squadHpPowerCurve` 形态 | C5/平衡轮 | C5 GDD |
| OQ-4 | 督队赏格数值与「高价值」的 C8 反向权重 | C6/C8 | C6/C8 GDD（序列 #6/#7） |
| OQ-5 | 攻方跨波存活单位的补给/增强（C2-E11 现状=裸保留） | C9/平衡轮 | C9 GDD（序列 #8） |
| OQ-6 | 近战可及范围 `meleeReach` 初值（同格/四邻=1 的工作假设）与远程射击距离模型 | C5 | C5 GDD（序列 #5） |

---

## 11. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0-draft | 2026-09-21 | 首版：五兵种契约/双资源行动经济（锁足裁定）/冲车不占格裁定（关闭 F1 OQ-3、C1 OQ-1/2）/督队 AuraStrategy 可替换框架（用户扩展性约束兑现）/UnitStatsQuery 关闭 C1 §6.2 ⚠ 行；F2 相位时点假设入 OQ-1 |
| v1.0.1-draft | 2026-09-21 | F2 对齐回填（主理人验收后）：§2.1 事件名对齐 `combat_phase_started`（F2 §3.3 B→C 迁移事件），OQ-1 关闭；§3.6 UnitStatsQuery 增补 speed/actionDone/controlMode/setActionDone 四方法，关闭 F2 §6.2「⚠ 待 C2 定签名」与 F2 OQ-1；Unit 实体增补 controlMode 字段（F2 槽路由消费面） |
| v1.1.0-draft | 2026-09-21 | C3 交叉互审对表（本人审 C3 的同步回填）：①§2.4 修正「滚木投放读戍卒 AP」笔误→设施操作与单位 AP 经济完全解耦（与 C3 §2.5 自由指令口径一致）；②新增 §2.4.1 攻击与目标——覆盖「攻击设施」分支（C3-E5 对表，target=FacilityId 资格判定在 C2、伤害入口 C5），并成文互认「光环只作用单位、设施不受光环」（互审重点②）；③新增 §2.4.2+§3.6 增补 isAlive/aliveDefendersIn/unitAt 三原语（C3 §3.4 挂账的存活查询签名，crewAlive 语义组装权留 C3）；④反向发现并已修复 F1 INV1 容量计入矛盾（F1 v1.3.2，设施不计入单位容量预算） |
| v1.1.1-draft | 2026-09-21 | 003 门内自改（设计侧走查移交，主理人批准）：①D-2 header 上游依据版本升引 F1 v1.3→v1.4.2、C1 v1.0.1→v1.0.4（引用内容零冲突，纯版本号对齐）；②D-3 §7.3「F2（v1.0 已落盘）」顶格孤行窜表修复——原行无表头可挂致 markdown 断表，转同构列表项（与 C1 行格式一致） |
| v1.1.2-draft | 2026-09-21 | **GW-P2-008 互审合流批（主理人授权，design-strategist-2 执行）**：X-1 采纳——§2.1 表下增「组合态注记」一行（`DEPLOYED∧OFFBOARD`=已购未上场，C7 撤回预备队零费再部署，不入行动序/C8 计划域；以 C6 charge 是否发生划「已购/未购」界；「复用 WITHDRAWN」经主理人终裁否决）；UNDEFINED 行加防混半句；§6.2「层位部署校验」行补 C7 v1.0 五闸履行注记。C2 结构零改动（纯注记行，无新枚举无新迁移） |
