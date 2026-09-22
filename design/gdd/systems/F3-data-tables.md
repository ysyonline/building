# F3 数值配置表系统 · GDD

> **状态**：v1.0.1（2026-09-22，互审合流定稿）｜ GW-P2-015-F3 ｜ Phase 2 GDD 基建补课批（与 F4 并行）
> **产出**：文策渊（design-strategist-f3）
> **上游依据**：`design/systems-breakdown.md` v1.0（§1.1 F3 职责行「承载兵种/设施/公式系数/波次构成全部数值的引擎无关外置表，两案通用」、§4 依赖图、§6 数值载体纪律「拥有表，改动需过平衡评审；消费方禁止私藏数值」）｜ C2 v1.1.3（§3.2 UnitTemplate 结构权威＋§7/§8.4 units.json 键位与初值汇总）｜ C3 v1.0.3（§3.2 facilities.json/weapons.json 键清单）｜ C5 v1.2（§2.4 修正键、§数值键清单 combat.json/weapons.json 宿主、§8.4 平衡联动注记）｜ C6 v1.0.3（§3.5 economy.json 键清单——本文 economy.json 宿主形状的权威依据）｜ C7 v1.0.2（裁定 G：`dz.budgetRef` MVP 不消费——R-1 勘误背书）｜ C8 v1.0.2（§3.2 ai-scripts.json 键清单、§8.4 权重初值汇总）｜ C9 v1.0（§2.2 WaveTable 模式、§3.1 三关波次表、§7.3 F3 数值宿主行）｜ C10 v1.0.1（§3.2 defense-scripts.json 键清单）｜ F1 v1.4.3（§4.5 TerrainRules 键清单、F1.7/F1.9 容量表宿主、§9.1 LevelMap 示例的 waveRef/terrainRulesRef/capacityTableRef/durabilityRef/budgetRef 引用面）｜ F2 v1.0.4（§1.4 LEVEL_INIT 时序、F2-E12 拒存档边界）｜ X2 v1.0.2（§3.2 F3 键位声明四键、§7.3 F3/F4 未落盘处理声明、§9.12 收编义务、附录 A.3 SaveDocument 分部结构）｜ X3 v1.0（§3.1 tutorial.json schema 与「宿主目录归数据管线惯例」承诺、§9.8/§9.11-A1 引用先例）
> **范围红线**：本文只裁 F3——**表文件清单与命名、加载与校验纪律、键位收编与冲突裁定、版本化与平衡评审流程**。**不写**任何机制语义（已由 C 系 GDD 定稿，本文逐字承接不重裁）、任何数值定值（全部键值 ⚠ 待灰盒，本文零硬编码）、F4 随机源内部（另一 GDD 并行）、磁盘格式选型（JSON 已定，不争论）、编辑器（X4 Alpha）、X5 对拍配置细节（Alpha 占位）。
> **对齐状态**：13 份已落盘 GDD 的 F3 键位声明逐份收编（§9.1-§9.10 回执）；六处键位/文件级冲突当场裁定（§4.2 R-1～R-7，其中四处需源 GDD 勘误，列 §9.14 申请位请主理人核）；X2 §9.12 收编义务本期销账（§9.9）。

---

## 0. 八节导航

| 节 | 内容 |
|---|---|
| §1 | 系统概述：定位/设计支柱/MVP 表清单范围 |
| §2 | 机制：三级归属模型、加载与物化时序、校验管线、冲突裁定原则、版本化与评审流程 |
| §3 | 数据：表清单总表（17 文件＝平衡 13 表＋关卡结构 4 文件）、逐表键位收编明细、目录布局、Alpha 占位 |
| §4 | 公式：引用解析式、不变式 INV-F3-1～6、裁定记录 R-1～R-7 |
| §5 | 边缘情况（E1-E9） |
| §6 | UI 接口：加载/校验 API 面、调参工作流、对拍指纹 |
| §7 | 依赖 |
| §8 | 验收标准（SC-1～SC-8） |
| §9 | 契约（逐上游收编回执 §9.1-§9.13＋申请位汇总 §9.14） |
| §10 | OQ |
| §11 | 变更记录 |

---

## 1. 系统概述

### 1.1 定位与职责边界

F3 是**数值配置表系统**：全部平衡数值与关卡静态数据的**唯一数据宿主**——一张在册表清单、一套加载/校验/冻结纪律、一条平衡评审通道。F3 **不是**机制系统：表里每一个键的**语义**归其结构权威 GDD（谁声明 schema 谁权威），F3 只管「键在哪个文件、怎么加载、怎么校验、怎么改才合法」。

| 归 F3 | 不归 F3 |
|---|---|
| 表文件清单、命名与目录布局 | 表内键的机制语义（各结构权威 GDD） |
| 加载时序、一次性物化、运行期只读纪律 | 数值定值本身（F3 灰盒，平衡评审产出） |
| 键位收编、跨 GDD 冲突裁定 | 机制行为裁定（C 系 GDD 已定稿，本文不重裁） |
| 校验管线（结构/引用/语义三级） | 随机数管理（F4）、存档结构（F5/X2 附录 A） |
| 版本化（schemaVersion/balanceVersion）与平衡评审流程 | 表编辑器（X4 Alpha）、对拍配置内容（X5 Alpha） |

### 1.2 设计支柱

| 支柱 | 内容 | 依据 |
|---|---|---|
| FP-1「单一宿主」 | 每个数值在全部表文件中**恰有一个规范键路径**；任何「同一数值双键双文件」即缺陷，发现即裁定归一（§4.2） | systems-breakdown §6；X3 §9.11-A1「数据宿主优先」先例 |
| FP-2「确定性数据源」 | 表内容是重放等式的常量项：加载期一次性物化、运行期只读、零热重载——同（存档态，指令序，种子，**表指纹**）⇒ 逐字节重放 | C5 裁定 G/C8.5/C6.6 同源纪律的表侧前提 |
| FP-3「调参不触码」 | 平衡调参=改表文件＋过评审，diff 永不触及代码；代码零数值硬编码是各消费方 GDD 既有条款，本文给表侧兑现口径 | C2 §2.2 注、C8 §2.6 纪律 4、C10 §8.4、C6 §3.5 |

### 1.3 MVP 范围裁定

- **平衡数值类 13 文件**＋**关卡结构数据类 4 文件**（合计 **17 文件**，按物理文件计）全部在册（§3.1）。任务书收编清单 11 表；本文收编过程中在 F1 §9.1 LevelMap 示例发现第三张表引用 `beacon.json`（烽燧耐久，F2 契约表确认「烽燧耐久数值→F3」），经 R-7 裁定**新增为第 13 张平衡表**——MVP 平衡表清单 **11→13 增量**（tutorial.json 另经 R-6 收编入关卡结构类），表清单以本文 §3.1 为准。
- **Alpha 表只列占位**（§3.4）：X5 对拍配置、F4 难度档参数、campaign.json 独立化预案。
- 首轮平衡评审入册清单随 §9 回执一并交付（§9.13），X2 §9.12 指名的 `initialTreasury` 三卡值在册。

---

## 2. 机制

### 2.1 三级归属模型（每张表、每个键的标注纪律）

| 层级 | 含义 | 本文用法 |
|---|---|---|
| **宿主** | 键值存放在哪个文件 | 一律 F3 在册表（本文 §3.1） |
| **结构权威** | 谁声明该键的 schema 与语义 | 声明它的 GDD（如 units.json 结构权威=C2） |
| **数值权威** | 值由谁定、改动过谁的评审 | 全部=F3 灰盒（平衡评审通道，§2.5）；关卡结构数据类除外（结构评审通道，§2.6） |

收编纪律：任何 GDD 的 §3/§7 F3 键位声明若与本文 §3.2 明细冲突，以本文裁定记录（§4.2）为准；裁定需给出「数据宿主优先＋引用方改动最小」论证，并视影响列 §9.14 申请位走勘误。

### 2.2 加载时序与一次性物化

```
战役载入起点（F2 LEVEL_INIT 进入前）
  F3.loadAll()：按 §3.1 清单全量读取 → 三级校验（§2.3）→ 深冻结物化为只读快照
  —— 任一表校验失败 ⇒ fail-fast 拒载（E1/E2），禁止静默默认值 ——
LEVEL_INIT(Ln)（X3 §2.2 时序图零改动）
  ① F1 载入 LevelMap        ← 消费已物化的 level-l{n}.json + 其 Ref 指向表
  ② X1 关初初始化读 perLevel.L{n}.initialTreasury（C6 键形状）
  ②' X3 装载 tutorial.json L1 步骤表 ← 同为已物化数据
  ……
运行期：零写、零重载、零热更新；表对象对消费方仅暴露只读视图
```

- **INV-F3-1（一次性物化）**：全部表在战役载入起点一次加载冻结，`LEVEL_INIT` 内各步骤（F1 载图、X1 读卡值、X3 装教学）消费的均为**同一份**已物化快照——X3 §2.2 时序图中「载入」字样一律读作「消费已物化数据」，F2/X3 文件零改动。
- **INV-F3-2（表内容恒常）**：表内容在同一次游戏会话内不随 run 变化、不随进度变化。这是 C5 裁定 G「同（状态，指令序列，种子）→逐字节重放」与 C8.5「同输入逐字节同计划」的**表侧前提**：表若中途可变，重放等式缺常量项。与 F4 的接口面=零调用（F3 不是随机源），仅共享「可重放」目标。
- **战役内零重载**：L1→L2 过关不重新 loadAll（表与关无关部分不变）；perLevel 段按 `levelId` 寻址（§4.1）。Alpha 若引入「难度档换表」，届时另裁（§10 OQ-4）。

### 2.3 校验管线（三级，全部 fail-fast）

| 级 | 校验内容 | 失败处置 |
|---|---|---|
| ① 结构校验 | JSON 可解析、顶层 schema 符合结构权威 GDD 的 TS 契约、`schemaVersion` 受支持、枚举值合法 | 拒载＋指名报错（E1/E5） |
| ② 引用完整性 | 跨文件引用可解析（`waveRef`/`terrainRulesRef`/`capacityTableRef`/`durabilityRef`/`budgetRef`(Alpha)、`templateId ∈ units.json`、`spawnEdge ∈ LevelMap.enemySpawns[].id`、`beacon.cellId` 存在且 h=2、`(levelId, waveId)` 覆盖键母键存在） | 拒载＋指名报错（E3） |
| ③ 语义约束 | 各结构权威 GDD 声明的值域/方向红线（如 C6 §3.5 注①②③、`planBudgetMs>0`、`stackLimit≥1`、Alpha 键位在 MVP 窗内必须缺省（E9）、X3 SC-7「tutorial.json 无 L2/L3 键」） | 拒载＋指名报错（E4/E7/E9） |

快速失败纪律：静态表损坏=数据构建错误，不走运行时降级——对齐 X2 附录 A INV-F5-4「禁静默降级」精神（该条管存档运行态缺字段，与 E6 存档-表版本错位是两回事，互不冲突）。

### 2.4 键位收编与冲突裁定原则

1. **数据宿主优先**：该数值的既有宿主 GDD（结构权威）声明的文件形状为规范形状（先例：X3 §9.11-A1 主理人裁定口径）。
2. **引用方改动最小**：冲突双方中，已被更多下游 GDD 按其形状引用的一方胜出；偏离方走勘误（§9.14 申请位），不在 F3 表内制造兼容别名。
3. **单一规范键路径**：裁定后全项目唯一写法；旧写法在源 GDD 勘误前由本表 §4.2 裁定记录兜底（实现以裁定记录为准，不等勘误落盘）。

### 2.5 版本化与平衡评审流程（平衡数值类）

- **双版本号**：每表文件顶层 `version`（数值/内容变更递增，即 balanceVersion）＋ `schemaVersion`（结构破坏性变更递增，迁移纪律与 X2 附录 A.4 同构）。MVP 期 schemaVersion 恒为 1。
- **表指纹**（规格定死，v1.0.1；消费面=X5 对拍报告标注＋存档 meta——**A6 已裁定采纳（2026-09-22 主理人）**，meta.tableFingerprint 可选字段落定）：
  - **规范化**：`canonical_bytes_i` = 逐表 JSON.parse → 键名递增排序的规范 JSON 序列化（数字十进制、无空白）→ UTF-8 字节——跨平台/跨编辑器稳定；**不采原始字节案**（CRLF/BOM/git checkout 即触发漂移）。
  - **逐表哈希＋折叠**：`H_i = FNV1a64(canonical_bytes_i)`；`fingerprint = FNV1a64(Σ fileName_i ++ 0x00 ++ H_i)`，按 §3.1 在册序折叠——文件名锚定防同名歧义、定宽折叠防表序重排漂移；输出 16 位小写 hex。
  - **哈希原语**：FNV-1a-64 全宽＋hex16 小写，**与 F4 §2.6 同构**（单一原语共享实现与审计面；引用规格≠机制依赖，F3/F4 双向零依赖界限不破，§7）。
  - 加载期计算一次（INV-F3-1 时点）；档内指纹缺字段→「指纹未知」→E6 走 schemaVersion 比对＋告警一次，**禁止实现为空串参与比对**。
- **改动流程**：提案（列键/值/理由/影响消费方）→ **平衡评审**（主理人主持；涉键消费方 GDD 作者会签）→ 落表＋`version` 递增＋变更记录 → 对拍复跑。绕过评审改表=流程违规（systems-breakdown §6「改动需过平衡评审」的执行细则）。
- **消费方义务**：消费方禁止私藏数值、禁止代码内同名常量旁路（FP-3）；新增数值需求=先在结构权威 GDD 声明键位，再入册 F3，再灰盒定值。

### 2.6 表内容分类与评审通道

| 类 | 判据 | 评审通道 |
|---|---|---|
| **平衡数值类**（13 文件） | 含 ⚠ 待灰盒数值键 | 平衡评审（§2.5） |
| **关卡结构数据类**（4 文件：LevelMap×3＋tutorial.json） | 纯结构/脚本数据，零平衡数值键 | 结构评审（结构权威 GDD 主导）；**不进平衡评审** |

归类理由示例：tutorial.json 零灰盒键（步骤/触发器/提示槽位皆结构），数值评审对它无意义；但其宿主目录与加载时机 X3 §3.1 明文「归 F1/X1 侧数据管线惯例」=本文，若不入册则成为体系外散表，破坏「所有外置表一张清单」的治理完整性——故**在册收编、免平衡评审**（R-6）。

---

## 3. 数据

### 3.1 表清单总表（MVP 全量，17 文件＝平衡 13＋关卡结构 4）

**平衡数值类（13 文件，物理文件计）**：

| # | 表文件 | 内容 | 结构权威 | 数值权威 | 消费方 | 键数 |
|---|---|---|---|---|---|---|
| 1 | `units.json` | 兵种模板全字段 | C2 §3.2 | F3 灰盒 | C1/C2/C5/C7/C8/C9/C10 | 11 键族×5 兵种档 |
| 2 | `facilities.json` | 设施耐久/射程/装填/目标优先级/投放半径 | C3 §3.2 | F3 灰盒 | C3/C5/C7/C8 | 8 |
| 3 | `weapons.json` | 伤害基准/骑射射程/对设施近战修正 | C3＋C5 共表 | F3 灰盒 | C3/C5 | 5 |
| 4 | `combat.json` | 命中基准/三项修正/小队战力曲线 | C5 §2.4 | F3 灰盒 | C5/C8/C10（联动复核） | 5 |
| 5 | `economy.json` | 经济全键＋perLevel 段＋campaign 段 | C6 §3.5 | F3 灰盒 | C6/C7/X1/X2/F5 | MVP 17＋Alpha 3 |
| 6 | `ai-scripts.json` | AI 目标/代价权重、意图脚本、预算 | C8 §3.2 | F3 灰盒 | C8 | 5 键族 |
| 7 | `defense-scripts.json` | 托管评分权重/天平/槽决策预算 | C10 §3.2 | F3 灰盒 | C10 | 9 |
| 8 | `waves/l1-waves.json` | L1 波次时刻表（WaveTable） | C9 §2.2 | F3 灰盒 | C9（唯一权威读者）；F1 waveRef 引用 | 波次档位锚点 4 ⚠ |
| 9 | `waves/l2-waves.json` | L2 波次时刻表 | C9 §2.2 | F3 灰盒 | 同上 | 档位锚点 6 ⚠ |
| 10 | `waves/l3-waves.json` | L3 波次时刻表 | C9 §2.2 | F3 灰盒 | 同上 | 档位锚点 8 ⚠ |
| 11 | `terrain-rules.json` | 移动消耗/云梯耐久/堆叠上限/格尺寸 | F1 §4.5/F1.2 | F3 灰盒（ladderHp 值域 C2/C5 联裁） | F1/C1/P1 适配器 | 6 |
| 12 | `grid-capacity.json` | 格容量（键=CellKind）＋连接器承载 | F1 §2.5.2/F1.7/F1.9 | F3 灰盒 | F1/C7 | 9（7 CellKind＋2 ConnectorKind） |
| 13 | `beacon.json` | 烽燧耐久（R-7 新增收编，第 13 张平衡表） | F1（BeaconDef） | F3 灰盒 | C5（伤害写入）/F2（判胜）/P4（耐久 HUD） | 1 |

**关卡结构数据类（4 文件，免平衡评审）**：

| # | 文件 | 内容 | 结构权威 | 消费方 |
|---|---|---|---|---|
| 14 | `levels/level-l{1..3}.json` | LevelMap 静态层（F1 §9.1） | F1 | F1/C7/C9/C8 |
| 15 | `levels/tutorial.json` | L1 教学步骤表（X3 §3.1） | X3 | X3 |

> 波次数 4/6/8 系 X2 附录 B.6 档位锚点非定值（⚠ 随 C9 OQ-1 灰盒标定），本文照录锚点语义、不定值。

### 3.2 逐表键位收编明细

**① `units.json`（结构权威 C2 §3.2）**：`templateId`（枚举键：五兵种档）｜`faction`｜`baseHp`｜`baseMp`｜`baseAp`｜`layerAccess`｜`footprint`｜`canBoardLadder`｜`attackCapable`｜`meleeReach`｜`mpZeroOnAttack`｜`auraStrategyId`（→策略注册表）｜`auraRadius`｜Alpha 加列位（C11 士气列，C2-E16 演练位）。初值汇总=C2 §8.4（⚠ 全表待灰盒）→ 入首轮评审清单。

**② `facilities.json`（结构权威 C3 §3.2）**：`facility.hp.bedCrossbow`｜`facility.hp.rollingStock`｜`bedCrossbow.range`｜`bedCrossbow.reloadTurns`｜`bedCrossbow.targetPriority`｜`rollingStock.dropRadius`｜`kindAllowed`（C7.4 消费，MVP 两类设施均={RAMPART_WALK}，结构键位可扩）｜Alpha 位。C3 §8.4 初值 → 入评审清单。

**③ `weapons.json`（C3＋C5 共表，键路径规范形）**：`weapons.bedCrossbow.damage`（R-4 统一，源 C3 §3.2；C5 键清单 `crossbow.damage` 系简写勘误）｜`weapons.rollingStock.dropDamage`（C5 简写 `dropDamage` 同规）｜`weapons.fallDamage`（C5 E2 自由落体分量）｜`weapons.horseArcher.range`（C5 §8.4：建议<床弩 range，方向约束）｜`weapons.meleeMod.vsFacility`（C5 对设施近战修正）。C5 OQ-1 伤害基准 → 入评审清单。

**④ `combat.json`（结构权威 C5 §2.4）**：`hitBase`｜`heightModPerLevel`（负向对称）｜`coverModParapet`｜`exposedModLadder`（**单宿主裁定 R-5：F1 §4.5 行转跨表注记，terrain-rules.json 不收**）｜`squadHpPowerCurve`。C5 §8.4 平衡联动注记（`moveCost climb`↔`exposedModLadder`、`dropRadius`↔`dropDamage`）原样入册为评审联动项。

**⑤ `economy.json`（结构权威 C6 §3.5；X2 §3.2 键位并入本表，R-2）**：

```
economy.json
├── perLevel: { L1|L2|L3: { initialTreasury, reinforcementSchedule } }   ← R-2 规范键路径
├── income:    { farmBasePerTurn(>0 红线), supplyBasePerTurn }
├── loot:      { perTemplate: { ladderInfantry, ramChariot, horseArcher, warlordEscort } }
├── cost:      { build.bedCrossbow, build.rollingStock, repair.perHp,
│               deploy.garrisonSquad, wallRepair.perHp(键位预留 OQ-3),
│               dismantleRefundRatio(Alpha 结构位) }
├── campaign:  { roster.poolCapacity(Alpha 预留, X2), retrain.costPerUnit(Alpha 预留, X2),
│               save.slotCount(MVP=1, X2 裁定 H), treasuryCarryRule(X2 域枚举位, MVP 不消费) }
└── alpha:     { supply.nodes[], farm.cells }   ← MVP 必须缺省（E9）
```

> X2 四键收编回执：`initialTreasury` 统一为 `perLevel.<id>.initialTreasury`（C6 形状；X3 §2.2/§9.8 已按此引用）；其余三键入 campaign 段（C6 §3.5 已有 X2 域键 `treasuryCarryRule` 先例，economy.json 为其既有宿主，零新增文件）。方向红线（C6 §3.5 注①②③）与 X2 §9.12「三卡值进首轮平衡评审」义务随册生效。

**⑥ `ai-scripts.json`（结构权威 C8 §3.2；单文件裁定 R-3）**：`targetWeights`（w_beacon/w_garrison/w_facility/w_path）｜`costWeights`（c_exposure/c_detour/c_congestion）｜`intentScripts`（MAIN_ASSAULT/FEINT/COORDINATED 三组 IntentWeights，＋可选 `(levelId, waveId)` 覆盖粒度——C9 受控扩展消费）｜`leadWeight`｜`planBudgetMs`（建议 ≤10ms 量级，对齐 C1 <50ms，⚠）。正文旧写法 `intent-scripts.json` 统一读作 `ai-scripts.json::intentScripts`。

**⑦ `defense-scripts.json`（结构权威 C10 §3.2）**：`w_block`｜`w_strike`｜`bountyWeight`｜`hasAuraBonus`｜`lambda_expose`｜`lambda_detour`｜`standFast`｜`slotDecisionMs`（≤2ms ⚠）｜`hooks[]`（ScoringHook 注册位，与 C8 钩子同构）。

**⑧-⑩ `waves/l{n}-waves.json`（结构权威 C9 §2.2）**：WaveTable（`waves[]`：turn/waveId/intentTag/spawnEdge/units[WaveUnitSpec]；`spawnDepth` 落格扫描深度 ⚠）。F1 `enemySpawns[].waveRef` 为唯一引用入口（F1 §9.1/C9 §7.3 双向确认零冲突）；C9 为唯一权威读者。

**⑪ `terrain-rules.json`（结构权威 F1 §4.5/F1.2）**：`moveCost.plains`｜`moveCost.climb`｜`moveCost.gate`｜`ladderHp`（值域 C2/C5 联裁，F1 §4.5「待 C2/C5 GDD 裁定」转注：数值权威仍 F3 灰盒，联裁只定值域）｜`stackLimit`（F1.12 护栏）｜`world.cellSizeMeters`（F1.2 渲染常量，初值 4m，正式值 P1/P2 收口）。**不含** `exposedMod ladder`（R-5）。

**⑫ `grid-capacity.json`（结构权威 F1 §2.5.2/F1.7/F1.9）**：容量键=CellKind 全 7 值｜连接器承载键=LADDER/SLOPE（MVP 值恒 1，键位在册）。

**⑬ `beacon.json`（R-7 新增；结构权威 F1 BeaconDef）**：`beacon.durability`。F1 §9.1 示例 `durabilityRef` 为既有引用面；F2 契约表「烽燧耐久数值→C6/F3」确认 F3 宿主义务；Alpha 多烽燧战役（X1）时本表自然扩展 per-beacon 结构位。

**⑭ LevelMap×3＋tutorial.json**：结构照录 F1 §9.1/X3 §3.1 schema，本文零改动；仅收编入册（宿主纪律/校验管线/指纹覆盖）。

### 3.3 目录布局（建议形，实现期与程基岩对齐，见 §10 OQ-3）

```
data/
├── tables/                  # 平衡数值类 13 文件（waves 含 3 文件）
│   ├── units.json  facilities.json  weapons.json  combat.json  economy.json
│   ├── ai-scripts.json  defense-scripts.json
│   ├── terrain-rules.json  grid-capacity.json  beacon.json
│   └── waves/ l1-waves.json  l2-waves.json  l3-waves.json
└── levels/                  # 关卡结构数据类 4 文件
    ├── level-l1.json  level-l2.json  level-l3.json    # LevelMap（F1 结构）
    └── tutorial.json                                   # 教学步骤表（X3 结构）
```

### 3.4 Alpha 占位（只列名，不设计）

| 占位 | 说明 | 启动时点 |
|---|---|---|
| X5 对拍配置表 | 模拟器对拍用例/容差配置 | Alpha（X5 启动评审） |
| F4 难度档参数 | 难度噪声钩子权重（C8 OQ-5） | Alpha |
| `campaign.json` 独立化 | 若 campaign 键增殖，自 economy.json 迁出（结构评审，§10 OQ-2） | Alpha |
| 分区预算（`budgetRef` 启用形） | Alpha 分区预算位，指向 economy.json Alpha 分区段，不复活 per-level 经济文件（R-1） | Alpha |

---

## 4. 公式

> 统一格式：编号｜名称｜定义｜消费方。F3 无产量数值公式；本节为引用解析式＋不变式＋裁定记录。

### 4.1 引用解析式

```
resolve(ref, levelId) = frozen[ref.file][ref.path ⟂ '<id>' ↦ levelId]
约束：恰一次替换、恰一个目标键；无回退链、无默认值、无通配 —— 任一步失败即 fail-fast（§2.3）
```

perLevel 寻址、`Ref` 字段（waveRef/durabilityRef/…）解析全走此式——**单一解析语义**是「引用完整性可静态验证」（SC-5）的前提。

### 4.2 不变式（全部可单测，验收判据直接引用）

- **INV-F3-1｜一次性物化**：`loadAll()` 在战役载入起点恰执行一次；运行期对表对象的任何写入路径不存在（深冻结＋类型只读），`LEVEL_INIT` 各步骤消费同一快照。
- **INV-F3-2｜表内容恒常**：会话内表内容与 `tableFingerprint`（规范化定义见 §2.5）恒不变；重放等式（C5 裁定 G/C8.5）的表参数项恒为常量。
- **INV-F3-3｜存档零表内容**：SaveDocument（X2 附录 A.3）不序列化任何在册表键值——存档只含运行时态分部。意义：①存档体积 O(运行时态)，不随表膨胀；②平衡调参对旧档即时生效（读档=重载当前版本表＋恢复运行时态）；③代价=档-表版本错位风险，由 E6 兜底。X3 快照区段 `x3?: TutorialState` 为运行态，不在本条约束内。
- **INV-F3-4｜fail-fast 校验**：三级校验（§2.3）任一失败 ⇒ 拒载＋指名报错；零静默默认、零空表兜底。
- **INV-F3-5｜单一规范键**：任一数值在全项目恰一个规范键路径（§4.2 裁定记录为裁决表）；源 GDD 勘误落地前，实现以裁定记录为准。
- **INV-F3-6｜调参不触码**：任一在册键改值，变更集=表文件＋version 递增＋变更记录，零代码 diff（TS 结构契约不变前提）。

### 4.3 裁定记录（R-1～R-7）

| id | 冲突/事项 | 裁定 | 理由 | 善后 |
|---|---|---|---|---|
| R-1 | F1 §9.1 示例 `budgetRef: "l1-economy.json"`（per-level 文件形）vs C6 §3.5 单文件 `economy.json` perLevel 段 | **统一单文件 `economy.json`**；MVP LevelMap 示例删 `budgetRef` 行 | ①宿主优先：C6 是 economy.json 结构权威，X2/X3 已按单文件形引用（引用方多数）；②改动最小：C6/X2/X3 零改动，F1 示例一处勘误；③C7 裁定 G 背书：`dz.budgetRef` MVP 不消费（预算权威=全局 treasury），字段本就是 Alpha 位 | §9.14-A1：F1 §9.1 示例勘误（删行/Alpha 注记） |
| R-2 | X2 §3.2 `campaign.initialTreasury.L1/L2/L3` vs C6 §3.5 `perLevel.<id>.initialTreasury`（键路径双源） | **规范键=`perLevel.<id>.initialTreasury`**；X2 四键中其余三键入 `economy.json.campaign.*` 段 | 宿主优先：C6 为 economy.json 结构权威；X3 §2.2/§9.8 已按 C6 形状引用；X2 §9.12 原文「冲突以 F3 平衡评审结论为准」预授权本裁 | §9.14-A2：X2 键路径勘误批（§3.2 键表、§7.3 叙述、附录 B.6 关初粮饷键列等） |
| R-3 | C8 内部 `intent-scripts.json`（正文/公式多处）vs `ai-scripts.json`（§3.2 宿主列）命名混用 | **单文件 `ai-scripts.json`**，意图权重为 `intentScripts` 段 | 宿主列（`ai-scripts.json（C8 新建）`）是正式宿主声明，其 `::` 记法证明段语义；正文文件名写法系简写 | §9.14-A3：C8 正文/C9 §7.3 措辞精化（零结构改动） |
| R-4 | C3 §3.2 `bedCrossbow.damage` vs C5 键清单 `crossbow.damage`（同表同义异名） | **规范键=`weapons.bedCrossbow.damage`** | 设施命名空间 `bedCrossbow` 为 C3/C5/C7 通行 id；`crossbow` 有歧义（骑射手亦持弓） | §9.14-A4：C5 键清单 1 行勘误＋`dropDamage`/`fallDamage` 简写补限定路径注记 |
| R-5 | `exposedMod ladder` 双现（F1 §4.5 TerrainRules 键清单 vs C5 combat.json） | **单宿主 `combat.json`**（C5 结构权威）；terrain-rules.json 不收；F1 §4.5 行转跨表注记 | 语义归战斗修正（C5 §2.4 暴露态裁定 F）；F1 供 ON_CONNECTOR 状态不消费该值；F1 §4.5 初值列原文「见 C5 表」已自证 C5 权威 | §9.14-A5：F1 §4.5 宿主列注记 |
| R-6 | tutorial.json 宿主归属（任务指定必裁） | **在册收编为关卡结构数据类**；免平衡评审，走结构评审 | ①X3 §3.1 明文「宿主目录与加载时机归数据管线惯例」=本文，不入册则体系外散表；②零灰盒键，平衡评审对其无意义；③校验/指纹/加载纪律仍须覆盖（SC-X3-7 联动） | 零勘误；X3 §9 契约 9.10 侧无需改 |
| R-7 | `beacon.json`（F1 §9.1 `durabilityRef`，任务书 11 表清单外） | **新增为第 13 张平衡表**；并立纪律：LevelMap 内零数值字面量，数值一律经 `*Ref` 外置 | F2 契约表「烽燧耐久数值→F3」宿主义务在案；F1 BeaconDef 接口注释的内联 `durability` 与 durabilityRef 外置引用并存，按 FP-1 归一为外置 | 零勘误（F1 示例保留 durabilityRef）；F1 接口注释随 A1 同批加外置注记 |

---

## 5. 边缘情况

> 裁定者=本文。格式：编号｜情形｜裁定。

| id | 情形 | 裁定 |
|---|---|---|
| E1 | 表文件缺失/不可解析/`schemaVersion` 不受支持 | fail-fast 拒载，报错指名文件与期望版本；禁空表兜底（INV-F3-4） |
| E2 | 键缺失（perLevel 缺某关、units.json 缺某 templateId、campaign 段缺 slotCount） | fail-fast＋指名「哪个消费方将拿到 undefined」；MVP 三关 perLevel 键必须齐全 |
| E3 | 引用悬空（waveRef 文件不在册、templateId 不在 units.json、spawnEdge 与 enemySpawns.id 不匹配、beacon.cellId 不存在或 h≠2） | fail-fast（§2.3 二级校验） |
| E4 | 重复键（同 waveId 重复、CellKind 重复、`(levelId,waveId)` 覆盖键无母键） | fail-fast |
| E5 | 枚举越界（intentTag 非 C9 三值、CellKind 非法、footprint 非法值） | fail-fast（枚举封闭，表不可扩枚举——扩枚举=结构权威 GDD 改契约） |
| E6 | 存档 `tableFingerprint` 与当前表不符（旧档新表） | 结构版本同=数值变更→**告警放行**（平衡调参对旧档生效是 INV-F3-3 的设计收益）；结构版本跨 schemaVersion→**拒绝载入**并提示版本不兼容。**A6 已采纳（2026-09-22 主理人）**：meta.tableFingerprint 在册；档内缺字段=「指纹未知」→走 schemaVersion 比对＋告警一次，**禁止实现为空串参与比对** |
| E7 | 表内数值越域（负造价、`planBudgetMs≤0`、`stackLimit<1`、违反 C6 §3.5 方向红线） | fail-fast；值域与方向红线归各结构权威 GDD 声明，F3 校验器执行其声明 |
| E8 | 调试期热重载请求 | MVP 无此通道（INV-F3-1）；Alpha 若由 X4 编辑器提出，仅限非联测环境且不进指令流水/对拍（届时另裁） |
| E9 | Alpha 键在 MVP 表中出现非缺省值（`supply.nodes` 非空、`dismantleRefundRatio` 有值、campaign 两 Alpha 键有值） | fail-fast——防灰盒期误调 Alpha 键污染 MVP 平衡（Alpha 键位允许预置占位，值必须缺省） |

---

## 6. UI 接口

F3 无玩家可见 UI。接口面三块：

### 6.1 加载/校验 API（引擎无关 TS 契约）

```ts
interface F3Tables {
  loadAll(dir: string): F3Tables;          // 一次性加载+三级校验+深冻结；失败抛指名错误
  fingerprint(): string;                   // tableFingerprint（规范化定死见 §2.5：canonical JSON→UTF-8→FNV1a64 逐表＋折叠，hex16）
  resolve<T>(ref: TableRef, levelId: LevelId): Readonly<T>;   // §4.1 单一解析式
  // 零写接口、零 reload 接口（INV-F3-1 的类型面表达）
}
```

消费方经各 C 系统 Query 面取值（C2 UnitStatsQuery 等），**不直读表对象**——表对象只供各系统初始化时装载。

### 6.2 灰盒调参工作流（人流程，无运行时热载）

改表（键/值/理由）→ 平衡评审会签（§2.5）→ `version` 递增＋变更记录 → 重启验证 → X5 对拍复跑（报告附 `fingerprint()`）。P4/策划侧无表编辑器（X4 Alpha 前用普通文本编辑＋校验器命令行）。

### 6.3 对拍与取证

X5 对拍报告、F5 存档 meta（A6 已采纳）、联测记录一律附表指纹——「同指纹＋同种子＋同指令序」是逐字节重放断言的完整前件（补全 C5 裁定 G 的表侧参数项）。**本行为重放等式完整形的正本**；F4 §7.3 与后续 GDD 引用重放等式时引此处，不在各自文件重复定义。

---

## 7. 依赖

| 系统 | 关系 | F3 消费/承诺的具体契约 | 版本 |
|---|---|---|---|
| systems-breakdown | 上游·定位 | §1.1 职责行、§4 依赖图 F3 行、§6 数值载体纪律 | v1.0 |
| C2 | 上游·结构权威 | units.json 模板 schema、§8.4 初值汇总 | v1.1.3 |
| C3 | 上游·结构权威 | facilities.json/weapons.json 键清单 | v1.0.3 |
| C5 | 上游·结构权威 | combat.json 修正键、weapons.json 键清单、§8.4 联动注记 | v1.2 |
| C6 | 上游·结构权威 | economy.json §3.5 全表形状 | v1.0.3 |
| C7 | 上游·裁定背书 | 裁定 G（budgetRef MVP 不消费）——R-1 依据 | v1.0.2 |
| C8 | 上游·结构权威 | ai-scripts.json 键清单、§8.4 权重汇总 | v1.0.2 |
| C9 | 上游·结构权威 | WaveTable schema、三关波次表、spawnDepth | v1.0 |
| C10 | 上游·结构权威 | defense-scripts.json 键清单 | v1.0.1 |
| F1 | 上游·结构权威 | TerrainRules/容量表/LevelMap/BeaconDef 引用面（§9.1 示例） | v1.4.3 |
| F2 | 上游·时序 | LEVEL_INIT 加载窗（本文 INV-F3-1 对齐其步骤①语义） | v1.0.4 |
| X2 | 上游·义务源 | §3.2 四键、§9.12 收编义务、附录 A.3 存档分部（INV-F3-3 依据） | v1.0.2 |
| X3 | 上游·结构权威 | tutorial.json schema、§3.1 宿主承诺、SC-7 校验项 | v1.0 |
| F4 | 平行·零接口 | F3 非随机源；仅共享确定性目标（INV-F3-2 与其重放等式**并列前提**，各自独立自洽——引用≠依赖） | 并行撰写 |
| F5 | 下游·存档 | A.3 零表内容确认＋指纹位（**A6 已采纳**：meta.tableFingerprint 可选字段，§9.14-A6） | 未启动（X2 附录代管） |
| X5 | 下游·对账 | 对拍报告附表指纹 | 未启动 |
| X4 | 下游·Alpha | 表编辑器写表回写须过同一校验管线 | Alpha |

---

## 8. 验收标准

| id | 标准 | 验证方式 |
|---|---|---|
| SC-1 | 收编完整性：§3.1 全 17 文件在册且逐表标注三级归属；与 13 份源 GDD 的 F3 键位声明零未裁定冲突（R-1～R-7 全部有记录） | 逐 GDD 对照走查（本文 §9.1-§9.10 即走查记录） |
| SC-2 | 一次性物化：`loadAll()` 会话内恰一次；运行期零写零重载（深冻结断言） | 单测＋运行期不变量断言（INV-F3-1/2） |
| SC-3 | 存档零表内容：SaveDocument 序列化产物不含任何在册表键值 | X2 附录 A.3 结构对照用例（INV-F3-3） |
| SC-4 | fail-fast：E1/E2/E3/E4/E5/E7/E9 各注入一个坏表样本，INIT 拒载且报错指名 | 坏表用例矩阵 |
| SC-5 | 引用完整性：全部跨文件引用（3×waveRef、terrainRulesRef、capacityTableRef、durabilityRef、templateId、spawnEdge、覆盖键）加载期可静态验证 | 好表全量通过＋悬空引用用例 |
| SC-6 | 调参不触码：任选一键改值，变更集=表文件＋version＋变更记录，零代码 diff | 变更集审查（INV-F3-6） |
| SC-7 | 指纹一致性：同指纹（§2.5 规范化定义）＋同种子＋同指令序 ⇒ 逐字节重放；对拍报告/存档 meta 附指纹 | X5 对拍用例＋存档 meta.tableFingerprint 断言（A6 已采纳，§9.14-A6） |
| SC-8 | 评审通道：§9.13 首轮平衡评审清单在册且与各源 GDD OQ/§8.4 汇总一致；X2 §9.12 指名的 initialTreasury 三卡值在册 | 清单对照 |

---

## 9. 契约

### 9.1 C2 v1.1.3
units.json 全键族收编（§3.2①）；C2 §7「F3 数值表｜键定，值 F3 宿主」→ **收编回执：键全数在册**；§8.4 初值汇总入首轮评审清单（§9.13）。C2-E16 士气加列位保留。零勘误。

### 9.2 C3 v1.0.3
facilities.json＋weapons.json 收编（§3.2②③）；`bedCrossbow.damage` 采为规范键（R-4，C3 侧零改动）。零勘误。

### 9.3 C5 v1.2
combat.json 五键＋weapons.json 键清单收编；**勘误申请 A4**：键清单 `crossbow.damage`→`bedCrossbow.damage`（1 行），`dropDamage`/`fallDamage` 补 `weapons.rollingStock.`/`weapons.` 限定注记；§8.4 平衡联动注记（climb↔exposedMod、dropRadius↔dropDamage）入册为评审联动项；OQ-1 伤害基准入评审清单。

### 9.4 C6 v1.0.3
economy.json §3.5 全表照录为宿主权威形状（**C6 侧零改动**——R-1/R-2 均以 C6 形状胜出）；X2 campaign 三键并入经 §9.14-A2 告知；OQ-1/OQ-2 与 §3.5 方向红线入评审清单。

### 9.5 C7 v1.0.2
裁定 G（budgetRef MVP 不消费）采为 R-1 背书，引用不改；C7.4 `kindAllowed` 表宿主注记与 §3.2② 一致。零勘误。

### 9.6 C8 v1.0.2
ai-scripts.json 单文件收编（R-3）；**勘误申请 A3**：正文 `intent-scripts.json` 写法统一为 `ai-scripts.json::intentScripts`（§1.4-D、§3.2 键列、C8.3、§7.1、§8.4、OQ-1 等，零结构改动）；§8.4 权重汇总入评审清单；C9 受控扩展的 `(levelId, waveId)` 覆盖粒度在册（E4 母键校验）。

### 9.7 C9 v1.0
l{n}-waves.json 三表收编（WaveTable 照录）；`waveRef` 引用模式确认为唯一入口（C9 §7.3「零冲突（消费确认）」镜像成立）；`spawnDepth` 在册；OQ-1 波次档位锚点入评审清单（X2 附录 B.6 波次列注同源）。A3 若采纳含 §7.3 一处措辞精化。

### 9.8 C10 v1.0.1
defense-scripts.json 九键收编；`lambda_expose` 与 C5 `coverMod/exposedMod` 联动复核义务转记为评审联动项；OQ 权重入评审清单。零勘误。

### 9.9 X2 v1.0.2
**§9.12 收编义务本期销账**：①§3.2 四键全数在册——`initialTreasury` 统一 `perLevel.<id>.initialTreasury`（R-2）、`roster.poolCapacity`/`retrain.costPerUnit` 入 economy.json campaign 段（Alpha 缺省，E9 守护）、`save.slotCount` 在册（MVP=1，裁定 H）；②`initialTreasury` 三卡值入首轮评审清单（§9.13 在册行）；③INV-F3-3 确认附录 A.3 零表内容不变式；**A6 已采纳并落定**：SaveDocument meta 增可选 `tableFingerprint`（元数据非表内容，不违 A.3；缺字段时 E6 退化 schemaVersion 比对＋告警一次，禁空串参与比对）。**勘误申请 A2**：X2 键路径统一批（§3.2 键表、§7.3 叙述、附录 B.6 关初粮饷键列等）。§7.3「F3 未落盘」状态行由主理人合流代落更新为「F3 v1.0.1 在册」。

### 9.10 X3 v1.0
tutorial.json 在册收编（R-6，关卡结构数据类）；X3 §3.1「宿主归数据管线惯例」承诺兑现；SC-X3-7（无 L2/L3 键）纳入 F3 三级校验语义约束层；X3 §2.2 时序图「载入」字样按 INV-F3-1 读作消费已物化数据，X3 文件零改动。X3 §9.8/§9.11-A1 引用形状与 R-2 结论一致，互为印证。

### 9.11 F1 v1.4.3
terrain-rules.json（6 键，R-5 移出 exposedMod）、grid-capacity.json（9 键）、LevelMap×3 与 beacon.json 收编；`waveRef`/`terrainRulesRef`/`capacityTableRef`/`durabilityRef` 引用面全部入校验管线。**勘误申请 A1**：§9.1 示例 `budgetRef` 行删改（R-1）；**申请 A5**：§4.5 `exposedMod ladder` 行加「值宿主 combat.json（C5 结构权威）」注记；BeaconDef 接口注释加「durability 经 durabilityRef 外置，LevelMap 零数值字面量」注记（R-7）。§7.3 依赖表 F3 行状态更新同 9.9。

### 9.12 F2 v1.0.4 ／ F4（并行）／ F5 ／ X5
F2：加载窗对齐 LEVEL_INIT（§2.2），F2 文件零改动。F4：零调用接口；INV-F3-2 与 F4 重放等式**并列前提**（各自独立自洽）；指纹哈希原语与 F4 §2.6 同构（引用规格≠机制依赖，§2.5）。F5：A6 **已采纳**（2026-09-22 主理人）——meta.tableFingerprint 可选字段落定（§9.14-A6）；E6 含缺字段路径（指纹未知→退化比对＋告警一次，禁空串）。X5：对拍报告附指纹（SC-7）；对拍配置表 Alpha 占位（§3.4）。

### 9.13 首轮平衡评审入册清单（灰盒义务汇总，SC-8）

| 来源 | 入册项 |
|---|---|
| X2 §9.12 | `perLevel.L1/L2/L3.initialTreasury` 三卡值（**指名必审**）＋教学购买力约束（X3 OQ-2：≥DEPLOY 一口价＋礌石造价＋冗余） |
| C2 §8.4 | 五兵种档全字段初值（mpZeroOnAttack/auraRadius 等联动） |
| C3 §8.4 | 设施耐久/射程/装填/投放半径 |
| C5 OQ-1/§8.4 | ladderHp/fallDamage/dropDamage/bedCrossbow.damage/horseArcher.range；联动项 climb↔exposedMod、dropRadius↔dropDamage |
| C6 OQ-1/OQ-2 | economy.json 全键＋treasuryCarryRule 方向红线三项 |
| C8 OQ-1 | ai-scripts.json 全权重（含三组 IntentWeights/leadWeight/planBudgetMs） |
| C10 §8.4 | defense-scripts.json 全权重＋slotDecisionMs |
| C9 OQ-1 | 三关波次档位锚点标定（4/6/8 系锚点非定值） |
| F1 OQ | terrain-rules 六键（ladderHp 值域 C2/C5 联裁）＋grid-capacity 容量 |

### 9.14 申请位汇总（六项，均请主理人核；本文裁定记录在勘误落地前即为实现口径）

| id | 事项 | 对象 GDD | 建议 |
|---|---|---|---|
| A1 | F1 §9.1 示例 `budgetRef: "l1-economy.json"` 删改（R-1）＋BeaconDef 外置注记（R-7） | F1 v1.4.3 | 示例删 budgetRef 行（Alpha 启用时指向 economy.json Alpha 分区段）；同批注记 |
| A2 | X2 键路径统一：`campaign.initialTreasury.*`→`perLevel.<id>.initialTreasury`（R-2） | X2 v1.0.2 | §3.2/§7.3/附录 B.6 一次勘误批 |
| A3 | `intent-scripts.json` 措辞统一 `ai-scripts.json::intentScripts`（R-3） | C8 v1.0.2／C9 v1.0 | 正文写法精化，零结构改动 |
| A4 | C5 键清单 `crossbow.damage`→`bedCrossbow.damage`＋简写补限定（R-4） | C5 v1.2 | 1 行勘误＋2 处注记 |
| A5 | F1 §4.5 `exposedMod ladder` 宿主注记（R-5） | F1 v1.4.3 | 行内注记「值宿主 combat.json」 |
| A6 | SaveDocument meta 增可选 `tableFingerprint`（§9.9） | X2 v1.0.2 附录 A（F5 代管） | **已采纳（2026-09-22 主理人裁定）**：schemaVersion=v1 零旧档，此刻进 meta 成本≈0；落地注记——缺字段→指纹未知→E6 走 schemaVersion 比对＋告警一次，禁空串参与比对；指纹算法与规范化定义见 §2.5 |

---

## 10. OQ

| id | 问题 | 归属 | 状态/备注 |
|---|---|---|---|
| OQ-1 | `tableFingerprint` 入 SaveDocument.meta | X2/F5 回执 | **已闭**（2026-09-22 合流）：A6 采纳，落位见 §9.14-A6 与 X2 附录 A.3 回执 |
| OQ-2 | campaign 段终居 economy.json 还是独立 campaign.json | Alpha 结构评审 | MVP 零痛点（4 键）；键增殖再议，迁移走结构评审 |
| OQ-3 | 目录布局/JSON 方言（注释允许与否、缩进规范） | 程基岩 | 低风险；GDD 给建议形（§3.3），实现期对齐后回填 |
| OQ-4 | Alpha 难度档换表机制（表内容恒常不变式在难度档下的边界） | F4/X1 Alpha | MVP 单表集零问题；Alpha 启动评审 |
| OQ-5 | X4 编辑器写表回写与校验管线复用 | X4（Alpha） | 回写必须过同一三级校验；Alpha |
| OQ-6 | 首轮平衡评审组织形式（集中一轮 vs 按系统分批） | 主理人 | 清单已备（§9.13）；形式不影响在册义务 |

---

## 11. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0-draft | 2026-09-21 | 首版（GW-P2-015-F3，基建补课批）：三级归属模型＋确定性数据源不变式（一次性物化/表内容恒常/存档零表内容）＋三级 fail-fast 校验管线＋双版本号与平衡评审流程；表清单总表 14 文件（平衡 12 表含 R-7 新增 beacon.json＋关卡结构 4 文件含 R-6 收编 tutorial.json）；13 份源 GDD 键位全收编（§9.1-§9.10 回执）；七项裁定 R-1～R-7（budgetRef 形态、initialTreasury 键路径、intent-scripts 命名、bedCrossbow.damage 异名、exposedMod 单宿主、tutorial.json 归类、beacon.json 新增）；X2 §9.12 收编义务销账＋首轮平衡评审入册清单（§9.13）；申请位六项（§9.14） |
| v1.0.1 | 2026-09-22 | **互审合流勘误（GW-P2-015-FIN-F3，f4 次审 M×2 作者自落＋A6 裁定采纳＋L 级）**：**M-1 表清单计数统一**——全文按物理文件计口径统一「**17 文件＝平衡 13＋关卡结构 4；beacon=第 13 张平衡表**」，§0 导航/§1.3/§2.6/§3.1 标题与类头/§3.3 目录树/§4.3-R7/SC-1 联动改齐（首版「14 文件」标题与目录树「13 文件」口径漂移根除；11→13 增量叙述入 §1.3）；**M-2 tableFingerprint 规范化定死（承重规格，正本落 §2.5）**——规范化=逐表 JSON.parse→键递增排序规范序列化（数字十进制、无空白）→UTF-8，**不采原始字节案**（防 CRLF/BOM/git checkout 漂移）；逐表 `H_i=FNV1a64(canonical_bytes_i)`＋按 §3.1 在册序文件名锚定折叠 `fingerprint=FNV1a64(Σ fileName_i++0x00++H_i)`，输出 16 位小写 hex；哈希原语与 F4 §2.6 同构（引用规格≠机制依赖，双向零依赖不破）；缺字段=「指纹未知」→E6 走 schemaVersion 比对＋告警一次，**禁空串参与比对**；落点 §2.5/INV-F3-2/§6.1/E6/SC-7；**A6 裁定采纳（主理人 2026-09-22）**——meta.tableFingerprint 可选字段落定（此刻进 meta 成本≈0，旧档＋静默改表是重放承诺最深暗坑），§9.14-A6/§9.9/§9.12/§7-F5 行/OQ-1/§6.3/SC-7 改确定语态；**L 级**：§7/§9.12 F4 行「互为前提」→「并列前提」（f3 主审自提 L-4） |
