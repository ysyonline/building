# 灰盒可玩性轮（垂直切片）规划卡 —— GW-VS

> **状态**：v1.0（2026-09-22）｜ VS-0 产出
> **产出**：主理人（汇编职责——只收拢挂账与决策，不裁数值）
> **数值初值建议**：归 VS-1 文策渊（见 §5 分工边界）
> **上游决策**（用户 2026-09-22 拍板）：①范围=B 档完整核心循环；②载体=单文件灰盒续用（three r158）；③验收=用户试玩 + 评测单

---

## 1. 切片范围与目标

**一句话**：在 graybox-f1 spike 底座上扩建单文件原型 `graybox-vs.html`，让用户玩通一局完整的 L1 教学骨架战局（四相位循环 × 4 波），验证核心循环「好不好玩」，并一次性消费全部「待灰盒」数值挂账。

**范围内（B 档）**：
- F2 七态相位 FSM（INIT→A→B→C→D→WIN/LOSE），速度序三键
- L1 教学骨架关卡（W=12、坡道 1、GATE 1、烽燧 1、波次 4，C9 §2.6 骨架）
- A 相位：C7 建造/部署（床弩、戍卒）+ C6 经济（quote/charge/缴获）
- B 相位：C9 波次入场 + C8 匈奴 AI（generatePlans 纯函数 + intentTag 三意图）
- C 相位：C1 移动/攀爬/堵位 + C2 攻击（MP×AP、锁足）+ C10 托管（AUTO/MANUAL）
- 器械：C3 床弩齐射（俯射走廊=同层轴向列）+ 滚木礌石（C5 五步固定序：SPENT→毁梯→坠落→dropDamage→残骸）
- D 相位：C6 D② 经济子序 + F2 判胜/判负唯一点（D④）
- F4 确定随机（mulberry32，固定种子，命中过骰消费）

**范围外（明确不做，防蔓延）**：
- X3 教学步骤脚本（A 档→C 档差异项；教学购买力仅作经济初值校验约束）
- F5 存档/读档、F4 游标随档恢复（切片局内一次性）
- X2 战役层、继承、L2/L3 关卡
- 冲车撞击结算细节（L1 门禁外：MVP_L1 ⊆ {ladder_infantry, horse_archer}，W-V3——冲车/督队不出现在 L1 波次表；但 C8/C10 代码路径保留表驱动位）
- 美术表现（灰盒几何体 + 现有切层渲染；三档相机沿用 spike）

**成功判据**：
1. 用户以守方身份完整打完一局（胜或负均可接受，两路都要在冒烟测试中各通一局）；
2. 评测单各维度可打分，核心循环成立性有结论；
3. §4 清单中全部键拿到初标定值，回填 VS-7 销账。

---

## 2. 任务分解与依赖（VS-0 ~ VS-7）

| # | 任务 | 负责 | 产出 | 状态 |
|---|------|------|------|------|
| VS-0 | 本规划卡 + 挂账总清单 | 主理人 | `design/spikes/vs-plan.md` | ✅ 本文 |
| VS-1 | 可玩性评测单 + 数值初标定建议表 | design-strategist（文策渊） | `design/spikes/vs-playtest-sheet.md` | 待开 |
| VS-2 | 底座：F2 FSM + L1 关卡数据 + 渲染扩展 | engineering-lead（程基岩） | `design/spikes/graybox-vs.html` 初版 | 待开 |
| VS-3 | C 相位战斗核心 + C10 托管 + C8 AI 首版 | engineering-lead | 同上迭代 | 待开 |
| VS-4 | A 相位建设经济 + 器械 + D 相位结算 | engineering-lead | 同上迭代 | 待开 |
| VS-5 | F3 数值全量注入 + 自动化冒烟 | engineering-lead（主理人核验） | 测试报告 | 待开 |
| VS-6 | 试玩交付 | 主理人 | 原型 + 评测单交用户 | 待开 |
| VS-7 | 反馈标定批 + GDD 销账回填 | 文策渊 + 程基岩 | 数值回填 + 勘误批 | 待开 |

依赖链：VS-0 → (VS-1 ∥ VS-2) → VS-3 → VS-4 → VS-5 → VS-6 → VS-7。
**执行纪律**：每个子任务完成后停下向用户汇报，审核通过再继续（用户明令）。

---

## 3. 技术基座与工程红线（程基岩 VS-2 起消费）

- **底座**：`design/spikes/graybox-f1.html`（three r158 UMD 内联、87 节点走廊、A* 0.037ms、三档相机、切层 O(1)）。
- **关卡数据**：层主序 `layers[h][x][z]`（F1 红线，禁列主序单值高度）；CellId=`${x}_${z}_${h}`；L1 参数 W=12、坡道 1、GATE 1、烽燧 1（h=2）、波次 4。
- **A* 启发层差权重 ≤ F3 最小跨层边成本**（C1.5 硬约束；F3 climb=2 工作假设 → 启发权重取 2.0，若灰盒调低 climb 须联动复核）。
- **连接器 9 字段**（含 accessPolicy，阵营过滤邻接图）；烽燧内部梯 DEFENDER_ONLY；攀爬原子 2MP、BLOCKED_TOP 顶满排队；board/unboard 双 mutation + E2 坠落链（落位失败不回滚 destroy）。
- **F2 铁律**：存档点概念（切片不做存档但保留 S0/S1 结构位注释）；胜负唯一点 D④；烽燧破=C 相位立即中止、判负优先于同回合清场；等速守方优先（tiePriority 可翻转）。
- **C5 固定序**：礌石五步不可交换；走廊目标集按距离轴向序（近→远）；齐射多来源按 facilityId 字典序；连锁深度=1。
- **确定性**：F4 mulberry32 + FNV-1a-32 种子展开，单流全局游标；C8/C10/C5 零独立 RNG；C6 零 F4 消费（重放安全岛）。
- **表驱动纪律**：单位模板、AI 权重、托管权重、经济键全部内联 JSON 结构（F3 表宿主形态），代码零兵种名/零数值硬编码；ScoringHook 框架占位返 0。
- **three r158 红线**：勿升 r160+（无 UMD）；内联库体禁包 IIFE。

---

## 4. 「待灰盒」挂账总清单（VS-1 逐键给初值，VS-7 逐键销账）

> 结构权威=各 GDD（已定稿），本文只收拢「值待灰盒」项。⚠ 标注 = GDD 内已有工作假设/方向约束，VS-1 须沿约束给值。宿主文件名按 F3 v1.0.1 R-1~R-7 规范键路径。

### 4.1 `units.json`（结构权威 C2 §3.2；初值汇总 C2 §8.4 全表 ⚠）

| 键 | 工作假设 ⚠ | 约束/方向 |
|---|---|---|
| garrison_squad.baseHp / baseMp / baseAp | 100 / 3 / 1 | 戍卒小队=squadHP 单池 |
| ladder_infantry.baseHp / baseMp | 60 / 3 | 攻方登城主力 |
| horse_archer.baseHp / baseMp | 50 / 5 | layerAccess=[0] 恒地面 |
| warlord_escort.baseHp / baseMp | 80 / 4 | attackCapable=false |
| auraStrategyId r / delta | 待灰盒 | C2.7 光环半径与增益值，C8 OQ-4 联动 |
| meleeReach / moveCost 消费 | —（结构键） | climb=2 时攀爬原子 2MP 与 C1 一致 |

### 4.2 `facilities.json`（结构权威 C3 §3.2，§8.4 初值 ⚠）

| 键 | 约束/方向 |
|---|---|
| facility.hp.bedCrossbow / rollingStock | 受近战威胁面（梯上匈奴）↔ hp 梯度 |
| bedCrossbow.range | 与 horseArcher.range 独立两键；L1 走廊 W=12 内覆盖语义 |
| bedCrossbow.reloadTurns | C3 工作假设=1（发射→跳过下一轮锚点） |
| bedCrossbow.targetPriority | F3 targetPriority 序取首 |
| rollingStock.dropRadius | C3.5 曼哈顿+轴向 |Δx|≤dropRadius；↔ dropDamage 联动 |

### 4.3 `weapons.json`（C3+C5 共表，规范键 F3 R-4）

| 键 | 约束/方向 |
|---|---|
| weapons.bedCrossbow.damage | 单发伤害基准（穿廊多目标逐个过骰） |
| weapons.rollingStock.dropDamage | ↔ dropRadius 共担礌石强度（联动注记） |
| weapons.fallDamage | E2 坠落伤害基准（climb 高度相关） |
| weapons.horseArcher.range | **< 床弩 range**（方向硬约束）；骑射独立命中键与否一并裁定 |
| weapons.meleeMod.vsFacility | 近战对设施伤害系数 |

### 4.4 `combat.json`（结构权威 C5 §2.4）

| 键 | 工作假设 ⚠ |
|---|---|
| hitBase | 0.75 |
| heightModPerLevel | ±0.10/层（负向对称；梯上单位按逻辑位置 h=0 计） |
| coverModParapet | −0.15 |
| exposedModLadder | +0.25（↔ moveCost climb 联动复核） |
| squadHpPowerCurve | 小队战力曲线（残队减员表达） |

### 4.5 `economy.json`（结构权威 C6 §3.5，全键待灰盒）

| 键 | 约束/方向 |
|---|---|
| perLevel.L1.initialTreasury | **X3 OQ-2 硬约束：≥ DEPLOY 一口价 + 礌石造价 + 建设冗余** |
| income.farmBasePerTurn | **>0 红线**（破产软约束保底） |
| income.supplyBasePerTurn | — |
| loot.perTemplate.ladderInfantry / horseArcher | 步兵档基准 |
| loot.perTemplate.ramChariot | 最高档之一（最难杀；L1 不出场但键须有值） |
| loot.perTemplate.warlordEscort | **显著高于步兵档**（C2 OQ-4「先杀督队」引导；L1 不出场键须有值） |
| cost.build.bedCrossbow / rollingStock | 与 initialTreasury 联动定标 |
| cost.deploy.garrisonSquad | 「DEPLOY 一口价」本体 |
| cost.repair.perHp | 「修理<重建」经济梯度 |
| cost.wallRepair.perHp | OQ-3 键位预留（MVP 可给占位值） |

**方向红线（C6 §3.5 注，校准约束非定值）**：①farmBase+supplyBase < 维持防线基础开销（缴获补缺口=压力成立的数学前提）；②缴获曲线「劣势回血、优势锦上添花」双向闭环；③督队赏格 > 云梯步兵赏格。

### 4.6 `ai-scripts.json`（结构权威 C8 §3.2；OQ-1/3/4 三挂账）

| 键 | 工作假设 ⚠ | 挂账 |
|---|---|---|
| w_beacon / w_garrison / w_facility / w_path | 高 / 中高 / 中 / 中 | OQ-1 |
| leadWeight | 待灰盒 | OQ-4（与 aura r 平衡联动） |
| intentScripts.MAIN / FEINT / COORDINATED | 三组乘加修正 | OQ-1；FEINT 教学关弱化可选（主键粒度覆盖） |
| COORDINATED 同步登城协同项 | 公式+值均待灰盒 | OQ-3（L1 禁 COORDINATED，PL-1 联测归 L2+；切片只占位） |
| 预算类（节点预算 2000 等结构键） | C1 已定 | 非本轮 |

### 4.7 `defense-scripts.json`（结构权威 C10 §3.2，全键待灰盒）

| 键 | 约束/方向 |
|---|---|
| w_block / w_strike | 正项双权重；堵位优先相对关系待 PL-4 校验 |
| bountyWeight / hasAuraBonus | 督队等高价值目标表驱动通道 |
| lambda_expose / lambda_detour | 代价系数；expose 与 C5 coverMod/exposedMod 联动复核 |
| standFast | **OQ-4 主平衡键**：过高=呆滞、过低=乱动 |

### 4.8 `terrain-rules.json` + `grid-capacity.json` + `beacon.json`（F1/C1 域）

| 键 | 工作假设 ⚠ |
|---|---|
| moveCost plains / climb / gate | 1 / 2 / 2（A* 启发权重联动硬约束） |
| ladderHp | 待灰盒（F1 OQ-2 结算入口已在 C5 关闭；值域 C2/C5 联裁） |
| stackLimit | 4 |
| 容量表（7 CellKind + 2 ConnectorKind） | 垛口1/马道2/地面4/门洞1/烽燧顶1/坡道1/墙0 |
| beacon.hp（烽燧耐久） | 待灰盒（F2 判负链 + C5 写入消费） |

### 4.9 `waves/l1-waves.json`（结构权威 C9 §2.2；骨架 §2.6；OQ-1）

| 项 | 骨架锁死（非数值） | 待灰盒数值 |
|---|---|---|
| 波次数 | 4 | 间隔、首波回合 |
| 意图序列 | MAIN → MAIN → FEINT → MAIN | — |
| W1@T2 | 纯云梯小队（教垛口堵击） | 每波单位数 |
| W2 | 骑射手首现（教远程 vs 掩体） | 骑射配比 |
| W3 | FEINT 小波（教看旗标） | — |
| W4 | MAIN 收尾 | 强度峰值构成 |

**交叉校验义务**：W1@T2 间隔须容纳 X3 TS2+TS3 建设节奏（X3 OQ-2 半边）；L1 兵种门禁 W-V3（⊆{ladder_infantry, horse_archer}）。

### 4.10 F4 种子

| 项 | 约束 |
|---|---|
| f4Seed | 切片固定值（建议字面量 "vs-l1-seed-01"），命中过骰/一切随机消费同流 |

---

## 5. 分工边界（防越界）

- **本文（主理人）**：只做挂账收拢、口径对照、依赖编排——**零数值建议**。
- **VS-1 文策渊**：§4 全部键给初值建议 + 可玩性评测单。数值以 C6 §3.5 方向红线、C8 §8.4 档位注记、C5 §8.4 联动注记、X3 OQ-2 购买力约束为硬边界。
- **VS-2~5 程基岩**：实现消费 §3 红线与 VS-1 数值表；实现中发现 GDD 冲突**只上报不擅改**。
- **VS-7 销账路径**（预告）：C8 OQ-1/3/4、C9 OQ-1、X3 OQ-2、C6 §3.5 键值、C5 §8.4、C10 §3.2、F1 §4.5/F3 各表——逐 GDD 勘误批 + F3 首轮平衡评审清单（§9.13）核销。

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 单文件体积膨胀（底座已 678KB，四相位全逻辑预估 +150~250KB 手写 JS） | 模块化 script 块分区（沿 spike 前例）；VS-5 冒烟含语法编译断言 |
| 数值初值组合导致 L1 不可通关/无压力 | VS-5 赢/输两路各通一局；VS-1 给值时附自检算式（购买力/ DPS 收益比） |
| 匈奴 AI 评分面首次实装，权重方向性错误致行为荒诞 | C8 BE-2 验收项移植为冒烟断言（MAIN 集中度 > FEINT）；AI 计划可视化调试面板 |
| 切层渲染下梯上单位可读性（Q5 已由 C10 §9.5 关闭口径，实现侧待验证） | 沿用灰盒冷青 #8fb8d8 顶色片方案（视觉对齐备忘 v1.1） |
| 用户试玩反馈超出演值范围（结构性不满） | 评测单区分「数值维度」与「结构维度」；结构问题走 VS-7 裁定而非静默改码 |
