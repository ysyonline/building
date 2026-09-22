# VS-4 交付报告 —— A 相位建设经济 + 器械 + D 相位结算（graybox-vs）

> **状态**：v1.0（2026-09-22）｜ 任务卡 #7 ｜ GW-VS 灰盒可玩性轮
> **产出**：engineering-lead（程基岩）
> **上游依据**：`vs-playtest-sheet.md` v1.0.1（§5.2/§5.3/§5.5 数值权威）｜ `C7-build-deploy.md` v1.0.2（五闸六指令）｜ `C6-economy.md` v1.0.3（账本/双段式/D② 子序）｜ `C4-siege-phase.md` v1.0.2（齐射锚点/K1-K3 推导）｜ `C3-defense-facilities.md` v1.0.3（礌石判定原语/射击循环）｜ `vs3-report.md` §5 挂账三条（#13 economy 表 / #14 d2Economy / #15 d3Reinforce）本批全部核销
> **硬约束遵守**：数值全取 playtest-sheet 禁自创 ✓ ｜ 经济零 F4 消费（INV-C6-5，断言证据）✓ ｜ 21 项 VS-3 回归零退化 ✓ ｜ 函数式 replace + 库体字节哨兵 ✓ ｜ three r158 裸内联未升版 ✓ ｜ shell 无 backdrop-filter ✓ ｜ GDD 只读 ✓

---

## 1. 实现清单（VS-4 三条实装范围）

### 1.1 C6 经济分区（新增，`_vs4-app.js`）
- **TreasuryState**：`treasury / turnLastSettled（幂等锚）/ battleTotals{farm,supply,loot,spent} / turnLedger.lootEntries（append-only）/ attackerKilled / defenderLost`。
- **quote/canAfford**：查表报价，表内无键=不可购买；键名桥 `matchKey` 归一（GDD §3.4 枚举字面 `'BED_CROSSBOW'` ↔ §5.5 camelCase `bedCrossbow`、`garrison_squad` ↔ `garrisonSquad`）。
- **charge 双拒绝态**：非 A 相位 `ILLEGAL_WINDOW`（INV-C6-3 窗口权威=TurnQuery）；不足/不可购买收敛 `INSUFFICIENT`；失败余额零变化（C6.4）；成功 `treasury_changed` 事件。
- **rollbackCharge**：C7 v1.0.1 MEDIUM-1 A 案防御兜底（落地闸拒入时回滚，正常路径不可达）。
- **registerKill 缴获登记**：`unit_killed` 订阅（`initC6Bus` 一次性接线）；仅 `faction=ATTACKER` 登记（守方阵亡零缴获 C6 §2.4）；登记时点查表冻结 amount，余额不动（双段式第一段）。
- **settleIncome（D②）**：固定子序 farm→supply→loot；supply 按 `WORLD.beaconHp()>0` 实判；loot 按 killSeq 汇总后清空流水；`turn <= turnLastSettled` 幂等拒绝（C6.5）；全程零 F4（重放安全岛）；`income_settled` 事件。
- **dueReinforcements / finalizeReport**：D③ 时刻表数据源（表只读）；D④ 终局 BattleEndReport 一次性冻结（二次调用 `ALREADY_FINALIZED`，BE-8）。

### 1.2 C7 建设部署分区（新增）
- **五闸管线**：①窗口闸（phase='A' 唯一权威）→ ②寻址闸 → ③世界闸（白名单 ⋃deployZones / 格型 / 容量 GRID_CAPACITY / 层位 layerAccess / 设施互斥 / 阵营）→ ④资金闸（C6.charge 终检，C7 零私藏费用数值）→ ⑤落地闸。任一步失败整条拒绝，世界与钱包零污染（C7 §2.7 零半执行）。
- **六指令**：BUILD_FACILITY（支付+CONSTRUCTING/ARMED+createdTurn 写入）/ DEPLOY_UNIT（购买即部署，两套账同格合法）/ REDEPLOY_UNIT（零费；SAME_CELL 拒绝；OFFBOARD 哨兵=removeUnit 离场、再登场走 F1.placeUnit）/ REPAIR_FACILITY（夹取 Δ′=min(Δ, maxHp−hp) 按实修扣费）/ DISMANTLE_FACILITY（零退款+格释放）/ WALL_REPAIR（W-1 未落地恒 `WALL_REPAIR_UNAVAILABLE`）。
- **orderLog 指令流水**：seq/turn/order/receipt 全量在册（C7 §3.4 诊断用）；随 WORLD.init 清空。

### 1.3 C4 器械节拍分区（新增）
- **K1/K3 零自有状态**：装填 `canFireAt = t ≥ lastFiredTurn + reloadTurns`、架设 `setupReadyAt = t ≥ createdTurn + setupTurns`——全部绝对回合戳推导，禁递减计数器；`_lastVolleyId` 去重戳是 E5 防线（同回合频次），非计时器。
- **fireVolley 齐射**：锚点=phase_enter C 处理期内（C4.1，早于 C① MP 重置与快照）；`volleyId = t+'_V'`；候选=rangedCorridor ∧ 非 DESTROYED ∧ 两推导就绪，facilityId 字典序（C4.4=C5 多来源序同源）；strike 后写 `lastFiredTurn=t` + RELOADING 显示翻转；空载照发 `results=[]`（N2 配对性）。
- **canDrop/drop 礌石自由指令**：四拒绝 NO_LADDER/OUT_OF_REACH（曼哈顿+轴向 |Δx|≤dropRadius）/NO_CREW（梯顶邻域存活守方人力约束）/SPENT；drop 仅 C 相位窗口（C3-E14），校验先行拒绝不消耗（C3-E8）；效果链走 C5.strike ROLLING_STOCK 五步固定序。

### 1.4 D 相位收口（F2/WORLD 钩子实装）
- `d2Economy` → `C6.settleIncome` + `dbe.incomeSettled` 标记；`d3Reinforce` → 顺延队列首位重试 + 时刻表到期入场（落点满进 pendingReinforcements，条目零丢失 F2.7）+ `reinforce_arrived`；`finalize` → `C6.finalizeReport` 注入 D④ 判定分支（先经济入账后终局冻结）。
- WORLD 侧：`addFacility`（createdTurn/lastFiredTurn）/ `repairFacility` / `removeFacility`（+`facility_dismantled`）/ `damageFacility` E7 释放链 / `placeReinforcement`（部署区首容格）/ `nextFacilityId`。

## 2. 交付物与实测证据

| 交付物 | 状态 |
|---|---|
| `design/spikes/graybox-vs.html` | ✅ 833,373 B · 3 script 块 · 49 构建锚点全过 · 构建幂等（连跑两次 sha1 `e0da5c12…` 一致） |
| `tools/build-vs4.js` | ✅ 幂等；函数式 replace；库体尾部字节哨兵 `sRGBEncoding=Ot}));` 过 |
| `tools/vs4-check.js` | ✅ **40 PASS / 0 FAIL**（21 项 VS-3 回归照搬零退化 + 19 项 VS-4 新增） |
| `tools/vs4-check-out.txt` | ✅ 运行输出证据落盘（node 22.22.2 直跑逻辑层） |
| shell 四按钮 | ✅ btn-economy / btn-c7orders / btn-c4rhythm / btn-v4all 已接 VS4Selftest（浏览器侧断言套件返回纯数据形状） |

**VS-4 新增 19 项断言摘要**（详见 vs4-check-out.txt）：
- **经济 4**：D② 固定子序 farm=20/supply=20/loot=0 + turnLastSettled 锚 + 零 F4；幂等 IDEMPOTENT_REJECT；charge 双拒绝态 + 失败余额零变化；原子扣费 charged=表价 + spentTotal 对账。
- **缴获 1**：攻方阵亡登记 ladderInfantry=30（余额不动、零 F4）→ D② 汇总入账 + 流水清空；守方阵亡零登记。
- **C7 六指令 6**：四预检拒绝零扣费；建造 bedCrossbow=100 + CONSTRUCTING + createdTurn；部署 WRONG_FACTION/OUT_OF_ZONE/CELL_FULL（容量 2 实证）+ 两套账同格；重置零费 + SAME_CELL + OFFBOARD→placeUnit 再登场；修理夹取 Δ′ + BAD_DELTA + NO_DAMAGE + 拆除零退款；修墙恒拒 + 破产排水至 <60 仍 INSUFFICIENT + C7 全程零 F4。
- **C4 节拍 4**：volleyId=`1_V` 空载照发 + E5 同回合去重（锚点自动挂 phase_enter C 实证）；架设推导 t1 不可 t2 可；装填推导（C4.2 原式）+ 端到端 lastFiredTurn 写入；礌石 NO_LADDER/OUT_OF_REACH + 窗口外 drop 恒拒不消耗。
- **D 收口 4**：D② 事件先于 D③（同一次 runPhaseD 内）+ 援军免费；终局报告一次性冻结 + stats 对账；带建设+排水+重置指令的双局重放逐字节一致（C6+C7 零 F4 链验证）；经济注入 E2E 40 回合内仍收敛终局 + 零 illegal_transition + 余额恒 ≥0。

## 3. 消费数值键清单（VS-4 新消费部分；全部取 playtest-sheet v1.0.1，禁自创 ✓）

| 键路径 | 值 | 来源 |
|---|---|---|
| `economy.perLevel.L1.initialTreasury` | 480 | §5.5 |
| `economy.income.farmBasePerTurn / supplyBasePerTurn` | 20 / 20 | §5.5（farm>0 红线 ✓；40 < 65 红线① ✓） |
| `economy.loot.perTemplate.ladderInfantry / horseArcher / ramChariot / warlordEscort` | 30 / 25 / 100 / 90 | §5.5（督队 90=3× 步兵档红线③ ✓；后两键 L1 不出场、键位在册） |
| `economy.cost.build.bedCrossbow / rollingStock` | 100 / 60 | §5.5 |
| `economy.cost.deploy.garrisonSquad` | 50 | §5.5 |
| `economy.cost.repair.perHp` | 1 | §5.5（满修床弩 30 < 100 重建 ✓） |
| `economy.cost.wallRepair.perHp` | 3 | §5.5（键位预留 OQ-3；指令面恒拒，零浪费） |
| `economy.cost.dismantleRefundRatio` | 0（MVP 恒零） | §5.5 备忘口径 |
| `facilities.bedCrossbow.setupTurns` | 1 | **C4 GDD v1.0.2 §3.4 结构定值**（GDD 新增键，非 sheet §5.2 键——sheet 未载，按 GDD 成文，见 §5 挂账 1） |
| `facilities.bedCrossbow.reloadTurns / range / targetPriority`（C4 消费） | 1 / 12 / [HA,LI,WE,RC] | §5.2（VS-3 已入表，本批首次被推导式消费） |
| `economy.reinforcementSchedule` | `[]`（空表） | C6 §3.5 结构位；**sheet/GDD 均无 L1 数值**——MVP 无援军内容，见 §5 挂账 2 |

VS-3 已消费的其余键（units/weapons/combat/ai/terrain/beacon/waves）零改动，清单见 vs3-report.md §4。

## 4. VS-3 挂账核销（本批）

| vs3-report # | 挂账 | 核销状态 |
|---|---|---|
| #13 | L669 [VS-4] economy 表未消费 | ✅ C6 分区全量消费（§2 经济 4 项断言） |
| #14 | L848 [VS-4] d2Economy 钩子 | ✅ settleIncome 实装（D② 先于 D③ 断言） |
| #15 | L849 [VS-4] d3Reinforce 钩子 | ✅ 顺延队列+时刻表实装（运行时注入验证；VS4-D1） |
| （VS-5 两条存档/视觉挂账） | F4 §2.5 字节流 / 堆叠可视化 | ⏳ 不变，仍归 VS-5 |

## 5. 已知问题 / 风险 / 挂账

1. **`bedCrossbow.setupTurns=1` 的 sheet 缺键**（§3 ⚠）：数值出处=C4 GDD v1.0.2 §2.4/§3.4（「MVP 床弩 setupTurns=1」结构定值，非平衡键），GDD 结构权威优先；建议 VS-7 把本键补入 playtest-sheet §5.2 勘误批。
2. **`economy.reinforcementSchedule` 为空表**：MVP L1 无援军内容（C6 裁定 H「援军免费」+ §3.2 结构位），sheet/GDD 均无 L1 时刻表数值——机制全量在位（VS4-D1 以运行时注入条目验证 D③ 顺延链），**数值内容挂账 VS-7**（如需 L1 援军，给出 ReinforceEntry[] 即零结构改动生效）。
3. **装填语义实现口径**：C4.2 原式 `t ≥ lastFiredTurn + reloadTurns`（reloadTurns=1 → 发射次轮即恢复可射）为字面实现；vs3/vs1 语境「发射→跳过下一轮 / 每 2 轮 1 发」的 DPS 折算与此式的节拍差（次轮可射 vs 隔一轮）**未引入数值偏差**——齐射锚点每回合恰一次 + E5 去重已承担频次约束，床弩实际射速=「每轮锚点至多 1 发」。若主理人裁定装填真空期须为整轮（t+1 拒、t+2 就绪），改一处推导式（`+ reloadTurns + 1`）+ 2 条断言即可，建议 VS-7 一并裁定。
4. **OFFBOARD 预备队不在 AI 目标集**（实现新增口径）：`C8.objectives` 过滤 `cellId==='OFFBOARD'`（未上场单位 `F1.getCell` 寻址为 null，不过滤会崩）——「预备队不被瞄准」符合 X-1 组合态语义，已注释在码；请主理人确认是否需 C8 GDD 补一行。
5. **`C6.quote` 键名桥**：GDD §3.4 PurchaseItem 枚举字面（'BED_CROSSBOW'）与 §5.5 表键 camelCase 不一致——实现以 `matchKey` 归一兼容双口径；建议 VS-7 勘误统一为表键 camelCase。
6. **浏览器侧（vs4-browser-check.js）未扩建**：任务卡标「如建」；VS4Selftest 桥四套断言已可被既有 CDP 范式直调（vs3-browser-check.js 改 3 个方法名即可复用），本批优先无头证据链。如需补跑请示下。
7. **改动波及面**：`_vs4-app.js`（新增 C6/C7/C4 三分区 ~400 行 + WORLD/F2 钩子 + VS4Selftest 桥 + boot 四按钮）、`_vs4-shell.html`（标题/四按钮/hint）、build-vs4.js（新建）、vs4-check.js（新建）；GDD 与 vs3 系文件**零改动**；未 git commit。
8. **VS-4 后 smoke 终局仍为 END_LOSE**：经济入账不改变战斗面实力对比（3 戍卒+1 床弩 vs 4 波 17 单位），灰盒调平归 VS-7——本批判据是「经济注入不破坏收敛 + 余额恒 ≥0」（VS4-D4 实证），非平衡结论。

## 6. 下一步建议（供主理人裁定，未自行开工）

- VS-5（存档/视觉）消费本批 `endReportFrozen()` 与 orderLog 两个结构位即可（BattleEndReport 已含经济统计四项+阵亡两向）。
- 装填语义（§5-3）与 OFFBOARD 目标集（§5-4）两处口径请主理人裁定；均一行改动可翻转。
- 若 VS-7 给出 L1 援军时刻表，`economy.reinforcementSchedule` 直填即生效（D③ 顺延链已实证）。

— 程基岩，待独立复核，未自行开 VS-5。
