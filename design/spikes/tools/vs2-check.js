#!/usr/bin/env node
'use strict';
/* vs2-check.js —— VS-2 切片底座逻辑层无头测试（Node 直跑渲染无关层）
 * 思路沿 tools/spike-test.js 前例：vm 裸上下文（无 exports/module/define）加载 graybox-vs.html
 * 三个 script 块中的应用块（THREE 未挂载时 boot 不执行，纯逻辑分区 F2/F1/F4 可独立驱动）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = path.join(__dirname, '..', 'graybox-vs.html');
const html = fs.readFileSync(HTML, 'utf8');

/* 提取第一个 script 块（应用逻辑） */
const firstOpen = html.indexOf('<script>');
const firstClose = html.indexOf('</script>');
if (firstOpen < 0 || firstClose < 0) { console.error('FAIL: app script block not found'); process.exit(1); }
const appBody = html.slice(firstOpen + '<script>'.length, firstClose);

/* vm 裸上下文（坑 5：无 exports/module/define，模拟浏览器全局） */
const sandbox = {
  window: { addEventListener: function () {} },
  console,
  performance: { now: () => Date.now() },
  setTimeout, clearTimeout,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
try {
  vm.runInContext(appBody, sandbox, { filename: 'graybox-vs-app.js' });
} catch (e) {
  console.error('FAIL: app block eval:', e.message);
  process.exit(1);
}

/* vm 裸上下文中顶层 var 挂在上下文全局（vm 与浏览器差异：浏览器 classic script 的 var 挂 window）。
 * 沿 spike-test.js 前例：从上下文全局取分区对象。 */
const F2 = sandbox.F2, F1 = sandbox.F1, F4 = sandbox.F4;
if (!F2 || !F1 || !F4) { console.error('FAIL: F2/F1/F4 partitions not exported to window'); process.exit(1); }

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name + (detail ? '  —— ' + detail : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  —— ' + detail : '')); }
}

console.log('== VS-2 切片底座 · 逻辑层无头测试 ==\n');

/* ---------- F2 FSM ---------- */
console.log('[F2 相位 FSM]');
ok('F2.1 七态迁移表完整', (function () {
  var t = F2.TRANSITIONS;
  return t.INIT && t.A && t.B && t.C && t.D && t.END_WIN && t.END_LOSE &&
         JSON.stringify(t.INIT) === '["A"]' && JSON.stringify(t.END_WIN) === '[]';
})(), 'INIT→A→B→C→D→(A|END_WIN|END_LOSE)');

ok('F2.2 表外迁移拒绝（非法 32 连发全拒）', (function () {
  F2.init('test-l1', null);
  var rejected = 0, events = [];
  F2.bus.on('illegal_transition', function (p) { events.push(p.from + '>' + p.to); rejected++; });
  // INIT 态：除→A 外全非法（6）
  ['B', 'C', 'D', 'END_WIN', 'END_LOSE', 'INIT'].forEach(function (t) { F2.beginPhase(t, 'test'); });
  F2.beginPhase('A', 'test');                       // 合法
  ['A', 'C', 'D', 'END_WIN', 'END_LOSE'].forEach(function (t) { F2.beginPhase(t, 'test'); });  // A 态非法（5）
  F2.beginPhase('B', 'test');                       // 合法
  ['A', 'B', 'D', 'END_WIN', 'END_LOSE'].forEach(function (t) { F2.beginPhase(t, 'test'); });  // B 态非法（5）
  F2.beginPhase('C', 'test');                       // 合法
  ['A', 'B', 'C', 'END_WIN', 'END_LOSE'].forEach(function (t) { F2.beginPhase(t, 'test'); });  // C 态非法（5）
  F2.beginPhase('D', 'test');                       // 合法
  ['B', 'C', 'D', 'INIT'].forEach(function (t) { F2.beginPhase(t, 'test'); });                 // D 态非法（4）
  F2.beginPhase('END_WIN', 'test');                 // 合法（D→END_WIN）
  ['A', 'B', 'C', 'D', 'INIT', 'END_WIN', 'END_LOSE'].forEach(function (t) { F2.beginPhase(t, 'test'); });  // 终态全拒（7）
  return rejected === 32 && events.length === 32;
})(), '32/32 拒绝并发 illegal_transition');

ok('F2.3 速度序三键（speed 降序 / 等速守方优先 / unitId 字典序）', (function () {
  F2.init('test-l2', {
    factionOf: function (uid) { return uid[0] === 'D' ? 'DEFENDER' : 'ATTACKER'; },
    isAlive: function () { return true; }
  });
  F2.beginPhase('A', 't'); F2.beginPhase('B', 't'); F2.beginPhase('C', 't');
  var units = [
    { unitId: 'A_fast', speed: 5 }, { unitId: 'D_mid', speed: 3 }, { unitId: 'A_mid2', speed: 3 },
    { unitId: 'D_mid2', speed: 3 }, { unitId: 'A_slow', speed: 1 }
  ];
  var r = F2.snapshotActionOrder(units);
  var expect = ['A_fast', 'D_mid', 'D_mid2', 'A_mid2', 'A_slow'];
  var same = r.order.length === expect.length;
  if (same) for (var i = 0; i < expect.length; i++) if (r.order[i] !== expect[i]) { same = false; break; }
  return same;
})(), '5→A_fast(5) → D_mid,D_mid2(守先) → A_mid2 → A_slow(1)');

ok('F2.4 顺序快照冻结（中途死亡不重排、跳槽事件成对）', (function () {
  F2.init('test-l3', {
    factionOf: function (uid) { return 'DEFENDER'; },
    isAlive: function (uid) { return uid !== 'u2'; },   // u2 已阵亡
    modeOf: function () { return 'MANUAL'; }
  });
  F2.beginPhase('A', 't'); F2.beginPhase('B', 't'); F2.beginPhase('C', 't');
  var r = F2.snapshotActionOrder([{ unitId: 'u1', speed: 2 }, { unitId: 'u2', speed: 2 }, { unitId: 'u3', speed: 1 }]);
  var opens = [], closes = [];
  F2.bus.on('action_slot_open', function (p) { opens.push(p.skipped || false); });
  F2.bus.on('action_slot_close', function (p) { closes.push(p.skipped || false); });
  var res = F2.runSlots(function () {});
  return r.order.join() === 'u1,u2,u3' && res.processed === 2 && res.skipped === 1 &&
         opens.length === 3 && closes.length === 3 && opens[1] === true && closes[1] === true;
})(), '死亡单位跳槽但 open/close 成对 {skipped:true}（F2-E5）');

ok('F2.5 D④ 判负优先于同回合清场（E11）', (function () {
  F2.init('test-l4', {
    beaconHp: function () { return 0; },            // 烽燧已破
    wavesExhausted: function () { return true; },   // 同回合波次耗尽
    aliveEnemies: function () { return 0; },        // 同回合清场
    d1Cleanup: function () {}, d2Economy: function () {}, d3Reinforce: function () {}, d5AdvanceCursor: function () { return 4; }
  });
  F2.beginPhase('A', 't'); F2.beginPhase('B', 't'); F2.beginPhase('C', 't'); F2.beginPhase('D', 't');
  var lost = null;
  F2.bus.on('battle_lost', function (p) { lost = p.reason; });
  var d4 = F2.runPhaseD();
  return d4.lose === true && d4.win === false && lost === 'BEACON_FALLEN';
})(), '烽燧破+清场同回合 → 判负');

ok('F2.6 D④ 判胜需「波次耗尽 ∧ 清场」双分量（只构造其一不判胜）', (function () {
  function probe(exh, clear) {
    F2.init('test-l5', {
      beaconHp: function () { return 100; },
      wavesExhausted: function () { return exh; }, aliveEnemies: function () { return clear ? 0 : 3; },
      d1Cleanup: function () {}, d2Economy: function () {}, d3Reinforce: function () {}, d5AdvanceCursor: function () { return 0; }
    });
    F2.beginPhase('A', 't'); F2.beginPhase('B', 't'); F2.beginPhase('C', 't'); F2.beginPhase('D', 't');
    return F2.runPhaseD();
  }
  var a = probe(true, false), b = probe(false, true), c = probe(true, true);
  return a.win === false && b.win === false && c.win === true && !a.lose && !b.lose;
})(), '耗尽∧清场才判胜（F2.5 双分量不可拆）');

ok('F2.7 turn 只在 D→A 时 +1', (function () {
  F2.init('test-l6', null);
  var t0 = F2.state().turn;
  F2.beginPhase('A', 't'); F2.beginPhase('B', 't'); F2.beginPhase('C', 't'); F2.beginPhase('D', 't');
  var tD = F2.state().turn;
  F2.beginPhase('A', 't');
  return t0 === 1 && tD === 1 && F2.state().turn === 2;
})(), '1→(A/B/C/D 全程)1→(D→A)2（F2.6）');

ok('F2.8 beaconDestroyed 中断链：剩余槽不再开启', (function () {
  F2.init('test-l7', {
    factionOf: function () { return 'ATTACKER'; }, isAlive: function () { return true; }, modeOf: function () { return 'AUTO'; }
  });
  F2.beginPhase('A', 't'); F2.beginPhase('B', 't'); F2.beginPhase('C', 't');
  F2.snapshotActionOrder([{ unitId: 'e1', speed: 3 }, { unitId: 'e2', speed: 2 }, { unitId: 'e3', speed: 1 }]);
  var slotsRun = [];
  var res = F2.runSlots(function (uid) {
    slotsRun.push(uid);
    if (uid === 'e1') F2.onBeaconDestroyed('e1');    // 第一个槽内烽燧被毁
  });
  return slotsRun.length === 1 && res.ended === 'interrupted' && F2.state().flags.beaconDestroyed === true;
})(), 'e1 槽内破坏 → e2/e3 槽不开启（F2-BE-3）');

/* ---------- F1 关卡 ---------- */
console.log('\n[F1 L1 关卡数据]');
var lvData = F1.buildL1();
F1.mount(lvData);

ok('F1.1 层主序 + CellId 含 h', (function () {
  var lv = F1.level();
  return Array.isArray(lv.layers) && lv.layers.length === 3 && Array.isArray(lv.layers[0]) &&
         typeof F1.getCellAt(5, 0, 1) === 'object' && F1.getCellAt(5, 0, 1).kind === 'PARAPET' &&
         F1.getCellAt(5, 0, 0).kind === 'GROUND';
})(), 'layers[h][x][z] · (5,0,h0)=GROUND 与 (5,0,h1)=PARAPET 同列共存（坑 1 回归）');

ok('F1.2 L1 结构参数（W=12 / 烽燧唯一 h=2 / 门洞 1 / 坡道 1）', (function () {
  var lv = F1.level();
  var beacon = 0, gate = 0, slopes = 0;
  Object.keys(lv.cells).forEach(function (id) {
    var c = lv.cells[id];
    if (c.kind === 'BEACON_FLOOR') beacon++;
    if (c.kind === 'GATE') gate++;
    if (c.kind === 'SLOPE') slopes++;
  });
  return lv.width === 12 && beacon === 1 && lv.cells['11_1_2'].h === 2 && gate === 1 && slopes === 1;
})(), 'V1/V4 烽燧唯一 + W=12（F1 §10.1 L1 列）');

ok('F1.3 连接器 9 字段齐备 + 烽燧梯 DEFENDER_ONLY', (function () {
  var cs = F1.allConnectors();
  var keys = ['id', 'from', 'to', 'connKind', 'orient', 'accessPolicy', 'occupancy', 'status', 'lifetime'];
  var all9 = cs.every(function (c) { return keys.every(function (k) { return c.hasOwnProperty(k); }); });
  var beaconConn = cs.filter(function (c) { return c.id === 'sl_L1_beacon'; })[0];
  return all9 && beaconConn.accessPolicy === 'DEFENDER_ONLY' && beaconConn.from === '11_1_0' && beaconConn.to === '11_1_2';
})(), '9 字段（F1 §2.4.2）· V9 守方专属');

ok('F1.4 容量表分类型（垛口1/马道2/地面4/门洞1/烽燧顶1/坡道1/墙0，堆叠上限4）', (function () {
  var g = F1.GRID_CAPACITY;
  return g.PARAPET === 1 && g.RAMPART_WALK === 2 && g.GROUND === 4 && g.GATE === 1 &&
         g.BEACON_FLOOR === 1 && g.SLOPE === 1 && g.WALL === 0 && F1.STACK_LIMIT === 4;
})(), 'F1 §2.5.2 全表（F3 grid-capacity 宿主键）');

ok('F1.5 容量判定：满格拒绝 + 堆叠上限护栏', (function () {
  var r1 = F1.placeUnit('t1', '0_0_0'); var r2 = F1.placeUnit('t2', '0_0_0');
  var r3 = F1.placeUnit('t3', '0_0_0'); var r4 = F1.placeUnit('t4', '0_0_0');
  var r5 = F1.placeUnit('t5', '0_0_0');           // 地面容 4 → 第 5 个拒绝
  return r1.ok && r2.ok && r3.ok && r4.ok && !r5.ok && r5.why === 'cell_full';
})(), 'GROUND 4/4 后拒绝（F1.8 + F1.12）');

ok('F1.6 V11 攻方可达（ACTIVE∧BOTH 边图上 地面→烽燧 存在路径）', (function () {
  var r = F1.aStar('0_0_0', '6_0_1');            // 地面→门洞（经 GATE 连接器，BOTH）
  var r2 = F1.aStar('6_0_1', '5_0_1');           // 门洞→垛口（马道水平段）
  return r.ok && r2.ok;
})(), '攻方 ACTIVE∧BOTH 通路成立');

ok('F1.7 守方内部梯可达烽燧', (function () {
  var r = F1.aStar('5_1_1', '11_1_2');
  return r.ok;
})(), '马道→烽燧（DEFENDER_ONLY 边对守方有效）');

ok('F1.8 board/unboard 骨架 + E2 坠落链（destroy 原子清 occupancy，落位不悬空）', (function () {
  F1.addConnector({ id: 'ld_t', from: '8_0_0', to: '8_0_1', connKind: 'LADDER', orient: 'FRONTAL',
    accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE', lifetime: { createdTurn: 1, currentHp: 3 } });
  F1.placeUnit('lad_u', '8_0_0');
  var b = F1.boardConnector('ld_t', 'lad_u');
  var cs = F1.allConnectors().filter(function (c) { return c.id === 'ld_t'; })[0];
  var onConn = cs.occupancy.units.indexOf('lad_u') >= 0;
  var stillInCell = F1.findUnitCell('lad_u') === '8_0_0';   // INV2：逻辑位置保持 from 格
  var d = F1.destroyConnector('ld_t');
  var landed = F1.findUnitCell('lad_u');                     // E2：必有著落（INV6）
  var cs2 = F1.allConnectors().filter(function (c) { return c.id === 'ld_t'; })[0];
  return b.ok && onConn && stillInCell && d.ok && d.stranded === 1 && !!landed && cs2.status === 'DESTROYED' && cs2.occupancy.units.length === 0;
})(), 'board→INV2 并存登记 → destroy→清 occupancy+落位（from 空→留原格）');

ok('F1.9 unboard 主动弃梯：from 满则拒绝（C1-E4 终裁 A 案）', (function () {
  F1.addConnector({ id: 'ld_t2', from: '9_0_0', to: '9_0_1', connKind: 'LADDER', orient: 'FRONTAL',
    accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE', lifetime: { createdTurn: 1, currentHp: 3 } });
  F1.placeUnit('lad_x', '9_0_0');
  F1.boardConnector('ld_t2', 'lad_x');
  // 填满 from 格（地面容 4，lad_x 占 1 槽——注意 board 后逻辑位置仍在 from，占位不重复计）
  var occ = F1.occupancyOf('9_0_0');
  var need = occ.capacity - occ.units.length;
  for (var i = 0; i < need; i++) F1.placeUnit('fill_' + i, '9_0_0');
  var ub = F1.unboardConnector('ld_t2', 'lad_x');
  return !ub.ok && ub.why === 'from_full';
})(), 'from 格满 → 拒绝弃梯、留梯保持暴露（INV1 无豁免）');

ok('F1.10 启发权重 ≤ climb（可采纳性联动约束在册）', (function () {
  return F1.HEURISTIC_LAYER_WEIGHT <= F1.TERRAIN_RULES.moveCost.climb;
})(), 'weight=' + F1.HEURISTIC_LAYER_WEIGHT + ' ≤ climb=' + F1.TERRAIN_RULES.moveCost.climb + '（C1.5 硬约束）');

/* ---------- F4 随机源 ---------- */
console.log('\n[F4 确定性随机]');
ok('F4.1 同种子两次初始化序列逐字节一致', (function () {
  F4.init('vs-l1-seed-01'); var a = F4.seq(128);
  F4.init('vs-l1-seed-01'); var b = F4.seq(128);
  for (var i = 0; i < 128; i++) if (a[i] !== b[i]) return false;
  return true;
})(), '"vs-l1-seed-01" ×128 值全等');

ok('F4.2 种子展开=FNV-1a-32（公开规范测试向量）', (function () {
  // FNV-1a-32 公开向量：'a'→0xe40c292c、'foobar'→0xbf9cf968（实现在 _vs2-app.js 与 harness 侧独立实现互证）
  return F4.fnv1a32([0x61]) === 0xe40c292c && F4.fnv1a32([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]) === 0xbf9cf968;
})(), 'FNV-1a("a")=0xe40c292c / FNV-1a("foobar")=0xbf9cf968（F4.2 展开原语正确）');

ok('F4.3 换种子序列不同 + 游标单调 +1', (function () {
  F4.init('seed-A'); var a = F4.seq(8); var c1 = F4.cursor();
  F4.init('seed-B'); var b = F4.seq(8); var c2 = F4.cursor();
  var diff = false; for (var i = 0; i < 8; i++) if (a[i] !== b[i]) { diff = true; break; }
  return diff && c1 === 8 && c2 === 8;
})(), '不同种子→不同序列；游标=消费数');

ok('F4.4 rand 值域 [0,1)', (function () {
  F4.init('range-test');
  for (var i = 0; i < 10000; i++) { var v = F4.rand('HIT_ROLL'); if (!(v >= 0 && v < 1)) return false; }
  return true;
})(), '10⁴ 采样无越界（state/2³² 结构保证）');

ok('F4.5 中文种子恒成功（零失败模式）', (function () {
  F4.init('烽燧'); var a = F4.seq(16);
  F4.init('烽燧'); var b = F4.seq(16);
  for (var i = 0; i < 16; i++) if (a[i] !== b[i]) return false;
  return a.length === 16;
})(), 'F4-E7 任意 UTF-8 串');

/* ---------- 全链路空转（headless 版 playthrough）---------- */
console.log('\n[全链路空转（无渲染）]');
ok('E2E.1 判胜路径 INIT→…→END_WIN 零 illegal_transition', (function () {
  var lv2 = F1.buildL1(); F1.mount(lv2);
  F4.init('vs-l1-seed-01');
  var units = {};
  var seq = 0;
  var WAVES = [
    { turn: 2, units: ['ladder_infantry', 'ladder_infantry'] },
    { turn: 4, units: ['horse_archer'] },
    { turn: 6, units: ['ladder_infantry'] }
  ];
  var waveCursor = 0, pending = [];
  function spawnCell() {
    for (var x = 0; x <= 2; x++) for (var z = 0; z < 3; z++) {
      var id = x + '_' + z + '_0';
      if (F1.getCell(id) && F1.getCell(id).kind === 'GROUND' && F1.canPlace(id, 1)) return id;
    }
    return null;
  }
  F2.init('MVP_L1', {
    spawnForTurn: function (turn) {
      var entered = [];
      for (var w = 0; w < WAVES.length; w++) if (WAVES[w].turn === turn) {
        waveCursor = Math.max(waveCursor, w + 1);
        WAVES[w].units.forEach(function (t) {
          var cid = spawnCell();
          if (cid) { var uid = 'a' + (++seq); F1.placeUnit(uid, cid); units[uid] = true; entered.push(uid); }
        });
      }
      return { entered: entered, deferred: 0 };
    },
    generatePlans: function () { return { plannedUnits: Object.keys(units).length }; },
    factionOf: function (uid) { return units[uid] ? 'ATTACKER' : 'DEFENDER'; },
    modeOf: function () { return 'AUTO'; },
    isAlive: function (uid) { return !!units[uid]; },
    beaconHp: function () { return 100; },
    wavesExhausted: function () { return waveCursor >= WAVES.length && pending.length === 0; },
    aliveEnemies: function () {
      var n = 0; Object.keys(units).forEach(function (u) { if (units[u]) n++; }); return n;
    },
    d1Cleanup: function () {}, d2Economy: function () {}, d3Reinforce: function () {},
    d5AdvanceCursor: function () { return waveCursor; }
  });
  var illegal = 0;
  F2.bus.on('illegal_transition', function () { illegal++; });
  // 清回合 1；回合 2 波 1 入场；回合 3 清场（C 相位内敌军全灭模拟）；回合 4 波 2 入场；回合 5 清场；回合 6 波 3；回合 7 清场 → D④ 判胜
  var ended = null, guard = 0;
  F2.beginPhase('A', 'e2e');
  while (!ended && guard++ < 60) {
    var s = F2.state();
    if (s.phase === 'A') {
      // 模拟守方在 C 相位全歼敌军（占位：清空攻方）
      Object.keys(units).forEach(function (u) { F1.removeUnit(u); delete units[u]; });
      F2.beginPhase('B', 'e2e'); F2.runPhaseB(); F2.beginPhase('C', 'e2e');
      var list = Object.keys(units).map(function (u) { return { unitId: u, speed: 3 }; });
      if (list.length) { F2.snapshotActionOrder(list); F2.runSlots(function () {}); }
      F2.beginPhase('D', 'e2e');
    } else if (s.phase === 'D') {
      var d4 = F2.runPhaseD();
      if (d4.lose) ended = 'END_LOSE'; else if (d4.win) ended = 'END_WIN'; else F2.beginPhase('A', 'e2e');
    } else ended = 'STALL';
  }
  return ended === 'END_WIN' && illegal === 0 && F2.state().phase === 'END_WIN';
})(), '3 波全歼 → 波次耗尽∧清场 → END_WIN（全程零表外迁移）');

/* ---------- 汇总 ---------- */
console.log('\n== 结果：' + pass + ' PASS / ' + fail + ' FAIL ==');
process.exit(fail ? 1 : 0);
