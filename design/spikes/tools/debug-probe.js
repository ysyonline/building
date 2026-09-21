#!/usr/bin/env node
/* debug-probe.js —— 检查图连通性：起点邻居、关键节点、A* 展开过程 */
const fs = require('fs');
const html = fs.readFileSync('D:/code/building/design/spikes/graybox-f1.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
globalThis.window = { addEventListener: function () {} };
(0, eval)(m[1]);

var lv = buildLevel();
function P(tag, n) {
  var nb = neighborsOf(lv, n);
  console.log(tag, '(' + n.x + ',' + n.z + ',h' + n.h + ') ->',
    nb.map(function (p) { return '(' + p.x + ',' + p.z + ',h' + p.h + ')'; }).join(' '));
}
P('start ', N3(1, 1, 0));
P('mid   ', N3(2, 1, 0));
P('ladder', N3(3, 0, 0));
P('ltop  ', N3(3, 0, 1));
P('goal  ', N3(6, 1, 1));

console.log('h[1][1]=', lv.h[1][1], ' h[2][1]=', lv.h[2][1], ' h[3][0]=', lv.h[3][0], ' h[6][1]=', lv.h[6][1]);
console.log('t[3][0]=', lv.t[3][0], ' t[3][1]=', lv.t[3][1]);

var r = aStar(lv, N3(1, 1, 0), N3(6, 1, 1));
console.log('astar ok=', r.ok, 'visited=', r.visited, 'ms=', r.ms.toFixed(3));
if (r.ok) console.log('path:', r.path.map(function (n) { return n.x + ',' + n.z + ',h' + n.h; }).join(' > '));
