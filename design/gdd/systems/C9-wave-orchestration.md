# C9 波次与攻势编排系统 · GDD

> **状态**：v1.0-draft（2026-09-21）｜ GW-P2-009 ｜ GDD 撰写序列 #8a
> **产出**：文策渊（design-strategist-c9）
> **上游依据**：`design/gdd/systems/C8-xiongnu-ai.md` v1.0.1（§2.2 WaveManifest{units, intentTag, spawnEdge} 签名——C8 转派挂账本次正式消费、§2.1 B③ 消费路径、intentTag 三枚举与 intent-scripts.json 注入面、§9.1-4 半销账行）｜ `design/gdd/systems/F2-phase-scheduler.md` v1.0.3（§2.2-B① 入场时点/D⑤ cursor 前移固定位、§2.5 胜负检查点 C9 侧输入、F2.5/F2.7 公式、E2 多波并存、E8 末波破燧、E13 顺延同构、§6.2 波次入场钩子行、§3.2 DPhaseLedger.waveCursor 镜像）｜ `design/gdd/systems/F1-terrain-grid.md` v1.4.3（§10.1 三关三变量矩阵、§10.4 最小结构判据=兵种引入门禁、§2.7 单轴红线「多波全从开放端进场」、enemySpawns/EnemySpawnDef、placeUnit/canPlace 写白名单、V2/V11/V12 校验、§10.2 渲染护栏 ≤80）｜ `design/gdd/systems/C2-units.md` v1.1.2（§2.1 UNDEFINED=攻方波次队列源态、「C9 入场→DEPLOYED」路径、§3.4 enterField 白名单与 C2-E7 双闸、§2.7 eliminate 死亡事件、E11 跨波存活裸保留、§10 OQ-5）｜ `design/gdd/systems/C6-economy.md` v1.0.2（§2.6 守方援军时刻表归 C6/敌军波次归 C9 分界声明）｜ `design/systems-breakdown.md` v1.0（§1.2 C9 职责、§5.4-R4 三变量节奏差异、§4 C9=数值载体宿主 F3）｜ `design/game-concept-planA-turnbased.md` 定稿 v1.0（§4 三关节奏=教学→标准→高潮、§6 四兵种构成与克制表、决策④匈奴仅 AI、P4 濒危险胜）
> **范围红线**：本文只裁 C9——每关敌军构成的**数据模型**（波次表 schema 与 waves.json 文件模式）、入场节奏与时序（F2 B①/D⑤ 挂点的 C9 侧语义）、佯攻/主攻/齐攻的**编排表达**（intentTag 随波下发的编排骨架）、波次强度曲线的三关差异化表达、波次耗尽谓词（F2.5 的 C9 侧输入）。**不写**匈奴 AI 决策内容（C8——本文只产其消费的 WaveManifest）、单位属性数值（C2/F3）、入场落点的寻路与移动执行（C1）、波次构成数值定值（F3 表宿主，全部留灰盒）、守方援军时刻表（C6 §2.6 分界）、任何动态波次触发（MVP 纯预设，动态调整留 Alpha）。
> **对齐状态**：与 C8 v1.0.1 / F2 v1.0.3 / F1 v1.4.3 / C2 v1.1.2 / C6 v1.0.2 逐份对表（§7.3 逐条）；C8 §2.2 签名四字段逐字落地（§3.3），新增 `unitIntents`/`enteringUnits` 两个**受控扩展字段**（单波在场时与 C8 现有消费行为零变化，精化点已列 §9 待 C8 回执）；两处上游措辞精化建议（F2 §6.2 placeUnit 调用链表述、F2.5 耗尽谓词定义权声明）均为语义澄清非行为冲突，详见 §7.3。

---

## 0. 八节导航

1. [概述](#1-概述) ｜ 2. [机制](#2-机制) ｜ 3. [数据](#3-数据) ｜ 4. [公式](#4-公式) ｜ 5. [边缘情况](#5-边缘情况) ｜ 6. [UI 接口](#6-ui-接口) ｜ 7. [依赖](#7-依赖) ｜ 8. [验收标准](#8-验收标准) ｜ 附 [§9 前置契约与承接清单（C8 §2.2 签名消费确认单列）] ／ [§10 开放问题] ／ [§11 变更记录]

---

## 1. 概述

### 1.1 职责定义

C9 是匈奴攻势的**剧本作者**：持有每关敌军构成的权威时刻表（`l{n}-waves.json`，F3 宿主），在 F2 B① 按表落位入场单位（经 C2 enterField→F1 placeUnit 白名单链）、在 F2 D⑤ 前移波次游标（簿记）、在每回合 B③ 冻结并向 C8 下发 `WaveManifest`（本回合的意图语境与单位集合），并向 F2 D④ 胜负检查点提供「波次耗尽」谓词。C9 **是编排的表、不是决策的脑**：匈奴每回合打什么归 C8，某个兵多强归 C2/F3，守方援军何时到归 C6——C9 只回答「**谁、在哪回合、从哪端、带着什么意图、按什么顺序进场**」。

一句话：**把「一夜攻势」写成一张可重放、可校验、零随机的时刻表，并把每一回合的意图语境切成 C8 能直接消费的一份清单。**

### 1.2 设计目标与支柱挂钩

| 支柱/定稿项 | C9 落点 |
|---|---|
| P4「侥幸守住的快感」 | 强度曲线是压力的作者：波次间隔压缩、意图接力（佯攻接主攻）、齐攻峰制造「濒崩」谷底；末波当回合清场即可判胜（耗尽谓词裁定 F）——「最后一轮极限调度」的收尾张力不被簿记时序稀释 |
| P4「本波冲哪」可读 | 一波一意图（裁定 E）+ `wave_entered` 事件 + P4 意图旗标（消费 C8 currentIntent）——玩家在敌军入场瞬间即可读出「这波是拉扯还是压上」 |
| 决策①「AI 弱则崩」缓解 | 意图脚本的威力取决于编排是否给足发挥面：FEINT 波给 C8 制造多点燃点、COORDINATED 波配足云梯兵使同步登城有权重可乘——编排层是意图系统的**弹药库** |
| 概念稿 §4 教学→标准→高潮 | 三关用 R4 三变量（墙段长度/连接器数量/波次构成）中的**波次构成**列做强度曲线：兵种引入门禁（W-V3 承接 F1 §10.4）+ 波次数/意图序列渐进（⚠ 灰盒） |
| 决策④ 匈奴仅 AI | 波次表无玩家输入入口；C9 全自动、零随机（INV-C9-4），是确定性重放（F4/F5/X5）的又一座安全岛 |
| R4 残余风险 | 三变量中「波次构成」的数据 schema 由本文定稿（§3.1）；与 W/连接器两变量的取值组合表落 §2.6 |

### 1.3 非目标（Non-goals）

- ❌ 匈奴每回合的行动决策、意图权重注入的实现 → **C8**（本文只产 `WaveManifest`，不解释它）。
- ❌ 入场后的移动、寻路、落点竞争 → **C1**（C9 只做入场瞬间的 placeUnit，之后单位归 C1/C8 管辖）。
- ❌ 兵种属性、MP/AP、波内单位的强弱 → **C2/F3**（C9 表只写 templateId 与数量/顺序）。
- ❌ 守方援军时刻表、到岗调度、顺延队列 → **C6 + F2 D③**（F2-E13 的「C6/C9 表」按 C6 §2.6 分界拆分：ReinforceEntry 归 C6，WaveEntry 归 C9；两队列独立零交叉，§2.4）。
- ❌ 士气崩溃触发攻势瓦解 → **C11（Alpha）**（届时「士气溃退提前耗尽波次」是其扩展位，本文表结构不预设）。
- ❌ 动态波次触发（基于战场状态提前/延后入场）→ **Alpha**（OQ-3；MVP 裁定 H 纯预设）。
- ❌ 第二入场端、多轴进攻 → **F1 §2.7 单轴红线**（MVP 多波全从开放端进场；spawnEdge 字段保留多端扩展位但不使用）。
- ❌ 任何数值定值（波次数/单位数/间隔/首波回合）→ **F3 `l{n}-waves.json` 表宿主**（正文骨架全部标 ⚠ 工作假设）。

### 1.4 关键裁定速览（TL;DR）

| # | 裁定 | 一句话 |
|---|---|---|
| A | WaveManifest 终版 schema | C8 §2.2 四字段（waveId/units/intentTag/spawnEdge）逐字落地 + 两个受控扩展字段 `unitIntents`/`enteringUnits`；**意图随波不随回合**——多波并存时残部继承来源波意图 |
| B | 时序模型 | **纯预设、按回合计**：每条目持绝对 `dueTurn`；B① 处理（落位）、D⑤ 簿记前移 cursor；同回合至多一波（W-V2）；零事件触发、零 RNG |
| C | 波内入场序 | **表序=入场序**（逐单位条目制，禁 count 字段，W-V4）；落格=(x↑,z↑) 字典序扫描出生区首个 canPlace 格 |
| D | 入场受阻顺延 | 落位失败按**单单位粒度**入 `pendingSpawns` FIFO 队列，下回合 B① 首位重试——与 F2-E13 守方援军顺延**同构但独立**（C9 自持队列）；cursor 前移不受顺延阻滞（防死锁） |
| E | 意图编排语义 | **一波一意图**（拒波内分组）；「主佯并发」= 相邻两波接力 + 残部意图继承（unitIntents）自然达成，无需波内分组；COORDINATED 是纯 C8 评分层语义，编排层只负责配足云梯兵 |
| F | 耗尽谓词 | `wavesExhausted ⇔ 全部条目已处理 ∧ pendingSpawns 空`——与 cursor 簿记位置**解耦**，末波当回合清场即可在 D④ 判胜（避免「寂静胜利回合」） |
| G | 三关骨架 | 兵种引入门禁硬校验（L1 梯+骑射／L2 +冲车／L3 +督队，W-V3 承接 F1 §10.4）；波次数 ⚠4/6/8；意图序列 MAIN→FEINT→COORDINATED 渐进；末波破燧能力硬校验（W-V6 承接 F2-E8） |
| H | MVP 纯预设 | 零动态触发、零随机（INV-C9-4）；FEINT 波被全歼**不**改变后续波意图；动态编排留 Alpha（与 C11 士气联动） |

---

## 2. 机制

### 2.1 全链路总览（在 F2 相位机上的两个挂点 + 一个冻结点）

```
【关卡载入】INIT：加载 l{n}-waves.json → W-V1..V10 校验（§3.5）→ WaveRuntimeState 初始化
             （cursor=0，pendingSpawns=[]，unitWaveMap={}）→ S0 存档

【每回合 A 相位】玩家建设（C9 无操作；波次表只读）

【每回合 B①】C9.spawnForTurn(turn)：
    ① 顺延重试：pendingSpawns 队首逐条尝试落位（§2.4 落格链）→ 成功出队 / 失败留队
    ② 到期入场：取 dueTurn = turn 的条目（至多 1 条，W-V2）→ 按 units[] 表序逐单位落位
    ③ 每单位落位成功 → 记入 unitWaveMap（来源波绑定，§2.5）→ 发 wave_entered（波级事件，聚合本回合入场清单）
    ④ 失败单位 → 入 pendingSpawns 队尾（单单位粒度，§2.4）

【每回合 B③ 前】C9.freezeManifest(turn)：
    裁定当前波（§2.3 规则）→ 冻结 WaveManifest（§3.3）→ 交 C8.generatePlans 消费

【每回合 C 相位】战斗结算（C9 无操作；订阅 eliminate 做波存活计数清理）

【每回合 D④】F2 胜负检查点：调 C9Query.wavesExhausted()（谓词见裁定 F/§4-C9.3）∧ F1 清场判定

【每回合 D⑤】C9.advanceCursor(turn)：簿记前移——cursor 越过全部 dueTurn ≤ turn 的已处理条目
             （处理已在 B① 完成；D⑤ 仅簿记，不改变任何谓词真值）→ F2 DPhaseLedger.waveCursor 镜像更新

【终局回合】D④ 触发 END_WIN/END_LOSE → D⑤ 不执行（cursor 冻结于终局值，§5-E9）
```

- **波次不是时间层级**（F2 §2.1 原口径）：C9 时刻表是「条目 × 绝对回合」的查找表，不引入第五层时间结构；一关一夜之内的全部波次共用 F2 权威时钟。
- **「处理」与「簿记」两阶段分离**（裁定 B/F 的根基）：条目的**处理**（落位尝试）只在 B① 发生且每条目恰一次；cursor 的**前移**只在 D⑤ 发生且纯属簿记。两阶段分离使耗尽谓词（D④ 求值）不依赖簿记时点——这是裁定 F「末波当回合清场即可判胜」的实现前提。
- **MVP 全图可见**（C12 简化裁定）：B① 入场即全员可见，无「侦测波次」的隐藏信息；可见性重算挂点留 C12 Alpha（届时波次表可增「预警回合」列，结构位见 §10 OQ-4）。

### 2.2 波次表数据模型终版（主裁点 1：WaveManifest 消费源的权威 schema）

每关一张时刻表，文件模式沿用 F1 §9.1 `enemySpawns[].waveRef` 既定引用（`l1-waves.json` / `l2-waves.json` / `l3-waves.json`），宿主 F3：

```ts
interface WaveTable {                  // F3 l{n}-waves.json（per-level，手工编写，X4 编辑器 Alpha）
  levelId: string;                     // "MVP_L1" | "MVP_L2" | "MVP_L3"——须与 LevelMap.levelId 一致（W-V7 联校）
  entries: WaveEntry[];                // 时序表：dueTurn 严格升序（W-V1），同 dueTurn 拒绝（W-V2）
}

interface WaveEntry {
  waveId: string;                      // 波次标识（C8 waveId 消费；命名建议 "L1_W3"，全局唯一 W-V10）
  dueTurn: number;                     // 入场回合：绝对回合计，≥1（W-V1）；首波建议 ≥2（W-V8 WARN，教学关建设缓冲）
  spawnEdge: SpawnEdgeId;              // 引用 LevelMap.enemySpawns[].id（存在性校验 W-V9）；MVP 三关恒 'spawn_main'
  intentTag: IntentTag;                // 'MAIN_ASSAULT' | 'FEINT' | 'COORDINATED'（W-V5；枚举与 C8 §2.2 同源）
  units: WaveUnitSpec[];               // **表序 = 入场序**；逐单位条目制（W-V4 禁 count 字段）
  meta?: { nameKey?: string };         // 可选文案锚点（P4 横幅/教学「第 3 波 · 左路佯攻」，P3 支柱）
}

interface WaveUnitSpec {
  templateId: UnitTemplateId;          // C2 §3.2 枚举；受关卡门禁约束（W-V3，见 §2.6）
  // 刻意不设更多字段：波内单位无个体差异（命名/装备/强化均不进 MVP——单位个性是 Alpha 话题）
}
```

- **逐单位条目制**（裁定 C）：`units: [{ladder_infantry}, {ladder_infantry}, {horse_archer}]` 即 2 梯兵+1 骑射、按此序入场。禁 `count` 字段——「所见即所 spawn」，无展开歧义、diff 友好、校验面最小；手工编写的行数代价（三关合计 ≈240 行）在 MVP 可接受，X4 编辑器可在编写层做 count 语法糖、编译为显式条目。
- **设计纪律**：单位个性（个体命名/精英化/装备差）不进 MVP 波次表——若 Alpha 引入，扩 WaveUnitSpec 字段位（追加式演化，F5 存档版本兼容同哲学，C6 BattleEndReport 同源纪律），不改既有字段语义。

### 2.3 时序模型（主裁点 2：dueTurn / cursor / 当前波裁定）

- **按回合计，拒事件触发**（裁定 B/H）：跨波间隔=相邻条目 `dueTurn` 差，纯回合计。理由：①确定性——spawn 序列是 `f(waves.json, WaveRuntimeState, F1 占位快照)` 的纯函数（§4-C9.5），F4 零消费；②可测试——时刻表即测试用例；③与 F2-E2 口径一致——「佯攻接主攻的连续压力是时刻表问题而非状态机问题」。基于战场状态的动态触发（前波全歼提前入场等）留 Alpha（OQ-3，届时与 C11 士气溃退联动设计）。
- **cursor 语义**：`cursor` = 「下一条未处理条目」的下标（`entries` 数组内位置）。B① 处理到期条目，D⑤ 前移簿记（越过全部 dueTurn ≤ turn 的已处理条目）。`WaveRuntimeState.cursor` 是权威，F2 `DPhaseLedger.waveCursor` 是镜像（F2 §3.2 既定）——权威/镜像方向不可倒置（F1 `TerrainRuntime.turn` 镜像同纪律）。
- **处理恰一次不变量**：条目处理 ⇔ 其 `units[]` 全部单位已尝试落位（成功在场/阵亡，失败在 pendingSpawns）。dueTurn 严格升序 + 每回合处理 `dueTurn == turn` ⇒ 每条目在其 dueTurn 回合被恰一次处理（无遗漏、无重复，INV-C9-2）。
- **当前波裁定**（WaveManifest.waveId 的取值规则，§4-C9.4）：
  1. 本回合 B① 有新入场波 → 该波为当前波；
  2. 否则 → **最近入场的仍存活波**（存活波=unitWaveMap 中 isAlive 单位非空的波；多波并存时取 turnLastSpawn 最大者，即最近入场优先）；
  3. 场上无任何存活敌军且本回合无入场 → 维持最近入场波的历史值，`units=[]`（空清单，C8 generatePlans 对空集合零计划产出，§5-E7）。
- **同回合至多一波**（W-V2）：MVP 编排器硬校验拒绝同 dueTurn 多条目。理由：当前波唯一性、P4「本波」旗标可读性、测试面收敛。「两波几乎同时」的编排诉求用**相邻回合接力**表达（间隔 1 回合 + 残部继承，§2.5）——表现力足，复杂度减半。

### 2.4 入场落位链与顺延队列（裁定 C/D）

**落位链**（每单位，B① 内）：

```
① 定格：出生候选区 = enemySpawns 条目声明的区域
        （edge=x_low ⇒ x ∈ [0, spawnDepth)，spawnDepth F3 键 ⚠初值 2；z ∈ zRange；h=0 且 kind=GROUND）
   扫描序 = (x 升序, z 升序) 字典序，取首个 canPlace(cell, 1) 为真格
② 预检（第一闸）：F1 canPlace——满格/非法格 → 落位失败
③ 状态迁移：C2.enterField(unitId, cellId)——UNDEFINED → DEPLOYED
   （C2 内部经 F1 placeUnit 白名单完成占位登记，C2 §3.4 纪律；二次校验失败（防时序差）= 第二闸拒绝，
    单位停留 UNDEFINED、回执错误——C2-E7 双闸同构）
④ 登记：unitWaveMap[unitId] ← 来源 waveId（意图继承的持久绑定，顺延不改变绑定）
```

- **调用链的契约落点**：F2 §6.2「B① 调 C9.spawnForTurn(turn) → 返回入场条目（F1 placeUnit 由 C9 调用）」的正式落点 = **C9 发起入场、占位经 C2.enterField→F1.placeUnit 白名单完成**——C2 §3.4「占位迁移全部经 F1 写白名单、C2 不直改 occupantIds」的纪律优先于 F2 该行的字面表述。行为语义（B① 窗口、入场时点、顺延）与 F2 裁定完全一致，仅调用链措辞精化（建议 F2 下次修订注记，§7.3）。
- **顺延队列（pendingSpawns，裁定 D）**：落位失败的单位按**单单位粒度**入队（条目其余单位照常落位——顺延不波及全条目），元素结构 `{waveId, unitIndex, templateId, spawnEdge}`。下回合 B① **队首逐条重试**（先于到期条目），失败留队可跨多回合累积——与 F2-E13 守方援军顺延同构但**队列独立**（C9 自持，不混入 F2 `pendingReinforcements`；两队列、两时刻表、零交叉，C6 §2.6 分界的镜像确认）。
- **顺延中的单位不可被攻击**：其状态停留 UNDEFINED（无占位、无行为面、不在 C8 计划域）——不存在「未入场先挨打」。
- **cursor 前移不受顺延阻滞**：D⑤ 前移以「条目已处理」为条件（失败单位入队即算已处理）——若以前移阻滞换取「落位成功才推进」，则出生区被堵时 cursor 永卡、后续波永不入场、战局僵死。**排空优先于严格时序**：顺延的代价是残部迟到，不是战线断裂。
- **零丢失承诺**：pendingSpawns 条目零丢失（成功落位时出队，别无出口）；极端全图满员时敌军迟到但不消失——「迟到」本身是战局恶化的自然反馈（C6-E9 同哲学）。

### 2.5 意图编排语义（主裁点 3：一波一意图 / 并发表达 / 齐攻表达）

- **一波一意图**（裁定 E）：intentTag 挂在波级，**拒绝波内分组异意图**（如「半波佯攻半波主攻」）。理由：①P4 可读性——「本波」旗标必须唯一（C8 `currentIntent()` 单值消费）；②C8 IntentWeights 主键是回合级查表（§2.2 签名）；③表简单。需要「同一窗口两种意图」时，编排成两波。
- **「FEINT 与 MAIN_ASSAULT 并发」的正式表达 = 相邻接力 + 残部继承**：
  - 编排层：FEINT 波 dueTurn=t，MAIN_ASSAULT 波 dueTurn=t+1（间隔 1，W-V2 允许）；
  - 语义层：t+1 回合 MAIN_ASSAULT 入场时，t 波 FEINT 残部通常仍在场——`unitIntents` 扩展字段使残部**继续按 FEINT 评分**（多点拉扯床弩/礌石火力），新入场单位按 MAIN_ASSAULT 集中破口。
  - 效果：**实际并发无需波内分组**——时间上的重叠就是空间上的两路，且每路意图纯净。这是裁定 A「意图随波不随回合」的玩法落点：佯攻的价值恰在于主攻到达时它还在拉火力。
- **意图随波不随回合**（裁定 A 核心）：单位对意图的绑定在入场瞬间经 unitWaveMap 固化，此后**不随当前波切换而漂移**。当前波裁定（§2.3）只决定 WaveManifest 顶层四字段（C8 的 IntentWeights 主键与 P4 旗标）；在场单位的逐单位意图恒查 `unitIntents[u]`。
- **C8 消费精化（受控扩展，待 C8 回执）**：C8.3 意图注入的查表键由 `intentTag` 精化为 `unitIntents[u] ?? intentTag`。**单波在场时两者恒等，C8 现有行为逐字节零变化**；多波并存时启用逐单位继承。C8 §2.2 表结构零破坏（仅追加可选字段），C8 §2.2 主表、intent-scripts.json 键位、(levelId, waveId) 覆盖粒度全部原样有效。
- **COORDINATED 齐攻的表达**：齐攻的「齐」在 C8 评分层（同步登城协同项，C8 OQ-3 灰盒量化）——**C9 波次表不新增任何齐攻专属字段**。编排层的义务只有一条：给 COORDINATED 波**配足云梯步兵**（多梯并立是 F1-E4 既定合法场景），使 C8 的同步权重有梯可用。反例警示：COORDINATED 波只配 1 个云梯兵 = 意图空转（校验不可行——「足量」是灰盒调参目标，非静态规则，入 §10 OQ-2）。

### 2.6 三关强度曲线编排骨架（主裁点 4 + R4 取值组合表）

**R4 三变量取值组合**（墙段/连接器/GATE 三列照录 F1 §10.1 权威值；波次构成列为本文裁定骨架）：

| 变量 | L1 教学（初雪） | L2 标准 | L3 高潮 |
|---|---|---|---|
| 墙段长度 W | 12 | 16 | 20 |
| 静态连接器（坡道） | 1（AXIAL 马道端） | 2（AXIAL+FRONTAL 各一） | 3（双侧+烽燧侧） |
| GATE 门洞 | 1（居中） | 1（偏侧） | 2（双门洞） |
| **波次数 ⚠** | **4** | **6** | **8** |
| **兵种引入（W-V3 门禁）** | 云梯步兵 + 骑射手 | + 冲车 | + 督队（全四兵种） |
| **意图序列 ⚠** | MAIN → MAIN → FEINT → MAIN | MAIN → FEINT → MAIN(冲车首现) → FEINT → MAIN → COORDINATED | MAIN → FEINT → MAIN → COORDINATED → MAIN(督队首现) → FEINT → COORDINATED → MAIN(决战波) |
| **末波构成红线（W-V6）** | 含云梯兵 | 含冲车 + 云梯兵 | 含冲车 + 云梯兵 + 督队 |

**编排设计意图（骨架级，单位数/间隔全部 ⚠ 灰盒）**：

| 波次职能 | L1（⚠4 波） | L2（⚠6 波） | L3（⚠8 波） |
|---|---|---|---|
| 开场波 | W1@T2：纯云梯小队——单梯单点，教「垛口堵击」（对齐 F1 §10.3 教学锚点） | W1@T2：梯+骑射混编——标准压力起步 | W1@T2：梯+骑射——无热身（高潮关不教学） |
| 兵种引入波 | W2：骑射手首现——教「远程骚扰 vs 垛口掩体」（克制表行） | W3：冲车首现——教「结构威胁 vs 火油/床弩」（对齐 C2 §2.3 冲车行为面） | W5：督队首现——随主攻波压阵，「先杀督队」光环战术位成立（F1 §10.4 判据） |
| 佯攻教学/接力 | W3：FEINT 小波——教「看旗标辨意图」（C8 PL-2 联动） | W2/W4：FEINT→MAIN 接力——多波并存与残部继承首次成型（F2-E2 承接） | W2/W6：FEINT 牵制；W3→W4 接力窗口最短（间隔 1） |
| 齐攻峰 | 无（L1 禁 COORDINATED，W-V8 WARN——教学弱意图，C8 PL-1） | W6（末波）：COORDINATED 首演——多梯同拍，全课收束 | W4/W7：双齐攻峰；W8 决战波=全兵种 MAIN——最终压力顶点 |
| 强度曲线形状 | 缓升：4 波小体量，每波一个新概念 | 锯齿升：FEINT/MAIN 交替拉扯，末波齐攻收 | 阶梯陡升：双齐攻+督队光环+双门洞，濒崩谷底最深 |

- **数值全部留灰盒**：上表只锁「结构」（波次数档位、引入次序、意图序列形状、末波红线）；每波单位数、波间间隔、首波回合、骑射手配比等定值一律 F3 表宿主（§10 OQ-1）。
- **三变量不新增地形**：三关 CellKind 集合恒等（F1 §10.4），C9 波次构成列与 W/连接器列的正交组合即全部差异化——R4 关闭条件（F1 PL-4）的 C9 侧兑现。
- **单轴红线**：三关全部单入场端（`spawn_main`），佯攻/主攻差异完全由时序+构成+意图表达——F1 §2.7「地形不提供第二轴线」在编排层的执行声明；spawnEdge 字段的多端扩展位保留但不使用（§10 OQ-4）。

### 2.7 与胜负判定的关系（主裁点 5：F2 §2.5 检查点的 C9 侧输入）

- **耗尽谓词（裁定 F）**：`wavesExhausted ⇔ (∀e ∈ entries: processed(e)) ∧ pendingSpawns = ∅`，其中 `processed(e)` = e 的全部单位已尝试落位（成功或已入顺延队列）。**与 cursor 簿记位置解耦**——D④ 求值时不看 cursor 指在哪，只看「是否还有可入场的工作」。
- **为什么不按 cursor 位置判**：cursor 前移固定位在 D⑤（F2 §2.2），若 D④ 按 cursor 位置求值，则末波入场当回合（D④ 时 cursor 尚未越过末条目）恒判「未耗尽」，胜利被迫滞后一个完整回合——清场后多出一个「寂静胜利回合」，稀释「最后一轮极限调度」的收尾（P4 反向）。处理态谓词使**末波当回合清场即可判胜**（D④ 双分量同时成立）。
- **双分量不可拆**（F2 §2.5 既定，C9 侧重申）：只耗尽不清场不判胜——最后一波残敌仍能爬上墙；只清场不耗尽不判胜——顺延队列中的迟到敌军仍在路上（含顺延堆积场景，§5-E3）。F2.5 的 `wavesExhausted(C9 cursor)` 中「C9 cursor」按本谓词理解（定义权归 C9，F2 侧零改动；建议 F2 注记，§7.3）。
- **荒局防线（F2-E8 承接）**：末波构成红线（W-V6：每关末波必含 ≥1 破燧能力单位=云梯兵或冲车）保证「耗尽后残敌理论上有破燧路径」，杜绝「剩一队骑射手永世登不了燧」的死局静默化。注：这是**静态编排保证**，非运行时检测——MVP 不设「僵局判定器」。

---

## 3. 数据

> 引擎无关 TS。C9 持久状态=WaveRuntimeState（F5 存档的 C9 分部）；回合内短期状态=WaveManifest（B③ 冻结、C 相位后弃）。零随机（INV-C9-4）、零 Three.js、全部运算为查表+扫描（性能可忽略，无预算项）。

### 3.1 波次表（WaveTable，F3 宿主，结构权威见 §2.2）

| 键/文件 | 含义 | 校验 | 消费方 |
|---|---|---|---|
| `l1-waves.json` / `l2-waves.json` / `l3-waves.json` | 三关时刻表（WaveTable） | §3.5 W-V1..V10，INIT 加载期 | C9（唯一权威读者）；F1 LevelMap.enemySpawns[].waveRef 引用 |

### 3.2 运行态（WaveRuntimeState，F5 存档 C9 分部）

```ts
interface WaveRuntimeState {
  cursor: number;                          // 下一未处理条目下标 ∈ [0, entries.length]（权威；F2 waveCursor 为镜像）
  pendingSpawns: PendingSpawn[];           // 顺延队列（FIFO；成功落位时出队，别无出口）
  unitWaveMap: Record<UnitId, string>;     // 单位 → 来源 waveId（意图继承与存活计数的持久绑定）
                                           // eliminate 事件订阅清理条目（INV-C9-1）；入场瞬间写入，顺延不改变绑定
  turnLastSpawn: number;                   // 最近成功入场回合（当前波裁定的排序键）
  lastWaveId: string;                      // 最近入场波 id（当前波裁定第 2/3 分支的回退值）
}

interface PendingSpawn {
  waveId: string;                          // 溯源键（unitWaveMap 绑定已在首次处理时写入）
  unitIndex: number;                       // 原 WaveEntry.units[] 下标（唯一溯源 (waveId, unitIndex)，INV-C9-3）
  templateId: UnitTemplateId;
  spawnEdge: SpawnEdgeId;
}
```

- **派生不持久**：波存活计数（aliveByWave）由 `unitWaveMap` × C2 `isAlive` 派生查询，不落地为状态——单一权威、零双写漂移（F1 turn 镜像同纪律的反向应用）。
- **存档点覆盖**：S0（INIT→A，初值）与 S1（D→A，全量）均不在 B 相位内——B① 处理不可分割、无中途存档问题（F2 裁定 F 的自然推论）。读档校验（脏档防线，C2-E12/C6-E4 同纪律）：`cursor ∈ [0, entries.length]`、`pendingSpawns 全部可溯源至 (waveId, unitIndex)`、`unitWaveMap 键 ⊆ 在场攻方单位`（无幽灵引用），违者拒读（§5-E10）。

### 3.3 WaveManifest（每回合冻结产物，C9→C8 正式契约——C8 §2.2 签名对齐落地）

```ts
interface WaveManifest {               // B③ 前冻结（freezeManifest），C 相位后弃；不持久化（读档后按态重算）
  turn: number;
  waveId: string;                      // ─┐
  units: UnitId[];                     //  │ C8 §2.2 四字段逐字落地：
  intentTag: IntentTag;                //  │ units = 当前波「本回合入场 ∪ 在场存量」（C8 原语义「本波入场+在场单位集合」）
  spawnEdge: SpawnEdgeId;              // ─┘ intentTag = 当前波意图（C8 IntentWeights 主键 / P4 旗标）
  unitIntents: Record<UnitId, IntentTag>;  // 【受控扩展①】全在场攻方单位 → 来源波意图映射
                                           //   意图随波不随回合；C8.3 查表键精化 unitIntents[u] ?? intentTag（§2.5）
  enteringUnits: UnitId[];                 // 【受控扩展②】本回合 B① 实际落位单位（含顺延重试成功者）
                                           //   P1 入场演出 / P4 横幅 / X5 重放核查消费；顺延未落位者不入
}
```

- **扩展字段的边界声明**：两字段为**追加**（C8 §2.2 主表零改动）；单波在场时 `unitIntents` 与顶层 intentTag 逐单位恒等——C8 现有消费路径在该场景**逐字节零变化**（回执请求见 §9.1-1）。
- **不持久化的正当性**：manifest 是 `f(WaveRuntimeState, F1 占位快照, waves.json)` 的纯函数产物（§4-C9.5），读档后 B① 重放即得同值——存档只携权威态，派生物不入档（F1 §5-E16「读档重建不走增量重放」同哲学）。

### 3.4 领域事件（走全局事件流；全部由确定性状态变化派生，可重放）

| 事件 | 载荷 | 主要订阅方 |
|---|---|---|
| `wave_entered` | `{turn, waveId, intentTag, units: UnitId[]}`（波级聚合，每入场波一条；本回合无入场不发） | P1（入场演出/号角挂点，P5 消费）、P4（波次横幅/意图旗标）、C8（参考）、X5 |
| `waves_exhausted` | `{turn}`（D⑤ cursor 前移后若谓词首次为真发一次） | P4（「最后一波」横幅——濒危险胜收尾提示）、X5 |
| `wave_spawn_deferred` | `{turn, waveId, unitIndex, queueDepth}` | X5（顺延率统计）、P4（可选调试显示）；MVP 不做玩家可见告警（入场受阻是常见微观事件，告警即噪音） |

### 3.5 波次表加载校验清单（W-V 规则，INIT 期执行，与 F1 §8.4 同纪律）

| # | 规则 | 级别 |
|---|---|---|
| W-V1 | dueTurn ≥ 1 且严格升序 | ERROR |
| W-V2 | 同 dueTurn 多条目（每回合至多一波） | ERROR |
| W-V3 | templateId ∈ C2 units.json 攻方枚举 **∧ 关卡门禁**：MVP_L1 ⊆ {ladder_infantry, horse_archer}；MVP_L2 ⊆ {ladder_infantry, horse_archer, ram_chariot}；MVP_L3 = 全四兵种（承接 F1 §10.4 最小结构判据） | ERROR |
| W-V4 | 逐单位条目制——WaveUnitSpec 仅含 templateId（schema 层面无 count 字段可违，此条为前向防回归哨兵） | ERROR |
| W-V5 | intentTag ∈ {MAIN_ASSAULT, FEINT, COORDINATED} | ERROR |
| W-V6 | 末条目含 ≥1 破燧能力单位（ladder_infantry ∨ ram_chariot）——F2-E8 荒局防线 | ERROR |
| W-V7 | levelId 与 LevelMap.levelId 一致 ∧ spawnEdge ∈ LevelMap.enemySpawns[].id | ERROR |
| W-V8 | 首波 dueTurn < 2 → WARN（建议保留 T1 纯建设教学缓冲）；L1 含 COORDINATED → WARN（教学弱意图建议，C8 PL-1） | WARN |
| W-V9 | units 数组非空 | ERROR |
| W-V10 | waveId 全局唯一；全关敌军总兵力 > 渲染护栏 80（F1 §10.2）→ WARN（上界哨兵：实际并存受战斗消耗约束，超界仅提示编排自查） | ERROR / WARN |

### 3.6 读写边界（谁写谁读）

| 数据 | 写入方 | 读取方 |
|---|---|---|
| waves.json（WaveTable） | 关卡作者（F3 加载，只读；表改动过平衡评审） | C9（权威读者）、X4(Alpha)、X5 |
| WaveRuntimeState | 仅 C9（B① 处理/D⑤ 簿记/eliminate 清理三入口） | F5（序列化）、C9Query 派生查询 |
| WaveManifest | C9（B③ 冻结，回合内短期） | C8（B③ 消费）、P4/P1（只读展示） |
| F2 DPhaseLedger.waveCursor | F2（D⑤ 从 C9 镜像抄写） | F2 自身（调试/存档校验） |
| unitWaveMap ↔ C2 单位列表 | C9 只写自己的映射；单位生死权威在 C2 | 双向一致由 INV-C9-1 对拍保证 |

---

## 4. 公式

> 统一格式：编号 ｜ 名称 ｜ 变量与单位 ｜ 表达式 ｜ 消费方。数值基准一律标「F3 表宿主」。

- `C9.1 ｜ B① 处理序：process(turn) = FIFO(pendingSpawns) ⊕ {e ∈ entries | e.dueTurn = turn}（e 按 units[] 表序逐单位）｜ 顺延优先于到期、表序即入场序——全序确定 ｜ 消费方：C9/F2-B①/X5`
- `C9.2 ｜ 落格序：cell*(u) = min_{lex(x,z)} { (x,z) | x < spawnDepth ⚠(F3), z ∈ zRange(spawnEdge), kind=GROUND, canPlace(cell,1) } ｜ 字典序 (x↑,z↑) 扫描；无解 → 单单位顺延 ｜ 消费方：C9/F1-placeUnit`
- `C9.3 ｜ 耗尽谓词：wavesExhausted ⇔ (∀e: processed(e)) ∧ |pendingSpawns| = 0 ｜ processed(e) ⇔ e.units 全部已尝试落位（成功或已入队）；与 cursor 簿记位置解耦（§2.7）｜ 检查点：F2-D④ ｜ 消费方：F2.5`
- `C9.4 ｜ 当前波裁定：currentWave(turn) = 本回合入场波 w ∷ 否则 argmax_{w ∈ 存活波} turnLastSpawn(w) ∷ 否则 lastWaveId(units=[]) ｜ 存活波 = unitWaveMap 过滤 isAlive 非空 ｜ 消费方：WaveManifest/P4`
- `C9.5 ｜ 确定性：spawn 序列与 WaveManifest = f(waves.json, WaveRuntimeState, F1 占位快照) 且 f 无内部随机 ⇒ 同输入逐字节同结果 ｜ C9 零 F4 消费（INV-C9-4）；读档后 B① 重放同值 ｜ 消费方：F5/X5`
- `C9.6 ｜ 意图绑定：unitIntent(u) = intentTag(waveId ∈ unitWaveMap[u]) ｜ 入场瞬间固化，顺延不改变绑定；C8.3 消费键 = unitIntents[u] ?? manifest.intentTag ｜ 消费方：C8/P4`
- `C9.7 ｜ cursor 簿记：D⑤ 时 cursor′ = 1 + max{i | entries[i].dueTurn ≤ turn ∧ processed(entries[i])}（无此 i 则不变）｜ 簿记不改变 C9.3 真值 ｜ 消费方：F2-D⑤/DPhaseLedger 镜像`
- `C9.8 ｜ 强度曲线骨架约束（非数值）：intro(t) ⊆ allowedTemplates(level)（W-V3）∧ 末波破燧能力（W-V6）∧ 意图序列按 §2.6 骨架渐进 ｜ 波次数/单位数/间隔全部 F3 灰盒 ｜ 消费方：关卡作者/平衡轮`

### 4.1 不变量（可单测）

- INV-C9-1：`unitWaveMap 键 ⊆ 在场攻方单位`（eliminate 清理 + 读档校验双闸；无幽灵引用）。
- INV-C9-2：每条目被处理恰一次（dueTurn 严格升序 + 每回合处理到期条目 ⇒ 覆盖恰全）；processed 标记单调不回退。
- INV-C9-3：`pendingSpawns` 每条可溯源至唯一 `(waveId, unitIndex)`；条目零丢失（唯一出口=落位成功出队）。
- INV-C9-4：C9 源码零 `Math.random`、零 F4 游标调用（静态扫描断言，纯预设红线）。
- INV-C9-5：`unitWaveMap[u]` 查表所得 intentTag 恒有定义（W-V5 保证枚举闭合）。
- INV-C9-6：`cursor ∈ [0, entries.length]` 恒成立（含读档校验）。

---

## 5. 边缘情况

> 裁定者=本文；落位执行归 C2/F1、决策归 C8、窗口归 F2。格式：编号｜场景｜裁定｜消费方。

### A. 时序与游标

- **C9-E1｜cursor 与存档读档一致性（F4/F5 确定性）**：S0/S1 存档点均在相位边界（B 相位内无存档位），WaveRuntimeState 全量序列化即完整态；读档后 B① 按 §4-C9.5 纯函数重放，spawn 序列与 WaveManifest 逐字节同值。cursor 镜像（F2 waveCursor）在读档时按 C9 权威重抄（镜像方向不可倒置）。脏档按 §3.2 校验拒读。
- **C9-E2｜D④ 判胜当回合的 D⑤**：D④ 触发 END_WIN/END_LOSE → D⑤ 不执行，cursor 冻结于终局值（BattleEndReport/战报可引用「打至第几波」）；仅 D→A 迁移路径执行 D⑤。终局回合的 C9 状态不再变化。
- **C9-E3｜顺延队列跨回合堆积**：出生区被前波残部持续占满时，pendingSpawns 可跨多回合累积（每回合 B① 首位重试）。零丢失承诺保证迟到敌军最终全部入场；耗尽谓词含「队列空」分量——堆积自动推迟 WIN 判定，无需特判。极端全局满员的荒局由 W-V6（末波破燧能力）+ 玩家清场能力（守方恒可经坡道出击歼灭地面残敌）双保险兜底，MVP 不设运行时僵局判定器。

### B. 入场落位

- **C9-E4｜入场格被占（spawnEdge 满）**：canPlace 预检失败 → 单单位入 pendingSpawns（裁定 D），下回合 B① 队首重试；与 F2-E13 守方援军顺延**同构但队列独立**（C9 自持，与 F2 pendingReinforcements / C6 时刻表零交叉）。落格扫描序（C9.2）天然偏向 x 最小列（贴边优先），残部占边时后入场者自动向 z/cell 纵深铺开。
- **C9-E5｜顺延重试与到期条目同回合竞争**：B① 处理序=顺延 FIFO 优先、到期条目其后（C9.1）——迟到的残敌先回到场上，节奏表的既定波次随后；两源单位各归各波（unitWaveMap 在首次处理时已绑定）。同回合入场总量超过出生区容量的极端场景由顺延自然消化（失败者留队，无报错无丢失）。
- **C9-E6｜顺延中的单位被集火？** 不可能：UNDEFINED 态无占位、无行为面、不在 C8 计划域与 C5 目标域（C2 §2.1 源态语义的自然推论）。P1 对顺延单位零渲染（无实体）。

### C. 波生命周期与意图

- **C9-E7｜全波耗尽后敌军未清空的持续回合**：耗尽谓词为真后战局照常循环——B① 空转、C8 每回合对残敌重出计划（C8 §2.1 每回合生成一次）、D④ 双分量判定。残敌清空 → WIN；烽燧破 → LOSE。无「耗尽即胜」的提前判定，无「耗尽后残敌冻结」的僵化处理——最后一波残敌爬墙正是濒危险胜的收尾张力（F2 §2.5 原口径重申）。
- **C9-E8｜FEINT 波被全歼对后续波 intentTag 的影响**：**零影响（纯预设，裁定 H）**——后续波意图按表执行，不因前波战果动态调整。理由：确定性/可测试/编排可读三收益，且「佯攻失败则主攻改道」的智能是 C11 士气联动级别的 Alpha 话题（OQ-3）。动态调整在 MVP 的唯一合法近似=改表（平衡轮权限）。
- **C9-E9｜督队阵亡对后续波次光环**：光环是 C2.6/C8.7 的**在场计算**，随死亡即时消失（C2-E9 时序）；波次层面**无指挥权转移/副督队接管机制**——后续波无督队则无增益，纯预设。编排层用「督队仅配置于 L3 中后段主攻/决战波」控制其暴露面与价值窗口（§2.6 骨架），「多督队接力」留 Alpha 编排变体（改表即得，无需新机制）。
- **C9-E10｜空场回合的 WaveManifest**：场上无存活敌军且本回合无入场（如末波前的大间隔）→ 当前波回退 lastWaveId、`units=[]`、`unitIntents={}`；C8 generatePlans 对空集合产出零计划（B③-B④ 链路照常走完，plans_ready 照发）——相位机不因空场跳步。

### D. 跨文档与校验

- **C9-E11｜同回合多波注入**：表层面被 W-V2 拒绝（ERROR）；运行时层面 spawnForTurn 对 `dueTurn == turn` 条目取唯一（升序扫描首组），构造上不可多取——双保险，fuzz 测试项（§8.2）。
- **C9-E12｜波次表与关卡数据不一致**：levelId 错配 / spawnEdge 悬空（W-V7）→ INIT 加载期硬错误拒绝启动（F1 V 系同纪律，禁静默降级）；W-V3 门禁违规同炮——「L1 混进督队」是设计回归事故，加载期拦截而非运行期容错。

---

## 6. UI 接口

### 6.1 C9 暴露给 UI 层的数据

| UI 元素 | 数据来源 | 语义 |
|---|---|---|
| 波次进度指示 | `C9Query.currentWave()` | P4 顶部「第 3 / 6 波」+ 意图旗标（旗标语义消费 C8 `currentIntent()` / manifest.intentTag，朱砂/米白视觉语言归 P4） |
| 「最后一波」横幅 | `waves_exhausted` 事件 | 濒危险胜收尾提示——「敌军已倾巢，清场即胜」（P4 文案锚点） |
| 入场演出锚点 | `wave_entered` / `enteringUnits` | P1 号角/狼烟入场演出（P5 氛围消费）、P4 波次横幅「第 3 波 · 佯攻」（meta.nameKey 可选文案） |
| 下一波预告（可选） | `C9Query.nextWavePreview()` | MVP 全图可见前提下无信息差负担，「侦测：下回合敌军大部队入场」提示归 P4 排期；不做=零成本 |
| 顺延调试显示 | `wave_spawn_deferred` / `spawnQueueDepth()` | 仅调试 overlay / X5 统计；MVP 不做玩家可见告警（§3.4） |

### 6.2 接口契约（对外承诺，下游 GDD 引用）

| 契约 | 提供方→消费方 | 内容 | 状态 |
|---|---|---|---|
| 入场钩子 | C9→F2 | `spawnForTurn(turn): {entered: UnitId[], deferred: n}`——B① 调用，落位经 C2.enterField→F1.placeUnit 链（§2.4）；`advanceCursor(turn)`——D⑤ 调用 | ✅ 本文定义（F2 §6.2「语义定，表归 C9」行的签名落地） |
| 耗尽谓词 | C9→F2 | `C9Query.wavesExhausted(): boolean`（§4-C9.3）——D④ 检查点输入，闭合 F2.5 的 C9 侧 | ✅ 本文定义 |
| 波次消费 | C9→C8 | `WaveManifest`（§3.3）——四字段签名对齐 C8 §2.2 + 两受控扩展字段；B③ 前冻结 | ✅ 本文主裁（C8 §9.1-4 半销账就此销账，回执请求见 §9.1-1） |
| 入场状态迁移 | C9→C2 | `C2.enterField(unitId, cellId)`——UNDEFINED→DEPLOYED（C2 §3.4 白名单消费；「C9 入场→DEPLOYED」路径正式启用） | ✅ 消费 C2 既有契约，C2 零改动 |
| 时刻表数据 | F3→C9 | `l{n}-waves.json`（WaveTable，§3.1/§3.5 校验） | ✅ 键定，值 ⚠ 灰盒 |
| 波次事件 | C9→P1/P4/P5/X5 | §3.4 三事件（全局事件流，可重放） | ✅ |
| 死亡清理订阅 | C2→C9 | `eliminate` 事件 → unitWaveMap 条目清理（INV-C9-1） | ✅ 消费 C2 §6.2 既有事件 |
| 分界互认 | C6↔C9 | 守方援军时刻表（ReinforceEntry，economy.json）归 C6、敌军波次（WaveEntry，waves.json）归 C9；两顺延队列独立零交叉 | ✅ C6 §2.6 分界的镜像确认，零改动 |

### 6.3 输入约束

C9 全自动、无玩家输入入口（决策④匈奴仅 AI 的编排面延伸）；P3/P4 不得向 C9 注入跳波/延波指令（调试指令走开发工具层，不入游戏契约）。调试 overlay 只读，不反向驱动时刻表。

---

## 7. 依赖

### 7.1 上游依赖（C9 需要）

| 依赖 | 类型 | 说明 |
|---|---|---|
| F1 地形 v1.4.3 | 结构契约 | `enemySpawns`（spawnEdge 引用源 + zRange）、`placeUnit/canPlace` 写白名单消费（经 C2 链）、出生区 GROUND/passable 判定、V2/V11/V12 校验兜底、§10.1 三变量（W/连接器列为 R4 组合表输入）、§10.4 兵种门禁（W-V3 依据）、§10.2 渲染护栏（W-V10 哨兵）、§2.7 单轴红线 |
| F2 相位 v1.0.3 | 窗口与时序 | B① 入场窗口、D⑤ cursor 簿记固定位、D④ 检查点（wavesExhausted 求值时点）、E2 多波并存语义、E8 末波破燧（W-V6）、E13 顺延同构参照、DPhaseLedger.waveCursor 镜像位、S0/S1 存档点覆盖 |
| C2 单位 v1.1.2 | 状态与事件 | `enterField`（UNDEFINED→DEPLOYED，§3.4 白名单）、templateId 枚举（W-V3 查表源）、`eliminate` 事件（unitWaveMap 清理触发源）、E11 跨波存活裸保留口径、E7 双闸回执语义、§10 OQ-5 承接 |
| C8 匈奴 AI v1.0.1 | 消费方契约 | §2.2 WaveManifest 四字段签名（本文落地）、intentTag 三枚举、intent-scripts.json 主键 + (levelId, waveId) 覆盖粒度、§2.1 B③ 消费路径、§9.1-4 半销账行（本次销账） |
| C6 经济 v1.0.2 | 分界互认 | §2.6 守方援军/敌军波次分界（零交叉确认）；无数据依赖 |
| F3 数值表 | 数值宿主 | `l{n}-waves.json`（WaveTable——C9 为数值载体，systems-breakdown §4）；`spawnDepth` 键（落格扫描深度 ⚠）；单位/间隔全部定值 |
| F4 确定性随机 | 纪律 | C9 零消费（INV-C9-4，静态扫描断言）——纯预设编排不需要随机源 |
| 概念稿/systems-breakdown | 设计依据 | §4 三关节奏、§6 四兵种构成、§1.2 C9 职责、§5.4-R4 三变量差异化 |

### 7.2 下游消费者（依赖 C9）

| 消费方 | 消费内容 | 对应 GDD |
|---|---|---|
| F2 相位 | spawnForTurn/advanceCursor 钩子 + wavesExhausted 谓词（D④） | 已落盘 v1.0.3（B①/D⑤/§2.5），零改动 |
| C8 匈奴 AI | WaveManifest（B③ 意图语境）+ unitIntents 精化点回执 | 已落盘 v1.0.1，消费面待互审回执（§9.1-1） |
| C2 单位 | enterField 的攻方调用方（C9 入场→DEPLOYED 路径正式启用） | 已落盘 v1.1.2，零改动 |
| P4 HUD | 波次进度/意图旗标/末波横幅 | — |
| P1/P5 | wave_entered 入场演出锚点 | — |
| F5 存档 | WaveRuntimeState 序列化契约（§3.2） | — |
| X5 模拟器 | 确定性重放（C9.5）+ 顺延率/波次压力统计（§3.4 事件） | Alpha |
| X1 战役流程 | 三关波次表=关卡难度曲线的数据实体（选关载入 waves.json）；「3 关连打」的强度坡道由 §2.6 骨架承载 | 序列 #9 |
| X4 编辑器(Alpha) | WaveTable schema 即波次编辑数据模型（count 语法糖在编写层编译为显式条目） | Alpha |

### 7.3 上游契约走查结论（零冲突声明 + 两处措辞精化）

| 文档 | 走查点 | 结论 |
|---|---|---|
| C8 v1.0.1 | §2.2 WaveManifest 四字段签名 | **零冲突（正式消费）**：§3.3 逐字落地；`unitIntents`/`enteringUnits` 为受控追加扩展，单波在场时 C8 现有行为逐字节零变化；C8.3 查表键精化点待 C8 互审回执（§9.1-1，非破坏性） |
| C8 v1.0.1 | §9.1-4「WaveManifest 接口定义——半销账（C9 落地对齐）」 | **本次销账**：签名已落地（§3.3），建议 C8 侧将该行置为完全销账 |
| F2 v1.0.3 | §2.2-B①/D⑤ 挂点、E2 多波并存、E8 末波破燧、E13 顺延 | **零冲突**：B①/D⑤ 语义照单全收；E2 经「相邻接力+残部继承」承接（§2.5）；E8 经 W-V6 承接；E13 同构队列独立（§2.4） |
| F2 v1.0.3 | §6.2「波次入场钩子｜B① 调 C9.spawnForTurn(turn) → 返回入场条目（F1 placeUnit 由 C9 调用）」 | **措辞精化建议（非冲突）**：占位迁移经 C2.enterField→F1.placeUnit 白名单链完成（C2 §3.4 纪律优先于该行字面表述）；B① 窗口/入场时点/顺延语义与 F2 裁定完全一致。建议 F2 下次修订时该行括注「经 C2 状态机白名单链」，本文 §2.4 已按精化链落定 |
| F2 v1.0.3 | F2.5 `wavesExhausted(C9 cursor)` | **定义权声明（非冲突）**：谓词按「处理态」而非「cursor 位置」定义（§2.7/§4-C9.3）——F2 将定义权留予 C9（「耗尽判定」归 C9 波次表，§2.5 原文），本文行使之；修正了「按 cursor 位置判」导致的胜利滞后一回合问题。建议 F2 注记 |
| F1 v1.4.3 | §10.4 兵种门禁、§10.1 三变量、enemySpawns 结构、§2.7 单轴红线 | **零冲突**：W-V3 逐字承接 §10.4；R4 组合表照录 §10.1 权威值；spawnEdge 引用 EnemySpawnDef.id；MVP 恒单端不破单轴红线 |
| F1 v1.4.3 | §9.1 enemySpawns[].waveRef 引用模式 | **零冲突（消费确认）**：`l{n}-waves.json` 文件名沿用 F1 草案命名，C9 为该引用的正式兑现方 |
| C2 v1.1.2 | §2.1「C9 入场→DEPLOYED」、§3.4 enterField、E7 双闸、E11 裸保留、§10 OQ-5 | **零冲突**：enterField 链正式启用（§2.4）；OQ-5 C9 侧回应=MVP 裸保留确认为正式口径（波次表不提供跨波补给/增强，增强机制留 Alpha 评估）——C2 OQ-5 半销账（§9.2） |
| C6 v1.0.2 | §2.6 援军/波次分界 | **零交叉确认**：ReinforceEntry（economy.json）/WaveEntry（waves.json）、F2 pendingReinforcements / C9 pendingSpawns 两两独立；C6 §2.6 分界声明在 C9 侧镜像成立，双方文件零改动 |

---

## 8. 验收标准

### 8.1 结构与数据验收（GDD 层）

- [ ] SC-1：WaveTable/WaveEntry/WaveUnitSpec schema、WaveRuntimeState、WaveManifest（含两扩展字段边界声明）全部定义且数值零硬编码（§2.2/§3.1/§3.2/§3.3，全部 F3 宿主）。
- [ ] SC-2：与 C8 v1.0.1 / F2 v1.0.3 / F1 v1.4.3 / C2 v1.1.2 / C6 v1.0.2 契约零冲突（§7.3 逐条）；C8 §2.2 签名对齐消费确认写入 §9。
- [ ] SC-3：五主裁点全部成文且无悬空——数据模型终版（§2.2/§3.3）、时序模型（§2.3）、意图编排语义（§2.5）、三关骨架（§2.6）、耗尽谓词（§2.7）。
- [ ] SC-4：W-V1..V10 校验清单齐备，W-V3（兵种门禁）与 W-V6（末波破燧）可追溯到 F1 §10.4 / F2-E8。
- [ ] SC-5：R4 三变量组合表落地且地形变量零新增（§2.6 与 F1 §10.1 逐格对表）。

### 8.2 行为验收（实现层，可自动化）

- [ ] BE-1：确定性重放——同（waves.json, WaveRuntimeState, F1 占位快照）→ spawn 序列与 WaveManifest 逐字节一致（C9.5，含 tie-break 无歧义断言）。
- [ ] BE-2：INV-C9-1..6 全部单测通过；随机落位/死亡/顺延 fuzz（1 万次）下零幽灵引用、零条目丢失。
- [ ] BE-3：时序链——B① 处理恰一次（INV-C9-2）：顺延重试→到期入场→wave_entered 聚合→D⑤ 簿记前移→DPhaseLedger 镜像一致，全链事件可追溯。
- [ ] BE-4：耗尽谓词——只耗尽不清场不判胜、只清场不耗尽不判胜、末波当回合清场即判胜（D④ 求值不依赖 D⑤ 簿记）三分量断言（与 F2 BE-4 联测）。
- [ ] BE-5：顺延链——出生区满→单单位入队→下回合 B① 首位重试→成功出队/失败累积，全链零丢失（与 F2 BE-7 结构对称独立）。
- [ ] BE-6：意图继承——FEINT 波残部在 MAIN_ASSAULT 波入场当回合的 C8 评分仍按 FEINT 权重（unitIntents 生效断言）；单波在场时 C8 计划与扩展字段缺席场景逐字节一致（零回归断言）。
- [ ] BE-7：W-V 校验负样本集（dueTurn 乱序/同回合双波/L1 混督队/末波无破燧能力/悬空 spawnEdge ≥ 5 类）全部加载期拒绝并给出可定位错误。
- [ ] BE-8：静态扫描——C9 模块零 Math.random、零 F4 游标（INV-C9-4，与 C6 INV-C6-5 同款断言）。

### 8.3 玩法判据（供灰盒可玩性轮）

- [ ] PL-1：三关强度曲线差异可感知——教学关「一波一个概念」、标准关「佯攻拉扯」、高潮关「齐攻+督队濒崩谷底」；试玩者能复述三关压力差异（R4 验证）。
- [ ] PL-2：「本波冲哪」可读——入场瞬间意图旗标 + 实际攻势方向一致率高（FEINT 波确实多点拉扯、MAIN_ASSAULT 波确实集中破口）；旗标撒谎即编排失败。
- [ ] PL-3：残部继承成立——主攻波到达时，前期佯攻残部仍在侧翼拉火力，玩家「拆东墙救西墙」的两难可复现（P4 支柱场景）。
- [ ] PL-4：末波收尾张力——「最后一波」横幅出现后，清场即胜（无寂静回合），最后一轮极限调度的爽点在 L3 决战波可复现（与 F2 PL-4 联测）。

### 8.4 数值初值汇总（全部 F3 `l{n}-waves.json` 宿主，工作假设标注 ⚠）

| 键/项 | 初值 ⚠ | 说明 |
|---|---|---|
| 波次数 per level | 4 / 6 / 8 | L1/L2/L3（§2.6 骨架档位） |
| 首波 dueTurn | 2 ⚠ | 三关统一保留 T1 纯建设缓冲（W-V8 WARN） |
| 波间间隔 | 1–2 回合 ⚠ | 灰盒压曲线的主杠杆 |
| 每波单位数 | 3–12 ⚠ | 顺波次序号递增（灰盒） |
| 兵种配比 | §2.6 骨架 ⚠ | 骑射手/冲车/督队入场比例灰盒标定 |
| `spawnDepth`（F3 通用键） | 2 ⚠ | 出生区列深（落格扫描范围，§4-C9.2） |
| COORDINATED 波云梯兵数 | ≥3 ⚠ | 「多梯齐攻有意义」的下限（OQ-2 联动 C8 OQ-3） |

---

## 9. 前置契约与承接清单

### 9.1 C8 §2.2 签名消费确认（C8 §9 挂账表的销账凭证）

| # | 来源条目 | 处置 |
|---|---|---|
| 1 | **C8 §2.2 WaveManifest 签名 + §9.1-4「半销账（C9 落地对齐）」** | **销账（本文主裁落地）**：四字段（waveId/units/intentTag/spawnEdge）逐字对齐（§3.3）；`units` 语义按 C8 原文「本波入场+在场单位集合」执行。**回执请求（请 C8 互审确认两项）**：①受控扩展字段 `unitIntents`/`enteringUnits` 的追加不破坏 §2.2 主表；②C8.3 意图注入查表键精化为 `unitIntents[u] ?? intentTag`——单波在场时与现行行为逐字节零变化，多波并存时启用逐单位继承。C8 侧建议改动量：§2.2 表加两行字段注记 + §4 C8.3 一处键名精化，主键消费路径零改动 |
| 2 | F2 §6.2 波次入场钩子行 | **销账（签名落地）**：`spawnForTurn(turn)` / `advanceCursor(turn)` / `C9Query.wavesExhausted()` 三签名成文（§6.2）；F1 placeUnit 调用链措辞精化建议随行转 F2（§7.3） |
| 3 | F2 §2.5 检查点 C9 侧输入 | **销账**：wavesExhausted 谓词定义（§2.7/§4-C9.3）——F2.5 分式中 C9 分量的正式交付 |
| 4 | F2-E8 末波破燧能力 | **销账（校验承接）**：W-V6 硬校验（§3.5） |
| 5 | F2-E2 多波并存 | **销账（编排承接）**：相邻接力 + 残部继承语义（§2.5）——「连续压力是时刻表问题」的 C9 侧答案 |
| 6 | F2-E13 援军顺延同构 | **销账（同构独立）**：pendingSpawns 队列（§2.4）——与 F2 pendingReinforcements 结构对称、归属隔离 |
| 7 | F1 §10.4 兵种门禁 / §10.1 三变量 / waveRef 引用 | **销账（承接）**：W-V3 / §2.6 组合表 / `l{n}-waves.json` 命名（§3.1） |
| 8 | C2 §2.1「C9 入场→DEPLOYED」/ §3.4 enterField | **销账（正式消费）**：入场落位链启用（§2.4），C2 文件零改动 |
| 9 | C2 §10 OQ-5（攻方跨波存活补给/增强） | **半销账（C9 侧口径确认）**：MVP 裸保留确认为正式消费口径（C2-E11——跨波存活单位 MP/AP 照常重置、无补给无增强）；波次表不设增强字段；Alpha 增强机制（如督队整训）留 Alpha 评估，届时走 WaveUnitSpec 追加式扩展位 |
| 10 | C6 §2.6 援军/波次分界 | **销账（零交叉互认）**：§7.3 双向确认，双方文件零改动 |

### 9.2 承接挂账三态清单（汇总）

| # | 来源 | 条目 | 三态 |
|---|---|---|---|
| 1 | C8 §9.1-4 | WaveManifest 接口定义 | **销账**（§9.1-1，回执请求附） |
| 2 | F2 §6.2 / §2.5 | 入场钩子签名 / 耗尽谓词 | **销账**（§9.1-2/3） |
| 3 | C2 §10 OQ-5 | 跨波存活增强 | **半销账**（§9.1-9，Alpha 评估位） |
| 4 | C8 OQ-3 齐攻协同量化 | COORDINATED「足量云梯兵」下限 | **关联不承接**：C9 侧仅给编排骨架下限 ⚠（§8.4），公式量化归 C8 OQ-3 灰盒联测 |
| 5 | — | 其余上游（F1/C6/F3/F4） | **零承接**：逐项走查无未决挂账指向 C9（§7.3） |

---

## 10. 开放问题

| # | 问题 | 影响方 | 建议关闭时点 |
|---|---|---|---|
| OQ-1 | `l{n}-waves.json` 全部数值定值（波次数/单位数/间隔/首波回合/兵种配比） | C9/平衡轮 | 灰盒可玩性轮统一标定（§2.6 骨架为校准基准） |
| OQ-2 | 多波并存重叠窗口的体感校准（FEINT 残部存续时长 × 主攻到达时点的「并发质感」）＋ COORDINATED 波云梯兵「足量」下限 | C9/C8/平衡轮 | 灰盒轮（PL-3 与 C8 OQ-3 联测） |
| OQ-3 | 动态波次触发（前波全歼提前入场 / 士气溃退联动攻势瓦解） | C9/C11 | Alpha 启动评审（MVP 纯预设裁定 H 的解除条件） |
| OQ-4 | 第二入场端（多 spawnEdge）与 C12 预警回合列（「侦测到敌军集结」信息差） | C9/F1/C12 | Alpha/Beta（F1 §2.7 单轴红线解除时同步评估） |
| OQ-5 | unitIntents 扩展的 C8 消费回执 + F2 两处措辞精化注记落文 | C8/F2 | 互审走查批（GW-P2-009 互审轮） |
| OQ-6 | 入场落格「扫描堆叠填充 vs 轮转铺开」的演出观感（现行 C9.2 扫描序会先填满一格再开新格，堆叠可视化观感待验） | C9/P1 | 灰盒视觉轮（渲染侧单格堆叠可视化既定前提下低风险） |

---

## 11. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0-draft | 2026-09-21 | 首版（GW-P2-009 序列 #8a）：WaveManifest 终版 schema（C8 §2.2 四字段签名对齐落地 + unitIntents/enteringUnits 受控扩展，意图随波不随回合）；时序模型（纯预设按回合计 dueTurn、B① 处理/D⑤ 簿记两阶段分离、同回合至多一波）；波内表序入场 + (x↑,z↑) 落格扫描 + 单单位粒度顺延队列（F2-E13 同构独立）；意图编排语义（一波一意图、相邻接力+残部继承表达主佯并发、COORDINATED 纯评分层语义）；三关强度曲线骨架（兵种引入门禁 W-V3 承接 F1 §10.4、波次数 ⚠4/6/8、意图序列渐进、末波破燧红线 W-V6 承接 F2-E8）+ R4 三变量组合表；耗尽谓词与 cursor 簿记解耦（末波当回合清场即判胜）；enterField 入场链正式启用（C2「C9 入场→DEPLOYED」消费）；W-V1..V10 校验清单；E1-E12 边缘情况；C6 §2.6 援军分界零交叉互认；上游走查零冲突（§7.3，含 F2 两处措辞精化建议） |
