# X3 教学关引导脚本系统 · GDD

> **状态**：v1.1（2026-09-22，GW-VS-04 收口批：§2.3 TS6／TS8 各追加一行 presentation 语义槽位，处置外部评审 R3／R4 教学缺口；八步不增补裁定成文）｜ GW-P2-014 ｜ GDD 撰写序列 #10（Phase 2 GDD 收官篇）；v1.0=合流定稿（申请位三项经主理人裁定回执，见 §9.11）
> **产出**：文策渊（design-strategist-c9）
> **上游依据**：`design/systems-breakdown.md` v1.0（§1.4 外围层 X3 职责行「教学引导——第 1 关教学关（关卡即教学，纸面提示承载）；完整引导框架在 Beta；MVP 最简」、依赖图「X3 教学引导 ←（X1＋全部机制定稿）」、§3 撰写顺序序 10「教学是全部机制的第一次集成排演，必须最后写」）｜ `design/gdd/systems/X2-inheritance-campaign.md` v1.0.1（§9.2-3 交割物：LEVEL_INIT(L1) 教学挂点＋F5 存档生命周期摘要＋「教学关不可跳过 S0 存档」约束；附录 B.2.2 流转状态机四步骤＋S0 存档点；附录 B.4-4 红线「X3 不得在 L2/L3 注入引导」；B-BE-3 联测项「挂点正确触发一次且重打不重复播，序列 #10」；X1-E4「重新开始战役」；X2.3「重守此关」存档恢复）｜ `design/gdd/systems/F2-phase-scheduler.md` v1.0.4（§2.2 四相位窗口 A 建设/B 敌军/C 攻防/D 补给、§1.4-F 存档点 S0=INIT→A 与 S1=D→A、§5-G 事件边界 `phase_enter/exit`、§5-E12 C 相位拒存档、B① 波次入场时点）｜ `design/gdd/systems/C9-wave-orchestration.md` v1.0（§2.6 三关骨架 L1 行：波次 4、W=12、GATE 1、坡道 1、兵种门禁 W-V3=云梯步兵＋骑射手、意图序列 MAIN→MAIN→FEINT→MAIN、末波破燧 W-V6、无 COORDINATED W-V8；编排设计意图：W1@T2 纯云梯小队、W2 骑射手首现、W3 FEINT 小波；§4 事件签名 `wave_entered{turn, waveId, intentTag, units[]}`、`waves_exhausted{turn}`）｜ `design/gdd/systems/C10-delegation-control.md` v1.0.1（§2.2 裁定 B「默认 AUTO：守方单位出生/部署即 AUTO」、§6.2 契约表「教学消费」行＝默认 AUTO 底板＋引导切 MANUAL、§6.1 AUTO 意图 overlay 降级「戍卒意图箭头」、C10-E9 援军/部署初值 AUTO、C10-E7 槽进行中禁切）｜ `design/gdd/systems/C2-units.md` v1.1.3（§3.6 `setControlMode` 模式写入唯一入口＋`controlMode_changed{unitId, mode}` 事件；§2.1 X-1 组合态 DEPLOYED∧OFFBOARD＝预备队源态）｜ `design/gdd/systems/C3-defense-facilities.md` v1.0.3（§2.3 滚木礌石 ROLLING_STOCK：投放＝自由指令不占行动槽、目标梯 `connKind=LADDER ∧ status=ACTIVE`＋投放半径、裁定 E 人力约束「有人才搬得动石头」、效果链礌石 SPENT→F1 destroyConnector→C5 砸落伤害；§1.2 分类学：礌石=C3 设施）｜ `design/gdd/systems/C7-build-deploy.md` v1.0.2（§2.2 六指令模型与 A 相位窗口；§5「成功路径零自有事件：世界变化由 F1/C2/C3 mutation 事件表达」——教学完成条件挂既有 mutation 事件面的纪律依据）｜ `design/gdd/systems/C6-economy.md` v1.0.3（§3 经济键表 `perLevel.<id>.initialTreasury` 关卡初始余额——关初粮饷教学购买力消费面）｜ `design/gdd/systems/F1-terrain-grid.md` v1.4.3（LevelMap 静态层/connector 状态查询、§3.8 mutation 全部带校验＋事件纪律）｜ `design/game-concept-planA-turnbased.md` 定稿 v1.0（§4 三关节奏＝教学→标准→高潮、P4「濒危险胜」体验支柱）
> **范围红线**：本文只裁 X3——L1 教学脚本的**步骤模型**（触发器/完成谓词/提示槽位/顺序放行）、四项核心教学命题的落地步骤、跳过与重打语义、教学运行态 `tutorialState` 的持久化归属。**不写**提示的视觉呈现与文案语气（P4/叙事侧，本文只定语义槽位）、任何新机制/新事件/新战斗指令（教学＝既有事件流＋查询接口的纯消费者，见 §2.1）、L2/L3 引导（X2 B.4-4 红线；完整引导框架 Beta 另立）、演出编排（P4/Beta）、灰盒数值定值（F3/C6，本文只声明教学购买力约束）。
> **对齐状态**：消费 F2 v1.0.4 / C9 v1.0 / C10 v1.0.1 / C2 v1.1.3 / C3 v1.0.3 / C7 v1.0.2 / C6 v1.0.3 / X2 v1.0.2 / F1 v1.4.3 契约逐条走查（§9.1-§9.10）；三处上游申请位已全部经主理人裁定回执闭账（§9.11，v1.0 合流）；B-BE-3 联测验收口径以本文 §2.2/§2.6 裁定为准（§9.2）。

---

## 0. 八节导航

| 节 | 内容 |
|---|---|
| §1 | 系统概述：定位/设计支柱/MVP「最简」范围 |
| §2 | 机制：纯观察者模型、挂点时序、八步教学脚本、跳过与重打裁定 |
| §3 | 数据：tutorial.json 文件模式、TutorialStep schema、tutorialState 运行态 |
| §4 | 公式：激活谓词、完成谓词与先手豁免、提示互斥 |
| §5 | 边缘情况（E1-E8） |
| §6 | UI 接口：X3→P4 查询面与跳过指令 |
| §7 | 依赖 |
| §8 | 验收标准（SC-1～SC-7） |
| §9 | 契约（逐上游 §9.1-§9.10＋申请位 §9.11） |
| §10 | OQ |
| §11 | 变更记录 |

---

## 1. 系统概述

### 1.1 定位与职责边界

X3 是**教学引导脚本系统**：在 L1（教学关）上以「关卡即教学、纸面提示承载」的方式，引导玩家完成四项核心认知的第一次建立。X3 **不是**机制系统——它不拥有任何战斗数据、不发出任何战斗指令、不改变任何游戏规则；它是挂在既有事件流上的**纯观察者＋提示编排器**（§2.1）。

| 归 X3 | 不归 X3 |
|---|---|
| L1 教学步骤的触发/完成/顺序模型 | 提示框/箭头/高亮的视觉与文案（P4/叙事侧） |
| `tutorialState` 运行态与持久化归属 | 存档机制本体（F5/X2 附录 A） |
| 跳过语义、重打不重播语义 | L2/L3 任何引导（X2 B.4-4 红线） |
| 四项教学命题的步骤落地 | 新机制/新事件/新指令（禁止，§2.1） |
| MVP 最简脚本（八步，§2.3） | 完整引导框架（Beta 另立，systems-breakdown X3 职责行） |

### 1.2 设计支柱

| 支柱 | 内容 | MDA 对应 |
|---|---|---|
| XP-1「教判断，不教操作清单」 | 步骤只推进到「玩家做出第一次正确决策」为止（砸梯/接管/看旗标/收尾），不覆盖六指令全手册——其余指令 L2 自然接触 | 美学：掌控感建立 |
| XP-2「零耦合＝可跳过＝可重放」 | 教学=纯观察者，跳过与重放语义由**结构**保证（不订阅就不触发、不写入就不影响），而非靠约定自律 | 机制：观察者脚本 |
| XP-3「一夜守城即一课」 | L1 波次骨架（C9 §2.6）本身就是课程表：W1 云梯→礌石课、W2 骑射→掩体课、W3 佯攻→旗标课、W4 末波→收尾课；脚本不改变课程难度 | 动态：引导式首次体验 |

### 1.3 MVP「最简」范围裁定

- **总步数 8**：4 个交互步骤（有完成条件，需玩家操作）＋4 个提示步骤（纸面提示，玩家确认关闭）。
- **仅 L1**：tutorial.json 只含 L1 步骤表；L2/L3 关卡无教学脚本装载（与 X2 B.4-4 红线同构表述）。
- **零演出编排**：无镜头、无动画序列、无语音；表现层=纸面提示框＋复用 C10 §6.1「戍卒意图箭头」overlay。
- **跳过常驻**：任意教学提示框角落「跳过全部教学」，一键终态（§2.5）。

---

## 2. 机制

### 2.1 核心模型：教学脚本＝纯观察者（零耦合三禁）

X3 对游戏机制面**只读**。三条禁令（验收 SC-3/SC-4 的机制来源）：

1. **禁注入指令**：X3 不调用 C7 六指令面、C3 礌石投放面、C2/C10 setControlMode——一切战斗指令的来源只能是玩家（X5 指令流水在教学期间与无教学 run 同构）。教学引导玩家操作，不代替玩家操作。
2. **禁新增事件**：X3 零自有机制事件；触发与完成全部消费既有事件流（`phase_enter`/`wave_entered`/`waves_exhausted`/`controlMode_changed`＋F1/C2/C3 mutation 事件面）或对既有状态的**惰性查询**（§2.4 模式 b）。P4 对教学状态的感知走查询接口（§6），不走新事件。
3. **禁随机与计时**：教学判定零 F4（随机源）消费、零计时器——一切推进由「玩家输入」或「机制事件」驱动（确定性重放兼容，SC-4/SC-6）。

X3 唯一写入面＝`tutorialState` 自身（§3.3）＋域内指令 `X3Command.skipTutorial()`（§6，不进战斗指令流水）。

### 2.2 教学挂点与装载时序（裁定 1｜reconcile X2「步骤①后」vs 派单「步骤②后」）

X2 §9.2-3 写挂点在「附录 B.2.2 **步骤①**后」，GW-P2-014 派单写「**步骤②**后」。本文裁定如下，并建议 X2 措辞精化（§9.11-A2）：

**挂点精确语义＝「步骤②后装载、首步 A 相位执行」。**

```
LEVEL_INIT(L1)（X2 附录 B.2.2）
  ① F1 载入 LevelMap_L1
  ② X1 关初初始化：粮饷 ← perLevel.L1.initialTreasury（C6 键表，§9.11-A1）；
     rosterPool → C2 预备队投放（DEPLOYED∧OFFBOARD）
  ②' ★X3 挂点：装载 tutorial.json L1 步骤表；
       tutorialState=UNDEFINED → ACTIVE（仅当战役级无教学记录，§2.6）；
       首步 TS1 置 pending
  ③ preLevelSnapshot ← rosterPool
  ④ 移交 F2 INIT
  —— S0 自动存档（INIT→A 边界，F2 §1.4-F；快照含 tutorialState，§9.11-A3）——
  A(T1) phase_enter{A} → TS1 展示（首步执行窗口）
```

**裁定理由**（三层）：
- **为何不在步骤①后**：教学首段要引用**已投放的预备队**（TS3 部署教学的目标即 rosterPool 单位）。步骤①后仅 F1 地图载入，rosterPool 尚空，教学引用会拿到空集。
- **为何必须在步骤④前**：S0 存档点在步骤④后的 INIT→A 边界，「教学关不可跳过 S0 存档」约束（X2 §9.2-3）要求 S0 快照已含 tutorialState 初值——装载必须先于存档。
- **为何首步执行在 A 相位**：装载≠展示。步骤②时尚无 UI 焦点语境；TS1 由 `phase_enter{A}` 触发展示，时序语义干净，且与「一切教学推进由机制事件驱动」（§2.1 禁 3）自洽。

**B-BE-3 对齐**：联测项「X3 教学挂点在 L1 LEVEL_INIT 步骤②后正确触发一次且重打不重复播」——「触发」以本裁定为准（装载判定单次性由 §2.6 守卫）；「重打不重复播」语义细化见 §2.6 三情形。

### 2.3 L1 教学步骤总表（四命题 × 八步）

L1 课程表直接复用 C9 §2.6 骨架（W1@T2 纯云梯、W2 骑射首现、W3 FEINT、W4 末波；T1=开局建设回合）。四项核心教学命题（GW-P2-014 派单口径）→ 步骤映射：

| 命题 | 上游锚点 | 步骤 |
|---|---|---|
| ①默认 AUTO 底板→引导切 MANUAL | C10 §2.2 裁定 B＋§6.2「教学消费」行 | TS6（交互） |
| ②礌石自由指令（C3 域） | C3 §2.3 投放=自由指令＋人力约束裁定 E | TS2＋TS5（交互） |
| ③建设阶段六指令基础操作（C7 域） | C7 §2.2 六指令、A 相位全手动 | TS2＋TS3（交互） |
| ④末波濒危险胜收尾（W-V6 体验面） | C9 `waves_exhausted`＋W-V6 末波红线 | TS8（提示） |

八步总表（固定线性序，顺序放行见 §4.1）：

| id | 时窗 | 类型 | 命题 | 触发 | 完成 | 引导内容（语义槽位，文案归 P4） |
|---|---|---|---|---|---|---|
| TS1 | A(T1) | 提示 | — | `phase_enter{A}` 首次 | 玩家确认 | 「你是戍主，守住烽燧这一夜」：目标＝帅帐不破 |
| TS2 | A(T1) | **交互** | ③ | TS1 完成 | F1 registerFacility mutation 事件（kind=ROLLING_STOCK） | 引导 `BUILD_FACILITY` 架一座**礌石**于马道格——一石二鸟：教建设指令＋保证 W1 手上有礌石 |
| TS3 | A(T1) | **交互** | ③ | TS2 完成 | F1 placeUnit mutation 事件（DEPLOY_UNIT 路径，C7 §2.2） | 引导 `DEPLOY_UNIT` 从预备队部署一队戍卒，**高亮 GATE/坡道邻近垛口格**（保证 TS5 人力约束天然满足，§5-E7 兜底） |
| TS4 | B(T2) | 提示 | ①前置 | `wave_entered{waveId:W1}` | 玩家确认 | 「旗标＝这波冲哪」：意图旗标初见（W1=MAIN） |
| TS5 | C(T2) | **交互** | ② | C 相位内惰性谓词「存在 LADDER∧ACTIVE 云梯」（§2.4 模式 b） | 惰性谓词「目标梯 status≠ACTIVE」（毁梯由玩家投放礌石达成） | 引导投放礌石：选礌石→选梯。云梯克星第一课（C3 克制三原则：礌石克云梯） |
| TS6 | C(T2) | **交互** | ① | TS5 完成 | `controlMode_changed{mode:MANUAL}` 首次（C2 §3.6） | 戍卒意图箭头已在跑（C10 §6.1 教学复用）——「这是托管底板，点选戍卒切 MANUAL 接管」；**[VS-7 勘误/已裁定] 追加语义槽位（v1.1，GW-VS-EXT-01 R4）：接管后首次手动指令处补一条「先动后打」规则预告——攻击发起后本轮行动力清零（`mpZeroOnAttack=true`，C2 §2.4／C2.4），先动到位再打**（文案本体归 P4／叙事侧，见 §1.1 红线） |
| TS7 | B(T4+) | 提示 | — | `wave_entered{waveId:W3}`（FEINT） | 玩家确认 | 「佯攻旗标：敌在拉扯，别倾巢追出」——旗标辨意图深化课（C9 W3 设计意图对齐） |
| TS8 | D(T末波) | 提示 | ④ | `waves_exhausted{turn}` | 玩家确认（战斗结束则自然消隐，§5-E6） | 「敌已倾巢，清场即胜」——濒危险胜收尾提示（C9 §4「最后一波」横幅的教学侧锚点；W2 骑射掩体课为纯文案带过，不占步骤，MVP 最简裁定）；**[VS-7 勘误/已裁定] 追加语义槽位（v1.1，GW-VS-EXT-01 R3 意见②）：下一关城墙更长时，床弩将盖不住两端——建在哪、朝哪会成为真问题（朝向／站位押注的预告；严禁为此改 `bedCrossbow.range=12`）**（文案本体归 P4／叙事侧） |

> [VS-7 勘误/已裁定] **八步不增补裁定（v1.1，主理人第三轮终裁）**：外部评审 GW-VS-EXT-01 的 R3（床弩朝向押注）与 R4（锁足规则 `mpZeroOnAttack`）经核实均为教学缺口（证据见 `design/reviews/GW-VS-04-consolidation.md` §7.2），**处置方式＝在既有 TS6／TS8 的 `presentation` 语义槽位各追加一行，不新增第九步**。三条理由：①破 X3 §1.3「**总步数 8**」MVP 最简裁定；②破 XP-1「**教判断，不教操作清单**」——R3/R4 是规则知识而非操作项，挂既有步骤即可承载；③MVP 八步已与 C9 §2.6 L1 波次骨架（W1 云梯／W2 骑射／W3 佯攻／W4 末波）一一对应，插入新步骤会挤压既有课程的时窗（§2.3 时窗列）。**落笔边界**：本 GDD 只写**语义槽位**，提示的视觉呈现与文案语气归 P4／叙事侧（§1.1 红线）；两者均为零数值、零规则改动。

**六指令覆盖裁定**：交互教学覆盖 `BUILD_FACILITY`（TS2）＋`DEPLOY_UNIT`（TS3）＋`REDEPLOY_UNIT` 文案带过（§5-E7 兜底提示用，零费调度正好顺手教）；`REPAIR_FACILITY`/`DISMANTLE_FACILITY`/`WALL_REPAIR` 不教学——L1（GATE 1/坡道 1、无墙损压力）无其使用语境，留 L2 自然接触（XP-1：不教操作清单）。礌石投放是 C3 自由指令（非六指令），在教学中独立成步（TS5）。

### 2.4 触发器与完成条件（事件订阅面）

两类模式，按「零新增事件」纪律选用：

- **模式 a（事件直订）**：完成条件可直接映射既有事件——TS2（registerFacility）、TS3（placeUnit）、TS6（controlMode_changed）。
- **模式 b（事件唤醒＋惰性查询）**：条件是**状态谓词**而非单点事件时（TS5 的「梯已架好/已被毁」），由任意既有事件到达唤醒，对 F1 connector 状态做查询求值。选用理由：①架梯/毁梯的精确事件名归属 F1/C8 落盘，X3 不越权指定（OQ-4）；②查询读的是确定性状态，重放安全。

| 步骤 | 触发/完成 | 模式 | 消费面 |
|---|---|---|---|
| TS1/TS4/TS7/TS8 | 触发 | a | `phase_enter`（F2 §5-G）/`wave_entered`/`waves_exhausted`（C9 §4） |
| TS2 | 完成 | a | F1 registerFacility mutation 事件（C7 §5「世界变化由 F1/C2/C3 mutation 事件表达」） |
| TS3 | 完成 | a | F1 placeUnit mutation 事件 |
| TS5 | 触发＋完成 | b | F1 connector 状态查询（`connKind=LADDER ∧ status`） |
| TS6 | 完成 | a | `controlMode_changed{unitId, mode}`（C2 §3.6，X-C10-1 已落盘） |

全部事件/查询源均为上游已定稿契约，X3 零新增（SC-3/SC-4 的结构性来源）。

### 2.5 跳过机制（裁定 2：跳过＝关闭触发器，不改规则）

- 跳过指令 `X3Command.skipTutorial()`：`tutorialState.status → SKIPPED`，全部未触发步骤作废，全部在途提示立即关闭。**不回滚**玩家已完成的操作（§5-E2）。
- 规则零变化承诺：跳过 run 与不跳过 run 在同种子同指令序下，**战局终态逐字节一致**——教学不进任何战斗数据面，胜负判定/经济结算/AI 行为对教学状态完全无感（SC-5）。
- 无教学奖励、无跳过惩罚（MVP 最简；成就向「无跳过通 L1」若要做，属 X1 战役账本统计位，Beta）。

### 2.6 重打不重复播（裁定 3｜B-BE-3 扩展：LOSE 重打后**不重播已播步骤**）

`tutorialState` 持久化于存档快照（§9.11-A3），三情形显式裁定：

| 情形 | 路径 | 语义 |
|---|---|---|
| A：局内 LOSE→重守此关 | DEFEAT → X2.3 恢复 S0/S1 存档 → 继续打 L1 | **断点续播**：存档内 tutorialState 已带进度，已播步骤不重播、未播步骤照常触发。理由：玩家「正在学」的中断不应惩罚性重来；交互步骤完成态随档恢复 |
| B：L1 已通→L2/L3 | battle_won → X1 战役流程 | **零重播**：tutorialState=COMPLETED 随战役进度持久；L2/L3 本就无教学装载（B.4-4） |
| C：重新开始战役 | X1-E4 → 战役存档全清 | **重播**：tutorialState 随战役存档重置。理由：新战役=新玩家语境（或老玩家有意重开，其可一键跳过，§2.5） |

「触发一次」的结构保证：装载判定（§2.2 步骤②'）仅当 `tutorialState=UNDEFINED` 时执行——UNDEFINED→ACTIVE 迁移全游戏生命周期至多一次（情形 C 重置除外，属新战役）。

---

## 3. 数据

### 3.1 tutorial.json 文件模式

```jsonc
{
  "levels": {
    "L1": { "steps": [ /* TutorialStep[]，固定线性序 */ ] }
  }
}
```

仅 L1 有条目（B.4-4 红线的数据面表达：L2/L3 键不存在＝无装载）。宿主目录与加载时机归 F1/X1 侧数据管线惯例，X3 只定义本文件 schema。

### 3.2 TutorialStep schema

```ts
interface TutorialStep {
  id: 'TS1' | ... | 'TS8';
  kind: 'INTERACTIVE' | 'HINT';
  window: { phase: 'A' | 'B' | 'C' | 'D', waveId?: string };   // 展示时窗（灰盒对齐 C9 表）
  trigger: TriggerSpec;      // §2.4 模式 a/b 之一
  completion?: TriggerSpec;  // 仅 INTERACTIVE 必填
  presentation: {            // 语义槽位，视觉/文案归 P4
    title: string;           // 键位（实际文案由叙事侧填充）
    body: string;
    highlight?: HighlightTarget;  // 单位/格/设施/连接器，复用 C10 §6.1 箭头与既有高亮面
  };
}
type TriggerSpec =
  | { mode: 'event',    event: 'phase_enter' | 'wave_entered' | 'waves_exhausted'
                      | 'controlMode_changed' | 'registerFacility' | 'placeUnit', filter?: object }
  | { mode: 'query',    predicate: 'ladderActive' | 'ladderDestroyed' };  // §2.4 模式 b，谓词枚举封闭
```

谓词枚举封闭（仅 2 项）：教学查询面收敛到 F1 connector 状态最小读集，不做通用脚本语言（MVP 最简；Beta 完整框架再议）。

### 3.3 tutorialState 运行态与持久化

```ts
interface TutorialState {
  status: 'UNDEFINED' | 'ACTIVE' | 'COMPLETED' | 'SKIPPED';
  doneSteps: StepId[];        // 已完成步骤（含先手豁免，§4.2）
  doneTurn: Record<StepId, number>;  // 完成回合（调试/联测取证）
}
```

- **持久化归属**：F5 存档快照 X3 区段（随 S0/S1 自动存档；C 相位拒存档期教学状态同样不落盘，与 F2-E12 同边界）——✅ 已落账：X2 v1.0.2 附录 A.3 `x3?: TutorialState`（§9.11-A3 采纳回执）。
- **恢复语义**：X2.3 读档 → tutorialState 随快照整体恢复 → 缺字段默认 `COMPLETED`＋告警（对齐 C10-E5「缺字段默认 AUTO＋告警」同构；§5-E3）。
- **UNDEFINED 语义**：战役存在但教学从未装载（理论上仅 L2+ 新战役出现）——查询接口一律报「无教学」。

---

## 4. 公式

教学系统无量产数值公式；本节形式化三规则（全部返回布尔/集合，无单位、无随机项——确定性纪律的形式面）。

### 4.1 步骤激活谓词

```
Active(s) ⇔ status = ACTIVE
          ∧ s ∉ doneSteps
          ∧ s = nextStep()                     // 固定线性序：队首未完成步骤
          ∧ TriggerSpec(s) 成立                 // 模式 a：事件到达；模式 b：事件唤醒后查询为真
nextStep() = steps 中第一个 ∉ doneSteps 的步骤  // 交互步骤未完成则阻塞后序（HINT 亦按序）
```

### 4.2 完成谓词与先手豁免

```
Complete(s) ⇔ ( kind(s) = HINT        ∧ 玩家确认 )
            ∨ ( kind(s) = INTERACTIVE ∧ CompletionSpec(s) 成立 )

先手豁免：CompletionSpec(s) 成立时若 s ∉ Active(s)（玩家抢在教学提示前完成目标动作）
  → doneSteps ← doneSteps ∪ {s}   // 静默标记完成，跳过展示，直接放行 nextStep()
```

理由：教学不能惩罚熟练玩家；展示的目的是引导第一次操作，操作已发生则目的已达。

### 4.3 提示互斥

```
展示队列 Q：|Q| ≤ 1；新提示到达时 Q 非空 → 入队尾（FIFO）
确认/步骤完成 → 出队 → 队首入展示
```

防多提示叠加的认知过载（设计理论红线：防认知过载的最小手段）。MVP 八步天然稀疏（每相位至多 1-2 步），队列实际深度常态 ≤1。

---

## 5. 边缘情况

| id | 情形 | 裁定 |
|---|---|---|
| E1 | 玩家先手：提示未出已完成目标动作（如自行投放礌石） | 先手豁免（§4.2）：静默完成放行，不补播 |
| E2 | 交互步骤进行中玩家点「跳过全部教学」 | 立即 SKIPPED 终态；已完成的玩家操作**不回滚**（教学无权撤玩家指令，§2.1 禁 1） |
| E3 | 存档恢复时 tutorialState 缺字段（旧档/损坏） | 默认 `COMPLETED`＋告警——教学缺失不阻塞游戏（C10-E5 同构）；不重建教学（半途教学比无教学更糟） |
| E4 | TS5 目标云梯在步骤激活前被床弩先毁 | 先手豁免同构：梯已毁＝完成条件已真，静默完成，TS6 顺延激活 |
| E5 | C(T2) 无可接管对象（戍卒全灭——灰盒极端局） | TS6 激活谓词附加查询「存在 AUTO∧存活守方单位」；为假则静默完成（教学不得阻塞败局流程） |
| E6 | TS8 展示中战斗结束（END_WIN/END_LOSE） | 提示随终局画面切换自然消隐；终态后 X3 零活动（status 已 COMPLETED/或 SKIPPED 持久，无泄漏） |
| E7 | TS5 人力约束不满足（梯顶相邻垛口无存活守方单位——玩家把人调走了） | 追加**补充提示**（非新步骤）：「没人搬不动石头」＋引导 `REDEPLOY_UNIT`（零费）调人上垛口——顺手教第三指令；谓词满足前步骤保持 ACTIVE 不超时（零计时器纪律） |
| E8 | TS6 完成后玩家反复切 MANUAL/AUTO | 首次 `controlMode_changed{MANUAL}` 即完成入 doneSteps；重复切换不重播不重复计数（首事件语义，与「触发一次」纪律同构） |

---

## 6. UI 接口

### 6.1 X3→P4 查询面（感知走查询，不走新事件）

```ts
interface TutorialQuery {
  isActive(): boolean;                    // status = ACTIVE
  currentStep(): { id: StepId, presentation: Presentation } | null;  // 展示队列 Q 队首
}
```

P4 在既有事件（phase_enter/wave_entered/controlMode_changed/…）到达后调用查询刷新教学 HUD——与 C10 挂件「订阅槽事件＋查询」同模式（C10 §9 契约 5 的纪律同源：表现层禁反向驱动）。视觉呈现（提示框样式/箭头动效/文案语气/朱砂米白语言）全部归 P4/叙事侧（OQ-1）。

### 6.2 X3 指令面（域内，不进战斗指令流水）

```ts
interface X3Command { skipTutorial(): void; }   // 唯一指令（§2.5）；跳过按钮=常驻于教学提示框角落（P4 渲染）
```

教学期间 X5 对账面＝空集：X3 产零战斗指令、零战斗数据写（对账声明，§2.1 三禁的簿记侧推论）。

### 6.3 输入处理

教学不改任何输入绑定/快捷键；交互步骤的高亮目标仅是**视觉引导**，不锁定输入——玩家在教学提示展示期间可自由执行任何合法指令（先手豁免 §4.2 兜住一切抢跑）。可访问性：提示文本承载全部教学语义（「纸面提示承载」，systems-breakdown 职责行），不依赖纯视觉线索传达规则知识——对齐 design/accessibility-requirements 的「信息双通道」取向。

---

## 7. 依赖

| 系统 | 关系 | X3 消费的具体契约 | 版本 |
|---|---|---|---|
| X2（含 F5/X1 附录） | 上游·挂点宿主 | LEVEL_INIT(L1) 挂点位（§2.2）、存档生命周期（S0 不可跳过）、B.4-4 红线、X2.3 恢复、X1-E4 重开、快照 X3 区段（申请位） | v1.0.1 |
| F2 | 上游·事件流 | 四相位窗口、`phase_enter/exit`、S0/S1 边界、E12 拒存档 | v1.0.4 |
| C9 | 上游·课程表 | L1 骨架（§2.6）、`wave_entered`/`waves_exhausted` 签名 | v1.0 |
| C10 | 上游·命题① | 默认 AUTO 裁定 B、§6.2 教学消费行、意图箭头 overlay、E5/E9/E7 | v1.0.1 |
| C2 | 上游·事件 | `controlMode_changed`（§3.6）、预备队源态（§2.1） | v1.1.3 |
| C3 | 上游·命题② | 礌石自由指令/人力约束/毁梯链语义（§2.3） | v1.0.3 |
| C7 | 上游·命题③ | 六指令模型与 A 相位窗口、零自有事件纪律（§5） | v1.0.2 |
| C6 | 上游·购买力 | `perLevel.<id>.initialTreasury`（教学建设步骤购买力约束，OQ-2） | v1.0.3 |
| F1 | 上游·状态源 | LevelMap/connector 状态查询、mutation 事件面（registerFacility/placeUnit） | v1.4.3 |
| P4 | 下游·表现 | TutorialQuery 消费、跳过按钮渲染、文案视觉填充（OQ-1） | 未启动 |
| X5 | 旁路·对账 | 对账面=空集声明（§6.2） | — |

X3 是 systems-breakdown 撰写序 #10（最后一位）——本表的全部上游契约均已落盘，无未定稿依赖（申请位三项除外，皆为主理人核，不阻塞结构）。

---

## 8. 验收标准

| id | 标准 | 验证方式 |
|---|---|---|
| SC-1 | 挂点一次：tutorialState UNDEFINED→ACTIVE 全战役生命周期至多一次；装载于 LEVEL_INIT 步骤②后、S0 前 | 单测＋联测（B-BE-3 序列 #10） |
| SC-2 | 重打三情形：局内 LOSE 重守=断点续播；L1 已通 L2+ 零重播；战役重开=重播且可跳过 | 存档生命周期用例 ×3 |
| SC-3 | 零指令注入：教学期间 X5 指令流水与无教学 run 同构（全部指令来源=玩家） | 流水 diff 用例 |
| SC-4 | 零 F4 消费、零计时器：教学判定仅由事件与状态查询驱动 | 代码审查＋重放用例 |
| SC-5 | 跳过零规则差异：同种子同指令序下，跳过与不跳过战局终态逐字节一致 | 双 run 终态 hash 对比 |
| SC-6 | 确定性重放兼容（F2 BE-2）：同存档+同指令序重放，教学步骤触发序确定 | 重放用例 |
| SC-7 | 仅 L1：tutorial.json 无 L2/L3 键；L2/L3 装载路径为 no-op | 数据校验＋装载单测 |

---

## 9. 契约

### 9.1 F2 v1.0.4
消费 `phase_enter/exit` 事件边界（§5-G）与四相位窗口（§2.2）；S0/S1 存档边界决定教学状态落盘时机；E12 C 相位拒存档期间教学状态同不落盘。零新增要求，✅ 语义就绪。

### 9.2 X2 v1.0.2（含 B-BE-3 验收口径声明）
挂点语义按本文 §2.2 裁定（**步骤②后装载、A 相位首步执行**）；**B-BE-3 联测（序列 #10）验收以本文口径为准**。X2 v1.0.2 §9.2-3 已照此精化（A2 回执落账）；§9.2-3 原文「附录 B.2.2 步骤①后」系交割表单处笔误，X2 自身 B-BE-3/B.4-4 原文即「步骤②后」。「教学关不可跳过 S0 存档」约束兑现：装载先于 S0、tutorialState 入首存（X2 v1.0.2 附录 A.3 `x3?: TutorialState`，A3 回执落账）。

### 9.3 C9 v1.0
消费 `wave_entered{turn, waveId, intentTag, units[]}`（TS4/TS7 触发）与 `waves_exhausted{turn}`（TS8 触发）；L1 步骤时窗引用 §2.6 骨架（W1@T2/W2/W3/W4），灰盒回填不改步骤结构。~~键名冲突见 §9.11-A1~~——经主理人核验 C9 v1.0 全文无经济键名引用，冲突不成立，申请项已闭（§9.11-A1 驳回备案）。

### 9.4 C10 v1.0.1
§6.2「教学消费」契约行兑现：TS6＝默认 AUTO 底板上的引导接管（C10 不为教学覆写初值，教学不覆写 C10 规则）；TS4/TS6 复用 §6.1 戍卒意图箭头 overlay（教学期 overlay 常开＝教学语义，非调试语义）；TS6 完成条件消费 X-C10-1 落地面 `controlMode_changed`；E7 槽中禁切是玩家侧自然约束，教学不绕行。

### 9.5 C2 v1.1.3
消费 §3.6 `setControlMode` 唯一写入面与 `controlMode_changed{unitId, mode}` 事件（X3 只订阅不调用）；§2.1 DEPLOYED∧OFFBOARD 预备队源态是 TS3 部署教学的单位来源。

### 9.6 C3 v1.0.3
TS5 教的是 §2.3 语义本身：自由指令（不占行动槽）、投放半径、**人力约束裁定 E**（E7 兜底提示的规则来源）；礌石采购走 C7 BUILD_FACILITY（TS2），投放走 C3 自由指令面——X3 零调用，两步均由玩家执行。

### 9.7 C7 v1.0.2
TS2/TS3 消费六指令之二（BUILD_FACILITY/DEPLOY_UNIT）于 A 相位全手动窗口；完成条件挂 §5「零自有事件、世界变化由 F1/C2/C3 mutation 事件表达」纪律的既有事件面。

### 9.8 C6 v1.0.3
关初粮饷消费 `perLevel.<id>.initialTreasury` 键（§3 键表形状）；~~C9 §2.6 写法 `campaign.initialTreasury.L1` 与键表冲突——申请位 §9.11-A1~~——经核验 C9 无此引用，冲突不成立（§9.11-A1 已闭）。教学购买力约束（OQ-2）：灰盒须满足「DEPLOY_UNIT 一口价＋礌石造价＋建设冗余」最低组合。

### 9.9 F1 v1.4.3
TS2/TS3 完成条件消费 registerFacility/placeUnit mutation 事件（§3.8「全部带校验＋事件」）；TS5 惰性谓词读 connector 状态（connKind/status 查询面）；事件名以 F1 落盘为准（OQ-4）。

### 9.10 P4（未启动，语义槽位先行）
X3→P4：TutorialQuery 查询面＋presentation 语义槽位＋跳过按钮位。P4 回执项：提示框/箭头视觉规格、文案定稿、highlight 目标类型渲染。

### 9.11 申请位（三项，已全部经主理人裁定回执，v1.0 合流闭账）

| id | 事项 | 建议 | 裁定（2026-09-21，主理人） |
|---|---|---|---|
| A1 | ~~**键名冲突**：C9 v1.0 §2.6 L1 行 `campaign.initialTreasury.L1` vs C6 v1.0.3 §3 键表 `perLevel.<id>.initialTreasury`~~ | 按「数据宿主优先」采 C6 形状 `perLevel.L1.initialTreasury`，C9 走勘误批对齐 | **驳回——冲突不成立**：主理人三重 grep 核验 C9 v1.0 全文（`initialTreasury`/`campaign.`/`perLevel`/`Treasury`/`粮饷`），零匹配——C9 §2.6 实际只写 W/连接器/坡道/GATE/波次数/意图序列骨架，无任何经济键名。X3 按 C6 形状引用无误，C9 零勘误。疑为撰写时对上游文本的误忆，存档备查 |
| A2 | **挂点措辞差异**：X2 §9.2-3/附录 B.2.2 注「步骤①后」vs 本文裁定步骤②后（含派单口径） | X2 精化为「步骤②后（rosterPool 投放完成）装载」，B-BE-3 措辞同步；本文 §9.2 已声明验收口径 | **采纳——X2 v1.0.2 已落**：主理人核验发现步骤①系 X2 §9.2-3 交割表单处笔误（X2 自身 B-BE-3/B.4-4 原文即「步骤②后」，majority 在②），§9.2-3 已精化并置已签收；本文 §2.2 裁定为 B-BE-3 联测验收口径 |
| A3 | **F5 快照增补**：存档快照新增 X3 区段 `tutorialState`（§3.3） | X2 附录 A 存档 schema 增补一节；缺字段默认 COMPLETED＋告警 | **采纳——X2 v1.0.2 已落**：附录 A.3 SaveDocument 增 `x3?: TutorialState` 可选区段（L2/L3 关 S0 恒 undefined）；缺字段走 INV-F5-4 既有纪律（默认 COMPLETED＋告警，禁静默降级，对齐 C10-E5 先例） |

---

## 10. OQ

| id | 问题 | 归属 | 状态/备注 |
|---|---|---|---|
| OQ-1 | 教学提示视觉规格（框/箭头/高亮/文案语气/朱砂米白应用） | P4＋叙事侧 | P4 GDD 未启动；本文 §2.3 presentation 语义槽位先行，P4 回执后闭合 |
| OQ-2 | L1 灰盒数值：initialTreasury 购买力 ≥「DEPLOY 一口价＋礌石造价＋冗余」；W1@T2 间隔是否容纳 TS2+TS3 完成节奏 | C6/C9 平衡轮 | 灰盒约束已声明（§9.8）；建议平衡轮将「教学购买力」列为 L1 校验项 |
| OQ-3 | tutorialState 缺字段默认 COMPLETED＋告警的同构性 | X2/F5 回执 | 与 §9.11-A3 合并回执；对齐 C10-E5 先例 |
| OQ-4 | 架梯/毁梯精确事件名（TS5 模式 b 的唤醒事件选型） | F1 落盘 | 本文以惰性查询谓词语义引用规避臆造；F1 侧落定后 tutorial.json filter 字段回填 |
| OQ-5 | 「无跳过通 L1」成就统计位 | X1 战役账本（Beta） | MVP 不做；Beta 若启用属 X1 统计面，X3 零改动（status 已含 SKIPPED） |

---

## 11. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0-draft | 2026-09-21 | 首版（GW-P2-014，序列 #10 收官）：纯观察者模型与零耦合三禁；挂点裁定（步骤②后装载、A 相位执行，reconcile X2 ①/②措辞差异）；八步教学脚本（四命题映射 C9 L1 骨架）；跳过＝关触发器零规则变化；重打三情形裁定（B-BE-3 扩展）；确定性纪律形式化（激活/完成/先手豁免谓词）；tutorialState 持久化申请位；上游申请位三项（C9/C6 键名冲突、X2 措辞精化、F5 快照增补） |
| v1.1 | 2026-09-22 | **GW-VS-04 收口批（主理人第三轮终裁，文策渊执笔）**：①§2.3 八步总表 **TS6** 追加一行 presentation 语义槽位——接管后首次手动指令处预告「先动后打」（攻击后本轮行动力清零，`mpZeroOnAttack=true`，C2 §2.4／C2.4），处置外部评审 **R4**；②§2.3 **TS8** 追加一行 presentation 语义槽位——预告「城墙更长时床弩盖不住两端，建在哪／朝哪会成为真问题」，处置外部评审 **R3 意见②**（严禁改 `bedCrossbow.range=12`）；③§2.3 增「八步不增补裁定」段，载明不新增第九步的三条理由（破 §1.3 总步数 8／破 XP-1 教判断不教操作清单／挤压既有课程时窗）。**只写语义槽位，不写文案本体**（§1.1 红线：视觉与文案归 P4／叙事侧）；零数值改动、零规则改动、八步顺序与全部触发器／完成谓词未动 |
| v1.0 | 2026-09-21 | **合流定稿（主理人裁定回执）**：§9.11 三项闭账——A1 驳回（C9 键名冲突经三重 grep 核验不成立，C9 零勘误）、A2 采纳（X2 v1.0.2 §9.2-3 精化为步骤②后，步骤①系交割表单处笔误，X2 自身 B-BE-3/B.4-4 本即②）、A3 采纳（X2 v1.0.2 附录 A.3 增 `x3?: TutorialState`，缺字段走 INV-F5-4 默认 COMPLETED＋告警）。Phase 2 GDD 撰写序列 #10 收官，13/13 全部落盘 |
