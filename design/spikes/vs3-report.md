# GW-VS-3 交付报告 · C 相位战斗核心（VS-3）

> 作者：程基岩（engineering-lead）｜ 2026-09-22 ｜ 任务卡 #1（GW-VS-3）
> 状态：**D-1/D-2 缺陷修复完成 + 主理人验收判据全过**（build 幂等 / browser-check 8/8 / T2–T22 密度不退化 / be2·determinism 复验 PASS / 本报告补齐）
> 产物：`design/spikes/graybox-vs.html`（779,360 B，单文件零网络，file:// 双击可跑）
> 本报告为 vs3-lead-review.md（主理人复核）的消费回执，含两处主理人缺陷单之外的**根因级新发现**（§2.3）。

---

## 1. 四块实现清单

| 块 | 分区 | 实现要点（结构权威 → 落点） |
|---|---|---|
| ① C1 移动 | `C1` 模块（_vs3-app.js） | MP×AP 消费模型（`reachable` Dijkstra 泛洪 MP 预算剪枝 + `applyMoveOrder` A* 逐格扣账）；攀爬原子 2MP 一口价（连接器边不分方向，`climb`=表键）；BLOCKED_TOP 顶满留梯排队（ON_CONNECTOR，occupancy 在册）；`boardConnector`/`unboardConnector` 真实实现（ACTIVE/容量/重复登记三检；弃梯 from 格满拒绝 = C1-E4 终裁 A 案）；E2 坠落链（F1 位移 → `setFallHandler` 回调 → C5 统一伤害入口，fallDamage=10 恒定不过骰、零 F4 消费、落位失败不回滚 destroy）；攻击后锁足（mpZeroOnAttack，C2.4） |
| ② C5 攻击结算 | `C5` 模块 | 命中过骰**唯一入口** `rollHit = F4.rand('HIT_ROLL') < hitBase + Σmods`（零独立 RNG）；修正四源合成 aura+height+cover+exposed（高度**攻方视角** `(atkH−tgtH)×mod`，远程走 `heightModPerLevelRanged=0.05`，与 VS-1 §5.3/§6.4 实测同号）；床弩走廊齐射（同层轴向、近→远、逐目标独立过骰，C4 齐射锚点 = phase_enter C 同步结算段）；近战（`vsFacility=0.5` 对设施/烽燧、`squadHpPowerCurve=linear` 输出侧 hp 比例）；礌石五步固定序 SPENT→DESTROY→RELOCATE→DROP_DAMAGE→RESIDUE；**[D-1] 攻方/守方远程分支** `strikeRanged`+`rangedTargets`（表驱动 `rangedWeapon` 键） |
| ③ C10 托管 | `C10` 模块 | UNIT 级 AUTO/MANUAL 路由（MANUAL 挂起零指令收槽）；即时决策制（槽开启时 `resolveSlot`）；评分 `w_block·blockVal(咽喉×空缺) + w_strike·strikeVal(威胁+赏格×0.2+hasAura) − λ_expose − λ_detour + Σhooks`；STAY 显式候选（standFast=45 基准）；ScoringHook 框架 presence-aware-v1/cohesion-v1 占位返 0；显式字典序 tie-break（Score↓→cellId→目标→MOVE<ATTACK<STAY→近战先于远程）；**零 F4 消费** |
| ④ C8 匈奴 AI | `C8` 模块 | `generatePlans` 纯函数（同输入同输出，B③ 预生成制、按满 MP 评估）；intentTag=MAIN_ASSAULT/FEINT 表驱动（值照 VS-1 §5.6）；COORDINATED 仅表加载占位（L1 禁出场，OQ-3）；targetWeights/costWeights + dispersion 拥挤惩罚；架梯 E1（`tryRaiseLadder` 表驱动 canBoardLadder）；**[D-2] BLOCKED_TOP 换梯/换目标重评分**；planBudgetMs 预算内 |

演示驱动（RENDER 分区）：视图层只读 WORLD 逻辑态（F2.bus 事件增量同步 unit_spawned/moved/removed）；相位按钮链 + 六诊断按钮（压测/RNG/L1&A*/坠落链/VS-3 指标/重放确定性）；`window.VS3Selftest` 桥（boot/hitRate/be2/aiTiming/determinism/smoke/metrics）供无头与浏览器自动化。

## 2. 缺陷修复记录（消费 vs3-lead-review.md）

### 2.1 D-1 攻守双方远程攻击分支缺失（阻塞级）→ 已修复

- **表驱动落点**：`TABLES.units.horse_archer.rangedWeapon='horseArcher'`（兵种名只出现在表内，代码零兵种名）；`WORLD.spawn` 透传 `rangedWeapon` 到单位实体。
- **C5 新增**：`rangedTargets(u)`（可及 = 曼哈顿(x,z) ∈ [1, weapons[key].range]，跨层可打、高度差走 ranged 键；序 = 近→远 + unitId 字典序，C5.7 同构）+ `strikeRanged(req)`（HIT_ROLL 走 F4 同流；修正链 = height(ranged) + cover(PARAPET) + exposed(onConnector) + `horseArcher.isHitMod(−0.05)`；命中后 mp=0 锁足照录）；`strike()` 注册 `kind:'RANGED'`。
- **攻方**（executePlan）：meleeTargets 为空时按 `rangedWeapon` 开火（C8 BE-3「骑射 L0 射程内点杀且不爬墙」）。
- **守方**（C10.evaluate）：评分面补远程目标集——**结构挂表就位**（rangedWeapon 单位自动进入 ATTACK 候选集、tie-break 近战先于远程）；L1 表内守方无远程武器键（VS-1 §5.3 仅床弩/骑射），故戍卒实际候选集为近战，**零数值杜撰**。
- **实测**：骑射命中面 p=0.75−0.05(仰攻 ranged)−0.15(垛口掩体)−0.05(isHitMod)=0.50，600 次 HitRate 实测落在 3σ 内（vs3-check C5.4 PASS）；实机战局 RANGED 结算 66 次。

### 2.2 D-2 BLOCKED_TOP 永久等待 → 全场冻结死锁（阻塞级）→ 已修复

- `executePlan` 三段式：① 近战优先（C2 §2.4 先攻后移）→ ② 远程 → ③ 按计划移动；**零位移（BLOCKED_TOP/BLOCKED_BOARD/REJECTED）不再原地等待**：先 `tryRaiseLadder`（C8-E2「继续等/换梯」菜单取「换梯」），再 `replanCell` 换目标重评分（预算内可达集选非当前格、非被堵格的推进格，参考点=帅帐，3D 曼哈顿 + cellId 字典序，零 F4 消费）。
- 效果：墙脚等梯单位改道找新攀爬点/压向帅帐，架梯点随移动扩散（W4「6 梯压防线」的自然实现）；**smoke 必落终局**（END_LOSE @ T32，见 §3）。
- 判据：T2–T22 战斗密度不退化（§3.3 对比表）；be2 与 determinism 复验 PASS（§3.1/§3.2）。

### 2.3 修复过程中的根因级新发现（主理人缺陷单未覆盖，已一并修复）

1. **烽燧目标形状不匹配 → 烽燧不可摧毁 → 永不 END_LOSE**（D-2 死锁的半边根因）：
   `meleeTargets` 曾推 `{type:'beacon'}`，而 `strikeMelee` 读 `t.beacon` → isBeacon=false、fid=null → 走 MISS 分支**且不消费 F4**。实测证据（修复前 40 回合诊断）：T16 起每回合 ~10 条 `MELEE→MISS`、F4 游标冻结在 87、beacon 恒 100——攻方在烽燧脚下挥拳 25 回合全部落空。修复：`{type:'beacon', beacon:true}` + `strikeMelee` 改 `t.beacon || t.type==='beacon'` 双保险。修复后 beacon 100→0（T7 起掉血，T32 归零判负）。
2. **守方近战拆自家床弩**（C10 目标集缺阵营过滤）：
   实测修复前 T1（场上 0 攻方）床弩 HP 30→18——`meleeTargets` 对设施目标无 faction 过滤，垛口戍卒把相邻的己方床弩当近战目标（C10 §2.4「攻击=点杀高价值**敌**目标」）。守方 2 人 × 6/回合 × 4 回合拆平器械，床弩开局即废。修复：设施目标仅攻方可选。修复后床弩存活至 T26（期间齐射 26 轮有效输出）。

## 3. 测试与实测证据

### 3.1 判据汇总（主理人五项完成判据）

| # | 判据 | 结果 |
|---|---|---|
| 1 | build-vs3.js 重建幂等（35 锚点 + 库体哨兵） | ✅ 连跑 3 次均 `779,360 bytes · 3 script blocks · 35 anchors pass`，库体逐字节哨兵过，函数式 replace 无吞字符 |
| 2 | vs3-browser-check.js 全 8 项 PASS，smoke 落终局 | ✅ **8/8 ALL PASS**；smoke `{ok:true, end:"END_LOSE", phase:"END_LOSE", turns:32}` |
| 3 | T2–T22 战斗密度不退化 | ✅ 见 §3.3 对比（修复前 40 回合 5 杀/烽燧零伤/游标冻结；修复后 T4 首杀、T7 烽燧开掉血、全程 melee/ranged/volley/架梯/坠落链活跃） |
| 4 | be2 与 determinism 修复后复验 | ✅ be2 MAIN 0.222 > FEINT 0.167；determinism same=true（3440B/13 行快照逐字节一致） |
| 5 | vs3-report.md 补齐 | ✅ 即本文件 |

### 3.2 测试基线

| 套件 | 结果 | 落盘 |
|---|---|---|
| 无头逻辑层 `vs3-check.js`（新增：C1×6 + C5×6 + C10×3 + C8×4 + E2E×2） | **21 PASS / 0 FAIL** | `tools/vs3-check-out.txt` |
| 浏览器级 `vs3-browser-check.js`（Edge 无头 CDP，主理人范式） | **8/8 PASS** | `tools/vs3-check-out.txt`（本次浏览器跑落盘同文件，历史基线见下） |
| 组装期语法 | APP SYNTAX OK（node 全量编译 app+lib 双块） | — |

关键实测数（browser-check 实机值）：

| 指标 | 实测 | 判据 |
|---|---|---|
| hitRate（n=2000，hitBase=0.75 基线） | rate=**0.761**，dev=0.011（≈1.1σ，3σ 容差 0.03） | PASS |
| BE-2 集中度（6 攻方 Herfindahl） | MAIN **0.222** > FEINT **0.167** | PASS（方向性成立） |
| C8 计划耗时（20 轮最差） | avg 0.16ms / worst **0.6ms** ≤ planBudgetMs=10ms | PASS |
| F4 重放确定性（同种子重跑逻辑快照） | same=true，digest 3440B × 13 行**逐字节一致** | PASS |
| smoke | END_LOSE @ T32（判负链：烽燧 HP 100→0） | PASS |

### 3.3 战斗密度对比（修复前 vs 修复后，同种子 vs-l1-seed-01 全链路实跑）

| 维度 | 修复前（lead 复核基线） | 修复后 |
|---|---|---|
| 终局 | ONGOING（40 回合上限，T24 起全场冻结） | **END_LOSE @ T32** |
| 击杀 | T22 后归零（累计 5） | T4 首杀，持续至 T28（累计 13 报告级击杀含器械） |
| 烽燧伤害 | **0**（形状 bug，见 §2.3-1） | 100→0，T7 起稳定掉血（均值 ~4/回合） |
| 床弩 | T1 起被守方自拆，T4 即毁（齐射仅 4 轮） | 存活至 T26，**齐射 26 轮**有效输出 |
| 骑射远程 | 无开火路径（D-1） | **66 次 RANGED 结算**（T4–T15 密集骚扰段） |
| F4 游标 | T15 后冻结在 87 | 全程单调推进至 212（消费=结算） |
| 架梯/攀登 | T2–T22 有 | 保留（墙顶在册位置 4_0_1/6_1_1/7_1_1/10_1_1 等 + 换梯扩散） |

### 3.4 F4 确定性验证（判据 3：同种子重跑逐字节一致）

- **规范流**：mulberry32（F4 §2.1 运算序直译）+ FNV-1a-32 种子展开（公开测试向量 `FNV-1a("a")=0xe40c292c`、`FNV-1a("foobar")=0xbf9cf968` 双实现互证）；单流全局游标，`rand('HIT_ROLL')` 为命中骰唯一入口。
- **重放证据**：同种子 `vs-l1-seed-01` 两局各跑 12 回合，逐回合逻辑快照（单位 uid:hp:cellId 全集 + 烽燧 HP + F4 游标）**逐字节一致**（browser `determinism same=true`；无头 E2E.2 PASS）。
- **零独立 RNG 断言**：C10 决策面 + C8 计划面跑完整回合游标零消耗（C10.2 PASS）；每次命中结算恰消耗 1 游标（C5.6 PASS）；E2 坠落伤害恒定不过骰、游标零消耗（C1.6 PASS）。C8 `generatePlans` 同输入两次输出 JSON 全等（C8.1 PASS）。

## 4. 消费数值键清单（键名 + 值 + 来源章节 = vs-playtest-sheet v1.0.1）

**代码零兵种名/零数值硬编码**：以下全部键只存在于 `TABLES` 内联 JSON 宿主（F3 §3.2 规范键路径）与 `WAVES_L1`；实现侧只按键路径消费。

| 键路径 | 值 | 来源 |
|---|---|---|
| `units.garrison_squad.baseHp/baseMp/baseAp/speed` | 100/3/1/3 | §5.1 |
| `units.ladder_infantry.baseHp/baseMp/speed/canBoardLadder/layerAccess` | 60/3/3/true/[0,1] | §5.1 |
| `units.horse_archer.baseHp/baseMp/speed/rangedWeapon` | 50/5/5/'horseArcher' | §5.1（rangedWeapon=本批新增接线键，指向 weapons.horseArcher） |
| `units.warlord_escort.*`（auraStrategyId） | 80/4/4/'presence-v1' | §5.1（L1 不出场，键位在册） |
| `units.ram_chariot.*`（immuneToMeleeInteract） | 200/2/2/true | §5.1（L1 不出场，W-V3 门禁） |
| `*.mpZeroOnAttack` | true（C2.4 攻击后锁足，近战/远程同口径） | §5.1 照录 |
| `facilities.bedCrossbow.hp/range/reloadTurns/targetPriority` | 30/12/1/[horse_archer,ladder_infantry,warlord_escort,ram_chariot] | §5.2 |
| `facilities.rollingStock.hp/dropRadius` | 20/1 | §5.2 |
| `weapons.bedCrossbow.damage` | 40 | §5.3 |
| `weapons.rollingStock.dropDamage` | 30 | §5.3 |
| `weapons.fallDamage` | 10 | §5.3（§8.4 裁定：恒定不过骰） |
| `weapons.melee.damage` ⚠ | 12 | **缺口补位键**：VS-1 §5.3/§6.4 全文近战基准（拆弩 12×0.5=6、戍卒 12×…），F3/C5 键清单无正式键——待 VS-7 勘误批收录 |
| `weapons.melee.vsFacility` | 0.5 | §5.3 |
| `weapons.horseArcher.range/damage/isHitMod` | 4/12/−0.05 | §5.3（range<12 硬约束 ✓） |
| `combat.hitBase` | 0.75 | §5.4 |
| `combat.heightModPerLevel` | 0.10 | §5.4（近战高度键；骑射仰攻另走 ranged 键） |
| `combat.heightModPerLevelRanged` | 0.05 | §5.4/§8（v1.0.1 裁定批准入 F3 清单，VS-7 随勘误批收录） |
| `combat.coverModParapet` | −0.15 | §5.4 |
| `combat.exposedModLadder` | +0.25 | §5.4 |
| `combat.squadHpPowerCurve` | 'linear'（输出侧 hp/maxHp） | §5.4 |
| `aiScripts.targetWeights.w_beacon/w_garrison/w_facility/w_path` | 100/60/40/40 | §5.6 |
| `aiScripts.costWeights.c_exposure/c_detour/c_congestion` | 1.0/0.5/0.5 | §5.6 |
| `aiScripts.intentScripts.MAIN_ASSAULT` | {beaconMul:1.5, pathMul:1.5, garrisonMul:1.0, facilityMul:1.0, dispersionMul:1.0} | §5.6 |
| `aiScripts.intentScripts.FEINT` | {beaconMul:1.0, pathMul:1.0, garrisonMul:0.5, facilityMul:1.2, dispersionMul:2.0} | §5.6 |
| `aiScripts.intentScripts.COORDINATED` | 表加载占位（L1 禁出场，C8 OQ-3） | §5.6 |
| `aiScripts.leadWeight/planBudgetMs` | 15/10 | §5.6 |
| `aiScripts.congestionGravity` ⚠ | 100 | **灰盒标定常量**（非 VS-1 键）：分散惩罚幅度 = dispersionMul×c_congestion×gravity×同目标计数，取 w_beacon 同量级使 MAIN 集中/FEINT 分散方向性成立（BE-2 实测 0.222>0.167），待 VS-7 校准 |
| `defenseScripts.w_block/w_strike` | 50/40 | §5.7 |
| `defenseScripts.bountyWeight/hasAuraBonus` | 0.2/20 | §5.7（赏格基准 loot/30 归一） |
| `defenseScripts.lambda_expose/lambda_detour/standFast/slotDecisionMs` | 0.8/0.5/45/2 | §5.7 |
| `defenseScripts.hooks` | ['presence-aware-v1','cohesion-v1']（占位返 0） | §5.7 |
| `terrain.moveCost.plains/climb/gate` | 1/2/2 | §5.8（climb=2 ↔ A* 启发层差权重 2.0 联动） |
| `terrain.ladderHp/stackLimit` | 15/4 | §5.8 |
| `beacon.durability` | 100 | §5.8 |
| `f4Seed` | 'vs-l1-seed-01' | §5.10 |
| `waves`（WAVES_L1） | 4 波 / MAIN→MAIN→FEINT→MAIN / W1@T2 纯梯 ×2 / W2 梯×2+骑×2 / W3 FEINT 梯×2+骑×3 / W4 梯×6+骑×2 / 间隔恒 2 | §5.9（W-V3/W-V6 ✓） |
| ⚠ 未消费域 | `economy`（initialTreasury 480、income 20/20、loot 30/25/100/90、cost build 100/60、deploy 50、repair 1） | §5.5——**表已加载、代码未消费**，A 相位建设经济归 VS-4；loot.perTemplate 已被 C10 strikeVal 只读消费 |

## 5. 锚点核销表

口径说明：底座文件括号锚点实数 **18 处**（[VS-3]×11 / [VS-4]×4 / [VS-5]×3；原基线字面 "VS-3" 27 处含标题/表头等非锚点文本，主理人 brief 记 26 处即该口径）——本表对 18 处逐一核销；另有 build-vs3.js 的 **35 个构建锚点**独立全过（判据 1）。核销期间旧演示分区的 2 处 [VS-3] 占位锚点随占位代码一并被真实实现替代（其承诺的行为已由新分区覆盖，见下表对应行）。

| # | 锚点（源文件行） | 归属 | 核销状态 |
|---|---|---|---|
| 1 | L316 board/unboard 骨架签名说明 | C1/F1 | ✅ 已实装（真实实现见 #6） |
| 2 | L319 E2 坠落伤害回调注入点 `setFallHandler` | E2 | ✅ 已实装（WORLD.init 注入 → C5.applyFallDamage） |
| 3 | L381 destroyConnector 坠落伤害链 | E2 | ✅ 已实装（fallHandler 回调，落位成功与否皆结算） |
| 4 | L396 E2 伤害结算挂点（位移后回调） | E2 | ✅ 已实装（fallDamage=10 恒定不过骰，C1.6 测试证据） |
| 5 | L415 攀爬登记双 mutation 骨架签名 | C1/F1 | ✅ 已实装（真实实现见 #6） |
| 6 | L427 boardConnector/unboardConnector 真实实现 | C1/F1 | ✅ 已实装（三检 + INV2 + from 满拒绝；C1.3/1.4/1.5 证据） |
| 7 | L500 A* 消费入口（layerAccess/faction/maxCost） | C1/F1 | ✅ 已实装（C1.1 证据；攻方 DEFENDER_ONLY 不可见） |
| 8 | L524 edgeCost 攀爬原子 2MP 一口价 | C1/F1 | ✅ 已实装（C1.3 证据：climb=2 恰扣） |
| 9 | L560 attackerAdjacency 供 C8 可达性评估 | C8/F1 | ✅ 契约履行：C1.reachable 内建同图同过滤（layerAccess+DEFENDER_ONLY+MP 预算），attackerAdjacency 保留为 F1 公开查询面 |
| 10 | L1415 boot 世界态先行接线 | WORLD | ✅ 已实装（WORLD.init → F1.mount + F4 展开 + F2 接线 + 表驱动守方布阵） |
| 11 | L1520 C5 格标签 COVER=PARAPET / EXPOSED=onConnector | C5 | ✅ 已实装（isCover/暴露位；C5.2/C5.4 证据） |
| 12 | L620 [VS-5] F4 §2.5 规范字节流 S | F4 | ⏳ 保留挂账（VS-5 存档批） |
| 13 | L669 [VS-4] economy 表未消费 | C6 | ⏳ 保留挂账（VS-4；strikeVal 对 loot 的只读消费不触禁令） |
| 14 | L848 [VS-4] d2Economy 收入结算钩子 | C6/F2 | ⏳ 保留挂账（VS-4；零 F4 消费注释在位） |
| 15 | L849 [VS-4] d3Reinforce 援军到岗钩子 | C6/C9/F2 | ⏳ 保留挂账（VS-4） |
| 16 | L1555 [VS-5] 堆叠可视化护栏（四象限） | RENDER | ⏳ 保留挂账（VS-5 视觉精化；本批四象限错位已生效） |
| — | （替代）旧 demo `modeOf` [VS-3] C10 托管路由占位 | C10 | ✅ 被真实 `C10.effectiveMode`/UNIT 级 controlMode 替代（C10.3 证据） |
| — | （替代）旧 demo「真实伤害结算替换此块」[VS-3] 占位 | C5 | ✅ 被真实 C5 结算替代（演示清场块删除；smoke 终局即证据） |

## 6. 已知问题 / 风险 / 挂账

1. **`weapons.melee.damage=12` 为缺口补位键**（§4 ⚠）：VS-1 §5.3/§6.4 全文近战基准取 12 但无正式键，VS-7 勘误批收录前按 12 实现。
2. **`aiScripts.congestionGravity=100` 为灰盒标定常量**（非 VS-1 键）：使 BE-2 方向性成立的最小假设，VS-7 校准；若主理人认为应挂账为 OQ，请转文策渊批。
3. **骑射高度口径**：实现统一用 `heightModPerLevelRanged=0.05`（§5.4/§8 批准键）；VS-1 §5.3 行 133 的示例「12×0.9」按 0.10 口径，两处字面不一致——按批准键执行，建议 VS-7 勘误时统一 §5.3 示例文字。
4. **灰盒简化（已注释在码，不阻塞）**：① 烽燧近战可及 = x/z 曼哈顿 ≤1（忽略高度差语义）；② 床弩走廊 z 固定 = 设施所在 z（只覆盖 z=1 列，走廊物化完整版归 C3）；③ 骑射可及 = 曼哈顿(x,z) 距离（非 C3 走廊轴向语义，按 C8 BE-3「L0 射程内点杀」执行）。
5. **smoke 终局 = END_LOSE（攻方胜，T32）**：灰盒无经济/增援/重建（VS-4 域），3 戍卒+1 床弩对 4 波 17 单位天然守不住——**不构成平衡结论**，仅证明判负链与战斗收敛正确。
6. **hitRate 诊断用独立种子 `vs3-hitrate-probe`**（D-3 备忘）：诊断工具内自洽（用后 resetBattle 复位主流），不违反 C5/C8/C10 零独立 RNG 纪律；如 VS-5 认为有歧义可改为跑后恢复游标。
7. **修复波及面提示**：本批改动限于 `_vs3-app.js`（C5 增 ~60 行 / C10 评分面 +tie-break / C8 executePlan+replanCell / TABLES 一键 / meleeTargets 两处 / VS3Selftest.smoke 返回形状）；`vs3-browser-check.js`、`build-vs3.js`、GDD **零改动**；未 git commit。
8. **BE-2 数值余量偏薄**（0.222 vs 0.167）：方向正确但差距 0.055，若 VS-7 调 gravity/dispersionMul 请复跑 be2 断言（无头 C8.2 + browser be2 双保险）。

## 7. 下一步建议（供主理人裁定，未自行开工）

- VS-4（A 相位建设经济 + 器械 + D 结算）消费本批 `economy` 表与 d2Economy/d3Reinforce 钩子位；礌石五步链已就绪可直挂 C3/C4 自由指令。
- 守方远程武器若后续裁定（戍卒弓？），C10 评分面已支持 `rangedWeapon` 一键接入，零结构改动。
- 建议主理人复核 §2.3 两处根因修复的口径（尤其「设施目标仅攻方可选」是否需要 C10 GDD 补一行边缘裁定）。

— 程基岩，待独立复核，未自行开 VS-4。
