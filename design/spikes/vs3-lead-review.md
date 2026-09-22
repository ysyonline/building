# VS-3 主理人复核记录 + 缺陷单（GW-VS-3）

> 2026-09-22 16:1x · 主理人（游承峰）代执行组装与验收
> 背景：程基岩 13:47–15:47 执行 VS-3 期间被平台 429 限流中断（配额 20:09 重置）。
> **实现主体（_vs3-app.js 116KB，四块分区齐全）为其 429 前已完成的工作**；主理人仅做：
> 机械组装（build-vs3.js）+ 验收基线（vs3-browser-check.js）+ 本缺陷单。未改动其任何实现逻辑。

## 1. 已完成的组装与验收

| 项 | 结果 |
|---|---|
| `tools/build-vs3.js` 构建 | ✅ 幂等，772,759 字节（较 VS-2 底座 +45,576），3 script 块，**35 锚点全过**，库体逐字节哨兵过 |
| 语法 | ✅ app 块 + 库块 node 全量编译过（`_vs3-syncheck.js` APP SYNTAX OK 103,729 chars） |
| 浏览器级验收（`tools/vs3-browser-check.js`，Edge 无头 CDP） | **7/8 PASS**：boot / hitRate(0.761 vs 0.75，dev 0.011≈1.1σ) / be2(MAIN 0.222 > FEINT 0.167，方向性成立) / aiTiming(worst 0.6ms ≤ 预算 10ms) / determinism(同种子重放逐字节一致) / metrics / uiButtons |
| 唯一 FAIL | **smoke：end=ONGOING**（下述缺陷 D-1/D-2 的直接后果，非偶发） |
| 环境修正 | `_vs3-shell.html` 去掉 `backdrop-filter: blur(4px)`（本机 Intel UHD + ANGLE/D3D11 整层渲染黑屏，2026-09-20 实测坑） |

校验器侧修正（主理人文件，与成员实现无关）：桥返回形状三种（ok/pass/same）统一判据、纯测量型（hitRate/metrics）按数据容差裁（hitRate 3σ=0.03）、hitRate 须显式传 n=2000。

## 2. 缺陷单（程基岩消费，配额恢复后修复）

### D-1｜攻守双方远程攻击分支缺失（阻塞级）

**证据**：`_vs3-app.js` 全文仅两处攻击调用，均为 MELEE——
- 攻方 `executePlan`（≈L1309）：`C5.strike({ attacker:uid, kind:'MELEE', target:tg[0] })`
- 守方 C10 托管（≈L1210）：`if (dec.kind === 'ATTACK') C5.strike({ ... kind:'MELEE' ... })`

**后果**：horse_archer（range 4 / dmg 12 / isHitMod −0.05，vs-playtest-sheet §5.3）**全程无开火路径**——W2 起 2+3+2=7 名骑射手在场上纯游走零输出；C5 §2.2 俯射走廊、§2.4 修正链对攻方远程完全不生效。

**修复方向**：executePlan 在 meleeTargets 为空时补远程分支（`C5` 需暴露攻方 ranged strike 入口，走 HIT_ROLL 同流 + heightModPerLevel.ranged + horseArcher.isHitMod）；守方 C10 评分面同理补远程目标集（垛口戍卒 vs 墙脚/梯上目标）。改后须重验 be2 与 determinism。

### D-2｜BLOCKED_TOP 永久等待 → 全场冻结死锁（阻塞级）

**证据**（`tools/_vs3-probe-out.txt`，btn-autoplay 实机日志）：**T23 起连续 18 回合**（至 40 上限）18 槽（守 3/攻 15）零动作零击杀；`executePlan` 遇 BLOCKED_TOP 直接 return（≈L1312「留梯等待」），无替代动作。

**死锁闭环**：墙脚攻方等梯顶空位（垛口容量 1，守方占位）→ 守方 meleeTargets 够不到墙脚（melee 语义=同层四邻 ∪ 连接器端格邻接）→ 双方互相够不着 → 永不判胜（清场不成立）也永不判负（烽燧未破）。

**修复方向**（按 C8 GDD 意图重排优先级）：BLOCKED_TOP 时单位应换目标重评分（C10 w_garrison 目标在场时优先打守方；骑射手 D-1 修复后天然能远程参与破僵局）；或按 C10 §9.5 口径允许守方对连接器排队单位攻击。修复判据：**smoke 必须落到 END_WIN 或 END_LOSE**，且 T2–T22 段战斗密度不得退化。

### D-3｜非阻塞备忘

- `hitRateCheck` 用独立种子 `vs3-hitrate-probe` 消费 F4 主流——冒烟工具内自洽（用后 resetBattle），不违反 C5/C8/C10 零独立 RNG 纪律（纪律约束战斗结算流，非诊断工具）；如 VS-5 认为有歧义可改为跑后恢复游标。
- 演示局 T2–T22 段战斗正常（架梯/坠落/击杀事件均触发），D-1/D-2 修复时勿伤及该段行为。

## 3. 待成员补齐的交付物

- `vs3-report.md`（26 处 [VS-3] 锚点核销表 + 数值键清单 + 实测证据）
- D-1/D-2 修复后 `vs3-check-out.txt` 全 PASS 基线
- （可选）`vs3-check.js` 无头版（当前仅浏览器级）
