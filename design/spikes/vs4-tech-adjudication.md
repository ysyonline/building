# VS-4 技术裁定落地文档 —— A/B/C/D/E 五裁定的技术消费与残留动作

> **版本** v1.0 ｜ **日期** 2026-09-22 ｜ **产出** engineering-lead（程基岩）
> **上游** 主理人 GW-VS-T1 裁定包（裁定 A-E）｜ `vs4-report.md` v1.0 §5/§6 ｜ `GW-VS-EXT-01-playability-review.md` ｜ `vs-playtest-sheet.md` v1.0.1
> **实装复核基准** `design/spikes/tools/_vs4-app.js`（VS-4 落盘态）｜ `tools/vs4-check.js`（40 PASS / 0 FAIL）｜ `design/spikes/graybox-vs.html`
> **硬约束遵守**：零数值改判（全文无任何平衡建议，仅 mechanics/正交性判断）✓ ｜ GDD 正文零改动（§3 条款为「供引述」草案）✓ ｜ `_vs4-app.js` / `graybox-vs.html` / `vs4-check.js` **零改动**（本轮纯文档）✓ ｜ 未 git commit ✓
> **未决事项一律上报**，未自行开工。

---

## §1 裁定落地表

### 1.0 异议 / 修正（置顶 · 按主理人硬性要求）

> 以下 5 条均为**与代码事实冲突或前提不成立**的修正，不是对裁定的反对；裁定方向照单执行，仅在精确落点/计数/前提上更正。

| # | 类型 | 异议内容 | 代码证据 | 建议处置 |
|---|---|---|---|---|
| **异议-1** | 裁定 A 的事实补充（**重要**） | **浏览器侧 VS4Selftest 的 `reload_derivation` 断言当前即为 FAIL，且它编码的正是「跳过下一轮」语义。** 该文件从未被无头测试执行过，故「40 PASS / 0 FAIL」的证据面未覆盖它——挂账 6（vs4-browser-check.js 未建）掩盖了一条已存在的失败断言。 | `_vs4-app.js:2610`：`chk('reload_derivation', !C4.canFireAt(f0,2) && !C4.canFireAt(f0,3) && C4.canFireAt(f0,4), 't2拒/t3拒(跳过下一轮)/t4就绪')`；而 `:1794` 实现为 `t >= lastFiredTurn + reloadTurns` ⇒ `canFireAt(f0,3) === true` ⇒ `!true === false` ⇒ **该 chk 恒 FAIL**。同一文件 `:1788` 的注释却写「t+1 即就绪」——**同一文件内两套语义并存** | 翻转（§2）不是引入新语义，而是让实现与**同文件内已写好但从未跑过的自测断言**一致。请主理人知悉：VS-7 翻转后，`reload_derivation` 由 FAIL 转 PASS，属于**修 bug 而非改判** |
| **异议-2** | 挂账 3 计数修正 | 挂账 3 原文「改一处推导式（`+ reloadTurns + 1`）+ **2 条断言**即可」。实际受影响面 ≠ 2 条：无头侧 1 条（VS4-R3，内部含 `pure`/`seman` 两个子判据）、浏览器侧 1 条（方向相反：FAIL→PASS）、**需重跑确认** 3 条（回归E2E.1 / 回归E2E.2 / VS4-D4）、**新增缺口** 1 处（C4.5 装填进度环分母，灰盒未实装） | 见 §2.3 清单 | 按 §2.3 清单执行，勿按「2 条」估算工时 |
| **异议-3** | **裁定 D 前提不成立** | 裁定 D 要求确认「`setupTurns` 是**唯一一处**被代码消费但不落在 sheet 的数值键」。**全量核对结论：不成立，共 4 处（含 5 个 speed 值）。** | 见 §1.6 全量核对表 | 请主理人把裁定 D 的「唯一」改为「已知 4 处」，勘误批按 4 处立项 |
| **异议-4** | 编号口径澄清 | 裁定 A 要求给「vs4-check.js 中的断言**编号**」。该文件**无数字编号**，断言以 `ok(name, cond, detail)` 的**首参字符串**为唯一标识 | `vs4-check.js:37-40`；40 条断言 = 21 条 `回归X.Y` + 19 条 `VS4-Xn` | 本文一律以 **断言名 + 行号** 双重标识，避免后续对不上 |
| **异议-5** | 裁定 E 契约缺口 | 「零结构改动即可生效」成立，但 **`ReinforceEntry.dropZoneRef` 当前被实现忽略**——落点=全部 deployZones 并集内首个可容纳格，不做 zone 定向 | `_vs4-app.js:875-885` `placeReinforcement()` 只 iterate `F1.level().deployZones` 全部 zone，未读 `entry.dropZoneRef` | 契约需显式声明（§1.5）：MVP 落点口径=并集首容格，`dropZoneRef` 为**未消费的保留字段**；若 X2 需定向，VS-7 加 1 行过滤 |

---

### 1.1 裁定 A ｜ 装填语义（挂账 3）

| 栏 | 内容 |
|---|---|
| **主理人裁定** | 维持字面实现，本轮不改；必须产出 VS-7 零成本翻转预案（引 GW-VS-EXT-01 §六-1 冻结数值 ／ §三 S2 装填空窗=骑射反击窗为强项） |
| **技术结论** | **服从，零代码改动。** 补充三条代码事实供主理人存档：①现状实现「装填空窗 = **0 整轮**」（发射于 t ⇒ t+1 即就绪，`:1794`），即 C4 §1.4「克制三原则①」与 §2.3「装填空窗是机制来源」在 MVP 参数（reloadTurns=1）下**节拍强度为零**；②`reloadTurns=1` 在 sheet §5.2 的理由文字是「**发射→跳过下一轮**」，与字面式**不同**；③sheet §6.4 括注「装填轮次减半」与各波行把 31.5 当每轮使用**内部矛盾**——该口径含混归文策渊勘误批，我不裁 |
| **本轮动作** | 产出 §2 完整翻转预案（精确落点 / 断言影响清单 / W4 定性影响 / 10 分钟 SOP / 回滚成本）。**未改任何代码** |
| **VS-7 残留动作** | ①按 §2.1 翻转（1 行）+ §2.2 连带（注释 1 处 + 浏览器断言 0 改）；②重跑 `vs4-check.js` 与浏览器 VS4Selftest（挂账 6 必须一并销账，否则翻转后仍无证据）；③裁定「空射是否记账」（§2.5 风险 R-2）；④C4.5 进度环实装时定分母口径（§2.5 风险 R-3） |

### 1.2 裁定 B ｜ OFFBOARD 预备队不在 AI 目标集（挂账 4）

| 栏 | 内容 |
|---|---|
| **主理人裁定** | 采纳实现口径为正式规则，回填 C8 GDD；我不改 GDD，只给可引述措辞 |
| **技术结论** | **确认成立，且防崩理由核实为真**：`F1.getCell('OFFBOARD')` 返回 `null`（`:315` `return lv.cells[id] \|\| null`）。若不过滤，后续 `C8.approachCell()`（`:1378-1380`）对目标格 `F1.getCell(objCellId)` 直接取 `.x/.z` → **TypeError 崩溃**。故本过滤是**必需的非空守卫**，非可选优化。实现落点 `_vs4-app.js:1364-1365`（`C8.objectives()` 内 `WORLD.defenderUnits()` 遍历的 `if (d.cellId === 'OFFBOARD') return;`） |
| **本轮动作** | 产出 §3 可直接贴进 C8 GDD 的条款草案（一句话规则 + 防崩理由 + `objectives` 筛选条件写法 + 两条禁例），标注「供 C8 GDD 引述」 |
| **VS-7 残留动作** | 由 design-strategist（文策渊）在 C8 GDD 回填；建议回填位=C8 §2.3「目标价值项」表下 + §5 边缘情况新增一条（我在 §3 给了建议编号与位置） |

### 1.3 裁定 C ｜ `C6.quote` 键名桥 `matchKey` 单向收干（挂账 5）

| 栏 | 内容 |
|---|---|
| **主理人裁定** | 单一真源 = F3 数据表键 camelCase；命令面别名留 command 解析层；**经济区不得再做 key 归一化** |
| **技术结论** | **方向服从，但落地形态需一处修正**：camelCase 权威在 **BUILD_FACILITY 侧可完全落地**（`facilities` 表键已是 camelCase，只需把 C6 §3.4 / C7 §3.1 的枚举字面 `'BED_CROSSBOW'/'ROLLING_STOCK'` 勘误为 `'bedCrossbow'/'rollingStock'`）；在 **DEPLOY_UNIT 侧不能靠「统一 camelCase」消除映射**——因为传入的是 **C2 UnitTemplateId（units.json 键 = snake_case，`garrison_squad`）**，而费用键在 economy.json（camelCase），这是**两张 F3 表、两种命名约定**的跨表缝，不是同表内的大小写分歧。强制经济区不做归一化 ⇒ 必须在「改名 units 域」与「改名 economy 域」之间二选一，或把映射**数据化** |
| **本轮动作** | 产出 §4：`matchKey` 删除的判定条件（3 条门禁）+ 删除后的调用面影响清单（具体函数名与炸点）+ 我推荐的**形态丙（映射数据化，与既有 `lootKey` 同构）**，不自行选型，交主理人 |
| **VS-7 残留动作** | ①主理人在三形态中选型；②按 §4.2 影响清单改命令面；③改完才能删 `matchKey`，否则六指令中两条核心指令 100% 拒绝（§4.2 炸点表） |

### 1.4 裁定 D ｜ `bedCrossbow.setupTurns=1` 缺 sheet 键（挂账 1）

| 栏 | 内容 |
|---|---|
| **主理人裁定** | 认可「结构定值归 GDD 权威」，须在 playtest-sheet §5.2 补键位并标注「GDD 结构定值·非平衡键」 |
| **技术结论** | **认可，但「唯一一处」前提不成立（见异议-3）。** 全量核对：代码消费、sheet §5.x 无键的数值键共 **4 组**。其中 `setupTurns` 是唯一**有 GDD 明文出处**的（C4 v1.0.2 §2.4/§3.4）；另 3 组属「代码补位常量，GDD 亦无键」，风险等级更高 |
| **本轮动作** | §1.6 给出全量核对结论表（键路径 / 值 / 消费行 / 出处状态 / 建议处置） |
| **VS-7 残留动作** | 勘误批 4 项立项：`setupTurns`（补 sheet §5.2，标 GDD 结构定值）、`weapons.melee.damage`（补 sheet §5.3 + C5/F3 键清单）、`aiScripts.congestionGravity`（补 sheet §5.6 或降级为灰盒私有常量并显式声明）、`units.*.speed`（补 sheet §5.1 五值，或声明「speed 归 C2 §3.6 结构字段、非平衡键」） |

### 1.5 裁定 E ｜ `reinforcementSchedule` 空表（挂账 2）

| 栏 | 内容 |
|---|---|
| **主理人裁定** | 保持空表；机制在位、数值内容挂 X2 传承战役；我给出零结构改动的接入契约 |
| **技术结论** | **确认「零结构改动即可生效」成立**：只需向 `TABLES.economy.reinforcementSchedule`（`_vs4-app.js:689`）填 `ReinforceEntry[]`，D③ 链自动消费（`:908-924` → `C6.dueReinforcements`（`:1601-1605`，按 `dueTurn === turn` 过滤）→ `WORLD.placeReinforcement`（`:875-885`）→ `reinforce_arrived` 事件）。断链点仅有「落点满 → 顺延队列」一条（F2.7，条目零丢失，已有断言 VS4-D1 覆盖） |
| **本轮动作** | §1.7 给出完整接入契约（字段形状 / 谁在何时读 / 典型落点 / 三条契约缺口） |
| **VS-7 残留动作** | ①契约缺口 E-1（`dropZoneRef` 未消费）需裁定「保留字段」vs「加 1 行过滤」；②缺口 E-3（`dz_reserve` 预备带不存在）随 L2 关卡数据一并评审 |

### 1.6 【裁定 D 配套】全量核对：代码消费但 sheet 无键的数值键

> 核对口径：扫描 `TABLES`（`_vs4-app.js:657-719`）全部数值叶子键，逐键比对 `vs-playtest-sheet.md` v1.0.1 §5.1-§5.10。非数值键（layerAccess / canBoardLadder / attackCapable / immuneToMeleeInteract / deployKind / rangedCorridor / hooks[] 等结构开关）与关卡数据（`level.initialDeploy` / `beacon.cellId`）不计入。

| # | 键路径 | 值 | 消费位置 | sheet 状态 | GDD 出处状态 | 风险 | 建议处置（交文策渊） |
|---|---|---|---|---|---|---|---|
| D-1 | `facilities.bedCrossbow.setupTurns` | 1 | `:1798` `setupReadyAt` | **§5.2 无键** | ✅ **有**：C4 v1.0.2 §2.4「MVP 床弩 setupTurns=1」+ §3.4 键清单「本文新增」 | 低 | 补 sheet §5.2，标「**GDD 结构定值·非平衡键**」 |
| D-2 | `weapons.melee.damage` | 12 | C5 近战伤害链 | **§5.3 无键**（§5.3/§6.4 全文近战基准取 12 但无正式键位） | ❌ **无**：代码头部 `:651-653` 自注「数值缺口补位键」，vs3-report 已列已知问题 | **中** | 补 sheet §5.3 + C5/F3 键清单正式收录 |
| D-3 | `aiScripts.congestionGravity` | 100 | `:1389` 拥挤分散惩罚幅度 | **§5.6 无键** | ❌ **无**：代码头部 `:654-655` 自注「灰盒标定常量，非 VS-1 键」 | **中**（消费在 C8 评分主循环，直接改 BE-2 集中度断言方向） | 二选一：①补 sheet §5.6；②显式降级为「灰盒私有常量」并在 vs-report 挂账（勿让它悄悄进平衡轮） |
| D-4 | `units.*.speed`（5 值：garrison_squad 3 / ladder_infantry 3 / horse_archer 5 / warlord_escort 4 / ram_chariot 2） | 见表 | `:130` F2.1 行动序排序主键；`:769` 单位实例化；`:2176` 快照构造 | **§5.1 全文无 `speed` 键**（全表 grep 零命中） | ⚠ **半有**：C2 §3.6 `speed(u)` 只定签名、注「值 F3 宿主」，**未给值** | **中高**（行动序 = 全回合最上游的时序结构，却无数值权威） | 补 sheet §5.1 五值；或明确声明「speed 归 C2 §3.6 结构字段、非平衡键」，并落一行到 sheet §7「推翻/调整既有工作假设」表 |

**结论**：`setupTurns` **不是唯一一处**。已知 4 组（D-1 唯一有 GDD 明文出处；D-2/D-3/D-4 为代码补位常量，GDD 亦无键，风险更高）。裁定 D 的勘误批请按 4 项立项。

### 1.7 【裁定 E 配套】`ReinforceEntry` 零结构改动接入契约

**字段形状**（C6 §3.2 五字段，实现侧零扩展、零裁剪）：

```ts
{
  entryId: string;          // 唯一标识（顺延队列去重用；本实现未校验唯一性，靠数据侧自洽）
  dueTurn: number;          // 原定到岗回合 —— 【唯一被判定的字段】dueTurn === turn 才到期
  templateId: UnitTemplateId;   // MVP 恒 'garrison_squad'；实现 fallback = 'garrison_squad'（:881）
  dropZoneRef: string;      // ⚠ 当前【未被消费】（异议-5）
  source: 'C6_REINFORCE';   // 枚举位，实现未校验
}
```

**谁在何时读（读链全图）**：

| 时点 | 调用 | 行为 |
|---|---|---|
| 每回合 D 相位 D③（F2 §2.2-D 固定序，位于 D② 之后） | `F2.runPhaseD()` → `hooks.d3Reinforce(turn)`（`:174`） | ①先倒序遍历 `F2.state().dbe.pendingReinforcements` 首位重试（条目零丢失 F2.7）；②再取 `C6.dueReinforcements(turn)` 新到期条目 |
| 同上 | `C6.dueReinforcements(turn)`（`:1601`） | 表**只读**过滤 `dueTurn === turn`；顺延**不回写表**（C6-E9） |
| 同上 | `WORLD.placeReinforcement(entry)`（`:875`） | 部署区白名单内 `cells.slice().sort()` 后**首个 `F1.canPlace(c,1)` 为真**的格 → `spawn('DEFENDER', …)`；全部满 → 返回 false → 入顺延队列 |
| 到岗/顺延任一发生 | `F2.bus.publish('reinforce_arrived', {turn, arrived, deferred})`（`:922`） | P4 飘字 / X5 对账 |

**典型落点**：当前 L1 `deployZones` 仅 `dz_wall = ['5_1_1','6_1_1','7_1_1']`（`:296`），故典型落点=`5_1_1`（字典序首个可容纳格），满则顺延 `6_1_1` → `7_1_1`；三格全满 → 顺延至下回合。

**三条契约缺口（X2 侧须知）**：

| 缺口 | 说明 | 影响 |
|---|---|---|
| E-1 | `dropZoneRef` 被忽略（落点=全并集首容格） | 若 X2 需「援军只落预备带」，VS-7 需在 `:877` 循环加 1 行 `if (entry.dropZoneRef && zones[zi].id !== entry.dropZoneRef) continue;` |
| E-2 | `templateId` 有 fallback `'garrison_squad'`；MVP 援军恒此兵种（C6 §2.6 已裁） | X2 若填非守方模板会被 `spawn('DEFENDER', …)` 静默按守方处理，无拒绝码 |
| E-3 | `dz_reserve` 预备带**在 L1 关卡数据中不存在**（C7 §2.9/E3 提及但未建） | 援军落点与玩家部署落点**同池竞争**；C7-E6 已裁定「无落点保留机制」，援军迟到是自然反馈 |

---

## §2 装填语义翻转预案（裁定 A · VS-7 零成本翻转包）

> 目标：VS-7 拿到本节后 **10 分钟内**可翻转完毕。全部落点已精确到行，无需重新推导。

### 2.1 精确落点（唯一必改行）

**文件**：`design/spikes/tools/_vs4-app.js`
**函数**：`C4.canFireAt(f, t)`（`:1792-1795`）

```js
// ── 现状（C4.2 字面式，本轮冻结不动）─────────────────────────────
function canFireAt(f, t) {
  if (f.lastFiredTurn === null || f.lastFiredTurn === undefined) return true;
  return t >= f.lastFiredTurn + T.facilities.bedCrossbow.reloadTurns;   // :1794
}

// ── 翻转后（VS-7 目标态：装填空窗 = 1 整轮）───────────────────────
function canFireAt(f, t) {
  if (f.lastFiredTurn === null || f.lastFiredTurn === undefined) return true;
  return t >= f.lastFiredTurn + T.facilities.bedCrossbow.reloadTurns + 1;   // 唯一改动：+ 1
}
```

**推导式对照**：

| | 现状（字面式） | 翻转后 |
|---|---|---|
| 表达式 | `t ≥ lastFiredTurn + reloadTurns` | `t ≥ lastFiredTurn + reloadTurns + 1` |
| reloadTurns=1 下，发射于 t=2 | t=3 起可射 | t=4 起可射 |
| **装填空窗（整轮数）** | **0 轮** | **1 轮** |
| 同回合二射防护 | `t = lastFiredTurn` ⇒ `t ≥ t+1` 恒 false ✅ | `t ≥ t+2` 恒 false ✅（E5 防线更厚） |
| 新建床弩火力爬升（createdTurn=c） | 首射 c+1，次射 c+2 | 首射 c+1，次射 c+3 |

**不得改动的行**（改了就超范围）：`:1798` `setupReadyAt` 的 `+ setupTurns`（架设期与装填期是两条独立推导，C4.3 不参与本翻转）；`:1808` `_lastVolleyId` 去重（E5 独立防线）；`:1827-1828` 状态翻转（显示字段，逻辑权威仍为推导式）。

### 2.2 连带改动（非必须，但 10 分钟内一并做完）

| # | 落点 | 改动 | 是否必须 |
|---|---|---|---|
| C-1 | `_vs4-app.js:1786-1791` 注释块 | 「t+1 即就绪」→「t+2 就绪（空窗 1 整轮）」；删掉 `:1790-1791` 关于「射一轮歇零整轮」的辩解段 | 建议（当前注释与同文件 `:2608-2610` 自测断言互相打脸） |
| C-2 | `_vs4-app.js:2608-2610` 浏览器自测 | **零改动**——它已经写对了，翻转后自动由 FAIL 转 PASS | 必须不改 |
| C-3 | `vs4-check.js:496-497` 注释 + `:498` `pure` + `:511` `seman` | 注释口径与判据同步翻转（见 §2.3） | **必须**（否则 VS4-R3 FAIL） |
| C-4 | C4.5 装填进度环 | 灰盒**未实装** `progress()`（全文件 grep 零命中）。VS-5 视觉层若要画环，分母须与翻转后口径一致：`progress = clamp((t − lastFiredTurn − 1) / reloadTurns, 0, 1)` | VS-5 时处理 |

### 2.3 受影响断言清单

> 无头侧以 `vs4-check.js` 的 `ok()` 首参名标识（该文件无数字编号，见异议-4）；浏览器侧以 `_vs4-app.js` 的 `chk()` 首参名标识。

| 断言标识 | 文件:行 | 现状 | 翻转后 | 处置 |
|---|---|---|---|---|
| `VS4-R3 装填推导：发射 t → 同轮去重（E5）→ t+1 恢复可射；齐射后 lastFiredTurn=t 写入` | `vs4-check.js:493-513` | PASS | **FAIL** | **必须改**：`:498` `pure` → `!canFireAt(f0,2) && !canFireAt(f0,3) && canFireAt(f0,4)`；`:511` `seman` → `!canFireAt(f,2) && !canFireAt(f,3) && canFireAt(f,4)`；`:496-497` 与 `:499` 注释同步（端到端段补一句「T4 才恢复可射」） |
| `reload_derivation`（浏览器 VS4Selftest，`btn-c4rhythm` 按钮） | `_vs4-app.js:2610` | **FAIL（当前即失败）** | **PASS** | 零改动；翻转后**必须补跑浏览器侧**（挂账 6 未销账则无证据） |
| `回归E2E.1 全链路 40 回合内必落 END_WIN\|END_LOSE，全程零 illegal_transition` | `vs4-check.js:258` | PASS | 预计 PASS（守方更弱 ⇒ 更早起 END_LOSE，收敛更快） | **必须重跑确认**，不可假设 |
| `回归E2E.2 F4 重放确定性：同种子两局逻辑快照逐字节一致` | `vs4-check.js:286` | PASS | 预计 PASS（两局同受翻转影响，确定性不受语义变更影响） | **必须重跑确认** |
| `VS4-D4 E2E 扩展：注入建设后全链路 40 回合内仍必收敛终局 ∧ 零 illegal_transition ∧ 余额恒 ≥0` | `vs4-check.js:600` | PASS | 预计 PASS（同上；余额项与床弩 DPS 无关路径：farm/supply 恒定，loot 因击杀减少而减少，恒 ≥0 不破） | **必须重跑确认** |
| `VS4-D3 全局重放确定性扩展` | `vs4-check.js:565` | PASS | 预计 PASS | 重跑确认 |
| `VS4-R1`（齐射 volleyId / 空载 / E5） | `vs4-check.js:473` | PASS | PASS（T1 无床弩可射，与装填无关） | — |
| `VS4-R2`（架设推导） | `vs4-check.js:484` | PASS | PASS（`setupReadyAt` 不参与翻转；`:490` 走 `lastFiredTurn:null` 分支恒 true） | — |
| `VS4-D1` / `VS4-D2`（D 相位收口） | `:534` / `:551` | PASS | PASS | — |
| 全部 21 条 `回归*` 中除 E2E.1/E2E.2 外 | — | PASS | 预计 PASS | 重跑确认 |

**合计**：必改 1 条（VS4-R3）、反向转绿 1 条（`reload_derivation`）、重跑确认 5 条（E2E.1 / E2E.2 / VS4-D3 / VS4-D4 / 全量回归）。

### 2.4 对 W4 压力曲线的定性影响预判（**仅 mechanics 后果，非平衡建议**）

> 声明：以下为「改一个节拍参数 ⇒ 下游算式怎么动」的**机械后果**推演，不构成任何「更好玩/更难」的判断，也**不得**作为 VS-6 前的调参依据（GW-VS-EXT-01 §六-1 冻结纪律仍然有效）。

| 项 | 现状（空窗 0 轮） | 翻转后（空窗 1 轮） |
|---|---|---|
| 床弩长期射速 | 每轮锚点至多 1 发（齐射锚点每回合恰一次 + E5 去重 ⇒ **射速上限=1 发/轮，无空窗**） | **每 2 轮 1 发**（射速减半） |
| 单发期望伤害（F3 表值，不变） | 40 × 0.75 × (1 + 0.05) = **31.5/发**（sheet §5.3/§5.4） | 同 |
| 每轮期望输出 | **31.5/轮**（= sheet §6.4 各波行实际使用的口径） | **≈15.75/轮**（= sheet §6.4 括注「装填轮次减半」的口径） |
| W4 守方「有效输出/轮」（按 sheet §6.4 行 `31.5 + 16.2 + 8.1×3 ≈ 72` 同法重算） | ≈ 72 | ≈ **56.3**（72 − 15.75） |
| W4 击杀所需轮次（攻方总有效 HP 545 ÷ 上值） | ≈ **7.6 轮** | ≈ **9.7 轮** |
| 敌场可达轮次（入场→登顶） | 5-6 轮 | 5-6 轮（不变） |
| **净轮差** | **−1 ~ −2 轮**（sheet §6.4 原结论） | **−4 轮量级**（粗算，量级示意） |
| 「装填空窗 = 骑射反击窗」（GW-VS-EXT-01 §三 S2） | **节拍强度 = 0**（该强项在 MVP 参数下不成立） | **成立**（空窗 1 整轮，双向节拍真实存在） |

**三条纯正交性观察（供主理人裁定，我不建议方向）**：

1. **现状与 sheet §5.2 的理由文字冲突**：sheet §5.2 给 `reloadTurns=1` 的理由原文是「发射→**跳过下一轮**」，而字面式下**没有任何一轮被跳过**。
2. **现状与 sheet §6.4 的算式口径冲突**：§6.4 括注声明「装填轮次减半」，但各波行把 31.5 当作**每轮**输出使用（未减半）。**§6.4 自身对此含混**——这是文策渊的勘误项，不是我能裁的。
3. **翻转方向与 GW-VS-EXT-01 §三 S2 一致**：评审把「装填空窗=骑射反击窗」列为**成立中的设计强项**，而现状该机制强度为零。翻转 = 让强项真正成立；不翻转 = 该强项在 MVP 参数下是纸面强项。

### 2.5 翻转的三个风险点（VS-7 翻转前须先过）

| # | 风险 | 说明 | 建议 |
|---|---|---|---|
| R-1 | **翻转会改变 VS-6 前的平衡基准** | 与 GW-VS-EXT-01 §六-1「现在到 VS-6 之前冻结数值」直接冲突。故本轮**必须不翻**（主理人裁定 A 已定） | 翻转时点 = **VS-6 之后**，与销账批同批；翻转后需要一次新的 vs4-check 基线快照 |
| R-2 | **空射是否记账**（机制未裁） | `:1819` 对**每个候选**无条件写 `lastFiredTurn = t`，即使走廊为空（`strikes` 零命中）。现状下空射代价=0（无空窗）；翻转后**空射也产生 1 整轮空窗**——一个此前不可见的机制问题会显形 | VS-7 翻转时**一并裁定**：「走廊为空时是否写 lastFiredTurn」（建议挂 C4 §5 新边缘条目，我不代裁） |
| R-3 | **C4.5 进度环分母** | C4.5 `progress = clamp((t − lastFiredTurn)/reloadTurns, 0, 1)` 在翻转后会出现「进度 100% 但仍 RELOADING」的错拍 | 灰盒未实装 `progress()`，无当前影响；VS-5 视觉层实装时按 §2.2-C-4 定分母 |

### 2.6 回滚成本与 10 分钟 SOP

**回滚成本**：**单行 `+ 1` 的增删** + 断言同步（VS4-R3 两行判据）。无数据结构变更、无存档字段变更（`lastFiredTurn` 语义不变，仍为绝对回合戳）、无事件契约变更（C4 §3.2 `facility_volley` 形状不变）。**回滚 = 改回同一行**，双向等价，零残留。

**10 分钟翻转 SOP**：

| 步 | 动作 | 耗时 |
|---|---|---|
| 1 | `_vs4-app.js:1794` 末尾加 `+ 1` | 30 s |
| 2 | `_vs4-app.js:1786-1791` 注释块口径改写（§2.2-C-1） | 2 min |
| 3 | `vs4-check.js:496-498` + `:511` 判据改写（§2.3） | 3 min |
| 4 | `node tools/vs4-check.js`（须 40 PASS / 0 FAIL） | 1 min |
| 5 | 浏览器侧跑 `btn-c4rhythm`（**须先销挂账 6** 建 `vs4-browser-check.js`，否则本步无证据） | 3 min |
| 6 | 重跑 `tools/build-vs4.js` 重建 `graybox-vs.html` 并验 sha1 幂等 | 1 min |

---

## §3 OFFBOARD 目标集规则条款（**供 C8 GDD 引述** · 草案，我不改 C8 正文）

> **使用说明**：以下为条款草案，请 design-strategist（文策渊）引述写入 C8 GDD；措辞可按 GDD 文体微调，**规则语义与防崩理由不得改写**。

### 3.1 建议回填位置

| 位置 | 内容 |
|---|---|
| C8 §2.3「目标评分层」→「**目标价值项**」表下新增一行注记 | 一句话规则（§3.2）+ 筛选条件写法（§3.4） |
| C8 §5 边缘情况 → 新增 **C8-E13**（建议编号） | 防崩理由（§3.3）+ 两条禁例（§3.5） |

### 3.2 一句话规则（可直接引述）

> **未上场的守方预备队（占位格 = `OFFBOARD`）不构成匈奴 AI 的目标候选：C8 目标集生成时须排除 `cellId === 'OFFBOARD'` 的守方单位。**

### 3.3 防崩理由（可直接引述）

> **防崩（非优化）**：`OFFBOARD` 是 F1 的**占位态哨兵值**而非真实格，`F1.getCell('OFFBOARD')` 恒返回 `null`；C8 目标评分在候选落点推导（`approachCell`）中以目标格坐标做距离计算，若将 `OFFBOARD` 单位纳入目标集，取坐标即触发空引用崩溃。故本排除是**必需的非空守卫**，不得视为可选的行为调优。

### 3.4 `C8.objectives` 筛选条件具体写法（可直接引述）

> 与 X-1 组合态语义一致：C7 §2.4 定「`DEPLOYED ∧ OFFBOARD` 组合语义 = 已购未上场」，C2 §2.4 生命周期不回迁 `UNDEFINED`。**不在场 ⇒ 不在 AI 目标集**，是本组合态在 C8 侧的必然推论（零行为面新增）。

```
目标集生成（C8.objectives）：
  戍卒 garrison 候选：
    for d in WORLD.defenderUnits():
        if d.cellId === 'OFFBOARD': continue        // ← 本条款（未上场预备队不入目标集）
        out.push({ key:'GARRISON:'+d.uid, base:'GARRISON',
                   value: W.w_garrison, cellId:d.cellId,
                   target:{ type:'GARRISON', unitId:d.uid } })
```

**作用域限定（勿扩大）**：本过滤**仅作用于守方单位候选**（`defenderUnits()`）。设施候选（`facilitiesList()`，过滤 `state === 'DESTROYED'`）、通路候选（`allConnectors()`，过滤 `status !== 'ACTIVE'`）、帅帐候选（常量坐标）**三条既有过滤不变**。

### 3.5 禁例（可直接引述）

| # | 禁例 | 理由 |
|---|---|---|
| 禁-1 | **禁止**以「预备队是潜在威胁」为由把 `OFFBOARD` 单位纳入目标集并另做距离特判 | 防崩守卫被绕过即崩溃；且「未上场的单位可被瞄准」违反 X-1「已购未上场」的语义（不在场即不可交互） |
| 禁-2 | **禁止**把本过滤实现为「`F1.getCell(cellId)` 为 null 才排除」的通用空守卫 | 通用空守卫会把**真实格寻址失败**静默吞掉（C2-E13「禁静默降级」同纪律）。必须按**哨兵值 `OFFBOARD` 显式判定**，使「哨兵态」与「寻址异常」可区分 |

---

## §4 key 栈归一施工图（裁定 C · `matchKey` 删除方案）

### 4.1 现状定位

| 项 | 内容 |
|---|---|
| 函数 | `C6.matchKey(map, s)`（`_vs4-app.js:1517-1523`）——去下划线 + 小写后**模糊字符串归一**匹配 |
| 唯一调用点 | `C6.quote()` 内 2 处：`:1527`（`BUILD_FACILITY` → `c.build`）、`:1528`（`DEPLOY_UNIT` → `c.deploy`） |
| 上游组装点 | `C7.execBuild` `:1688` `{kind:'BUILD_FACILITY', facilityKind: order.facilityKind}`；`C7.execDeploy` `:1710` `{kind:'DEPLOY_UNIT', templateId: order.templateId}` |
| 分歧实况 | 命令面字面 = `'BED_CROSSBOW'` / `'ROLLING_STOCK'`（C6 §3.4 / C7 §3.1 枚举字面，**SNAKE_UPPER**）与 `'garrison_squad'`（C2 UnitTemplateId，**snake_lower**）；F3 费用表键 = `bedCrossbow` / `rollingStock` / `garrisonSquad`（**camelCase**） |

### 4.2 删除后调用面影响清单（**未先改命令面就删 = 立即炸**）

| 调用路径 | 删除 `matchKey` 后（命令面未改）的后果 | 受影响断言 |
|---|---|---|
| `C6.quote` ← `C6.canAfford`（`:1539`） | 恒 `null` ⇒ `canAfford` 恒 false | `VS4-C7.6`（破产排水循环）、`VS4-D3`/`VS4-D4`（`canAfford` 驱动的部署循环） |
| `C6.quote` ← `C6.charge`（`:1545`） | `q === null` ⇒ 恒 `{ok:false, reason:'INSUFFICIENT'}` | **六指令中两条核心指令 100% 拒绝** |
| `C7.execBuild` → `C6.charge` | 建造 100% `INSUFFICIENT` | `VS4-C7.2`（建造成功+扣费+CONSTRUCTING+createdTurn）**FAIL** |
| `C7.execDeploy` → `C6.charge` | 部署 100% `INSUFFICIENT` | `VS4-C7.3`（部署容量/扣费/两套账）、`VS4-C7.4`（重置 OFFBOARD 依赖先部署成功）**FAIL** |
| `C6.rollbackCharge`（`:1556`） | 防御兜底路径 `q === null` 提前 return ⇒ 回滚失效（正常路径不可达，但兜底语义被破坏） | 无断言覆盖（正常路径不可达）— **静默退化，风险高于 FAIL** |
| 浏览器 `VS4Selftest.c7Check` / `c6Check` | `build_ok` / `deploy_ok_two_ledgers` / `bankrupt_insufficient` 等连锁 FAIL | 浏览器侧连锁 |
| `vs4-check.js:337` `VS4-E3`（不可购买键 → INSUFFICIENT） | 仍 PASS（但语义从「键不匹配」退化为「键不存在」，判据失真） | 需重新设计该断言的「不可购买」构造方式 |

**结论**：`matchKey` **不可先删**。删除的前置条件是命令面已完成归一（§4.3 门禁）。

### 4.3 删除 `matchKey` 的判定条件（三条门禁，全过才可删）

| 门禁 | 判定条件 | 验证方式（可自动化） |
|---|---|---|
| **G-1** | `C6.quote` 内**零字符串变换**：断言 `C6` 源码不含 `.replace(/_/g` / `.toLowerCase()` | 静态扫描断言（并入 `INV-C6-5` 同族） |
| **G-2** | 命令面 `BuildOrder.facilityKind` 与 `DEPLOY_UNIT.templateId` 的取值域，与 `economy.cost.*` 表键取值域**逐键相等** | 加载期交叉校验：`Object.keys(cost.build)` 与设施模板 id 集合全等、`cost.deploy` 键与守方模板费用键集合全等，不等即 fail-loud（C2-E13「禁静默降级」同纪律） |
| **G-3** | `vs4-check.js` 与浏览器 VS4Selftest **全绿**，且 `VS4-E3` 的「不可购买」用例改用「键存在但世界闸先拒」构造（不再依赖键名不匹配） | 重跑 40 PASS / 0 FAIL |

### 4.4 三个落地形态（**我不选型，交主理人**）

| 形态 | 做法 | 改动面 | 评价（技术视角） |
|---|---|---|---|
| **甲 · 全库 camelCase** | `units.json` 键改 camelCase（`garrisonSquad`/`ladderInfantry`/…），同步 C2 §3.2 / C6 §3.4 / C7 §3.1 / C9 波表 / `lootKey` 桥 | **大**：units 表 5 键 + WAVES_L1 全部 templateId + `lootKey` 5 值 + 3 份 GDD 字面 | 最彻底，但**为一次命名统一改 C2 域权威**，跨 GDD 面广，与「VS-7 勘误批」体量不匹配 |
| **乙 · economy 键向 units 对齐（snake_case）** | `cost.build`/`cost.deploy` 键改 snake_case | **小**（1 张表、2 个键组） | 改动最小，但**与裁定 C「单一真源=F3 数据表键 camelCase」字面相反**——若主理人坚持 camelCase 权威，此形态需重裁 |
| **丙 · 映射数据化（我推荐）** | 保留 camelCase 权威；**删除 `matchKey` 模糊归一**，改为在 `units` 表内挂显式费用键字段 `costKey:'garrisonSquad'`（与**既有 `lootKey:'ladderInfantry'` 完全同构**，`_vs4-app.js:659-663` 已在用）；`quote` 改为 `c.deploy[T.units[tpl].costKey]` 直读，零字符串变换；设施侧直接把 C6/C7 枚举字面勘误为 camelCase | **小**：units 表加 1 字段（5 值）+ 枚举字面勘误 2 处 + `quote` 2 行 | ✅ 满足裁定 C 的**实质意图**（经济区零归一化、零模糊匹配）；✅ 与已在跑的 `lootKey` 同构，**无新机制**；✅ 跨表缝**数据化**而非**代码化**，后续新增兵种只加表行不加代码分支；❌ 需在 sheet/F3 记一行 `units.*.costKey` |

**形态丙下 `quote` 的目标形**（示意，VS-7 才落地）：

```js
function quote(item) {
  var c = T.economy.cost;
  if (item.kind === 'BUILD_FACILITY') return c.build[item.facilityKind] ?? null;   // 枚举字面已勘误为 camelCase，直读
  if (item.kind === 'DEPLOY_UNIT')    return c.deploy[T.units[item.templateId].costKey] ?? null;   // 显式映射字段，零归一
  …
}
```

---

## §5 VS-5 接入面清点 + F4 消费边界审计

### 5.1 VS-5 可直接消费的结构位全清单

> 稳定性承诺分级：**【冻结】**= GDD 已定形、形状不可变；**【灰盒自造】**= GDD 未定义、本批为调试/演出自加，VS-5 可消费但**不得**当作 F5 契约面；**【缺口】**= GDD 要求但当前缺失。

| # | 结构位 | 形状 | 稳定性承诺 | 能否重放 | VS-5 用法 |
|---|---|---|---|---|---|
| S-1 | `C6.state()` → `TreasuryState` | `{treasury, turnLastSettled, battleTotals{farmTotal,supplyTotal,lootTotal,spentTotal}, turnLedger{lootEntries}, attackerKilled, defenderLost}`（`:1501-1507`） | **【冻结】** C6 §3.1 定义 | ✅ 可重放；**存档点恒在 D② 后 ⇒ `lootEntries` 恒空**（INV-C6-2 / `:1593`） | F5 存档 C6 分部；读档校验 `treasury ≥ 0 ∧ turnLastSettled = turn − 1`（C6 §3.1） |
| S-2 | **幂等锚 = `C6.state().turnLastSettled`** | number | **【冻结】** C6.5 | ✅ | **VS-5 存档的 D② 幂等锚。** ⚠ **勿用 `dbe.incomeSettled` 当幂等锚**——它是每回合复位的运行态标记（`runPhaseD` 开头置 `false`（`:171`）、D② 后置 `true`（`:905`）），不是跨回合持久语义 |
| S-3 | `C6.endReportFrozen()` → `BattleEndReport` | `{levelId, outcome, reason, endTurn, treasuryFinal, stats{farmTotal,supplyTotal,lootTotal,spentTotal,attackerKilled,defenderLost}, garrisonCasualties[{templateId,count}]}`（`:1610-1617`） | **【冻结】** C6 §3.3 v1（v1.1 追加字段位已标） | ❌ **终态一次性**，不可重放（二次调用 `ALREADY_FINALIZED`，BE-8） | X1 结算画面直读；X2 结转输入（`treasuryFinal` / `garrisonCasualties`） |
| S-4 | `F2.state().dbe` → `DPhaseLedger` | `{incomeSettled:bool, pendingReinforcements:ReinforceEntry[], waveCursor:number, turnEndSnapshots:[]}`（`:82-87`） | **【冻结】** F2 §3.2 | ✅（`pendingReinforcements` 是 F2.7 顺延队列，须入档） | 存档 F2 分部；`turnEndSnapshots` 本批恒空（移交 X1 的挂位） |
| S-5 | `C7.logSnapshot()` → `OrderLogEntry[]` | `[{seq, turn, order:BuildOrder, receipt:OrderReceipt}]`（`:1646`）；`receipt` 形状随指令不同：`{ok,reason}` / `{ok,charged,facilityId}` / `{ok,charged,unitId}` / `{ok,charged:0}` / `{ok,repaired,charged}` / `{ok,refunded}` | **【冻结·可选件】** C7 §3.4 明载「流水仅作重放对账与调试诊断；**世界重建不依赖它**」 | ✅（可重放对账）但**可丢弃** | F5 可选诊断件；落盘后须 `C7.resetRuntime()` 清空（`:1774`） |
| S-6 | Facility 扩展字段 `createdTurn` / `lastFiredTurn` | number \| null（`:807`） | **【冻结】** C4 §3.3 | ✅ 纯函数推导，读档穿越逐字节一致（BE-3） | F5 序列化；**禁令：存档禁止含「剩余轮数」字段**（C4 §2.3 禁令一） |
| S-7 | `F4.state()` → `{cursor, state, logBytes}` | `:626-633` | **【冻结】** F4 §3.1 | ✅ | **VS-5 主战场**；⚠ 见 §5.4 缺口 F-1 |
| S-8 | `C4._lastVolleyId` / `C4.volleyedThisTurn()` | string / bool（`:1800-1801`） | **【灰盒自造·运行态】** E5 去重戳 | — | **不入档**：K1 逻辑权威=推导式，去重由 `volleyId` 一致性在运行时承担；`C4.resetRuntime()` 复位（`:1880`） |
| S-9 | `F1.level().deployZones` | `[{id:'dz_wall', cells:['5_1_1','6_1_1','7_1_1']}]`（`:296`） | **【冻结】** F1 §9.1 | ✅ 静态数据 | 关卡数据；⚠ `dz_reserve` 预备带未建（缺口 E-3） |
| S-10 | `WAVES_L1` 运行态 `waveState` | `{cursor, pendingSpawns[], unitWaveMap{}, unitIntents{}}`（`:741`） | **【灰盒自造】** C9 未落盘侧 | ✅ | VS-5 若做存档，`pendingSpawns` 须入档（否则读档丢入场） |

### 5.2 事件 payload 形状表（VS-5 演出 / 飘字 / 存档对账）

| 事件 | payload | 稳定性 | 订阅方/用途 |
|---|---|---|---|
| `income_settled` | `IncomeReport{ok,turn,farm,supply,loot,total,treasuryAfter}`（`:1595`） | **【冻结】** C6 §3.6 | P4 D② 三源分项飘字；X5/F5 对拍锚 |
| `loot_registered` | `{killSeq, unitId, templateId, amount}`（`:1575`） | **【冻结】** C6 §3.6 | P4 击杀飘字带缴获数 |
| `treasury_changed` | `{delta, reason:'CHARGE'\|'ROLLBACK', treasuryAfter}`（`:1550`/`:1560`） | **【冻结】** C6 §3.6（`ROLLBACK` 为灰盒扩展枚举，C6 §3.6 只列 `CHARGE`） | P4 余额动画 |
| `facility_volley` | `{type, turn, volleyId, results[]}`；`results[i]={facilityId, dir, targetLineup:[targetId], strikes:[StrikeReport]}`（`:1821`/`:1831`） | **【冻结】** C4 §3.2（灰盒 `strikes` 为整包 `rep` 数组，非 C4 §3.2 的逐目标 `StrikeReport[]`——**形状简化，VS-5 若按 GDD 逐目标消费需先对齐**） | P1 演出锚点、P4 哑火指示、X5 配对校验 |
| `facility_built` | `{facilityId, facilityKind, cellId, facing, turn}`（`:1697`） | **【灰盒自造】** ⚠ C7 §3.3 明载「成功路径**零自有事件**」（禁止重复事件源） | VS-5 **不得**当作 F5 契约面；世界变化应读 `facility_registered`（`:808`） |
| `unit_redeployed` | `{unitId, toCellId}`（`:1739`） | **【灰盒自造】** 同上 | 同上 |
| `stock_dropped` | `{stockId, ladderId, turn}`（`:1875`） | **【灰盒自造】** 同上 | 同上 |
| `reinforce_arrived` | `{turn, arrived, deferred}`（`:922`） | **【灰盒自造】** C6 §3.6 未列 | P4 援军到岗提示 |
| `battle_end_report` | 完整 `BattleEndReport`（`:1618`） | **【灰盒自造】** ⚠ GDD 口径是「随 `battle_won/lost` payload.stats 透传」（F2 §3.3 / C6 §3.3） | VS-5 终局数据包的**当前唯一完整入口** |
| `battle_won` / `battle_lost` | `{reason, turn}`（`:185`/`:189`） | **【缺口】** ⚠ **未携带 `stats`/BattleEndReport**，与 F2 §3.3 口径不符 | 见 §5.4 缺口 F-2 |
| `order_rejected` | — | **【缺口】** ⚠ C7 §3.3 定义 `{order, reason}`，**实现从未发出该事件**（全文件 grep 零命中） | 见 §5.4 缺口 F-3 |
| `facility_dismantled` | `{facilityId, cellId, turn}`（`:826`） | **【冻结】** C7 §2.5 定义（载荷/发出方已定） | P1 免演残骸 |
| `unit_killed` / `unit_spawned` / `unit_damaged` / `unit_moved` / `unit_fell` / `beacon_damaged` / `beacon_destroyed` / `facility_destroyed` / `facility_registered` / `ladder_raised` / `residue_cleared` / `wave_entered` / `plans_ready` / `action_slot_open`/`close` / `phase_enter`/`phase_exit` / `turn_started` / `battle_started` / `illegal_transition` | 见 `:774`/`:781`/`:1089`/`:1059`/`:1246`/`:800`/`:203`/`:793`/`:808`/`:1438`/`:901`/`:116`/`:119`/`:148`/`:151`/`:108`/`:106`/`:105`/`:98` | 混合（部分 GDD 定义、部分灰盒自造） | VS-5 逐个核对后再入档 |

### 5.3 F4 消费边界审计：C6 / C7 / C4 三分区

> **静态事实**：`F4.rand()` 全库仅 **1 个调用点** = `_vs4-app.js:1083` `C5.rollHit()`（`C5.2` 唯一命中骰入口）。C6/C7/C4 三分区源码内**零 `F4.rand` 调用**；它们出现的 `F4.cursor()` 全部是**断言取数**（`===` 比较游标未变），不是消费。

| 路径 | F4 消费现状 | 是否安全岛 | 依据 GDD 条款 |
|---|---|---|---|
| **C6 全路径**（`quote`/`canAfford`/`charge`/`rollbackCharge`/`settleIncome`/`dueReinforcements`/`finalizeReport`/`registerKill`） | **零消费**（只读游标做断言） | ✅ **安全岛（硬红线，无允许引入的岛边界）** | C6 §1.2「C6 全程零随机」/ §4.6 C6.6 / **INV-C6-5**（静态扫描断言：零 `Math.random`、零 F4 游标调用）；F4 §9.1-14 与 INV-F4-5 互为对偶 |
| **C7 全路径**（六指令 `dispatch`/`execBuild`/`execDeploy`/`execRedeploy`/`execRepair`/`execDismantle`/`WALL_REPAIR`） | **零消费** | ✅ **安全岛（硬红线，GDD 未预留任何 F4 岛）** | C7 §3.6「确定性声明：零 `Math.random`、零墙钟、零浮点累计（金额比较整数化）」；C6-E7 同源 |
| **C4 推导层**（`canFireAt` / `setupReadyAt` / `fireVolley` 物化与排序 / `canDrop` 四拒绝） | **零消费** | ✅ **安全岛（硬红线）** | C4 §1.4-A 单一时钟源 / §2.3 禁令一（禁递减计数器）、禁令二（禁时钟回拨）；K1 无自有状态 |
| **C4 结算层**（`fireVolley` → `C5.strike(kind:'CROSSBOW_VOLLEY')`；`drop` → `C5.strike(kind:'ROLLING_STOCK')`） | **间接消费**（经 C5 唯一入口 `rollHit` → `F4.rand('HIT_ROLL')`） | ⚠ **非安全岛 · 但是合法且必须的既有岛** | C4 §7.1「F4 确定性随机｜纪律依赖：窗口内命中骰共用种子流」；C4 §2.1「命中骰走 F4 种子流」；F4 §9.1-15「C4（命中骰走 F4）经 C5 入口消费」 |
| **C5（对照组）** | **唯一直接消费方** | ⚠ 岛本体 | F4 §1.1「MVP 唯一消费方=C5 命中骰」/ §3.2 / §9.1-3~7 |
| **C8（Alpha 预留岛）** | 零消费（MVP） | ⚠ **GDD 已预留的岛边界** | F4 §1.4-G「C8 噪声钩子=预留值位，domainTag 0x02 仅编码预留」；F4 §2.7 per-domain 子流升级路径；C8 §2.6/C8.5「难度噪声钩子 MVP 不启用」；Alpha 启用须 C5/C8/F4/F5 联审 + 重放基线重建 |

**岛边界结论（一句话）**：**C6 与 C7 是绝对零 F4 区，无任何预留岛；C4 的推导层绝对零、结算层经 C5 唯一入口消费（既有合法岛）；未来唯一允许新开 F4 岛的位置是 C8（Alpha，走 per-domain 子流 + 联审）。** VS-5 存档层据此可断言：`f4` 分部只需承载 cursor/state/log 三字段，C6/C7 分部**不参与** checksum 的 RNG 见证面。

### 5.4 VS-5 开工前的缺口清单（**阻塞项**）

| # | 缺口 | 严重度 | 说明 | 建议处置 |
|---|---|---|---|---|
| **F-1** | **`F4State.logBytes` 未实现 F4 §2.5 规范字节流** | **P0 · 阻塞** | `_vs4-app.js:638` 每次 rand 只 push **1 个 opTag 字节**（`0x01`），**无 header 14 B、无 10 B/条定长条目（cursorBefore/cursorAfter 各 4 B LE）、无显式小端编码**。F4 §2.5/§2.6 的 `checksum = hex16(FNV1a64(S))` 因此**无法计算**，INV-F4-3 / INV-F5-3 对拍不成立 | VS-5 存档批必须补：header（magic `"F4L0G"` 5B + logVer 1B + seedWord 4B LE + entryCount 4B LE）+ 10 B/条（opTag/domainTag/cursorBefore/cursorAfter）；`F4` 模块需增 `snapshot()` / `restore()` / `checksumOf()`（F4 §3.2 三接口当前**均未实装**） |
| **F-2** | `battle_won` / `battle_lost` 未携带 `stats`/BattleEndReport | P1 | F2 §3.3 / C6 §3.3 口径=「BattleEndReport 随 `battle_won/lost` payload.stats 透传」，实现只发 `{reason, turn}`（`:185`/`:189`） | VS-5 二选一：①改 payload 携带 `stats`（对齐 GDD）；②明确改读 `C6.endReportFrozen()` 并把 `battle_end_report` 事件升为正式契约（需文策渊裁定） |
| **F-3** | `order_rejected` 事件从未发出 | P1 | C7 §3.3 定义（P3 行内错误反馈 + X5 负样本对账），实现零发出 | VS-5 若要做「负样本对账」需补发；若不做，请在 C7 侧明确降级为「灰盒不实现」并挂账 |
| **F-4** | 挂账 6（浏览器侧 `vs4-browser-check.js` 未建） | **P0 · 阻塞 §2 翻转验收** | `_vs4-app.js:2610` 的 `reload_derivation` 当前 FAIL 且从未被验证；不建则 VS-7 翻转后**无浏览器侧证据**，也无法发现同类「写了没跑」的断言 | VS-7 翻转**同一批**内必须建（vs3-browser-check.js 改 3 个方法名即可复用） |
| **F-5** | `C4.5 progress()` 未实装 | P2 | 视觉层装填进度环无数据源 | VS-5 视觉层实装时按 §2.2-C-4 定分母（先定翻转与否） |

---

## §6 交付与交接

| 项 | 内容 |
|---|---|
| **本轮产出** | 本文档 `design/spikes/vs4-tech-adjudication.md`（v1.0） |
| **本轮代码改动** | **零**。`_vs4-app.js` / `graybox-vs.html` / `vs4-check.js` / 全部 GDD 均未改动；未 git commit |
| **需主理人裁定/转派** | ①§4.4 三形态选型（我推荐丙）；②§1.4 勘误批按 **4 项**立项（非 1 项）；③§1.7 缺口 E-1 `dropZoneRef` 保留字段 vs 加 1 行过滤；④§2.5 R-2「空射是否记账」；⑤§2.5 R-1 翻转时点（VS-6 之后） |
| **需转 design-strategist（文策渊）** | §3 条款草案（供 C8 GDD 引述，我不直改 C8）；§1.6 勘误 4 项；§2.4 观察-2（sheet §6.4「装填轮次减半」内部口径含混） |
| **VS-5 开工前阻塞项** | **F-1（F4 规范字节流 + 三接口未实装，P0）**、**F-4（浏览器侧证据链缺失，P0）**；F-2/F-3/F-5 为 P1/P2，可并行 |

— 程基岩 · VS-4 技术裁定落地 · v1.0 · 2026-09-22 · 待主理人复核
