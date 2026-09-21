#!/usr/bin/env node
/* spike-test.js —— 灰盒逻辑层自测（Node 环境直跑 script[0]，不启动渲染）
 * 验证：跨层路径正确性 / 云梯断边绕行 / 双断不可达 / 性能 / 占位容量
 * 注意：不用 'use strict'——需让间接 eval 的顶层 var 落到全局作用域 */
const fs = require('fs');
const html = fs.readFileSync('D:/code/building/design/spikes/graybox-f1.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no script block'); process.exit(1); }

globalThis.window = { addEventListener: function () {} };
(0, eval)(m[1]);       // 间接 eval：声明进全局，buildLevel/aStar 可直接调用

var fails = 0;
function assert(cond, msg) {
  if (cond) console.log('PASS:', msg);
  else { fails++; console.error('FAIL:', msg); }
}

var lv = buildLevel();
var cnt = 0;
for (var hh = 0; hh < 3; hh++)
  for (var x = 0; x < lv.W; x++) for (var z = 0; z < lv.D; z++)
    if (lv.layers[hh][x][z] !== null) cnt++;
assert(cnt === 87, '有效节点数 = 87（实际 ' + cnt + '）');
assert(lv.connectors.length === 4, '连接器 = 4（2 坡道 + 2 云梯）');

var r = aStar(lv, N3(1, 1, 0), N3(6, 1, 1));
assert(r.ok, 'G1 地面→墙顶 可达');
assert(r.path.length === 9, 'G1 路径长 = 9（实际 ' + (r.ok ? r.path.length : '不可达') + '）');
assert(r.path.some(function (n) { return n.x === 3 && n.z === 0 && n.h === 0; }) &&
       r.path.some(function (n) { return n.x === 3 && n.z === 0 && n.h === 1; }),
       'G1 经过云梯 L1 两端（跨层必经连接器）');

var r2 = aStar(lv, N3(9, 1, 1), N3(15, 2, 2));
assert(r2.ok && r2.path.length === 8, 'G2 墙顶→烽燧顶 长 = 8（实际 ' + (r2.ok ? r2.path.length : '不可达') + '）');
assert(r2.path.some(function (n) { return n.x === 10 && n.z === 2 && n.h === 1; }) &&
       r2.path.some(function (n) { return n.x === 11 && n.z === 2 && n.h === 2; }),
       'G2 经过坡道 R2（唯一跨层边）');

var r3 = aStar(lv, N3(15, 2, 2), N3(9, 1, 1));
assert(r3.ok && r3.path.length === 8, 'G2b 反向（烽燧→墙顶）长 = 8，双向对称成立');

var L1 = lv.connectors.find(function (c) { return c.id === 'L1'; });
var L2 = lv.connectors.find(function (c) { return c.id === 'L2'; });
var R1 = lv.connectors.find(function (c) { return c.id === 'R1'; });
L1.open = false;
var r4 = aStar(lv, N3(1, 1, 0), N3(6, 1, 1));
assert(r4.ok && r4.path.length === 16, '毁 L1 后 G1 绕行 R1，长 = 16（实际 ' + (r4.ok ? r4.path.length : '不可达') + '）');
assert(!r4.path.some(function (n) { return n.x === 3 && n.z === 0 && n.h === 1; }), '绕行路径不经过 L1 顶端格');
assert(r4.path.length >= r.path.length, '绕行长 ≥ 原路径长（最优性未被启发式破坏）');

R1.open = false;
var r5 = aStar(lv, N3(1, 1, 0), N3(6, 1, 1));
assert(r5.ok && r5.path.some(function (n) { return n.x === 10 && n.z === 0 && n.h === 1; }),
       '毁 L1+R1 后 G1 仍可达，经 L2 角楼云梯（动态连接器各自独立生效）');
L2.open = false;
var r6 = aStar(lv, N3(1, 1, 0), N3(6, 1, 1));
assert(!r6.ok, '毁 L1+L2+R1 后 G1 不可达（全部跨层边断开即封路）');
L1.open = true; L2.open = true; R1.open = true;

var times = [], sumV = 0, bad = 0;
for (var i = 0; i < 2000; i++) {
  var rr = aStar(lv, N3(0, i % 3, 0), N3(15 + (i % 3), 2, 2));
  times.push(rr.ms); sumV += rr.visited; if (!rr.ok) bad++;
}
var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
var mx = Math.max.apply(null, times);
console.log('PERF: n=' + times.length + ' avg=' + avg.toFixed(3) + 'ms max=' + mx.toFixed(3) +
            'ms avgVisited=' + (sumV / times.length).toFixed(1) + ' failed=' + bad);
assert(avg < 1, '平均单次求解 < 1ms（' + cnt + ' 节点图）');

var occ = {};
function tryPlace(n) {
  var k = n.x + ',' + n.z + ',' + n.h;
  occ[k] = occ[k] || 0;
  if (occ[k] >= lv.unitCap) return false;
  occ[k]++; return true;
}
assert(tryPlace(N3(1, 1, 0)) && tryPlace(N3(1, 1, 0)) && !tryPlace(N3(1, 1, 0)),
       '占位容量 2：同格第 3 个单位被拒绝');

console.log(fails === 0 ? '\nALL LOGIC TESTS PASSED' : '\n' + fails + ' LOGIC TEST(S) FAILED');
process.exit(fails === 0 ? 0 : 1);
