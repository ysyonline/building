#!/usr/bin/env node
'use strict';
/* vs3-check.js —— VS-3 战斗核心逻辑层无头测试（Node 直跑渲染无关层，沿 vs2-check.js 范式）
 * 增量覆盖：C1 移动（MP 消费/攀爬原子 2MP/BLOCKED_TOP/弃梯拒绝/E2 坠落）
 *         + C5 结算（走廊近→远/高度攻方视角/vsFacility/骑射命中面/烽燧目标链）
 *         + C10 托管（STAY 基准/零 F4 消费/槽路由）
 *         + C8 AI（generatePlans 纯函数/BE-2 集中度断言/planBudgetMs）
 *         + E2E 终局收敛（smoke 必落 END_WIN|END_LOSE + 零 illegal_transition）。
 * 结果落盘 vs3-check-out.txt（由 runner 重定向）。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTMLDIR = path.join(__dirname, '..');
const APP = path.join(__dirname, '_vs3-app.js');
let body = fs.readFileSync(APP, 'utf8');
if (body.startsWith('<script>')) body = body.slice('<script>'.length);
const ci = body.lastIndexOf('</script>'); if (ci >= 0) body = body.slice(0, ci);

const sandbox = {
  window: { addEventListener: function () {} },
  console, performance: { now: () => Date.now() }, setTimeout, clearTimeout,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
try { vm.runInContext(body, sandbox, { filename: '_vs3-app.js' }); }
catch (e) { console.error('FAIL: app block eval:', e.message); process.exit(1); }

const F2 = sandbox.F2, F1 = sandbox.F1, F4 = sandbox.F4, TABLES = sandbox.TABLES,
      WORLD = sandbox.WORLD, C1 = sandbox.C1, C5 = sandbox.C5, C10 = sandbox.C10, C8 = sandbox.C8;
if (!F2 || !F1 || !F4 || !WORLD || !C1 || !C5 || !C10 || !C8) {
  console.error('FAIL: partitions not exported'); process.exit(1);
}

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name + (detail ? '  —— ' + detail : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  —— ' + detail : '')); }
}
function fresh() { WORLD.init(TABLES.f4Seed); }

console.log('== VS-3 战斗核心 · 逻辑层无头测试 ==\n');

/* ---------- C1 移动 ---------- */
console.log('[C1 移动（MP×AP / 攀爬原子 / E2）]');
ok('C1.1 reachable 预算剪枝（MP=3 内可达集，超出格不出现）', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '0_0_0');
  var reach = C1.reachable(u.uid);
  var maxD = 0; for (var k in reach) maxD = Math.max(maxD, reach[k]);
  return reach['0_0_0'] === 0 && maxD <= 3 && reach['3_0_0'] === 3 && reach['4_0_0'] === undefined;
})(), 'MP=3 → 恰好 3 格深（Dijkstra 泛洪 + 预算剪枝 C1.4）');

ok('C1.2 平移消耗 MP=plains(1)/格（MoveReport.mpSpent 对账）', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '0_0_0');
  var rep = C1.applyMoveOrder({ unitId: u.uid, target: '2_0_0', mode: 'AUTO' });
  return rep.status === 'COMPLETED' && rep.mpSpent === 2 && u.mp === 1 && u.cellId === '2_0_0';
})(), '2 格平移 → mpSpent=2 · mp 3→1');

ok('C1.3 攀爬原子 2MP 一口价（board+move+unboard 单事务）', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '8_0_0');
  F1.addConnector({ id: 'ld_t', from: '8_0_0', to: '8_0_1', connKind: 'LADDER', orient: 'FRONTAL',
    accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE',
    lifetime: { createdTurn: 1, currentHp: TABLES.terrain.ladderHp } });
  var rep = C1.applyMoveOrder({ unitId: u.uid, target: '8_0_1', mode: 'AUTO' });
  return rep.status === 'COMPLETED' && rep.mpSpent === C1.climbCost() && u.mp === 1 &&
         u.cellId === '8_0_1' && u.onConnector === null;
})(), '跨层一格 → 恰好扣 climb=2（不分方向一口价）· 落顶格 · occupancy 已清');

ok('C1.4 BLOCKED_TOP：顶满 → 留梯排队（ON_CONNECTOR，非失败）', (function () {
  fresh();
  var blocker = WORLD.spawn('DEFENDER', 'garrison_squad', '8_0_1');   // 垛口容量 1 占满（顶格）
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '8_0_0');
  F1.addConnector({ id: 'ld_t2', from: '8_0_0', to: '8_0_1', connKind: 'LADDER', orient: 'FRONTAL',
    accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE',
    lifetime: { createdTurn: 1, currentHp: TABLES.terrain.ladderHp } });
  /* 目标取梯后马道（8_1_1）：订单预检过（目标格空），中途攀爬遇顶满 → BLOCKED_TOP
   * （直接以顶格为目标的订单走 F1-E7 目标满 REJECTED，不入此分支） */
  var rep = C1.applyMoveOrder({ unitId: u.uid, target: '8_1_1', mode: 'AUTO' });
  var cn = C1.connById('ld_t2');
  return rep.status === 'BLOCKED_TOP' && rep.waitingConnector === 'ld_t2' &&
         u.onConnector === 'ld_t2' && u.cellId === '8_0_0' && u.mp === 1 &&
         cn.occupancy.units.indexOf(u.uid) >= 0 && WORLD.isAlive(blocker.uid);
})(), '顶满 → BLOCKED_TOP + occupancy 在册 + 逻辑位置保持 from（INV2）· MP 已扣 climb');

ok('C1.5 弃梯拒绝：from 格满（C1-E4 终裁 A 案）', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '9_0_0');
  F1.addConnector({ id: 'ld_t3', from: '9_0_0', to: '9_0_1', connKind: 'LADDER', orient: 'FRONTAL',
    accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE',
    lifetime: { createdTurn: 1, currentHp: TABLES.terrain.ladderHp } });
  F1.boardConnector('ld_t3', u.uid);
  var occ = F1.occupancyOf('9_0_0');           // board 后逻辑位置仍在 from，占 1 槽
  var need = occ.capacity - occ.units.length;
  for (var i = 0; i < need; i++) F1.placeUnit('fill_' + i, '9_0_0');
  var ub = F1.unboardConnector('ld_t3', u.uid);
  return !ub.ok && ub.why === 'from_full' &&
         F1.allConnectors().filter(function (c) { return c.id === 'ld_t3'; })[0].occupancy.units.indexOf(u.uid) >= 0;
})(), 'from 满 → 拒绝弃梯、留梯保持暴露（INV1 无豁免）· occupancy 仍在册');

ok('C1.6 E2 坠落链：梯毁 → 落位 + fallDamage=10 恒定不过骰（零 F4 消费）', (function () {
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
})(), 'from 空 → 落回 from · HP 60→50（表驱动 fallDamage）· 游标零消耗（§8.4 恒定不过骰）');

/* ---------- C5 攻击结算 ---------- */
console.log('\n[C5 攻击结算（HIT_ROLL 单流 / 修正链 / 目标集）]');
ok('C5.1 床弩走廊：同层轴向近→远（多目标距离序）', (function () {
  fresh();
  var near = WORLD.spawn('ATTACKER', 'ladder_infantry', '4_1_0');
  var far = WORLD.spawn('ATTACKER', 'ladder_infantry', '2_1_0');
  var rep = C5.strike({ attacker: 'bed_crossbow_1', kind: 'CROSSBOW_VOLLEY', origin: '6_1_1', dir: '-x' });
  return rep.perTarget.length === 2 && rep.perTarget[0].target === near.uid &&
         rep.perTarget[1].target === far.uid;
})(), 'd=2 先于 d=4（C5.7 近→远，逐目标独立过骰）');

ok('C5.2 高度修正=攻方视角（床弩 h1 俯射 h0 → +0.05·ranged 键）', (function () {
  fresh();
  WORLD.spawn('ATTACKER', 'ladder_infantry', '4_1_0');
  var rep = C5.strike({ attacker: 'bed_crossbow_1', kind: 'CROSSBOW_VOLLEY', origin: '6_1_1', dir: '-x' });
  return rep.perTarget.length > 0 && rep.perTarget[0].mods.height ===
         (F1.getCell('6_1_1').h - F1.getCell('4_1_0').h) * TABLES.combat.heightModPerLevelRanged;
})(), 'heightModPerLevel.ranged=0.05 · 与 VS-1 §5.3/§6.4 实测同号（仰攻为负）');

ok('C5.3 近战对设施 ×vsFacility(0.5)（命中时伤害=12×0.5=6）', (function () {
  fresh();
  WORLD.kill('D_2', 'test_clear');             // 清 (5,1,1) 守方占位
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '5_1_1');
  var hitSeen = false, dmgOk = true, cur0 = F4.cursor();
  for (var i = 0; i < 24 && !hitSeen; i++) {
    var rep = C5.strike({ attacker: u.uid, kind: 'MELEE', target: { type: 'facility', facilityId: 'bed_crossbow_1' } });
    var t = rep.perTarget[0];
    if (t.hit) { hitSeen = true; dmgOk = (t.dmg === TABLES.weapons.melee.damage * TABLES.weapons.melee.vsFacility); }
  }
  return hitSeen && dmgOk && F4.cursor() > cur0;
})(), '命中样本 dmg=6（vsFacility 键）· 每次过骰消费 F4 主流');

ok('C5.4 骑射命中面：0.75 −0.05(仰攻ranged) −0.15(垛口掩体) −0.05(isHitMod) = 0.50 ±3σ', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'horse_archer', '8_1_0');   // D_1@5_0_1 垛口线（PARAPET=掩体，d=4≤range）
  var N = 600, hits = 0;
  for (var i = 0; i < N; i++) {
    WORLD.unit('D_1').hp = WORLD.unit('D_1').maxHp;           // 测试侧回血：隔离「击杀截断」对统计的污染
    var rep = C5.strike({ attacker: u.uid, kind: 'RANGED', weapon: 'horseArcher', target: { type: 'unit', unitId: 'D_1' } });
    if (rep.perTarget[0].hit) hits++;
  }
  var p = TABLES.combat.hitBase - TABLES.combat.heightModPerLevelRanged + TABLES.combat.coverModParapet + TABLES.weapons.horseArcher.isHitMod;
  var rate = hits / N;
  return Math.abs(rate - p) <= 0.07;
})(), '期望 p=0.50（掩体=PARAPET 键）· 3σ=0.067 · 逐次独立 HIT_ROLL');

ok('C5.5 烽燧目标链：攻方邻接可打、命中扣烽燧 HP（beacon:true 形状回归）', (function () {
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

ok('C5.6 命中过骰唯一入口：F4 单流游标=消费数（无独立 RNG）', (function () {
  fresh();
  var c0 = F4.cursor();
  WORLD.spawn('ATTACKER', 'ladder_infantry', '4_1_0');
  var rep = C5.strike({ attacker: 'bed_crossbow_1', kind: 'CROSSBOW_VOLLEY', origin: '6_1_1', dir: '-x' });
  return F4.cursor() - c0 === rep.perTarget.length;
})(), '每目标恰一次 HIT_ROLL · rand("HIT_ROLL") 为唯一命中骰入口');

/* ---------- C10 托管 ---------- */
console.log('\n[C10 托管（评分框架 / 零 F4 / 槽路由）]');
ok('C10.1 STAY 显式候选 Score=standFast(45)（待命合法性 C10.8）', (function () {
  fresh();
  /* 无咽喉可堵、无目标可打、无掩体语义的格 → 候选集收缩到 [STAY]，argmax 即 STAY */
  var u = WORLD.spawn('DEFENDER', 'garrison_squad', '0_1_0');
  var best = C10.evaluate(u);
  return best.kind === 'STAY' && best.score === TABLES.defenseScripts.standFast;
})(), '无合格候选时待命合法（不强制乱动，C10 §2.7-6）· standFast=45');

ok('C10.2 托管决策零 F4 消费（C10.6 确定性纪律）', (function () {
  fresh();
  var cur0 = F4.cursor();
  WORLD.aliveUnits().forEach(function (u) {
    if (WORLD.factionOf(u.uid) === 'DEFENDER') C10.resolveSlot(u.uid);
    else { C8.executePlan(u.uid); }
  });
  return F4.cursor() === cur0;
})(), 'C10 评分 + C8 计划执行（无命中场景）游标不动——决策面零 RNG');

ok('C10.3 槽路由：AUTO 即时产出指令 / MANUAL 挂起（契约 1）', (function () {
  fresh();
  var d = WORLD.defenderUnits()[0];
  var r1 = C10.resolveSlot(d.uid);
  C10.setControlMode(d.uid, 'MANUAL');
  var r2 = C10.resolveSlot(d.uid);
  return (r1 && (r1.choice === 'STAY' || r1.choice === 'MOVE' || r1.choice === 'ATTACK')) &&
         r2 && r2.hung === true;
})(), 'UNIT 级 AUTO/MANUAL 路由 · MANUAL 零指令收槽');

/* ---------- C8 匈奴 AI ---------- */
console.log('\n[C8 匈奴 AI（纯函数 / BE-2 / 预算）]');
ok('C8.1 generatePlans 纯函数：同输入两次调用计划逐字节一致（零 RNG）', (function () {
  fresh();
  for (var i = 0; i < 6; i++) WORLD.spawn('ATTACKER', 'ladder_infantry', '0_' + (i % 3) + '_0');
  WORLD.spawn('ATTACKER', 'horse_archer', '1_1_0');
  var a = C8.generatePlans(2, 'MAIN_ASSAULT'), b = C8.generatePlans(2, 'MAIN_ASSAULT');
  return JSON.stringify(a.plans) === JSON.stringify(b.plans) && a.plannedUnits === 7;
})(), '同世界态 → 同计划（C8.4 确定性）· 7 攻方全计划');

ok('C8.2 BE-2 集中度：MAIN_ASSAULT > FEINT（Herfindahl 目标分布）', (function () {
  fresh();
  for (var i = 0; i < 6; i++) WORLD.spawn('ATTACKER', 'ladder_infantry', '0_' + (i % 3) + '_0');
  var main = C8.concentration(C8.generatePlans(2, 'MAIN_ASSAULT').plans);
  var feint = C8.concentration(C8.generatePlans(2, 'FEINT').plans);
  return main > feint;
})(), 'dispersionMul 1.0 vs 2.0 方向性成立（破口集中 vs 多点拉扯）');

ok('C8.3 单轮计划耗时 ≤ planBudgetMs(10)（BE-5 预算）', (function () {
  fresh();
  for (var i = 0; i < 8; i++) WORLD.spawn('ATTACKER', 'ladder_infantry', '0_' + (i % 3) + '_0');
  var worst = 0;
  for (var r = 0; r < 20; r++) { var ms = C8.generatePlans(2, r % 2 ? 'MAIN_ASSAULT' : 'FEINT').ms; if (ms > worst) worst = ms; }
  return worst <= TABLES.aiScripts.planBudgetMs;
})(), '20 轮最差值 ≤ 10ms');

ok('C8.4 架梯 E1：canBoardLadder 单位原位架梯（表驱动，零兵种名）', (function () {
  fresh();
  var u = WORLD.spawn('ATTACKER', 'ladder_infantry', '4_0_0');
  var raised = C8.tryRaiseLadder(u);
  var cs = F1.allConnectors().filter(function (c) { return c.connKind === 'LADDER' && c.status === 'ACTIVE' && c.from === '4_0_0'; });
  return raised && cs.length === 1 && u.ap === TABLES.units.ladder_infantry.baseAp - 1;
})(), 'GROUND 上格=PARAPET → 架梯成功 · AP −1（executePlan 走「换梯」分支）');

/* ---------- E2E 终局收敛 ---------- */
console.log('\n[E2E 终局收敛（smoke 判据）]');
ok('E2E.1 全链路 40 回合内必落 END_WIN|END_LOSE，全程零 illegal_transition', (function () {
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

ok('E2E.2 F4 重放确定性：同种子两局逻辑快照逐字节一致', (function () {
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

/* ---------- 汇总 ---------- */
console.log('\n== 结果：' + pass + ' PASS / ' + fail + ' FAIL ==');
process.exitCode = fail ? 1 : 0;
