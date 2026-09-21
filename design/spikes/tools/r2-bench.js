#!/usr/bin/env node
/* r2-bench.js —— R2 残余风险实测：床弩「穿透一列」两种实现的单次代价对比
 * A 方案：网格步进（同层轴向逐格查占位）——纯数组操作
 * B 方案：Three.js 真射线（Raycaster vs 87 盒体场景）
 * THREE 从 graybox-f1.html 的内联块加载（vm 裸上下文，走浏览器分支挂载） */
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('D:/code/building/design/spikes/graybox-f1.html', 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(function (m) { return m[1]; });
const ctx = { console: console, Date: Date, Math: Math, performance: performance,
              addEventListener: function () {} };   // 裸沙箱无 DOM：桩掉错误监听
ctx.globalThis = ctx; ctx.self = ctx; ctx.window = ctx;
ctx.navigator = { userAgent: 'r2-bench' };
vm.createContext(ctx);
vm.runInContext(blocks[1], ctx);
const T = ctx.THREE;

/* 场景：重建灰盒的 87 个盒体（20×3 地面 + 墙顶 + 烽燧，同主原型布局） */
vm.runInContext(blocks[0], ctx);
const lv = ctx.buildLevel();
const boxes = [];
for (var hh = 0; hh < 3; hh++)
  for (var x = 0; x < lv.W; x++) for (var z = 0; z < lv.D; z++)
    if (lv.layers[hh][x][z] !== null) {
      var hgt = hh === 0 ? 1.0 : hh * 1.2;
      var mesh = new T.Mesh(new T.BoxGeometry(0.94, hgt, 0.94));
      mesh.position.set(x, hh * 1.2 - hgt / 2, z);
      mesh.updateMatrixWorld(true);
      boxes.push(mesh);
    }
console.log('scene boxes:', boxes.length);

/* A 方案：网格步进（床弩从 (4,1,h1) 沿 +x 同层射，逐格查占位直到无格） */
var occ = {};   // 模拟每格占位（垛口带放 2 个目标）
occ['8,0,1'] = 2; occ['9,0,1'] = 1;
function gridStep() {
  var hits = [];
  for (var cx = 5; cx <= 19; cx++) {
    if (lv.layers[1][cx][0] === null) break;
    if (occ[cx + ',0,1']) hits.push(cx);
  }
  return hits;
}
var t0 = performance.now(), REPS = 100000, acc = 0;
for (var i = 0; i < REPS; i++) acc += gridStep().length;
var aMs = (performance.now() - t0) / REPS;
console.log('A grid-step : avg ' + (aMs * 1000).toFixed(2) + ' us/shot, hits=' + (acc / REPS));

/* B 方案：真射线 vs 87 盒（从 (4,1.2,0) 沿 +x），3 射线/发 模拟一列采样 */
var origin = new T.Vector3(4, 1.2, 0);
var rc = new T.Raycaster(); rc.far = 14;
var dirs = [new T.Vector3(1, 0, -0.18), new T.Vector3(1, 0, 0), new T.Vector3(1, 0, 0.18)];
t0 = performance.now(); REPS = 2000; var rayHits = 0;
for (var i2 = 0; i2 < REPS; i2++) {
  for (var s = 0; s < 3; s++) {
    rc.set(origin, dirs[s]);
    var arr = rc.intersectObjects(boxes, false);
    if (arr.length) rayHits++;
  }
}
var bMs = (performance.now() - t0) / REPS;
console.log('B true-ray  : avg ' + (bMs * 1000).toFixed(1) + ' us/shot (3 rays), hit-rays=' + rayHits + '/' + (REPS * 3));
console.log('ratio B/A   : ' + (bMs / aMs).toFixed(1) + 'x');
