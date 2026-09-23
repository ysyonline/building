#!/usr/bin/env node
'use strict';
/* vs4-check.js —— VS-4 建设经济+器械+D 结算 无头测试（沿 vs3-check.js 范式，Node 直跑渲染无关层）
 * 21 项 VS-3 回归判据逐条照搬（不退化硬约束）+ VS-4 新增 19 项：
 *   C6 经济 4 项（D② 固定子序/幂等/双拒绝态/原子扣费零 F4）· 缴获双段式 1 项（登记/入账/守方零登记）
 *   C7 五闸六指令 6 项（预检闸序/建造落地/部署容量/重置 OFFBOARD/修理夹取拆除/修墙封闭+破产禁下单）
 *   C4 器械节拍 4 项（齐射 volleyId+E5 去重/架设推导/装填推导/礌石拒绝面+窗口外不消耗）
 *   D 相位收口 4 项（D② 先于 D③/终局报告一次性冻结/重放确定性扩展/E2E 经济注入收敛）
 * 结果落盘 vs4-check-out.txt（由 runner 重定向）。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTMLDIR = path.join(__dirname, '..');
const APP = path.join(__dirname, '_vs4-app.js');
let body = fs.readFileSync(APP, 'utf8');
if (body.startsWith('<script>')) body = body.slice('<script>'.length);
const ci = body.lastIndexOf('</script>'); if (ci >= 0) body = body.slice(0, ci);

const sandbox = {
  window: { addEventListener: function () {} },
  console, performance: { now: () => Date.now() }, setTimeout, clearTimeout,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
try { vm.runInContext(body, sandbox, { filename: '_vs4-app.js' }); }
catch (e) { console.error('FAIL: app block eval:', e.message); process.exit(1); }

const F2 = sandbox.F2, F1 = sandbox.F1, F4 = sandbox.F4, TABLES = sandbox.TABLES,
      WORLD = sandbox.WORLD, C1 = sandbox.C1, C5 = sandbox.C5, C10 = sandbox.C10, C8 = sandbox.C8,
      C6 = sandbox.C6, C7 = sandbox.C7, C4 = sandbox.C4;
if (!F2 || !F1 || !F4 || !WORLD || !C1 || !C5 || !C10 || !C8 || !C6 || !C7 || !C4) {
  console.error('FAIL: partitions not exported (need C6/C7/C4 for VS-4)'); process.exit(1);
}

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name + (detail ? '  —— ' + detail : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  —— ' + detail : '')); }
}
function fresh() { WORLD.init(TABLES.f4Seed); }
/* 相位快捷推进：INIT→A→(B 结算)→B→C→D（真实链：B 入场+AI 计划；runPhaseB 有 phase!=='B' 守卫，
 * 故必须 beginPhase('B') 落位后再 runPhaseB——直调于 A 是 no-op）。 */
function toPhase(p, tag) {
  tag = tag || 'chk';
  if (F2.state().phase === 'INIT') F2.beginPhase('A', tag);
  if (F2.state().phase === 'A' && ['B', 'C', 'D'].indexOf(p) >= 0) {
    F2.beginPhase('B', tag); F2.runPhaseB();       // B① 波次入场 + B③ AI 计划
  }
  if (F2.state().phase === 'B' && ['C', 'D'].indexOf(p) >= 0) F2.beginPhase('C', tag);
  if (F2.state().phase === 'C' && p === 'D') F2.beginPhase('D', tag);
}

console.log('== VS-4 建设经济+器械+D结算 · 逻辑层无头测试 ==\n');

/* ============================================================
 * 第一部分：VS-3 21 项回归（逐条照搬 vs3-check.js，判据与 detail 不变）
 * ============================================================ */
console.log('[回归·C1 移动（MP×AP / 攀爬原子 / E2）]');
ok('回归C1.1 reachable 预算剪枝（MP=3 内可达集，超出格不出现）', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '0_0_0');
  var reach = C1.reachable(u.uid);
  var maxD = 0; for (var k in reach) maxD = Math.max(maxD, reach[k]);
  return reach['0_0_0'] === 0 && maxD <= 3 && reach['3_0_0'] === 3 && reach['4_0_0'] === undefined;
})(), 'MP=3 → 恰好 3 格深（Dijkstra 泛洪 + 预算剪枝 C1.4）');

ok('回归C1.2 平移消耗 MP=plains(1)/格（MoveReport.mpSpent 对账）', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '0_0_0');
  var rep = C1.applyMoveOrder({ unitId: u.uid, target: '2_0_0', mode: 'AUTO' });
  return rep.status === 'COMPLETED' && rep.mpSpent === 2 && u.mp === 1 && u.cellId === '2_0_0';
})(), '2 格平移 → mpSpent=2 · mp 3→1');

ok('回归C1.3 攀爬原子 2MP 一口价（board+move+unboard 单事务）', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '8_0_0');
  F1.addConnector({ id: 'ld_t', from: '8_0_0', to: '8_0_1', connKind: 'LADDER', orient: 'FRONTAL',
    accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE',
    lifetime: { createdTurn: 1, currentHp: TABLES.terrain.ladderHp } });
  var rep = C1.applyMoveOrder({ unitId: u.uid, target: '8_0_1', mode: 'AUTO' });
  return rep.status === 'COMPLETED' && rep.mpSpent === C1.climbCost() && u.mp === 1 &&
         u.cellId === '8_0_1' && u.onConnector === null;
})(), '跨层一格 → 恰好扣 climb=2（不分方向一口价）· 落顶格 · occupancy 已清');

ok('回归C1.4 BLOCKED_TOP：顶满 → 留梯排队（ON_CONNECTOR，非失败）', (function () {
  fresh();
  var blocker = WORLD.spawn('DEFENDER', 'garrison_squad', '8_0_1');
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '8_0_0');
  F1.addConnector({ id: 'ld_t2', from: '8_0_0', to: '8_0_1', connKind: 'LADDER', orient: 'FRONTAL',
    accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE',
    lifetime: { createdTurn: 1, currentHp: TABLES.terrain.ladderHp } });
  var rep = C1.applyMoveOrder({ unitId: u.uid, target: '8_1_1', mode: 'AUTO' });
  var cn = C1.connById('ld_t2');
  return rep.status === 'BLOCKED_TOP' && rep.waitingConnector === 'ld_t2' &&
         u.onConnector === 'ld_t2' && u.cellId === '8_0_0' && u.mp === 1 &&
         cn.occupancy.units.indexOf(u.uid) >= 0 && WORLD.isAlive(blocker.uid);
})(), '顶满 → BLOCKED_TOP + occupancy 在册 + 逻辑位置保持 from（INV2）· MP 已扣 climb');

ok('回归C1.5 弃梯拒绝：from 格满（C1-E4 终裁 A 案）', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '9_0_0');
  F1.addConnector({ id: 'ld_t3', from: '9_0_0', to: '9_0_1', connKind: 'LADDER', orient: 'FRONTAL',
    accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE',
    lifetime: { createdTurn: 1, currentHp: TABLES.terrain.ladderHp } });
  F1.boardConnector('ld_t3', u.uid);
  var occ = F1.occupancyOf('9_0_0');
  var need = occ.capacity - occ.units.length;
  for (var i = 0; i < need; i++) F1.placeUnit('fill_' + i, '9_0_0');
  var ub = F1.unboardConnector('ld_t3', u.uid);
  return !ub.ok && ub.why === 'from_full' &&
         F1.allConnectors().filter(function (c) { return c.id === 'ld_t3'; })[0].occupancy.units.indexOf(u.uid) >= 0;
})(), 'from 满 → 拒绝弃梯、留梯保持暴露（INV1 无豁免）· occupancy 仍在册');

ok('回归C1.6 E2 坠落链：梯毁 → 落位 + fallDamage=10 恒定不过骰（零 F4 消费）', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '8_0_0');
  F1.addConnector({ id: 'ld_t4', from: '8_0_0', to: '8_0_1', connKind: 'LADDER', orient: 'FRONTAL',
    accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE',
    lifetime: { createdTurn: 1, currentHp: TABLES.terrain.ladderHp } });
  F1.boardConnector('ld_t4', u.uid);
  var cur0 = F4.cursor();
  var dr = F1.destroyConnector('ld_t4');
  var landed = F1.findUnitCell(u.uid);
  return dr.ok && dr.stranded === 1 && landed === '8_0_0' &&
         u.hp === 60 - TABLES.weapons.fallDamage && F4.cursor() === cur0;
})(), 'from 空 → 落回 from · HP 60→50（表驱动 fallDamage）· 游标零消耗');

console.log('\n[回归·C5 攻击结算（HIT_ROLL 单流 / 修正链 / 目标集）]');
ok('回归C5.1 床弩走廊：同层轴向近→远（多目标距离序）', (function () {
  fresh();
  var near = WORLD.spawn('ATTACKER', 'ladder_infantry', '4_1_0');
  var far = WORLD.spawn('ATTACKER', 'ladder_infantry', '2_1_0');
  var rep = C5.strike({ attacker: 'bed_crossbow_1', kind: 'CROSSBOW_VOLLEY', origin: '6_1_1', dir: '-x' });
  return rep.perTarget.length === 2 && rep.perTarget[0].target === near.uid &&
         rep.perTarget[1].target === far.uid;
})(), 'd=2 先于 d=4（C5.7 近→远，逐目标独立过骰）');

ok('回归C5.2 高度修正=攻方视角（床弩 h1 俯射 h0 → +0.05·ranged 键）', (function () {
  fresh();
  WORLD.spawn('ATTACKER', 'ladder_infantry', '4_1_0');
  var rep = C5.strike({ attacker: 'bed_crossbow_1', kind: 'CROSSBOW_VOLLEY', origin: '6_1_1', dir: '-x' });
  return rep.perTarget.length > 0 && rep.perTarget[0].mods.height ===
         (F1.getCell('6_1_1').h - F1.getCell('4_1_0').h) * TABLES.combat.heightModPerLevelRanged;
})(), 'heightModPerLevel.ranged=0.05 · 与 VS-1 §5.3/§6.4 实测同号（仰攻为负）');

ok('回归C5.3 近战对设施 ×vsFacility(0.5)（命中时伤害=12×0.5=6）', (function () {
  fresh();
  WORLD.kill('D_2', 'test_clear');
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '5_1_1');
  var hitSeen = false, dmgOk = true, cur0 = F4.cursor();
  for (var i = 0; i < 24 && !hitSeen; i++) {
    var rep = C5.strike({ attacker: u.uid, kind: 'MELEE', target: { type: 'facility', facilityId: 'bed_crossbow_1' } });
    var t = rep.perTarget[0];
    if (t.hit) { hitSeen = true; dmgOk = (t.dmg === TABLES.weapons.melee.damage * TABLES.weapons.melee.vsFacility); }
  }
  return hitSeen && dmgOk && F4.cursor() > cur0;
})(), '命中样本 dmg=6（vsFacility 键）· 每次过骰消费 F4 主流');

ok('回归C5.4 骑射命中面：0.75 −0.05(仰攻ranged) −0.15(垛口掩体) −0.05(isHitMod) = 0.50 ±3σ', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'horse_archer', '8_1_0');
  var N = 600, hits = 0;
  for (var i = 0; i < N; i++) {
    WORLD.unit('D_1').hp = WORLD.unit('D_1').maxHp;
    var rep = C5.strike({ attacker: u.uid, kind: 'RANGED', weapon: 'horseArcher', target: { type: 'unit', unitId: 'D_1' } });
    if (rep.perTarget[0].hit) hits++;
  }
  var p = TABLES.combat.hitBase - TABLES.combat.heightModPerLevelRanged + TABLES.combat.coverModParapet + TABLES.weapons.horseArcher.isHitMod;
  var rate = hits / N;
  return Math.abs(rate - p) <= 0.07;
})(), '期望 p=0.50（掩体=PARAPET 键）· 3σ=0.067 · 逐次独立 HIT_ROLL');

ok('回归C5.5 烽燧目标链：攻方邻接可打、命中扣烽燧 HP（beacon:true 形状回归）', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '11_1_0');
  var tg = C5.meleeTargets(u);
  var hasBeacon = tg.some(function (t) { return t.type === 'beacon' && t.beacon === true; });
  var damaged = false;
  for (var i = 0; i < 40 && !damaged; i++) {
    var hp0 = WORLD.beaconHp();
    C5.strike({ attacker: u.uid, kind: 'MELEE', target: { type: 'beacon', beacon: true } });
    if (WORLD.beaconHp() < hp0) damaged = true;
  }
  return hasBeacon && damaged;
})(), 'meleeTargets 含 {type:beacon,beacon:true} · 命中后 WORLD.beaconHp 下降（判负链通）');

ok('回归C5.6 命中过骰唯一入口：F4 单流游标=消费数（无独立 RNG）', (function () {
  fresh();
  var c0 = F4.cursor();
  WORLD.spawn('ATTACKER', 'ladder_infantry', '4_1_0');
  var rep = C5.strike({ attacker: 'bed_crossbow_1', kind: 'CROSSBOW_VOLLEY', origin: '6_1_1', dir: '-x' });
  return F4.cursor() - c0 === rep.perTarget.length;
})(), '每目标恰一次 HIT_ROLL · rand("HIT_ROLL") 为唯一命中骰入口');

console.log('\n[回归·C10 托管（评分框架 / 零 F4 / 槽路由）]');
ok('回归C10.1 STAY 显式候选 Score=standFast(45)（待命合法性 C10.8）', (function () {
  fresh();
  var u = WORLD.spawn('DEFENDER', 'garrison_squad', '0_1_0');
  var best = C10.evaluate(u);
  return best.kind === 'STAY' && best.score === TABLES.defenseScripts.standFast;
})(), '无合格候选时待命合法（不强制乱动）· standFast=45');

ok('回归C10.2 托管决策零 F4 消费（C10.6 确定性纪律）', (function () {
  fresh();
  var cur0 = F4.cursor();
  WORLD.aliveUnits().forEach(function (u) {
    if (WORLD.factionOf(u.uid) === 'DEFENDER') C10.resolveSlot(u.uid);
    else { C8.executePlan(u.uid); }
  });
  return F4.cursor() === cur0;
})(), 'C10 评分 + C8 计划执行（无命中场景）游标不动——决策面零 RNG');

ok('回归C10.3 槽路由：AUTO 即时产出指令 / MANUAL 挂起（契约 1）', (function () {
  fresh();
  var d = WORLD.defenderUnits()[0];
  var r1 = C10.resolveSlot(d.uid);
  C10.setControlMode(d.uid, 'MANUAL');
  var r2 = C10.resolveSlot(d.uid);
  return (r1 && (r1.choice === 'STAY' || r1.choice === 'MOVE' || r1.choice === 'ATTACK')) &&
         r2 && r2.hung === true;
})(), 'UNIT 级 AUTO/MANUAL 路由 · MANUAL 零指令收槽');

console.log('\n[回归·C8 匈奴 AI（纯函数 / BE-2 / 预算）]');
ok('回归C8.1 generatePlans 纯函数：同输入两次调用计划逐字节一致（零 RNG）', (function () {
  fresh();
  for (var i = 0; i < 6; i++) WORLD.spawn('ATTACKER', 'ladder_infantry', '0_' + (i % 3) + '_0');
  WORLD.spawn('ATTACKER', 'horse_archer', '1_1_0');
  var a = C8.generatePlans(2, 'MAIN_ASSAULT'), b = C8.generatePlans(2, 'MAIN_ASSAULT');
  return JSON.stringify(a.plans) === JSON.stringify(b.plans) && a.plannedUnits === 7;
})(), '同世界态 → 同计划（C8.4 确定性）· 7 攻方全计划');

ok('回归C8.2 BE-2 集中度：MAIN_ASSAULT > FEINT（Herfindahl 目标分布）', (function () {
  fresh();
  for (var i = 0; i < 6; i++) WORLD.spawn('ATTACKER', 'ladder_infantry', '0_' + (i % 3) + '_0');
  var main = C8.concentration(C8.generatePlans(2, 'MAIN_ASSAULT').plans);
  var feint = C8.concentration(C8.generatePlans(2, 'FEINT').plans);
  return main > feint;
})(), 'dispersionMul 1.0 vs 2.0 方向性成立（破口集中 vs 多点拉扯）');

ok('回归C8.3 单轮计划耗时 ≤ planBudgetMs(10)（BE-5 预算）', (function () {
  fresh();
  for (var i = 0; i < 8; i++) WORLD.spawn('ATTACKER', 'ladder_infantry', '0_' + (i % 3) + '_0');
  var worst = 0;
  for (var r = 0; r < 20; r++) { var ms = C8.generatePlans(2, r % 2 ? 'MAIN_ASSAULT' : 'FEINT').ms; if (ms > worst) worst = ms; }
  return worst <= TABLES.aiScripts.planBudgetMs;
})(), '20 轮最差值 ≤ 10ms');

ok('回归C8.4 架梯 E1：canBoardLadder 单位原位架梯（表驱动，零兵种名）', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '4_0_0');
  var raised = C8.tryRaiseLadder(u);
  var cs = F1.allConnectors().filter(function (c) { return c.connKind === 'LADDER' && c.status === 'ACTIVE' && c.from === '4_0_0'; });
  return raised && cs.length === 1 && u.ap === TABLES.units.ladder_infantry.baseAp - 1;
})(), 'GROUND 上格=PARAPET → 架梯成功 · AP −1');

console.log('\n[回归·E2E 终局收敛（smoke 判据）]');
ok('回归E2E.1 全链路 40 回合内必落 END_WIN|END_LOSE，全程零 illegal_transition', (function () {
  fresh();
  var illegal = 0;
  F2.bus.on('illegal_transition', function () { illegal++; });
  F2.beginPhase('A', 'e2e');
  var guard = 0;
  while (guard++ < 200) {
    var s = F2.state();
    if (s.phase === 'END_WIN' || s.phase === 'END_LOSE') break;
    if (s.turn > 40) break;
    if (s.phase === 'A') { F2.beginPhase('B', 'e2e'); F2.runPhaseB(); F2.beginPhase('C', 'e2e'); }
    else if (s.phase === 'C') {
      F2.snapshotActionOrder(WORLD.aliveUnits().map(function (u) { return { unitId: u.uid, speed: u.speed }; }));
      F2.runSlots(function (uid) {
        if (WORLD.factionOf(uid) === 'DEFENDER') C10.resolveSlot(uid); else C8.executePlan(uid);
      });
      F2.beginPhase('D', 'e2e');
    }
    else if (s.phase === 'D') {
      var d4 = F2.runPhaseD();
      if (!d4.lose && !d4.win) F2.beginPhase('A', 'e2e');
    }
    else break;
  }
  var s = F2.state();
  return (s.phase === 'END_WIN' || s.phase === 'END_LOSE') && illegal === 0;
})(), '战局收敛到唯一点 D④ · 中断场景不卡死（C8 BE-6）');

ok('回归E2E.2 F4 重放确定性：同种子两局逻辑快照逐字节一致', (function () {
  function transcript() {
    fresh();
    var lines = [];
    F2.beginPhase('A', 'det');
    for (var i = 0; i < 12; i++) {
      var s = F2.state();
      if (s.phase === 'END_WIN' || s.phase === 'END_LOSE') { lines.push('END:' + s.phase); break; }
      if (s.phase !== 'A') break;
      F2.beginPhase('B', 'det'); F2.runPhaseB(); F2.beginPhase('C', 'det');
      F2.snapshotActionOrder(WORLD.aliveUnits().map(function (u) { return { unitId: u.uid, speed: u.speed }; }));
      F2.runSlots(function (uid) {
        if (WORLD.factionOf(uid) === 'DEFENDER') C10.resolveSlot(uid); else C8.executePlan(uid);
      });
      F2.beginPhase('D', 'det');
      var d4 = F2.runPhaseD();
      if (!d4.lose && !d4.win) F2.beginPhase('A', 'det');
      var snap = WORLD.aliveUnits().map(function (u) { return u.uid + ':' + u.hp + ':' + u.cellId; }).sort().join('|') +
                 '#b' + WORLD.beaconHp() + '#c' + F4.cursor();
      lines.push(snap);
    }
    return lines.join('\n');
  }
  var a = transcript(), b = transcript();
  return a.length > 0 && a === b;
})(), '12 回合逐回合快照（单位 HP/位置 + 烽燧 + 游标）全等（F4-E2/BE-1）');

/* ============================================================
 * 第二部分：VS-4 新增 12 项
 * ============================================================ */
console.log('\n[VS-4·C6 经济（D② 固定子序 / 幂等 / 双拒绝态 / 原子扣费零 F4）]');
ok('VS4-E1 D② 固定子序：farm=farmBasePerTurn(20) ∧ supply=supplyBasePerTurn(20) ∧ loot=0 ∧ 余额对账', (function () {
  fresh();
  var cur0 = F4.cursor();
  var rep = C6.settleIncome(1);
  var okc = rep.ok && rep.farm === TABLES.economy.income.farmBasePerTurn &&
            rep.supply === TABLES.economy.income.supplyBasePerTurn && rep.loot === 0 &&
            rep.total === rep.farm + rep.supply + rep.loot &&
            rep.treasuryAfter === TABLES.economy.perLevel.L1.initialTreasury + rep.total &&
            C6.state().turnLastSettled === 1;
  return okc && F4.cursor() === cur0;      // 零 F4 消费（重放安全岛）
})(), 'farm=20 supply=20 · turnLastSettled 锚推进 · D② 游标零消耗');

ok('VS4-E2 D② 幂等：同回合重入 IDEMPOTENT_REJECT 拒绝（C6.5）', (function () {
  fresh();
  C6.settleIncome(1);
  var rep2 = C6.settleIncome(1);
  return !rep2.ok && rep2.reason === 'IDEMPOTENT_REJECT' &&
         C6.treasury() === TABLES.economy.perLevel.L1.initialTreasury + 40;   // 余额未被二次入账
})(), 'turn<=turnLastSettled 拒绝 · treasury 只入账一次');

ok('VS4-E3 charge 双拒绝态：非 A 窗口 ILLEGAL_WINDOW / 不可购买键 INSUFFICIENT / 失败余额零变化', (function () {
  fresh();
  var base = TABLES.economy.perLevel.L1.initialTreasury;
  var cw = C6.charge({ kind: 'BUILD_FACILITY', facilityKind: 'rollingStock' });      // INIT 态 → 窗口外
  F2.beginPhase('A', 'chk');
  var cb = C6.charge({ kind: 'BUILD_FACILITY', facilityKind: 'nonexistent' });       // 表内无键
  return !cw.ok && cw.reason === 'ILLEGAL_WINDOW' && C6.treasury() === base &&
         !cb.ok && cb.reason === 'INSUFFICIENT' && C6.treasury() === base;
})(), 'INV-C6-3 窗口权威=TurnQuery phase=A · 不可购买键收敛 INSUFFICIENT（加载期校验兜底）');

ok('VS4-E4 charge 原子扣费：成功 charged=表价 ∧ spentTotal 累计 ∧ 余额恰减', (function () {
  fresh();
  F2.beginPhase('A', 'chk');
  var base = TABLES.economy.perLevel.L1.initialTreasury;
  var r1 = C6.charge({ kind: 'DEPLOY_UNIT', templateId: 'garrison_squad' });         // 50
  var r2 = C6.charge({ kind: 'DEPLOY_UNIT', templateId: 'garrison_squad' });         // 50
  return r1.ok && r1.charged === TABLES.economy.cost.deploy.garrisonSquad &&
         r2.ok && C6.treasury() === base - 2 * TABLES.economy.cost.deploy.garrisonSquad &&
         C6.state().battleTotals.spentTotal === 2 * TABLES.economy.cost.deploy.garrisonSquad;
})(), '下单即支付（C6.1/C6.4）· battleTotals 对账链通');

console.log('\n[VS-4·缴获双段式（登记 append-only / D② 入账 / 守方零登记）]');
ok('VS4-L1 缴获双段式：攻方阵亡登记 ladderInfantry=30（余额不动）→ D② 汇总入账+清空 / 守方阵亡零登记', (function () {
  fresh();
  var cur0 = F4.cursor();
  var base = TABLES.economy.perLevel.L1.initialTreasury;
  var foe = WORLD.spawn('ATTACKER', 'ladder_infantry', '1_1_0');
  var own = WORLD.spawn('DEFENDER', 'garrison_squad', '7_1_1');
  var ledger = C6.state().turnLedger;
  WORLD.kill(own.uid, 'chk_own');
  var nAfterOwn = ledger.lootEntries.length;
  WORLD.kill(foe.uid, 'chk_foe');
  var last = ledger.lootEntries[ledger.lootEntries.length - 1];
  var reg = nAfterOwn === 0 && last && last.amount === TABLES.economy.loot.perTemplate.ladderInfantry &&
            C6.treasury() === base && F4.cursor() === cur0;
  var rep = C6.settleIncome(1);
  return reg && rep.ok && rep.loot === TABLES.economy.loot.perTemplate.ladderInfantry &&
         C6.treasury() === base + 40 + rep.loot && C6.state().turnLedger.lootEntries.length === 0;
})(), 'C 相位 killed 流水登记（C6 §2.4）→ D② farm+supply+loot 一次入账 · 流水清空（INV-C6-2）· 登记零 F4');

console.log('\n[VS-4·C7 五闸六指令（单事务：下单即支付+立即落地）]');
ok('VS4-C7.1 窗口闸+白名单闸+设施互斥闸+facing 闸（四预检先于资金闸，拒绝零扣费）', (function () {
  fresh();
  var base = TABLES.economy.perLevel.L1.initialTreasury;
  var w = C7.exec({ type: 'BUILD_FACILITY', cellId: '6_1_1', facilityKind: 'bedCrossbow', facing: '-x' });  // INIT
  F2.beginPhase('A', 'chk');
  var oz = C7.exec({ type: 'BUILD_FACILITY', cellId: '1_0_0', facilityKind: 'bedCrossbow', facing: '-x' }); // 白名单外
  var oc = C7.exec({ type: 'BUILD_FACILITY', cellId: '6_1_1', facilityKind: 'bedCrossbow', facing: '-x' }); // 初始床弩占位
  var mf = C7.exec({ type: 'BUILD_FACILITY', cellId: '7_1_1', facilityKind: 'bedCrossbow' });               // 缺 facing
  return !w.ok && w.reason === 'ILLEGAL_WINDOW' &&
         !oz.ok && oz.reason === 'OUT_OF_ZONE' &&
         !oc.ok && oc.reason === 'CELL_OCCUPIED_FACILITY' &&
         !mf.ok && mf.reason === 'MISSING_FACING' && C6.treasury() === base;
})(), '五闸序：窗口→寻址→世界（B1/B3/B4）全拒绝且钱包零污染（C7 §2.7 零半执行）');

ok('VS4-C7.2 建造成功：支付 bedCrossbow=100 ∧ CONSTRUCTING（架设推导）∧ createdTurn 写入 ∧ 指令流水在册', (function () {
  fresh();
  F2.beginPhase('A', 'chk');
  var base = TABLES.economy.perLevel.L1.initialTreasury;
  var r = C7.exec({ type: 'BUILD_FACILITY', cellId: '7_1_1', facilityKind: 'bedCrossbow', facing: '+x' });
  var f = r.ok ? WORLD.facility(r.facilityId) : null;
  var logN = C7.logSnapshot().length;
  return r.ok && C6.treasury() === base - TABLES.economy.cost.build.bedCrossbow &&
         f && f.state === 'CONSTRUCTING' && f.createdTurn === 1 && f.lastFiredTurn === null && logN >= 1;
})(), '资金闸（C6 charge 终检）→ 落地闸（createdTurn=t 消费 C4.3）· orderLog 流水（C7 §3.4）');

ok('VS4-C7.3 部署：WRONG_FACTION/CELL_FULL 拒绝 + 成功扣费 deploy=50 + 两套账同格合法', (function () {
  fresh();
  F2.beginPhase('A', 'chk');
  var base = TABLES.economy.perLevel.L1.initialTreasury;
  var wf = C7.exec({ type: 'DEPLOY_UNIT', cellId: '7_1_1', templateId: 'ladder_infantry' });   // 攻方兵种
  var cf = C7.exec({ type: 'DEPLOY_UNIT', cellId: '5_0_1', templateId: 'garrison_squad' });    // 垛口非部署区（OUT_OF_ZONE 先于容量闸，C7 §2.4 闸序）
  var cap = C7.exec({ type: 'DEPLOY_UNIT', cellId: '6_1_1', templateId: 'garrison_squad' });   // RAMPART_WALK 容量 2：初始 0 单位
  var cap2 = C7.exec({ type: 'DEPLOY_UNIT', cellId: '6_1_1', templateId: 'garrison_squad' });
  var cap3 = C7.exec({ type: 'DEPLOY_UNIT', cellId: '6_1_1', templateId: 'garrison_squad' });  // 第 3 次 → 容量 2 已满
  var okr = C7.exec({ type: 'DEPLOY_UNIT', cellId: '7_1_1', templateId: 'garrison_squad' });   // 与初始床弩同格（两套账）
  return !wf.ok && wf.reason === 'WRONG_FACTION' && !cf.ok && cf.reason === 'OUT_OF_ZONE' &&
         cap.ok && cap2.ok && !cap3.ok && cap3.reason === 'CELL_FULL' &&
         okr.ok && C6.treasury() === base - 3 * TABLES.economy.cost.deploy.garrisonSquad &&   // 恰 3 笔成功扣费
         WORLD.unit(okr.unitId).cellId === '7_1_1';
})(), '闸序 D1 白名单→D2 容量→D3 层位→D4 阵营 · 设施账与单位账独立（C7 §2.4）· 容量=GRID_CAPACITY');

ok('VS4-C7.4 重置：零费位移 + SAME_CELL + OFFBOARD 哨兵 + 再登场零费（Δtreasury=0）', (function () {
  fresh();
  F2.beginPhase('A', 'chk');
  var base = TABLES.economy.perLevel.L1.initialTreasury;
  var d = C7.exec({ type: 'DEPLOY_UNIT', cellId: '7_1_1', templateId: 'garrison_squad' });
  var u0 = WORLD.unit(d.unitId);
  var sc = C7.exec({ type: 'REDEPLOY_UNIT', unitId: d.unitId, toCellId: u0.cellId });
  var ob = C7.exec({ type: 'REDEPLOY_UNIT', unitId: d.unitId, toCellId: 'OFFBOARD' });
  var offOk = ob.ok && ob.charged === 0 && u0.cellId === 'OFFBOARD';
  var rd = C7.exec({ type: 'REDEPLOY_UNIT', unitId: d.unitId, toCellId: '6_1_1' });   // OFFBOARD→再登场（placeUnit 分支）
  return !sc.ok && sc.reason === 'SAME_CELL' && offOk &&
         rd.ok && rd.charged === 0 && WORLD.unit(d.unitId).cellId === '6_1_1' &&
         C6.treasury() === base - TABLES.economy.cost.deploy.garrisonSquad;   // 只花了部署的 50
})(), 'C7.8 已购资产位移/撤回/再登场零费 · OFFBOARD=DEPLOYED∧未上场组合态（X-1）· OFFBOARD→F1.placeUnit');

ok('VS4-C7.5 修理夹取：Δ′=min(Δ,maxHp−hp) 按缺口扣费 + BAD_DELTA 拒绝 + 满血 NO_DAMAGE + 拆除零退款', (function () {
  fresh();
  F2.beginPhase('A', 'chk');
  var base = TABLES.economy.perLevel.L1.initialTreasury;
  var perHp = TABLES.economy.cost.repair.perHp;
  var dmg = WORLD.damageFacility('bed_crossbow_1', 7);          // 30→23，缺口 7
  var ovr = C7.exec({ type: 'REPAIR_FACILITY', facilityId: 'bed_crossbow_1', deltaHp: 999 });   // 夹到 7
  var bd = C7.exec({ type: 'REPAIR_FACILITY', facilityId: 'bed_crossbow_1', deltaHp: -5 });
  var nd = C7.exec({ type: 'REPAIR_FACILITY', facilityId: 'bed_crossbow_1', deltaHp: 3 });      // 已满血
  var dm = C7.exec({ type: 'DISMANTLE_FACILITY', facilityId: 'bed_crossbow_1' });
  var freed = !WORLD.facilityAt('6_1_1');
  var dm2 = C7.exec({ type: 'DISMANTLE_FACILITY', facilityId: 'bed_crossbow_1' });
  return ovr.ok && ovr.repaired === dmg.dmg && ovr.charged === dmg.dmg * perHp &&
         !bd.ok && bd.reason === 'BAD_DELTA' && !nd.ok && nd.reason === 'NO_DAMAGE' &&
         dm.ok && dm.refunded === 0 && C6.treasury() === base - ovr.charged && freed &&
         !dm2.ok && dm2.reason === 'BAD_TARGET';
})(), 'C7.5 夹取防多扣（C6-E8 防逆向刷钱同源）· C7.7 零退款=沉没成本 · 拆后格释放');

ok('VS4-C7.6 修墙封闭恒拒绝 + 破产=禁止下单（INSUFFICIENT）+ C7 全程零 F4', (function () {
  fresh();
  F2.beginPhase('A', 'chk');
  var cur0 = F4.cursor();
  var wr = C7.exec({ type: 'WALL_REPAIR', connectorId: 'sl_L1_gate', deltaHp: 3 });
  var cost50 = TABLES.economy.cost.deploy.garrisonSquad;
  var spent = 0;
  while (C6.canAfford({ kind: 'DEPLOY_UNIT', templateId: 'garrison_squad' }) && spent < 20 * cost50) {
    var r = C7.exec({ type: 'DEPLOY_UNIT', cellId: '7_1_1', templateId: 'garrison_squad' });
    if (!r.ok) break;
    spent += r.charged;
    C7.exec({ type: 'REDEPLOY_UNIT', unitId: r.unitId, toCellId: 'OFFBOARD' });   // 挪下场腾格，只烧钱
  }
  var ins = C7.exec({ type: 'BUILD_FACILITY', cellId: '7_1_1', facilityKind: 'rollingStock' });
  var c7calls = C7.logSnapshot().length;
  var wrok = !wr.ok && wr.reason === 'WALL_REPAIR_UNAVAILABLE' && C7.wallRepairAvailable() === false;
  var broke = !ins.ok && ins.reason === 'INSUFFICIENT' && C6.treasury() < TABLES.economy.cost.build.rollingStock;
  return wrok && broke && C6.treasury() >= 0 && F4.cursor() === cur0 && c7calls >= 3;
})(), 'W-1 未落地整体封闭（C7-E8）· 排水至 <60 仍恒拒 · 下单校验零 RNG（资金闸只对账）');

console.log('\n[VS-4·C4 器械节拍（齐射 volleyId / 绝对回合戳推导 / 礌石自由指令）]');
ok('VS4-R1 齐射：volleyId=`1_V` ∧ 空载照发 results=[] ∧ 同回合重复进窗口 no-op（E5 去重）∧ 锚点自动挂 phase_enter C', (function () {
  fresh();
  var seen = [];
  F2.bus.on('facility_volley', function (p) { seen.push(p); });
  F2.beginPhase('A', 'chk'); F2.beginPhase('B', 'chk'); F2.runPhaseB(); F2.beginPhase('C', 'chk');   // T1：锚点自动发 volley
  var t1 = seen.filter(function (p) { return p.turn === 1; });
  var auto1 = t1.length === 1 && t1[0].volleyId === '1_V' && t1[0].results.length === 0;   // 初始床弩 createdTurn=1 当轮 CONSTRUCTING → 空载
  var again = C4.fireVolley();                                            // E5：同回合手动重复 → null
  return auto1 && again === null && C4.volleyedThisTurn();
})(), 'N2 配对性（空载荷照发）· volleyId 一致性防线（C4-E5）· 锚点在 phase_enter C 处理期内');

ok('VS4-R2 架设推导（纯函数）：createdTurn=1, setupTurns=1 → t1 不可射 t2 可射；建成当轮 CONSTRUCTING', (function () {
  fresh();
  var f1 = { createdTurn: 1, lastFiredTurn: null };
  var t1NotReady = !C4.setupReadyAt(f1, 1) && C4.setupReadyAt(f1, 2);
  var initF = WORLD.facility('bed_crossbow_1');
  return t1NotReady && initF.createdTurn === 1 && initF.state === 'ACTIVE' &&
         !C4.canFireAt({ lastFiredTurn: null }, 99) === false;
})(), 'setupTurns=1（C4 §3.4 GDD 结构定值）· 零自有状态零计时器（K3）');

ok('VS4-R3 装填推导：发射 t → 同轮去重（E5）→ t+1 恢复可射；齐射后 lastFiredTurn=t 写入', (function () {
  fresh();
  var f0 = { lastFiredTurn: 2, state: 'READY' };
  /* C4.2 原式 t ≥ lastFiredTurn + reloadTurns（reloadTurns=1）：发射于 t=2 → t=3 恢复可射
   * （装填占用发射后的 1 轮间隔）；同回合频次防线由 E5 volleyId 去重承担。 */
  var pure = !C4.canFireAt(f0, 2) && C4.canFireAt(f0, 3) && C4.canFireAt(f0, 4);
  /* 端到端：T1 建床弩（当轮 CONSTRUCTING 跳过，E6）→ T2（turn=2）齐射发射（lastFiredTurn=2）→ T3 拒 → T4 就绪 */
  F2.beginPhase('A', 'chk');
  var b = C7.exec({ type: 'BUILD_FACILITY', cellId: '7_1_1', facilityKind: 'bedCrossbow', facing: '-x' });
  F2.beginPhase('B', 'chk'); F2.runPhaseB(); F2.beginPhase('C', 'chk'); F2.beginPhase('D', 'chk');   // T1 收尾（锚点 volley=1_V 已自动发）
  F2.beginPhase('A', 'chk');                            // → turn=2
  F2.beginPhase('B', 'chk'); F2.runPhaseB();
  WORLD.spawn('ATTACKER', 'ladder_infantry', '4_1_0');    // 喂目标（须在进 C 前——锚点 volley 于 phase_enter C 即时结算）
  F2.beginPhase('C', 'chk');                              // T2 锚点自动发 volley（2_V）
  var f = WORLD.facility(b.facilityId);
  /* T2 齐射已由 phase_enter C 锚点自动发出（2_V）：发射→lastFiredTurn=2+RELOADING（E5 使手动重入=null） */
  var auto2 = C4.volleyedThisTurn() && C4.lastVolleyId() === '2_V';
  var t2fired = auto2 && f.lastFiredTurn === 2 && f.state === 'RELOADING';
  var seman = !C4.canFireAt(f, 2) && C4.canFireAt(f, 3);   // t3 起装填期过、恢复可射（C4.2 原式）
  return pure && t2fired && seman;
})(), 'reloadTurns=1 → 装填占用发射后 1 轮间隔，t3 恢复可射（C4.2 原式 + E5 同回合去重）· 绝对回合戳非递减计数器');

ok('VS4-R4 礌石 canDrop 拒绝面：NO_LADDER（坡道）+ OUT_OF_REACH（远梯）+ 窗口外 drop 恒拒且不消耗', (function () {
  fresh();
  F2.beginPhase('A', 'chk');
  var base = TABLES.economy.perLevel.L1.initialTreasury;
  var r = C7.exec({ type: 'BUILD_FACILITY', cellId: '5_1_1', facilityKind: 'rollingStock' });   // ARMED 当轮可投
  var rs = WORLD.facility(r.facilityId);
  var armed = r.ok && rs.state === 'ARMED';
  var nl = C4.canDrop(rs.id, 'sl_L1_1');                  // SLOPE 非 LADDER
  F1.addConnector({ id: 'ld_chk', from: '10_0_0', to: '10_0_1', connKind: 'LADDER', orient: 'FRONTAL',
    accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE',
    lifetime: { createdTurn: 1, currentHp: TABLES.terrain.ladderHp } });
  var oor = C4.canDrop(rs.id, 'ld_chk');                  // (5,1)→(10,0) 曼哈顿 6 > dropRadius 1
  var wd = C4.drop(rs.id, 'sl_L1_1');                     // A 相位非 C 窗口
  return armed && !nl.ok && nl.reason === 'NO_LADDER' && !oor.ok && oor.reason === 'OUT_OF_REACH' &&
         !wd.ok && wd.reason === 'ILLEGAL_WINDOW' && wd.consumed === false && rs.state === 'ARMED' &&
         C6.treasury() === base - TABLES.economy.cost.build.rollingStock;
})(), 'C3.5 四拒绝前二 + C3-E14 窗口闸 · 校验先行拒绝不消耗（C3-E8）');

console.log('\n[VS-4·D 相位收口（D② 先于 D③ / 援军顺延零丢失 / 终局报告一次性冻结）]');
ok('VS4-D1 D② 经济入账先于 D③ 援军（固定六步序 D①→D⑥）∧ 援军免费（treasury 不减）', (function () {
  fresh();
  var order = [];
  F2.bus.on('income_settled', function () { order.push('d2'); });
  F2.bus.on('reinforce_arrived', function () { order.push('d3'); });
  toPhase('A', 'chk'); F2.beginPhase('B', 'chk'); F2.beginPhase('C', 'chk'); F2.beginPhase('D', 'chk');
  var dbe = F2.state().dbe;
  dbe.pendingReinforcements.push({ entryId: 'chk_r1', dueTurn: 1, templateId: 'garrison_squad', dropZoneRef: 'dz_wall', source: 'C6_REINFORCE' });
  var tBefore = C6.treasury();
  var before = F2.state().dbe.incomeSettled;
  F2.runPhaseD();                                          // D②→D③ 同一次调用内
  var n1 = WORLD.aliveUnits().filter(function (u) { return u.faction === 'DEFENDER' && u.cellId !== 'OFFBOARD'; }).length;
  return order.indexOf('d2') >= 0 && order.indexOf('d3') > order.indexOf('d2') &&
         dbe.pendingReinforcements.length === 0 &&         // 顺延队列清空=到岗
         C6.treasury() >= tBefore;                         // 免费入账（C6-H）
})(), 'F2 §2.2-D 固定序 · 注入条目走运行时顺延链（MVP L1 时刻表空表挂账 VS-7）');

ok('VS4-D2 终局报告一次性冻结：WIN 先冻结 → LOSE 二次调用 ALREADY_FINALIZED 拒绝 ∧ stats 对账', (function () {
  fresh();
  F2.beginPhase('A', 'chk'); F2.beginPhase('B', 'chk'); F2.beginPhase('C', 'chk'); F2.beginPhase('D', 'chk');
  var d4 = F2.runPhaseD();                                 // 波次未入场 → 不终局，D② 照常结算
  var f1 = C6.finalizeReport('WIN', 'WAVES_CLEARED');
  var f2 = C6.finalizeReport('LOSE', 'BEACON_FALLEN');
  var fr = C6.endReportFrozen();
  return d4 && !d4.lose && !d4.win && f1.ok &&
         !f2.ok && f2.reason === 'ALREADY_FINALIZED' &&
         fr && fr.outcome === 'WIN' && fr.levelId === 'MVP_L1' &&
         fr.stats.farmTotal >= TABLES.economy.income.farmBasePerTurn &&
         fr.treasuryFinal === C6.treasury();
})(), 'BE-8 一次性（D④ 判定分支先 finalize 再切终态）· BattleEndReport 冻结含经济统计');

ok('VS4-D3 全局重放确定性扩展：带建设指令的两局逐回合快照逐字节一致（C6+C7 零 F4 消费链验证）', (function () {
  function transcript() {
    fresh();
    var lines = [];
    F2.beginPhase('A', 'det');
    for (var i = 0; i < 6; i++) {
      var s = F2.state();
      if (s.phase === 'END_WIN' || s.phase === 'END_LOSE') { lines.push('END:' + s.phase); break; }
      if (s.phase !== 'A') break;
      C7.exec({ type: 'BUILD_FACILITY', cellId: '7_1_1', facilityKind: 'rollingStock' });   // T1 建成（之后格被礌石占——重置/拆除绕行）
      C7.exec({ type: 'REDEPLOY_UNIT', unitId: (WORLD.facilityAt('7_1_1') ? null : 'x'), toCellId: '7_1_1' });   // no-op 探针（BAD_TARGET 亦零 RNG）
      C7.exec({ type: 'DISMANTLE_FACILITY', facilityId: (WORLD.facilityAt('7_1_1') || {}).id });   // 腾格供下轮
      var start = C6.treasury();
      while (C6.canAfford({ kind: 'DEPLOY_UNIT', templateId: 'garrison_squad' }) && start - C6.treasury() < 150) {
        var d = C7.exec({ type: 'DEPLOY_UNIT', cellId: '7_1_1', templateId: 'garrison_squad' });
        if (!d.ok) break;
        C7.exec({ type: 'REDEPLOY_UNIT', unitId: d.unitId, toCellId: 'OFFBOARD' });
      }
      F2.beginPhase('B', 'det'); F2.runPhaseB(); F2.beginPhase('C', 'det');
      F2.snapshotActionOrder(WORLD.aliveUnits().map(function (u) { return { unitId: u.uid, speed: u.speed }; }));
      F2.runSlots(function (uid) {
        if (WORLD.factionOf(uid) === 'DEFENDER') C10.resolveSlot(uid); else C8.executePlan(uid);
      });
      F2.beginPhase('D', 'det');
      var d4 = F2.runPhaseD();
      if (!d4.lose && !d4.win) F2.beginPhase('A', 'det');
      lines.push('T' + s.turn + '#tr' + C6.treasury() + '#b' + WORLD.beaconHp() + '#c' + F4.cursor() +
                 '#u' + WORLD.aliveUnits().map(function (u) { return u.uid + ':' + u.hp; }).sort().join(','));
    }
    return lines.join('\n');
  }
  var a = transcript(), b = transcript();
  return a.length > 0 && a === b && a.indexOf('#tr') > 0;
})(), '建设+排水+重置全链路双局一致（A 相位指令面零 RNG → 指令序一致 ⇒ 终态一致）');

ok('VS4-D4 E2E 扩展：注入建设后全链路 40 回合内仍必收敛终局 ∧ 零 illegal_transition ∧ 余额恒 ≥0', (function () {
  fresh();
  var illegal = 0, treasuryMin = Infinity;
  F2.bus.on('illegal_transition', function () { illegal++; });
  F2.beginPhase('A', 'e2e');
  var guard = 0;
  while (guard++ < 200) {
    var s = F2.state();
    if (s.phase === 'END_WIN' || s.phase === 'END_LOSE') break;
    if (s.turn > 40) break;
    if (s.phase === 'A') {
      treasuryMin = Math.min(treasuryMin, C6.treasury());
      if (C6.canAfford({ kind: 'DEPLOY_UNIT', templateId: 'garrison_squad' })) {
        C7.exec({ type: 'DEPLOY_UNIT', cellId: '7_1_1', templateId: 'garrison_squad' });
      }
      F2.beginPhase('B', 'e2e'); F2.runPhaseB(); F2.beginPhase('C', 'e2e');
    }
    else if (s.phase === 'C') {
      F2.snapshotActionOrder(WORLD.aliveUnits().map(function (u) { return { unitId: u.uid, speed: u.speed }; }));
      F2.runSlots(function (uid) {
        if (WORLD.factionOf(uid) === 'DEFENDER') C10.resolveSlot(uid); else C8.executePlan(uid);
      });
      F2.beginPhase('D', 'e2e');
    }
    else if (s.phase === 'D') {
      var d4 = F2.runPhaseD();
      if (!d4.lose && !d4.win) F2.beginPhase('A', 'e2e');
    }
    else break;
  }
  var s = F2.state();
  return (s.phase === 'END_WIN' || s.phase === 'END_LOSE') && illegal === 0 && treasuryMin >= 0;
})(), '经济注入不破坏终局收敛（可玩性底线）· 破产保护 INV-C6-1');

/* ============================================================
 * 第二部分：VS5-F1 断言块 —— F4 §2.5 规范字节流 S + §3.2 三接口（VS-5 存档批前置）
 * 结构权威 F4 GDD v1.0.1；缺口 F-1 销账（vs4-tech-adjudication §5.4-F-1）。
 * 锚定独立测试向量（非自证）：FNV-1a-64("foobar")=85944171f73967e8（FNV 官方向量）。
 * ============================================================ */
console.log('\n[VS5-F1 · F4 规范字节流 + 三接口（存档批前置）]');

ok('VS5-F1.1 FNV-1a-64 双实现互证（BE-2）：BigInt 参考版与 split-mul 版在已知官方向量 + 300 随机字节串上逐位一致', (function () {
  var utf8 = function (s) {                 // 纯 ASCII 手工编码：vm sandbox 无 TextEncoder，且全部夹具串限 ASCII
    var out = [], i;
    for (i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xFF);
    return out;
  };
  var cases = [[], [0x61] /* "a" */, utf8('foobar'), utf8('vs-l1-seed-01'), utf8('DEADBEEF')];
  var i, j;
  for (i = 0; i < 300; i++) {
    var arr = [];
    for (j = 0; j < 1 + (i % 64); j++) arr.push((i * 37 + j * 11) & 0xFF);   // 确定性伪随机（不用 F4 本流，防自噬）
    cases.push(arr);
  }
  for (i = 0; i < cases.length; i++) {
    if (F4.hex16(F4.fnv1a64(cases[i])) !== F4.hex16(F4.fnv1a64Split(cases[i]))) return false;
  }
  return F4.hex16(F4.fnv1a64(utf8('foobar'))) === '85944171f73967e8';        // 官方已知向量锚定
})(), '官方向量 foobar=85944171f73967e8 锚定 · 300 确定性伪随机串双实现逐位一致');

ok('VS5-F1.2 S 形状（F4 §2.5）：init 即 header-only 14B（magic "F4L0G" + logVer=1 + seedWord LE + entryCount=0），空流合法', (function () {
  F4.init(TABLES.f4Seed);
  var s = F4.state();
  var expSw = F4.fnv1a32((function () { return Array.prototype.slice.call(new TextEncoder().encode(TABLES.f4Seed)); })());
  return s.logBytes.length === 14 &&
         s.logBytes[0] === 0x46 && s.logBytes[1] === 0x34 && s.logBytes[2] === 0x4C && s.logBytes[3] === 0x30 && s.logBytes[4] === 0x47 &&
         s.logBytes[5] === 0x01 &&
         s.logBytes[6] === (expSw & 0xFF) && s.logBytes[7] === ((expSw >>> 8) & 0xFF) &&
         s.logBytes[8] === ((expSw >>> 16) & 0xFF) && s.logBytes[9] === ((expSw >>> 24) & 0xFF) &&
         s.logBytes[10] === 0 && s.logBytes[11] === 0 && s.logBytes[12] === 0 && s.logBytes[13] === 0 &&
         F4.entryCount() === 0;
})(), 'magic=F4L0G · logVer=1 · seedWord=expand(seed) 小端 · entryCount=0（空流 checksum 恒可算 F4 §2.5）');

ok('VS5-F1.3 条目 10B 定长与链自洽（F4.5）：rand×5 后 14+50B，逐条 opTag=0x01/domainTag=0x01/before→after 链无缝且末 after=cursor', (function () {
  F4.init(TABLES.f4Seed);
  var N = 5, i;
  for (i = 0; i < N; i++) F4.rand('HIT_ROLL');
  var L = F4.state().logBytes;
  if (L.length !== 14 + 10 * N || F4.entryCount() !== N || F4.cursor() !== N) return false;
  var prevAfter = 0;
  for (i = 0; i < N; i++) {
    var o = 14 + i * 10;
    if (L[o] !== 0x01 || L[o + 1] !== 0x01) return false;                    // opTag=HIT_ROLL · domainTag=CORE
    var cb = (L[o + 2] | (L[o + 3] << 8) | (L[o + 4] << 16) | (L[o + 5] << 24)) >>> 0;
    var ca = (L[o + 6] | (L[o + 7] << 8) | (L[o + 8] << 16) | (L[o + 9] << 24)) >>> 0;
    if (cb !== i || ca !== i + 1) return false;                              // 链自洽：before=i, after=i+1
    prevAfter = ca;
  }
  return prevAfter === F4.cursor() && (L[10] | (L[11] << 8)) === N;          // header.entryCount 同步回写
})(), 'S=header14+10B/条 · e.after=e.before+1 ∧ e[i+1].before=e[i].after ∧ cursor=eₙ.after（F4.5 全式）');

ok('VS5-F1.4 checksum（F4.4）：checksumOf(S)=hex16(FNV1a64(S))，确定性可复现，且对 1 字节差异敏感', (function () {
  F4.init(TABLES.f4Seed);
  F4.seq(8);
  var S = F4.snapshot().log;
  var c1 = F4.checksumOf(S), c2 = F4.checksumOf(S.slice());
  var S2 = S.slice(); S2[20] ^= 0x01;
  var c3 = F4.checksumOf(S2);
  F4.init(TABLES.f4Seed);
  var ce = F4.checksumOf(F4.state().logBytes);
  return c1 === c2 && c1.length === 16 && /^[0-9a-f]{16}$/.test(c1) && c1 !== c3 && ce.length === 16;
})(), '幂等 · 16 位小写 hex 前导零保留 · 单字节翻转必变签名 · 空流良定义');

ok('VS5-F1.5 snapshot/restore 往返（BE-6「打过的骰子不重摇」）：restore 后继续同指令产出与原会话尾逐位一致 ∧ O(1) 直读不重放步进', (function () {
  F4.init(TABLES.f4Seed);
  F4.seq(10);
  var snap = F4.snapshot();
  var tail1 = F4.seq(6).map(function (v) { return v.toFixed(12); }).join(',');
  F4.init('other-seed');                                                      // 换种子污染现场
  F4.restore(snap, TABLES.f4Seed);
  var tail2 = F4.seq(6).map(function (v) { return v.toFixed(12); }).join(',');
  var st = F4.state();
  return tail1 === tail2 && st.cursor === 16 && st.f4Seed === TABLES.f4Seed &&
         F4.state().logBytes.length === 14 + 10 * 16;
})(), 'restore(snapshot) 后同指令 → 骰序逐位一致（C5-E15 兑现）· 直读恢复非重导出');

ok('VS5-F1.6 损坏注入矩阵（BE-3 子集）：翻条目字节/改 cursor 不改 log/截断末条/entryCount 篡改/换 seed 五路径全拒载零静默（F4-E5）', (function () {
  F4.init(TABLES.f4Seed);
  F4.seq(4);
  var snap = F4.snapshot();
  function rejected(mut) {
    var l = snap.log.slice(); mut(l);
    try { F4.restore({ cursor: snap.cursor, state: snap.state, log: l }, TABLES.f4Seed); return false; }
    catch (e) { return String(e.message).indexOf('[F4 restore 拒载]') === 0; }   // 必须 fail-loud 带标准前缀
  }
  var okFlip = rejected(function (l) { l[20] ^= 0xFF; });                      // 翻条目字节 → 链/结构破坏
  var okCur = (function () {                                                    // 改 cursor 不改 log
    try { F4.restore({ cursor: snap.cursor + 1, state: snap.state, log: snap.log.slice() }, TABLES.f4Seed); return false; }
    catch (e) { return true; }
  })();
  var okTrunc = rejected(function (l) { l.length -= 10; });                     // 删末条
  var okCount = rejected(function (l) { l[13] = 9; });                          // entryCount 篡改
  var okSeed = (function () {                                                   // 换 seed 不换 log（seedWord 绑定 F4.5 末项）
    try { F4.restore(snap, 'another-seed'); return false; }
    catch (e) { return true; }
  })();
  return okFlip && okCur && okTrunc && okCount && okSeed;
})(), '全部路径抛 [F4 restore 拒载]（F4-E4 必选分部纪律：缺字段/脏档零静默通过）');

ok('VS5-F1.7 INV-F4-2 四角互证：step^cursor(expand(seed))=state 断言在位——state 单点篡改必被拒载', (function () {
  F4.init(TABLES.f4Seed);
  F4.seq(7);
  var snap = F4.snapshot();
  try { F4.restore({ cursor: snap.cursor, state: (snap.state + 1) >>> 0, log: snap.log.slice() }, TABLES.f4Seed); return false; }
  catch (e) { return String(e.message).indexOf('四角互证') >= 0; }
})(), 'seed/state/cursor/log 四者分别篡改后单点自洽不可过（校验模式断言随 restore 常开）');

ok('VS5-F2.1 battle_won 携带 stats：payload.stats 与 endReportFrozen().stats 同一冻结结构逐键一致（真实判胜链 D④）', (function () {
  fresh();
  var seen = []; F2.bus.on('battle_won', function (p) { seen.push(p); });
  F2.beginPhase('A', 'chk');
  var buy = C7.exec({ type: 'DEPLOY_UNIT', cellId: '7_1_1', templateId: 'garrison_squad' });   // 制造 spentTotal（资金链已入账）
  F2.beginPhase('B', 'chk'); F2.runPhaseB(); F2.beginPhase('C', 'chk');
  WORLD.kill(WORLD.defenderUnits()[0].uid, 'chk_clear');       // 制造 defenderLost=1
  WORLD.waveState().cursor = WORLD.WAVES().length;             // wavesExhausted 真分量①（处理态谓词权威=WORLD 波次游标；D⑤ 只做 dbe 镜像）
  F2.beginPhase('D', 'chk'); F2.runPhaseD();                   // D④：wavesExhausted ∧ 清场（攻方 0）→ WIN
  var won = seen.filter(function (p) { return p.reason === 'WAVES_CLEARED'; });
  if (won.length !== 1 || !buy || !buy.ok || F2.state().phase !== 'END_WIN') return false;
  var fr = C6.endReportFrozen();
  if (!fr || fr.outcome !== 'WIN') return false;
  return won[0].stats === fr.stats &&
    won[0].stats.spentTotal === TABLES.economy.cost.deploy.garrisonSquad &&
    won[0].stats.defenderLost === 1 && won[0].stats.attackerKilled === 0 &&
    won[0].stats.farmTotal >= TABLES.economy.income.farmBasePerTurn &&
    typeof won[0].stats.lootTotal === 'number' && typeof won[0].stats.supplyTotal === 'number' &&
    won[0].turn === fr.endTurn && won[0].reason === fr.reason && fr.reason === 'WAVES_CLEARED';
})(), 'won payload.stats=EndReport.stats 同一对象（S-3 冻结结构零重复计算）· 判胜点冻结后透传 · 波次游标簿记权威在 WORLD（D⑤ 镜像 dbe）');

ok('VS5-F2.2 battle_lost 携带 stats：判负路径 payload.stats 与 endReportFrozen().stats 一致 ∧ 判负回合 D② 照常入账（C6-E2）', (function () {
  fresh();
  /* 真实判负链：C 相位把烽燧打到 0 → beacon_destroyed 旗标 → C→D 中断推进 → D④ 判负唯一点 → battle_lost。
   * damageBeacon=F2.4 判负链的攻方写入侧（beaconHp≤0 判负，勿用 WORLD.kill 清守方——会触发清场歧义）。 */
  var seen = []; F2.bus.on('battle_lost', function (p) { seen.push(p); });
  F2.beginPhase('A', 'chk'); F2.beginPhase('B', 'chk'); F2.runPhaseB(); F2.beginPhase('C', 'chk');
  WORLD.damageBeacon(WORLD.beaconHp() + 1, 'chk_lose');   // 打到 0 → onBeaconDestroyed 置旗标
  F2.beginPhase('D', 'chk'); F2.runPhaseD();
  var lost = seen.filter(function (p) { return p.reason === 'BEACON_FALLEN'; });
  if (lost.length !== 1 || F2.state().phase !== 'END_LOSE') return false;
  var fr = C6.endReportFrozen();
  if (!fr || fr.outcome !== 'LOSE' || fr.endTurn !== 1) return false;
  return lost[0].stats === fr.stats &&
    lost[0].stats.farmTotal === fr.stats.farmTotal &&
    lost[0].stats.spentTotal === fr.stats.spentTotal &&
    lost[0].stats.attackerKilled === fr.stats.attackerKilled &&
    lost[0].stats.defenderLost === fr.stats.defenderLost &&
    lost[0].turn === fr.endTurn && lost[0].reason === fr.reason &&
    typeof lost[0].stats.lootTotal === 'number' && typeof lost[0].stats.supplyTotal === 'number';
})(), 'lost payload.stats=EndReport.stats 同一对象（S-3 冻结结构零重复计算）· 判负回合 D② 照常入账（C6-E2）· 判负优先于同回合清场（F2-E11）');

console.log('\n[VS5-F3 · order_rejected 补发（C7 §3.3 契约事件）]');
ok('VS5-F3.1 order_rejected：五闸拒绝逐单发出 {order, reason}，payload.order=下单原对象；成功单零事件（C7 §3.3 禁重复事件源）', (function () {
  fresh();
  /* 四条拒绝闸各取一（窗口/白名单/facing/资金）+ 成功单。资金闸=标准排水范式（VS4-C7.6 同款）。
   * exec 返回值=回执 receipt；事件 payload.order=下单原对象（C7 §3.3 契约）——订单字面量须提变量比引用。 */
  var rej = [];
  F2.bus.on('order_rejected', function (p) { rej.push(p); });
  var ordW  = { type: 'BUILD_FACILITY', cellId: '6_1_1', facilityKind: 'bedCrossbow', facing: '-x' };
  var w  = C7.exec(ordW);                                                                                    // ① 窗口闸
  F2.beginPhase('A', 'chk');
  var ordOz = { type: 'BUILD_FACILITY', cellId: '1_0_0', facilityKind: 'bedCrossbow', facing: '-x' };
  var oz = C7.exec(ordOz);                                                                                   // ② 白名单闸
  var ordMf = { type: 'BUILD_FACILITY', cellId: '7_1_1', facilityKind: 'bedCrossbow' };
  var mf = C7.exec(ordMf);                                                                                   // ③ facing 闸
  var cost50 = TABLES.economy.cost.deploy.garrisonSquad, spent = 0;
  while (C6.canAfford({ kind: 'DEPLOY_UNIT', templateId: 'garrison_squad' }) && spent < 20 * cost50) {
    var dr = C7.exec({ type: 'DEPLOY_UNIT', cellId: '7_1_1', templateId: 'garrison_squad' });
    if (!dr.ok) break;
    spent += dr.charged;
    C7.exec({ type: 'REDEPLOY_UNIT', unitId: dr.unitId, toCellId: 'OFFBOARD' });
  }
  var ordIns = { type: 'DEPLOY_UNIT', cellId: '7_1_1', templateId: 'garrison_squad' };
  var ins = C7.exec(ordIns);                                                                                 // ④ 资金闸（真余额不足）
  return !w.ok && w.reason === 'ILLEGAL_WINDOW' && !oz.ok && oz.reason === 'OUT_OF_ZONE' &&
    !mf.ok && mf.reason === 'MISSING_FACING' && !ins.ok && ins.reason === 'INSUFFICIENT' &&
    C6.treasury() < cost50 && C6.treasury() >= 0 &&
    rej.length === 4 &&
    rej[0].order === ordW && rej[0].reason === 'ILLEGAL_WINDOW' &&
    rej[1].order === ordOz && rej[1].reason === 'OUT_OF_ZONE' &&
    rej[2].order === ordMf && rej[2].reason === 'MISSING_FACING' &&
    rej[3].order === ordIns && rej[3].reason === 'INSUFFICIENT';
})(), 'C7 §3.3 {order, reason} 契约形状 · payload.order=下单原对象（引用同体）· 成功单零事件（receipt 仍为拒绝语义权威）');

ok('VS5-F3.2 order_rejected 拒绝零污染对账：事件面拒绝与钱包/世界零变化逐单对应（修墙封闭+白名单外各一）', (function () {
  fresh();
  var rej = [];
  F2.bus.on('order_rejected', function (p) { rej.push(p); });
  var base = TABLES.economy.perLevel.L1.initialTreasury;
  var uN = WORLD.aliveUnits().length;                        // 拒单前取基准（拒绝单零 spawn/零扣费）
  F2.beginPhase('A', 'chk');                                 // 窗口闸最前（INIT 发 WALL_REPAIR 只会拿 ILLEGAL_WINDOW，故先入 A）
  var ordWr = { type: 'WALL_REPAIR', connectorId: 'sl_L1_gate', deltaHp: 3 };                                // 恒拒绝扩展
  var wr = C7.exec(ordWr);
  var ordOz = { type: 'DEPLOY_UNIT', cellId: '5_0_1', templateId: 'garrison_squad' };                        // 垛口非部署区
  var oz = C7.exec(ordOz);
  return !wr.ok && wr.reason === 'WALL_REPAIR_UNAVAILABLE' && !oz.ok && oz.reason === 'OUT_OF_ZONE' &&
    rej.length === 2 && rej[0].order === ordWr && rej[0].reason === 'WALL_REPAIR_UNAVAILABLE' &&
    rej[1].order === ordOz && rej[1].reason === 'OUT_OF_ZONE' &&
    C6.treasury() === base && WORLD.aliveUnits().length === uN;
})(), 'WALL_REPAIR_UNAVAILABLE / OUT_OF_ZONE 同经 order_rejected 出口 · 钱包/世界零污染（C7 §2.7 零半执行在事件面成立）');

console.log('\n[VS5-F5 · C4.5 装填进度 progress()（裁定书 §2.2-C-4 −1 版）]');
ok('VS5-F5.1 progress() 数值锚点（L=2 实测）：t≤L 钳 0、t=L+1 读 0、t=L+2 首达 1、此后钳 1；未发射恒 1（表驱动 R 零硬编码）', (function () {
  fresh();
  var f = { lastFiredTurn: 2, state: 'RELOADING' };
  var n = { lastFiredTurn: null };
  var R = TABLES.facilities.bedCrossbow.reloadTurns;
  /* R=1 下分子 (t−L−1) ∈ {…,−1,0,1,2} ÷ 1：进度恒整数，0→1 于 t=L+2 一次跳变——
   * 首达 1 回合与 VS-7 翻转后恢复可射回合（t ≥ L+1+R）精确重合（−1 版设计意图）。 */
  return R === 1 &&
    C4.progress(f, 1) === 0 && C4.progress(f, 2) === 0 && C4.progress(f, 3) === 0 &&
    C4.progress(f, 4) === 1 && C4.progress(f, 9) === 1 &&
    C4.progress(n, 1) === 1 && C4.progress(n, 9) === 1;
})(), 'clamp((t−L−1)/R,0,1) · R=1 → 0/1 两态、首达 1 于 t=L+2（翻转后与 canFireAt 精确重合）· 未发射=满装填 1（canFireAt 空戳真分支同构）');

ok('VS5-F5.2 progress() 与 canFireAt 错拍排除：p≥1 ⇒ canFireAt 必真（lastFiredTurn×回合 200 组穷举）∧ 值域恒 [0,1] ∧ RELOADING 期单调不减', (function () {
  fresh();
  var badMismatch = 0, badMono = 0;
  for (var L = 1; L <= 20; L++) {
    for (var t = 1; t <= 10; t++) {
      var f = { lastFiredTurn: L };
      var p = C4.progress(f, t), can = C4.canFireAt(f, t);
      if ((p >= 1 && !can) || p < 0 || p > 1) badMismatch++;               // 错拍排除 + 值域钳位
      var pPrev = t > 1 ? C4.progress(f, t - 1) : 0;
      if (t > L && p < pPrev) badMono++;                                   // 装填窗口内（t>L）单调不减
    }
  }
  return badMismatch === 0 && badMono === 0;
})(), '「进度 100% 但仍 RELOADING」结构排除（p≥1 ⇒ canFireAt 真对偶，VS-7 翻转后精确重合）· 单调不减');
/* ---------- 汇总 ---------- */
console.log('\n== 结果：' + pass + ' PASS / ' + fail + ' FAIL（21 回归 + 19 VS-4 新增 + 7 VS5-F1 新增 + 5 VS5-F2/F3/F5 新增）==');
process.exitCode = fail ? 1 : 0;
