#!/usr/bin/env node
'use strict';
/* _vs3-debug.js — 无头战场诊断（vm 裸上下文，镜像页内 C 相位驱动）：
 * 逐回合dump 攻守单位/位置/HP、烽燧 HP、C5 结算报告分类、事件密度，定位不终局根因。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
vm.runInContext(body, sandbox, { filename: '_vs3-app.js' });

const F2 = sandbox.F2, F1 = sandbox.F1, F4 = sandbox.F4, TABLES = sandbox.TABLES,
      WORLD = sandbox.WORLD, C1 = sandbox.C1, C5 = sandbox.C5, C10 = sandbox.C10, C8 = sandbox.C8;

WORLD.init(TABLES.f4Seed);
const TURNS = parseInt(process.argv[2] || '40', 10);

F2.beginPhase('A', 'dbg');
for (let t = 0; t < TURNS; t++) {
  const s = F2.state();
  if (s.phase === 'END_WIN' || s.phase === 'END_LOSE') { console.log('TURN', F2.state().turn, '=> ', s.phase); break; }
  if (s.phase === 'A') { F2.beginPhase('B', 'dbg'); F2.runPhaseB(); F2.beginPhase('C', 'dbg'); }

  // C 相位
  const list = WORLD.aliveUnits().map(u => ({ unitId: u.uid, speed: u.speed }));
  F2.snapshotActionOrder(list);
  let acts = { melee: 0, ranged: 0, volley: 0, move: 0, stay: 0, ladder: 0, none: 0 };
  const seq0 = C5.seq();
  F2.runSlots(function (uid) {
    const u = WORLD.unit(uid);
    if (WORLD.factionOf(uid) === 'DEFENDER') {
      const r = C10.resolveSlot(uid);
      if (r && r.choice === 'ATTACK') acts.melee++;
      else if (r && r.choice === 'MOVE') acts.move++;
      else acts.stay++;
    } else {
      const hp = WORLD.aliveUnits().length;
      C8.executePlan(uid);
      // 动作分类：看 C5 报告增量 + 计划
      const p = C8.planFor(uid);
      void p; void hp;
      acts.none++;
    }
  });
  const rep = C5.reports().slice(seq0);
  rep.forEach(r => { if (r.kind === 'MELEE') acts.melee++; else if (r.kind === 'RANGED') acts.ranged++; else if (r.kind === 'CROSSBOW_VOLLEY') acts.volley++; else acts.ladder++; });
  void acts.ladder;
  if (t >= (parseInt(process.argv[3] || '9999', 10))) {
    rep.forEach(r => console.log('      strike#' + r.seq + ' ' + r.kind + ' ' + r.attacker + '→' +
      r.perTarget.map(x => x.target + (x.hit ? 'H' + x.dmg : 'M') + (x.killed ? 'K' : '')).join(',')));
  }
  const fac = WORLD.facilitiesList().map(f => f.id + ':' + f.hp + ':' + f.state).join(',');

  const atk = WORLD.attackerUnits(), def = WORLD.defenderUnits();
  const kills = C5.reports().filter(r => r.perTarget.some(x => x.killed)).length;
  const pos = atk.map(u => u.uid + ':' + u.templateId.slice(0, 4) + '@' + u.cellId + '(' + u.hp + ')').join(' ');
  console.log('T' + F2.state().turn +
    ' | atk=' + atk.length + ' def=' + def.length +
    ' | beacon=' + WORLD.beaconHp() +
    ' | melee=' + acts.melee + ' ranged=' + acts.ranged + ' volley=' + acts.volley +
    ' | kills(reports)=' + kills +
    ' | curs=' + F4.cursor() + ' | fac=' + fac);
  if (atk.length <= 18) console.log('    ' + pos);
  console.log('    DEF ' + def.map(u => u.uid + '@' + u.cellId + '(' + u.hp + ')').join(' '));

  // D 相位
  F2.beginPhase('D', 'dbg');
  const d4 = F2.runPhaseD();
  if (d4.lose) { console.log('TURN', F2.state().turn, '=> END_LOSE'); break; }
  if (d4.win) { console.log('TURN', F2.state().turn, '=> END_WIN'); break; }
  F2.beginPhase('A', 'dbg');
}
const byKind = {};
C5.reports().forEach(r => { byKind[r.kind] = (byKind[r.kind] || 0) + 1; });
console.log('== C5 strike kinds:', JSON.stringify(byKind));
console.log('== final phase:', F2.state().phase, 'turn', F2.state().turn, 'beacon', WORLD.beaconHp());
