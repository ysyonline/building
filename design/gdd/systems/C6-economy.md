# C6 粮饷经济系统 · GDD

> **状态**：v1.0.3-draft（2026-09-21）｜ GW-P2-006 ｜ GDD 撰写序列 #7a
> **产出**：文策渊（design-strategist）
> **上游依据**：`design/gdd/systems/F2-phase-scheduler.md` v1.0.3（§2.2-D②/D③ 结算窗口、§3.2 DPhaseLedger.incomeSettled 钩子、F2.7 援军顺延、E13 堆积、E14 终局数据包格式约定、§6.2 收入/援军钩子契约行、§3.3 battle_won/lost 载荷；v1.0.3=撰写期勘误 D③ 括注引用，零实质变更）｜ `design/gdd/systems/C2-units.md` v1.1.1（§2.4 双资源正交口径、§2.7 死亡事件与抚恤挂点、§2.6 督队赏格字段归属、§6.2 eliminate 事件契约、§10 OQ-4）｜ `design/gdd/systems/C3-defense-facilities.md` v1.0.3（§2.6 修理仅 A 相位/费用归 C6/repair 接口语义/DESTROYED 重建、E5 设施受击面）｜ `design/gdd/systems/C5-combat-resolution.md` v1.1.1（E13 killed 单点事件/C5.7 结算序）｜ `design/gdd/systems/C8-xiongnu-ai.md` v1.0（§9 七项转派走查）｜ 概念稿定稿 v1.0（§5 单一资源三源口径、P4 经济压力设计意图）｜ `design/systems-breakdown.md` v1.0（§1.2 C6 职责、§2.2 链 B、§4 C6=数值载体、§6.2 督队裁定）
> **范围红线**：本文只裁 C6——单一资源「粮饷」的资金模型：收入三源（屯田/击杀缴获/烽燧补给线）的结算时点与入账序、缴获数值基准、守方援军时刻表的数据契约、支出侧费用查询/扣费契约（供 C7 消费）、终局 BattleEndReport 格式（F2-E14 数据包的 C6 侧、X2 交割面）。**不写**建造/修理/部署的指令校验与流程（C7）、相位窗口与 D 相位时序权威（F2）、killed 事件的产生与伤害结算（C2/C5）、敌军波次构成与入场时刻表（C9）、继承与关间结转规则（X2）、任何数值定值（F3 economy.json 表宿主）。
> **对齐状态**：与 F2 v1.0.3 / C3 v1.0.3 / C2 v1.1.1 / **C5 v1.2** / C8 v1.0 / **C7 v1.0.1** 逐条对表零冲突（§7.3 逐项列）；C2 OQ-4（督队赏格数值）**半销账**——键位本文裁定挂 economy.json，数值定值留灰盒；C8 §9 七项转派走查无一与 C6 交叉（零承接声明，§7.3）；F2 §6.2「收入/援军钩子」行本文落签名闭合。**C7 互审双向闭环（GW-P2-008 合流）**：§9.1 交割面经 C7 消费回执＋C6 侧走查双向确认（C7 §9.1 零异议回执属实，走查详情见 §7.3-C7 行）；OQ-3/OQ-4 经 C7 v1.0 终裁销账（§10）。**X2 联裁回执（GW-P2-013a）**：OQ-2 treasuryCarryRule 终裁 B 案已销账、重募费用键 MVP 零新键已销账、BattleEndReport v1.1 追加字段已回填注记（§3.3，定义权 X2 v1.0 §2.2）。

---

## 0. 八节导航

1. [概述](#1-概述) ｜ 2. [机制](#2-机制) ｜ 3. [数据](#3-数据) ｜ 4. [公式](#4-公式) ｜ 5. [边缘情况](#5-边缘情况) ｜ 6. [UI 接口](#6-ui-接口) ｜ 7. [依赖](#7-依赖) ｜ 8. [验收标准](#8-验收标准) ｜ 附 [§9 前置契约与承接清单（→C7 交割面单列）] ／ [§10 开放问题] ／ [§11 变更记录]

---

## 1. 概述

### 1.1 职责定义

C6 是战局的**账房**：持有唯一资源「粮饷」的权威余额，裁定收入三源（屯田/击杀缴获/烽燧补给线）的结算时点与入账顺序，向消费侧（C7 建造/修理/部署）提供费用报价与原子扣费契约，持有守方援军到岗时刻表（F2 D③ 的数据源），并在终局时冻结战局账本产出 BattleEndReport（F2-E14 数据包的 C6 侧格式）。C6 **是账本的记账员而非策略的决策者**：买什么、修什么、何时部署是玩家经 C7 的决策；C6 只保证「每一文钱从哪来、到哪去、何时入账」有唯一确定答案。

一句话：**把「粮饷」变成一本可重放、可审计、无随机数的账。**

### 1.2 设计目标与支柱挂钩

| 支柱/定稿项 | C6 落点 |
|---|---|
| P4「濒危险胜」 | 经济压力是「最后一轮极限调度」的资源面：基础收入（屯田+补给）刻意压低、缴获浮动项给劣势局「杀敌回血」翻盘通道——压力来自「想建的总比买得起的多」，而非「穷死死局」（破产裁定 G 的设计依据） |
| P1「一墙之隔，两种战争」 | 经济完全不对称：守方独占粮饷收支；匈奴的「资源」是波次兵力（C9 消耗品），无经济系统——攻方烧人不烧钱 |
| P3「每段城墙都有故事」 | 收入三源的叙事包装（屯田/缴获/补给）在机制上 MVP 退化为两项固定收入+缴获浮动，但三源分项在 P4 飘字中保留叙事可读（§6.1），Alpha 恢复格/节点建模时文案零改动 |
| 决策⑥ 引擎无关 | 结算为纯 TS 账本运算：输入（turn，killed 事件流）→ 输出（IncomeReport/BattleEndReport），零 Three.js 依赖 |
| MVS 确定性纪律 | **C6 全程零随机**（零 F4 消费，静态扫描断言 INV-C6-5）：三源数值全为查表固定值，同（存档态，killed 事件流）→ 余额曲线逐字节重放——经济是确定性重放的安全岛 |

### 1.3 非目标（Non-goals）

- ❌ 建造/修理/部署的指令校验、撤销、建造流程 → C7（本文只供报价/扣费契约，§9.1 交割面单列）。
- ❌ D②/D③/D④ 相位时序权威 → F2（C6 只被调用，不调度相位）。
- ❌ killed 事件的产生、伤害数值、死亡连锁 → C2/C5（C6 只订阅 eliminate 事件记账）。
- ❌ 敌军波次构成与入场时刻表 → C9（守方援军时刻表才归 C6，§2.6 分界）。
- ❌ 关间结转/重募/继承规则 → X2（本文只交割 BattleEndReport 数值与键位）。
- ❌ 第二资源、补给节点网络、屯田格控制 → Alpha（仅留表结构与枚举扩展位，不展开机制，§2.5）。
- ❌ 任何数值定值 → F3 `economy.json`（§3.5 键清单，正文零硬编码）。

### 1.4 关键裁定速览（TL;DR）

| # | 裁定 | 一句话 |
|---|---|---|
| A | 单一资源红线 | 全游戏唯一战略资源=粮饷；MP×AP 是**行动**资源（C2 域），与粮饷正交、不互换、不可互购——两套账永不合流（措辞纪律 §2.1） |
| B | D② 结算序 | **屯田 → 补给线 → 缴获**，固定子序；F2 §2.2-D② 的三源列举为职责枚举非结算序，子序由本文裁定（加法结算总和对序不敏感，固定序纯为重放逐字节一致服务）；D② 是收入入账唯一窗口，`incomeSettled` 幂等防重入 |
| C | 缴获双段式 | 击杀时点（C 相位 killed 事件）只做**流水登记**（append-only，余额不变），D② 统一汇总入账——C 相位不能花钱，实时改余额无玩法意义且破坏「A 相位余额=本回合预算」的简单模型 |
| D | 缴获按兵种固定值 | MVP 赏格=per-template 固定值（F3 `loot.perTemplate.*`），不按造价比例——玩家可学习（「督队值大价钱」）、避免缴获曲线与造价键联动共振、可独立调节「先杀督队」引导强度（C2 OQ-4 承接） |
| E | 补给线最简化 | MVP 补给线=「每回合固定收入 × 烽燧存活实判系数」；烽燧唯一（F1 V4）→ 全程恒全额、仅终局回合实判可为 0；Alpha 烽火台=补给节点，节点损失断收入经 `supply.nodes[]` 结构位恢复（§2.5） |
| F | 屯田最简化 | MVP 屯田=每回合固定基础收入（**无屯田格**——走廊式关卡无农田落点，F1 格类型不扩）；Alpha 战役地图恢复「屯田格」建模（F1 meta 标签位预留）——与 E 同构的第二个「退化为固定收入」简化 |
| G | 破产=禁止下单 | 余额下限 0；费用不足 → charge DECLINED（C7 前置询价+charge 二次校验双闸）；**无欠饷、无负余额、无哗变**——欠饷惩罚是「劣势滚雪球」，与 P4 反向；屯田保底 >0 保证软约束不死局 |
| H | 援军免费 | MVP 援军到岗（D③）**零费用**——援军是补给线叙事的一部分，「有钱才配要救兵」体验怪异且引入 D③ 资金校验复杂度（没钱→援军不来？顺延？）；X7（Beta）援军令调度玩法再评估 |
| I | BattleEndReport v1 | 终局数据包 C6 侧格式（§3.3）：账本四项累计+阵亡统计+余额终值，随 `battle_won/lost` payload.stats 透传（F2 §3.3）；X2 消费面标注回填位 |

---

## 2. 机制

### 2.1 资金模型总览（收支全景与时序）

```
turn N 的 C 相位：敌单位死亡 → C2 eliminate 事件 → C6 缴获流水登记（append，余额不变）
turn N 的 D 相位（F2 调度，C6 被调）：
  D② settleIncome(turn)：屯田 + 补给线 + 缴获流水汇总 → 余额入账 → income_settled 事件
  D③ 援军到岗：F2 查 dueReinforcements(turn) ＋ 顺延队列首位重试 → F1 placeUnit（C6 不调 F1）
  D④ 胜负判定：若终局 → F2 调 finalizeReport() 冻结 BattleEndReport → battle_won/lost
turn N+1 的 A 相位：C7 指令 → quote() 询价 → charge() 原子扣费（余额=上一 D② 结算后的实时值）
```

- **预算周期语义**：A 相位可用余额=上一 D② 结算后的实时值（A 相内无收入源，恒定基准）。玩家决策的预算感=「上回合赚的+结余」，与建设不限时（决策⑤）配合——思考不受限时，钱包受限。
- **单一资源措辞纪律**（对齐 C2 §2.4 正交口径）：粮饷只回答「能不能买」；MP×AP 只回答「能不能做」。二者无兑换、无转化、无联合支付——「用粮饷买行动」类设计一律视为 Alpha 另议事项（§3.5 表结构位）。
- **无随机声明**：C6 不消费 F4（三源全部查表定值）；缴获数额由 templateId 决定、与伤害骰无关——「杀一个骑射手值多少」是公开常量，P4 可标注（P4 透明对赌的经济版）。

### 2.2 收入三源（D② 唯一入账窗口）

| 源 | MVP 机制形态 | 结算输入 | F3 键 |
|---|---|---|---|
| 屯田 farm | 每回合固定基础收入（裁定 F；叙事包装保留） | turn（无世界依赖） | `income.farmBasePerTurn` |
| 补给线 supply | 每回合固定收入 × 烽燧存活实判系数（裁定 E；系数 ∈ {0,1}，D② 执行瞬间查 F1 只读） | beacon 存活 | `income.supplyBasePerTurn` |
| 击杀缴获 loot | 本回合 LootEntry 流水汇总（裁定 C 双段式） | battleLoot 流水 | `loot.perTemplate.<templateId>` |

- **入账序固定：farm → supply → loot**。屯田/补给是世界状态的静态函数、缴获是战斗结果（动态项），「先静态后动态」调试友好（断余额异常时先排除固定项）；固定序是确定性硬约束而非数值需求。
- **incomeSettled 幂等**（协同 F2 DPhaseLedger 标记）：同回合重复 `settleIncome` 拒绝（`turn ≤ turnLastSettled` 即拒绝）——重放窗口与调试重复触发的双保险（C6.5）。
- **判负回合照常结算**（F2 裁定「D①-D③ 不跳过」）：烽燧毁于 C 相位时，D② 照常走，supply 按结算时点实判=0，farm/loot 照常入账（§5-E2）——账本完整性是 X2/X5 的地基。

### 2.3 支出场景枚举（消费侧只声明契约）

| # | 场景 | 相位窗口 | 调用方 | 费用模型 | F3 键 |
|---|---|---|---|---|---|
| 1 | 建造设施（床弩/礌石） | A | C7 → charge | 按设施类型一口价 | `cost.build.bedCrossbow` / `cost.build.rollingStock` |
| 2 | 修理设施 | A | C7 → charge | 按 Δhp 线性（C6.3） | `cost.repair.perHp` |
| 3 | 部署戍卒 | A | C7 → charge | 按小队一口价 | `cost.deploy.garrisonSquad` |
| 4 | 修墙（墙体耐久） | A | C7 → charge | 按 Δhp 线性（模型同 #2；修墙指令细节归 C7，OQ-3） | `cost.wallRepair.perHp`（键位预留） |
| 5 | 援军调度 | —（D③ 到岗） | F2 调度 | **MVP 零费用**（裁定 H）；X7 扩展位 | —（无键） |

- **扣费原子性**：charge 成功=余额精确减报价＋发 `treasury_changed`；余额不足/窗口非法 → DECLINED/ILLEGAL_WINDOW 且余额零变化。无预支、无冻结、无部分扣费。
- **无退款通道**（已付费用不可撤销退回；拆除/重置的世界层面语义归 C7——拆除零退费、重置零费）：MVP 无撤收回退（建造/部署不可撤销）——决策⑤不限时给足检查时间，错手即代价是极限调度的一部分；撤收退费已终裁（§10 OQ-4 销账，C7 v1.0 三条纠错梯度）。
- **校验分工**：canAfford 前置询（C7 消费，UI 灰显）＋ charge 二次校验（防时序差，C2-E7 同纪律双闸）——指令合法性与世界校验归 C7（落点/耐久/容量），本文只保证 charge 自身的窗口与原子性（§9.1 分工边界）。
- **修理 vs 重建的经济梯度**：DESTROYED 不可修（C3.7），重建=BUILD 全价——「保护设施比重建便宜」天然成立，是克制网「器械必须有人护」（C3 §2.1 人力约束/E5 威胁面）的经济面收口。

### 2.4 缴获登记链（killed 订阅与双段式）

```
C 相位：C2 eliminate 事件 {unitId, killer?, cause}（唯一死亡入口，C2 §2.7）
  → C6 过滤：faction(dead)=ATTACKER 才登记（守方阵亡零缴获）
  → 查表 loot.perTemplate[templateId] → LootEntry append（killSeq=本回合流水序）
  → loot_registered 事件（P4 飘字/战报消费）
D②：流水按 killSeq 序汇总 → 入余额 → 流水清零、累计入 battleTotals.lootTotal
```

- **时序与死亡连锁**（C5-E13 口径沿用）：killed 事件单点发出、C6/C9/P1 各自订阅互不组合；连锁深度 1（C5 §2.3）意味着一击多杀时 killSeq 按结算序（走廊近→远，C5.7）append——流水序确定，重放一致（§5-E1）。
- **killer 字段不读**：守军是单一经济主体，缴获不区分击杀者（MVP 无子账户）；killer 仅由战报叙事消费。
- **守方戍卒阵亡的 C6 侧口径**：**关内零扣费零抚恤**——痛感=战力永久损失本身（C2 §2.7「不可复活」），再扣钱是双重惩罚且无替代兵源可买（穷上加穷与 P4 反向）；C2 §2.7「抚恤/重募成本归 C6/X2」在本文的落点=**关间域**：garrisonCasualties 进 BattleEndReport 交割，重募费用键是否设立随 X2 GDD 裁定（§10 OQ-2）。

### 2.5 两个固定收入简化的显式声明（Alpha 恢复位）

| MVP 形态 | 简化了什么 | Alpha 恢复位 | 恢复条件 |
|---|---|---|---|
| 补给线=固定收入×烽燧实判系数 | 节点网络、断线截断、护送博弈 | `supply.nodes[]` 结构位（F3）：每节点 {nodeId, alive, perTurn}，总额=Σ存活节点 | 烽火台设施（C3 §2.7 Alpha 位）落地=C12 视野链载体同步 |
| 屯田=固定基础收入 | 屯田格控制、占领惩罚 | F1 格 meta 标签位（PARAPET 标签同机制）＋ `farm.cells` 计价；控制数×单价 | 战役地图/多段落引入（X1 扩展）——单段走廊无农田落点 |

- 两项简化共用同一原则：**MVP 的经济压力全部由「固定项小、缴获浮动、支出场景多」制造，不靠地理化的收入点**——地理化收入=新占领/防守目标，是玩法结构变更而非数值调参，不塞进 6 周 MVP。
- 叙事不降级：P4 飘字仍分三项显示（§6.1），「屯田/补给」作为世界观词汇在文案层完好；机制层两个固定项数值上等价（平衡轮可并单键），双键保留为 Alpha 拆回留位。

### 2.6 守方援军时刻表（C6 数据契约，F2 调度）

- **职责分界**：ReinforceEntry 结构与时刻表数据归 C6（宿主 economy.json per-level 段）；到岗调度、F1 placeUnit 调用、顺延队列（pendingReinforcements）归 F2——F2 §3.4 读写边界已锁「F2 写/C6 提供」，本文落签名。守方援军≠敌军波次（C9）：F2-E13「C6/C9 表」按此拆分归属，零冲突。
- **落点**：ReinforceEntry.dropZoneRef 引用关卡部署区（V12 可达性校验覆盖的区域），F2 据此调 F1 placeUnit；C6 不落点、不调 F1。
- **堆积兜底**（F2-E13 联动）：时刻表只读、顺延不回写表；条目零丢失承诺（§5-E9）；关卡表侧义务=援军总量与部署区容量自洽（关卡数据评审项）。
- MVP 援军内容恒 garrison_squad（守方唯一兵种），免费到岗（裁定 H）。

---

## 3. 数据

> 引擎无关 TS。C6 持久状态=TreasuryState（F5 存档的 C6 分部）；短期状态=本回合账本（D② 清零）。零随机、零 Three.js、结算为常数级账本运算（无性能预算项）。

### 3.1 账本状态（TreasuryState）

```ts
interface TreasuryState {                 // F5 存档 C6 分部全量
  treasury: number;                       // 余额，不变量 ≥ 0（INV-C6-1）
  turnLastSettled: number;                // 幂等锚：最近已结算回合（初值 0）
  battleTotals: { farmTotal: number; supplyTotal: number; lootTotal: number; spentTotal: number };
  turnLedger: TurnLedger;                 // 本回合明细（D② 入账时清零重开）
}
interface TurnLedger {
  lootEntries: LootEntry[];               // 本回合缴获流水（append-only；D② 汇总后清空）
}
interface LootEntry {
  killSeq: number;                        // 本回合流水序（=killed 事件到达序，确定性）
  unitId: UnitId;
  templateId: UnitTemplateId;
  amount: number;                         // 登记时点查表冻结（防平衡期热改表回溯改账）
}
```

- **存档点天然覆盖**：F2 S0（INIT→A）与 S1（D→A）都位于 D② 之后——存档态流水恒空（INV-C6-2），存档只携 treasury 数字与累计项，读档一致性极简（§5-E4）。
- **读档校验**（脏档防线，C2-E12 同纪律）：`treasury ≥ 0 ∧ turnLastSettled = TurnQuery.current().turn − 1`（A 相位读档态下），违者拒读。

### 3.2 援军条目（ReinforceEntry，F2 顺延队列的元素结构）

```ts
interface ReinforceEntry {
  entryId: string;
  dueTurn: number;                        // 原定到岗回合（表数据只读，顺延不回写）
  templateId: UnitTemplateId;             // MVP 恒 'garrison_squad'
  dropZoneRef: string;                    // 关卡部署区引用（V12 校验可达）
  source: 'C6_REINFORCE';                 // 枚举位（敌军波次归 C9 域，不经此结构）
}
```

### 3.3 终局数据包（BattleEndReport v1，F2-E14 的 C6 侧格式）

```ts
interface BattleEndReport {               // 随 battle_won/lost payload.stats 透传（F2 §3.3）
  levelId: string;
  outcome: 'WIN' | 'LOSE';
  reason: string;                         // F2 填（'BEACON_FALLEN' 等），C6 透传
  endTurn: number;
  treasuryFinal: number;                  // 关末余额（X2 结转基准——结转规则归 X2 裁）
  stats: {                                // battleTotals 终值
    farmTotal: number; supplyTotal: number; lootTotal: number; spentTotal: number;
    attackerKilled: number; defenderLost: number;    // P4 战报 / X1 结算画面消费
  };
  garrisonCasualties: Array<{ templateId: UnitTemplateId; count: number }>;  // X2 重募核算输入
  // —— v1.1 追加字段（X2 v1.0 §2.2 回填定义，追加位置文末，全部可空/恒 null；v1 既有字段零改动）：
  // survivorRoster: SurvivorEntry[]  // 幸存者名单（LOSE 恒 []）；定义权 X2 §2.2
  // facilityCarry: null              // MVP 恒 null（裁定 B 设施不携带）；Alpha 声望建筑占位
  // wallCarry: null                  // MVP 恒 null（裁定 C 墙体不携带）；Alpha 城墙工事度占位
  // treasuryCarry: null              // MVP 恒 null（裁定 D B 案）；Alpha C 案占位（OQ-2 销账联动）
  // survivorRoster / facilityCarry 等继承细目：X2 v1.0 §2.2 已正式回填定义（v1.1 追加式，不改已有字段语义）
}
```

- **冻结纪律**：finalizeReport 一次性（终态冻结），二次调用拒绝（BE-8）；报告数字全部来自账本累计、无现场重算——「结算画面撒谎」在结构上不可能。

### 3.4 对外接口（费用消费面＋结算钩子）

```ts
type PurchaseItem =
  | { kind: 'BUILD_FACILITY'; facilityKind: 'BED_CROSSBOW' | 'ROLLING_STOCK' }
  | { kind: 'REPAIR_FACILITY'; facilityId: FacilityId; deltaHp: number }
  | { kind: 'DEPLOY_UNIT'; templateId: 'garrison_squad' }
  | { kind: 'WALL_REPAIR'; deltaHp: number };        // 键位预留（修墙指令面归 C7，OQ-3）

interface EconomyQuery {                  // 任何人可读（P3/P4/C7/C10 报价显示）
  treasury(): number;
  quote(item: PurchaseItem): number;      // 查表报价；表内无键=不可购买（加载期校验兜底）
  canAfford(item: PurchaseItem): boolean;
}
interface EconomyCommand {                // 仅 C7 经此消费；仅 A 相位窗口合法
  charge(item: PurchaseItem):
    | { ok: true; charged: number; treasuryAfter: number }
    | { ok: false; reason: 'INSUFFICIENT' | 'ILLEGAL_WINDOW' };
}
interface EconomySettlementApi {          // 仅 F2 在 D 相位窗口调用（§9.2 契约 2）
  settleIncome(turn: number): IncomeReport;                   // D②；幂等，重入拒绝
  dueReinforcements(turn: number): ReinforceEntry[];          // D③ 新到期条目（顺延重试队列权威在 F2）
  finalizeReport(outcome: 'WIN' | 'LOSE', reason: string): BattleEndReport;  // D④ 判定后一次性
}
interface IncomeReport {
  turn: number; farm: number; supply: number; loot: number; total: number; treasuryAfter: number;
}
```

### 3.5 F3 `economy.json` 键清单（数值载体，本文零硬编码；表改动需过平衡评审）

| 键 | 含义 | MVP 工作假设 ⚠ |
|---|---|---|
| `perLevel.<id>.initialTreasury` | 关卡初始余额 | 待灰盒 |
| `income.farmBasePerTurn` | 屯田固定收入/回合 | 待灰盒（**>0 红线**，破产软约束保底） |
| `income.supplyBasePerTurn` | 补给线固定收入/回合 | 待灰盒 |
| `loot.perTemplate.ladderInfantry` | 云梯步兵赏格 | 待灰盒 |
| `loot.perTemplate.ramChariot` | 冲车赏格 | 待灰盒（方向建议：最高档之一——最难杀） |
| `loot.perTemplate.horseArcher` | 骑射手赏格 | 待灰盒 |
| `loot.perTemplate.warlordEscort` | 督队赏格（**C2 OQ-4 承接键位**） | 待灰盒（方向建议：显著高于步兵档——引导「先杀督队」） |
| `cost.build.bedCrossbow` | 床弩造价 | 待灰盒 |
| `cost.build.rollingStock` | 礌石造价 | 待灰盒 |
| `cost.repair.perHp` | 设施修理单价（/点） | 待灰盒 |
| `cost.deploy.garrisonSquad` | 戍卒小队部署价 | 待灰盒 |
| `cost.wallRepair.perHp` | 修墙单价（键位预留，OQ-3） | 待灰盒 |
| `cost.dismantleRefundRatio` | 拆除退款比例（Alpha 结构位；MVP 不设=恒零） | 待灰盒/Alpha——**启用即重开「无退款通道」评审，与 C7 OQ-4 互见** |
| `reinforcementSchedule`（per-level 段） | 守方援军时刻表（ReinforceEntry[]） | 关卡数据 |
| `treasuryCarryRule` | 关间结转规则枚举位（X2 域，MVP 不消费） | X2 裁定（OQ-2） |
| `supply.nodes[]` / `farm.cells` | Alpha 结构位（MVP 空置/无消费者） | Alpha（OQ-5） |

> **赏格与压力的方向红线**（非定值，灰盒校准的约束条件）：①`farmBase + supplyBase` < 维持防线的基础开销——缺口由缴获补，这是「压力成立」的数学前提；②缴获总额曲线须构成「劣势局杀敌回血、优势局锦上添花」的双向闭环，防「穷者愈穷死局」；③督队赏格 > 云梯步兵赏格（「先杀督队」引导的最低保障）。

### 3.6 领域事件（走全局事件流；全部由确定性状态变化派生，可重放）

| 事件 | 载荷 | 主要订阅方 |
|---|---|---|
| `loot_registered` | `{killSeq, unitId, templateId, amount}` | P4（击杀飘字带缴获数）、P1、X5 |
| `income_settled` | `IncomeReport` | P4（D② 三源分项飘字）、X5、F5 对拍 |
| `treasury_changed` | `{delta, reason: 'CHARGE', treasuryAfter}` | P4（余额动画）、X5 |

### 3.7 读写边界（谁写谁读）

| 数据 | 写入方 | 读取方 |
|---|---|---|
| treasury / battleTotals / turnLedger | 仅 C6（charge 与 settleIncome 两入口） | 全部（经 EconomyQuery 只读） |
| LootEntry 流水 | C6（killed 订阅回调） | C6 自身（D② 消费） |
| ReinforceEntry / 时刻表 | 关卡表（F3 加载，只读） | F2（D③ 调度）、P4（援军预告，可选） |
| pendingReinforcements（顺延队列） | F2（D③ 写） | F2 自身（C6 不持有，结构归本文 §3.2） |
| beacon 存活 | F1/C5（伤害权威） | C6（D② supply 实判只读） |

---

## 4. 公式

> 统一格式：编号 ｜ 名称 ｜ 变量与单位 ｜ 表达式 ｜ 消费方。数值基准一律标「F3 表宿主」。

- `C6.1 ｜ D② 收入入账：treasury′ = treasury + farm + supply + loot ｜ farm = farmBasePerTurn；supply = supplyBasePerTurn × beaconAlive（实判 0/1）；loot = Σ lootEntries.amount（按 killSeq 序汇总）｜ 消费方：F2 D②/P4`
- `C6.2 ｜ 缴获数额：amount(dead) = loot.perTemplate[templateId(dead)] ｜ faction(dead)=ATTACKER 才登记；与 killer/伤害骰无关 ｜ 消费方：C6/P4`
- `C6.3 ｜ 修理报价：quote(REPAIR_FACILITY) = ceil(deltaHp × cost.repair.perHp) ｜ deltaHp ∈ (0, maxHp − currentHp]（耐久上限校验在 C3.7/C7，本文只报价不校验世界合法性）；WALL_REPAIR 同型、独立单价键 ｜ 消费方：C7`
- `C6.4 ｜ 扣费：treasury′ = treasury − charged ⇔ ok=true ｜ charged = quote(item)；ok=false 时 treasury 零变化 ｜ 不变量：treasury′ ≥ 0 ｜ 消费方：C7/P4`
- `C6.5 ｜ 幂等：settleIncome(turn) 合法 ⇔ turn > turnLastSettled ｜ 成功后 turnLastSettled ← turn ｜ 消费方：F2/X5（重放窗口防御）`
- `C6.6 ｜ 结算确定性：IncomeReport(turn) = f(TreasuryState, killed 事件流前缀, F3 表) 且 f 无随机 ⇒ 同输入逐字节同报告 ｜ C6 零 F4 消费 ｜ 消费方：X5/F5`
- `C6.7 ｜ 结转占位：treasury 关间结转规则归 X2（treasuryCarryRule 枚举位），本文不裁 ｜ 消费方：X2`

### 4.1 不变量（可单测）

- INV-C6-1：`treasury ≥ 0` 恒成立（任意指令序列 fuzz）。
- INV-C6-2：`turnLedger.lootEntries` 只增不改删（append-only），D② 消费后即清空——存档态流水恒空。
- INV-C6-3：charge 仅在 `TurnQuery.current().phase = 'A'` 成功（窗口硬闸，对齐 F2-E10 校验纪律）。
- INV-C6-4：`Σ battleTotals.lootTotal = Σ 历史已入账 loot`（累计与流水对账恒等——审计线）。
- INV-C6-5：C6 源码零 `Math.random`、零 F4 游标调用（静态扫描断言，确定性红线）。

---

## 5. 边缘情况

> 裁定者=本文；窗口归 F2、耐久校验归 C3/C7、事件产生归 C2/C5。格式：编号｜场景｜裁定｜消费方。

### A. 收入侧

- **C6-E1｜缴获与同回合死亡结算时序（C5 死亡连锁深度 1 联动）**：killed 事件到达序=流水序（killSeq）；一次走廊穿杀多目标时按 C5.7 轴向序逐一 append；连锁（深度 1，只清 buff 不递归杀人）不产生额外流水项。D② 按序汇总入账——重放断言=IncomeReport 逐字节一致（BE-1）。
- **C6-E2｜烽燧毁于 C 相位当回合的 D②**：照常结算（F2 裁定 D①-D③ 不跳过）；supply 按结算时点实判=0（beacon 已毁），farm/loot 照常入账——数字进 BattleEndReport 但战局将终。规则真实性与重放一致性优先于「都输了还算账」的直觉（账本完整是 X2/X5 的地基）。
- **C6-E3｜屯田格被占领对收入的影响**：场景不存在（裁定 F——MVP 屯田无格）；Alpha 屯田格模型的占领惩罚走 `farm.cells` 恢复位，届时另裁。补给线侧同理：单燧失守即终局（F2 §2.5），「失守但战局继续」的收入惩罚属 Alpha 多燧结构（X1 战役账本），本文无消费者。
- **C6-E4｜读档后收入重放一致性**：存档点（S0/S1）恒在 D② 后（F2 裁定 F）→存档态流水空、幂等锚就位；读档→后续回合同 killed 事件流→IncomeReport 逐字节一致；C6 零随机（INV-C6-5）使经济成为重放安全岛。脏档（treasury<0／幂等锚错位）拒读（§3.1）。

### B. 支出侧

- **C6-E5｜修理费与 DESTROYED 重建**：DESTROYED 拒修（C3.7），费用侧自然封闭（C7 不会对 DESTROYED 下修理单；charge 不复检耐久——报价与扣费只管钱，不管世界合法性，分工见 §9.1）；重建=BUILD 全价，「修理便宜、重建贵」经济梯度成立。「同回合先修后毁」不可能：修理仅 A、伤害仅 C（F2-E10 窗口互斥），无跨窗口退款场景。
- **C6-E6｜连续指令的资金挤兑**：玩家 A 相位连下三单，第三单时余额不足 → charge DECLINED，前两单不回滚（各自原子）；C7 侧逐单校验失败反馈（UI 灰显恢复）。无预支/冻结机制——「下单那一刻付得起」是唯一条件。
- **C6-E7｜非 A 相位扣费请求**：ILLEGAL_WINDOW 拒绝（INV-C6-3）；含 C10/C8 注入路径——托管不做购买决策（F2 §9 契约 3：A 相位不向 C10 开放），经济指令面与托管面天然隔离。
- **C6-E8｜负 deltaHp／非法 PurchaseItem 注入**：deltaHp ≤ 0 的修理报价直接拒绝（防逆向刷钱——修理恒正支出、无退款通道=无刷钱路径，审计线 INV-C6-4 兜底）；表内无键的 PurchaseItem 在加载期校验拒绝启动（C2-E13「禁静默降级」同纪律）。

### C. 援军与终局

- **C6-E9｜援军顺延堆积（F2-E13 联动）**：落点满 → F1 placeUnit 拒绝 → F2 顺延队列首位重试，可跨多回合累积；条目零丢失（时刻表只读不改）；C6 侧义务=关卡表援军总量×落点容量自洽（关卡数据评审项）。极端堆积局（全图满员）援军迟到但不消失——「迟到」本身是战局恶化的自然反馈，无需额外机制。
- **C6-E10｜战败当回合已花的钱**：不退——spentTotal 照实进 BattleEndReport；「沉没成本可视化」是 X1 结算画面的叙事素材（P3/P4 支柱），不是退款理由。胜局同口径（赢回来的是烽燧，不是钱）。
- **C6-E11｜finalizeReport 与 X2 扩展**：报告结构 v1 字段冻结（本文），X2 GDD 动笔时以「追加字段」扩展、不改已有字段语义（追加式演化，F5 存档版本兼容同哲学）；survivorRoster 等继承细目标注为 X2 回填位。

---

## 6. UI 接口

### 6.1 C6 暴露给 UI 层的语义

| UI 元素 | 数据来源 | 语义 |
|---|---|---|
| 粮饷余额（P4 HUD 常驻） | `EconomyQuery.treasury()` ＋ treasury_changed | 数字直出；变动经事件动画；无上限显示 |
| D② 收入结算飘字 | `income_settled` | 三源分项「屯田 +12／补给 +20／缴获 +35」——三源叙事可读性（机制可合并，文案不合并，§2.5） |
| 击杀缴获飘字 | `loot_registered` | 击杀演出附带「缴获 +n」（数值与击杀地点同帧锚定，P1 演出消费） |
| 购买按钮可用态 | `canAfford`（C7 消费后反映到 UI） | 不足灰显＋差额提示（「还差 30」）——报价透明，玩家可规划 |
| 援军预告（可选） | ReinforceEntry 时刻表只读 | 「下回合援军 ×1」HUD 提示（数据已有，展示归 P4 排期） |
| 终局结算画面账本 | BattleEndReport.stats | 「本关屯田 X／补给 Y／缴获 Z／支出 W／阵亡 N 小队」——X1 画面直接读 |

### 6.2 接口契约（对外承诺，下游 GDD 引用）

| 契约 | 提供方→消费方 | 内容 | 状态 |
|---|---|---|---|
| 结算钩子 | C6→F2 | EconomySettlementApi 三方法（§3.4）——**闭合 F2 §6.2「收入/援军钩子」行（语义定→签名定）** | ✅ 本文裁定 |
| 事件订阅 | C2→C6 | eliminate 事件 `{unitId, killer?, cause}`——C2 §6.2 契约行的消费侧就位 | ✅ |
| 费用查询/扣费 | C6→C7 | EconomyQuery/EconomyCommand ＋ §3.5 费用键 ＋ A 相位窗口语义——**§9.1 交割面单列** | ✅ 本文裁定 |
| killed 时序口径 | C5→C6 | C5-E13 单点事件、订阅分权（C6 缴获双段式） | ✅ 沿用 |
| repair 接口语义 | C3→C6 | repair(facilityId, Δhp) 耐久校验在 C3/C7，费用侧经 charge（本文支出场景 #2） | ✅ 职责分界互认 |
| BattleEndReport | C6→F2/X2 | §3.3 v1 格式，随 battle_won/lost payload.stats 透传；X2 消费面回填标注 | ✅ 初版（回填位标定） |
| 督队赏格键位 | C6→C2/C8 | `loot.perTemplate.warlordEscort`——**C2 OQ-4 半销账**（键定值待灰盒）；C8 §2.5 leadBias 的经济面映射 | ✅ 键位定 |
| 确定性纪律 | C6→F5/X5 | 零 F4 消费＋幂等锚＋INV-C6 全系 | ✅ |

### 6.3 输入约束（传递 P3）

玩家不直接触碰 EconomyCommand（一律经 C7 指令面）；P3 的费用显示只读 EconomyQuery，**禁止本地缓存报价**（表热调时报价即变，缓存即撒谎）。C6 无玩家直接输入入口。

---

## 7. 依赖

### 7.1 上游依赖（C6 需要）

| 依赖 | 类型 | 说明 |
|---|---|---|
| F2 相位调度 | 窗口与调度 | D②/D③/D④ 调用窗口（EconomySettlementApi 消费方）；incomeSettled 幂等协同；S0/S1 存档点覆盖 C6 状态；E13/E14 边缘口径；「pendingReinforcements 归 F2 写」分界 |
| C2 单位 | 事件源 | eliminate 事件（缴获登记触发源）；「MP×AP 与粮饷正交」口径互认；templateId 查表键；阵营字段过滤 |
| C5 攻防结算 | 时序口径 | E13 killed 单点事件＋订阅分权；C5.7 结算序=流水序的确定性来源 |
| C3 设施 | 校验分界 | repair 耐久合法性校验在 C3/C7；DESTROYED 拒修；本文只管钱 |
| F3 数值表 | 数值宿主 | economy.json（§3.5 清单）——C6 为数值载体（systems-breakdown §4），表改动过平衡评审 |
| F1 地形 | 只读 | beacon 存活实判（D② supply 项）；deployZone 引用合法性由关卡校验 V12 保证 |
| F5 存档 | 序列化 | TreasuryState 全量（§3.1）；读档校验断言（脏档防线） |
| X1 战役流程 | 终局消费方 | BattleEndReport 接收（经 F2 事件透传）；结算画面账本显示 |

### 7.2 下游消费者（依赖 C6）

| 消费方 | 消费内容 | 对应 GDD |
|---|---|---|
| C7 建设部署 | §9.1 交割面（报价/扣费/费用键/窗口/分工边界） | 序列 #7b（并行） |
| P4 HUD | §6.1 全部语义 | — |
| P3 | canAfford 报价反馈（§6.3 约束） | — |
| X2 继承 | BattleEndReport（结转基准＋阵亡统计）——**v1.1 追加字段已回填（X2 v1.0 §2.2，见 §3.3 注记）**；OQ-2 treasuryCarryRule 终裁 B 案已销账（§10）；重募费用键 MVP 零新键（X2 §2.1-C3，§10） | 已落盘 X2 v1.0（序列 #9） |
| X5 模拟器 | 零随机重放承诺＋账本对拍锚（income_settled / treasury 曲线） | Alpha |
| C2/C8 | 督队赏格键位（OQ-4 承接） | 已落盘侧零改动 |

### 7.3 上游契约走查结论（零冲突声明）

| 文档 | 走查点 | 结论 |
|---|---|---|
| F2 v1.0.3 | D② 职责枚举「屯田+缴获+补给线」vs 本文结算序 farm→supply→loot | **零冲突**——F2 为职责枚举非序裁定，子序归本文（§2.2）；F2 结构零改动 |
| F2 v1.0.3 | E14「payload 由 C6/X2 格式约定」 | **零冲突**——本文 §3.3 履行 C6 半边；F2「只透传快照引用」口径不变 |
| F2 v1.0.3 | §3.4「pendingReinforcements：F2 写/C6 提供时刻表」 | **零冲突**——本文 §2.6/§3.2 照此分界落签名 |
| C3 v1.0.3 | 「修理…费用 C6」＋ repair 校验语义 | **零冲突**——费用在本文支出场景 #2，耐久校验留 C3/C7，职责分界互认 |
| C2 v1.1.1 | §2.4 双资源正交、§2.7 死亡事件/抚恤口径 | **零冲突**——措辞区分纪律（§2.1）＋关内零抚恤裁定（§2.4）；C2 文件零改动 |
| C5 v1.2 | E13/C5.6 killed 单点事件；§2.2 骑射仰射走廊（消费面：缴获按死亡事实记账，与弹道形态无关） | **零冲突**——双段式消费（§2.4），流水序=结算序 |
| C8 v1.0 | §9 七项转派挂账 | **零交叉**——逐项走查无一指向 C6，零承接（显式声明） |
| C7 v1.0.1 | §9.1 交割面消费（quote/charge 四类 PurchaseItem 组装/费用键/分工/窗口） | **零冲突**——GW-P2-008a/b 双向互审（C6 走查 C7：五项核对忠实、零私造键；C7 走查 C6：措辞建议两处已并入本文 v1.0.2）；OQ-3/OQ-4 经其终裁销账（§10） |
| F2 v1.0.2→v1.0.3（备注，已勘误） | §2.2-D③ 括注「§5-E6」 | F2 内部引用笔误（援军顺延应为 F2-E13）——已上报主理人核验，**F2 v1.0.3 勘误落盘**，本文上游引用同步升版 |

---

## 8. 验收标准

### 8.1 结构与数据验收（GDD 层）

- [ ] SC-1：单一资源模型、D② 固定结算序、缴获双段式、两个固定收入简化（含 Alpha 恢复位）、破产从简、援军免费六项裁定全部成文（§1.4/§2）。
- [ ] SC-2：全部数值挂 F3 economy.json 键（§3.5），正文零定值；「数值载体」纪律与方向红线注记在位。
- [ ] SC-3：与 F2 v1.0.3 / C3 v1.0.3 / C2 v1.1.1 / C5 v1.2 / C8 v1.0 / C7 v1.0.1 契约零冲突（§7.3 逐条）；F2 §6.2 收入/援军钩子行签名闭合。
- [ ] SC-4：§9.1 →C7 交割面齐备（API＋键清单＋窗口＋分工边界）。
- [ ] SC-5：BattleEndReport v1 定义完整，X2 回填位显式标注（F2-E14 消费闭环）。

### 8.2 行为验收（实现层，可自动化）

- [ ] BE-1：收入重放——同（存档态，killed 事件流，F3 表）→ IncomeReport/BattleEndReport 逐字节一致（C6.6）。
- [ ] BE-2：幂等——同回合重复 settleIncome 100% 拒绝且余额不变（C6.5）。
- [ ] BE-3：charge 窗口与原子性——非 A 相位 100% ILLEGAL_WINDOW；INSUFFICIENT 时余额零变化；成功时精确减报价（INV-C6-3/C6.4）。
- [ ] BE-4：余额不变量——随机指令 fuzz（购买/修理/结算混合序列 1 万次）`treasury ≥ 0` 恒成立（INV-C6-1）。
- [ ] BE-5：缴获流水——killed(ATTACKER) → append 序=事件序；守方阵亡/设施摧毁零流水；killSeq 连续无跳（INV-C6-2/4）。
- [ ] BE-6：援军顺延链——与 F2 BE-7 联测：落点满 → 顺延 → 首位重试 → 条目零丢失。
- [ ] BE-7：确定性红线静态扫描——C6 模块零 Math.random／零 F4 游标（INV-C6-5）。
- [ ] BE-8：finalizeReport 一次性——二次调用拒绝；报告累计与账本对账恒等（INV-C6-4）。

### 8.3 玩法判据（供 GW-P2-003 评审与灰盒可玩性轮）

- [ ] PL-1：经济压力成立——「想建的总比买得起的多」被试玩者自发复述；基础收入压缩后无「穷死死局」（farmBase >0 保底＋缴获回血可感）。
- [ ] PL-2：缴获翻盘杠杆——劣势局「杀敌回血」可感知；玩家在低余额时出现「放进来杀 vs 远远点掉」的缴获权衡（与 C3/C5 火力分配联动）。
- [ ] PL-3：赏格引导——督队赏格高位设定下「先杀督队值回票价」的动机可复述（C2 OQ-4 玩法面验证）。
- [ ] PL-4：账本透明——D② 三源飘字＋终局账本画面使试玩者能回答「钱从哪来、花到哪去」（P3/P4 支柱可读性）。

---

## 9. 前置契约与承接清单（→C7 交割面单列）

### 9.1 给 C7 的交割面（序列 #7b 并行撰写，直接引用）

| # | 交割项 | 内容 |
|---|---|---|
| 1 | 报价接口 | `EconomyQuery.quote/canAfford/treasury`（§3.4）——建造/修理/部署/修墙四类 PurchaseItem |
| 2 | 扣费接口 | `EconomyCommand.charge` 原子扣费（仅 A 相位窗口；INSUFFICIENT/ILLEGAL_WINDOW 两拒绝态，余额零污染） |
| 3 | 费用键清单 | §3.5 `cost.*` 全键——C7 校验逻辑只调 quote，**禁止私藏费用数值**（systems-breakdown §4 消费方纪律） |
| 4 | 分工边界 | C7 管指令合法性与世界校验（落点/耐久/容量/部署区），C6 只管钱（余额/窗口/原子性）；双闸分工=前置询价在 C7（UI 灰显）、charge 内部终检（防时序差，C2-E7 同纪律） |
| 5 | 窗口语义 | charge 仅 A 相位（对齐 F2：A=建造/修理/部署唯一窗口）；建造流程与撤销机制本文不写（OQ-4 留 C7） |

### 9.2 承接挂账三态清单

| # | 来源 | 条目 | 处置 |
|---|---|---|---|
| 1 | C2 §10 OQ-4 | 督队赏格数值 | **半销账**：键位 `loot.perTemplate.warlordEscort` 本文裁定（economy.json）；数值定值灰盒轮；「高价值」AI 侧消费已由 C8 §2.5 自洽解释（leadBias），C2 侧措辞统一随 C8 §9.1-3 回派项走 |
| 2 | F2 §6.2 | 收入/援军钩子行 | **销账**：EconomySettlementApi 签名落定（§3.4） |
| 3 | F2-E14 | 战利品/继承数据包 C6 半边 | **销账（初版）→ v1.1 完整回填（X2 v1.0 §2.2，2026-09-21 回执批）**：BattleEndReport v1.1 四追加字段注记入 §3.3（survivorRoster/facilityCarry/wallCarry/treasuryCarry，定义权 X2） |
| 4 | C8 §9 七项转派 | — | **零承接**：逐项走查无一与 C6 交叉（§7.3） |
| 5 | C2 §2.7 | 「抚恤/重募成本归 C6/X2」C6 半边 | **收口**：关内零扣费裁定（§2.4）；重募费用键裁定 **MVP 零新键**（X2 v1.0 §2.1-C3，幸存者免费＋阵亡走 C7 DEPLOY 全价；retrain.* Alpha 预留挂 F3）——2026-09-21 X2 回执批销账（§10 OQ-2） |

---

## 10. 开放问题

| # | 问题 | 影响方 | 建议关闭时点 |
|---|---|---|---|
| OQ-1 | economy.json 全键数值定值（收入/赏格/造价/修理单价） | 平衡轮 | 灰盒可玩性轮统一校准（方向红线见 §3.5 注） |
| OQ-2 | ~~关间结转规则（treasuryCarryRule 三选一）＋重募费用键是否设立~~ | ~~X2~~ | **已关闭（X2 联裁两案销账，GW-P2-013a 回执批）**：①treasuryCarryRule **终裁=B 案（每关 F3 固定初值 `campaign.initialTreasury.L{n}`，X2 v1.0 §2.1-D；主理人维持 X2 裁定，2026-09-21）**——曲线保护（单关封闭调平，MVP 无平衡迭代预算下唯一可控形态）×战役感（幸存者名单已承担可感载体）×实现最简（关初直读卡值）；C6 原建议 C 案（部分结转＋下限）转 **Alpha 占位**（`treasuryCarry` 字段位已留，X2 §2.2，启用时 X1 关初读 `max(F3 下限, 结转额)` 单行改动）；C6 侧零结构改动——`treasuryCarryRule` 键保留 economy.json（值语义改为「终裁枚举 B」），因 BattleEndReport.treasuryFinal 仍为关末自然终点（X1 结算画面复盘用）；②重募费用键 **MVP 零新键**（X2 §2.1-C3）——幸存者免费入场（购买成本既往关已付）、阵亡补充=C7 标准 DEPLOY 全价（既有 `cost.deploy.garrisonSquad` 照旧）、`campaign.retrain.costPerUnit`（打折重募）Alpha 预留挂 F3（X2 §3.2），economy.json 侧无动作 |
| OQ-3 | ~~WALL_REPAIR 修墙指令面与费用模型对接细节~~ | ~~C7/F1~~ | **已关闭（C7 v1.0，GW-P2-008 合流）**：修墙=GATE 段修理（范围裁定 C7 §2.6），指令面 WALL_REPAIR{connectorId, Δhp}，PurchaseItem 按夹取 Δ′ 组装（接口零改动）；数据前提=F1 接口需求 W-1，未落地则指令封闭，`cost.wallRepair.perHp` 键位保留待启用 |
| OQ-4 | ~~撤收/取消退费是否产品化~~ | ~~C7~~ | **已关闭（C7 v1.0，GW-P2-008 合流）**：不产品化（采纳本文建议），纠错走三条梯度：戍卒重置零费、设施拆除零退费、拆除重建全价（C7 TL;DR-C/§2.5）；退款比例键 `cost.dismantleRefundRatio`（宿主=economy.json，本文 §3.5 已列）列 Alpha 平衡预留位，启用即重开「无退款通道」评审，与 C7 OQ-4 互见 |
| OQ-5 | Alpha 三恢复位启用评估：第二资源／supply 节点网络／farm 屯田格 | Alpha 评审 | Alpha 启动评审（结构位已留，机制另裁） |

---

## 11. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0-draft | 2026-09-21 | 首版（GW-P2-006 序列 #7a）：单一资源资金模型；五主裁点成文——①D② 固定结算序 farm→supply→loot＋缴获双段式（击杀流水登记/D② 入账）；②缴获按兵种固定值（督队赏格键位承接 C2 OQ-4）；③④补给线/屯田双简化裁定（固定收入＋显式 Alpha 恢复位）；⑤破产=禁止下单（无欠饷）＋援军免费裁定；BattleEndReport v1（X2 回填位标定）；EconomyQuery/Command 交割面（→C7 单列）；EconomySettlementApi 闭合 F2 §6.2 钩子行；零 F4 消费确定性红线（INV-C6-5）；边缘情况 E1-E11；上游契约走查零冲突（§7.3，含 F2 §2.2-D③ 括注笔误上报） |
| v1.0.1-draft | 2026-09-21 | F2 勘误联动升引（主理人核验代提）：F2 §2.2-D③ 括注笔误经主理人核实（E6=留梯单位行动槽，援军顺延本体是 E13），F2 落 v1.0.3 勘误；本文 header 上游依据/对齐状态/SC-3/§7.3 引用同步升 F2 v1.0.3，零实质变更 |
| v1.0.2-draft | 2026-09-21 | **C7 互审合流批 008（主理人授权执行）**：①§2.3「无退款通道」措辞精化——钱/世界两层辨析（已付费用不可撤销退回 vs 拆除/重置语义归 C7），-2-2 走查发现 1 采纳；②§2.1「余额=D② 后快照」→「实时值（A 相内无收入源，恒定基准）」，-2-2 走查发现 2 采纳；③§3.5 补 `cost.dismantleRefundRatio` 键行（宿主=economy.json，启用即重开退款裁定，与 C7 OQ-4 互见）；④§10 OQ-3/OQ-4 销账（文案=C7 v1.0 §9.3 原文，合流批）；⑤§7.3 补 C7 v1.0.1 互审零冲突行＋header 对齐状态同步（含 C5 v1.2 引用升版） |
| v1.0.3-draft | 2026-09-21 | **X2 回执批（GW-P2-013a，主理人授权代落）**：①§10 OQ-2 销账——treasuryCarryRule 终裁 B 案（每关 F3 固定初值，X2 v1.0 §2.1-D；主理人维持 X2 裁定），C 案转 Alpha 占位（treasuryCarry 字段位已留）；②重募费用键销账——MVP 零新费用键（幸存者免费＋阵亡走 C7 DEPLOY 全价），campaign.retrain.* Alpha 预留挂 F3（X2 §2.1-C3）；③BattleEndReport v1.1 回填注记——§3.3 处标注四追加字段（survivorRoster/facilityCarry/wallCarry/treasuryCarry，追加式零改动，定义权 X2 §2.2）；④§7.2 X2 行与 §9.2 挂账 #3/#5 同步刷新。零结构性改动（C6 全部接口/键位/结算语义不变） |
