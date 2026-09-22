<script>
/* ============================================================
 * 烽燧·长城攻防 —— GW-P2-SPIKE-F1 灰盒原型（自包含，无外部资源）
 * 结构：本脚本 = F1 数据模型 + 跨层 A* + Three.js 渲染/UI。
 *       boot() 在文件尾、Three.js r160 内联脚本之后调用（零网络，预览面板 CSP 兼容）。
 *
 * 验证目标（《系统拆解》§5.3 四条件）：
 *   条件1 走廊式关卡：单段城墙灰盒（横向 20 列 × 纵深 3 格 × 高度 0-2 层）
 *   条件2 分层 2D 网格 + 显式连接器：§5.2 同构数据模型，跨层 A* 真实求解
 *   条件3 云梯=动态连接器：与坡道共用同一图论模型，架设/摧毁 = 连边/断边
 *   条件4 相机固定档位 + 上层半透明切层：三档位 + ghost，无自由镜头
 * ============================================================ */

/* ---------- 0. 防御性错误层 ---------- */
window.addEventListener('error', function (e) {
  var el = document.getElementById('err');
  if (el) { el.hidden = false;
    el.textContent = 'Spike 运行时错误：' + (e.message || '未知') +
      '\n（灰盒渲染层报错；数据模型与 A* 是纯 JS，可独立审查）'; }
});

/* ---------- 1. 水墨夜巡色调（与 great-wall.html 对齐） ---------- */
var NIGHT = {
  ground: 0x50596a, wall: 0x76828f, walk: 0x93a2b4, merlon: 0x4c5665,
  tower: 0x9a742f,  ramp: 0x9c4a31, ladder: 0xb08b4a, path: 0x62c068,
  bg: 0x0d0f16, ghostOpacity: 0.14
};

/* ============================================================
 * 2. F1 数据模型：分层 2D 网格（与《系统拆解》§5.2 定义同构）
 * ------------------------------------------------------------
 * level.layers[h][x][z] : null=该层无格 | 'ground'|'wall'|'walk'|'merlon'|'tower'
 *   层主序三维数组：h∈{0 地面, 1 墙顶/马道, 2 烽燧顶}。同一 (x,z) 列可同时持有
 *   地面格与墙顶格——「分层 2D 网格」的本义：各层是独立 2D 图，仅在连接器处并边。
 *   ⚠ spike 实测教训：若按列单值 h[x][z] 存高度标签，墙体写入会覆盖同列地面格，
 *   走廊地面在墙段整段断裂（寻路不可达）——F1 GDD 数据节必须写明层主序结构。
 * connectors[]  : { id, kind:'ramp'|'ladder', a:{x,z,h}, b:{x,z,h},
 *                   open:bool, hp:int|null, note }
 *   - 坡道 ramp   = 静态连接器（永远 open，双向）
 *   - 云梯 ladder = 动态连接器（架设 open，摧毁 close；双向）
 *     预留扩展字段位：单向爬升消耗、capacity、破坏阈值（spike 未消费）
 * 寻路图：同层 (x,z,h) 4 邻接 ∪ 连接器 a↔b 并边；跨层仅经连接器。
 * 占位容量（R1 残余风险）：unitCap=2，每格并发单位上限（spike 仅在日志演示）。
 * ============================================================ */
function N3(x, z, h) { return { x: x, z: z, h: h }; }
var TYPES = { ground: 0, wall: 1, walk: 1, merlon: 1, tower: 2 };  // 类型→层归属
var TYPE_COLORS = { ground: NIGHT.ground, wall: NIGHT.wall, walk: NIGHT.walk,
                    merlon: NIGHT.merlon, tower: NIGHT.tower };

function buildLevel() {
  var W = 20, D = 3;
  var layers = [];
  for (var hh = 0; hh < 3; hh++) {
    var plane = [];
    for (var x = 0; x < W; x++) { var row = []; for (var z = 0; z < D; z++) row.push(null); plane.push(row); }
    layers.push(plane);
  }
  var x, z;
  for (x = 0; x < W; x++) for (z = 0; z < D; z++) {
    if (z === 2 && x >= 11) continue;      // 烽燧基座占位：其投影下不设地面格
    layers[0][x][z] = 'ground';            // 地面层（匈奴集结/冲锋）
  }
  for (x = 2; x <= 10; x++) for (z = 0; z < D; z++) layers[1][x][z] = 'wall';  // 墙顶 x∈[2,10]
  for (x = 5; x <= 7; x++) for (z = 0; z < D; z++) layers[1][x][z] = 'walk';   // 中段马道
  for (x = 2; x <= 10; x++) layers[1][x][0] = 'merlon';                        // 垛口带 z=0
  for (x = 11; x < W; x++) layers[2][x][2] = 'tower';                          // 烽燧顶 x∈[11,19]

  return {
    W: W, D: D, layers: layers,           // layers[h][x][z] = 类型 | null
    connectors: [
      { id: 'R1', kind: 'ramp',   a: N3(11, 1, 0), b: N3(10, 1, 1), open: true, hp: null, note: '守军马道坡道·静态连接器' },
      { id: 'R2', kind: 'ramp',   a: N3(10, 2, 1), b: N3(11, 2, 2), open: true, hp: null, note: '烽燧梯道·静态连接器' },
      { id: 'L1', kind: 'ladder', a: N3(3, 0, 0),  b: N3(3, 0, 1),  open: true, hp: 3,    note: '匈奴云梯·垛口位·动态连接器' },
      { id: 'L2', kind: 'ladder', a: N3(10, 0, 0), b: N3(10, 0, 1), open: true, hp: 3,    note: '匈奴云梯·角楼位·动态连接器' }
    ],
    unitCap: 2                            // R1 占位容量 MVP 定值：每格 2
  };
}

/* ---------- 3. 图邻居：同层 4 邻接 ∪ 连接器并边（条件2/3 核心） ---------- */
function neighborsOf(lv, n) {
  var out = [];
  var d4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (var i = 0; i < 4; i++) {
    var ax = n.x + d4[i][0], az = n.z + d4[i][1];
    if (ax >= 0 && ax < lv.W && az >= 0 && az < lv.D &&
        lv.layers[n.h][ax][az] !== null) out.push({ x: ax, z: az, h: n.h });
  }
  for (var c = 0; c < lv.connectors.length; c++) {
    var cn = lv.connectors[c];
    if (!cn.open) continue;                 // 动态连接器断边 = 不可通行（摧毁生效点）
    if (cn.a.x === n.x && cn.a.z === n.z && cn.a.h === n.h) out.push(cn.b);
    else if (cn.b.x === n.x && cn.b.z === n.z && cn.b.h === n.h) out.push(cn.a);
  }
  return out;
}

/* 边成本：垛口 1.5（翻越），坡道边 1.4（梯道），云梯边 1.8（爬升慢；未来可加 hp 消耗） */
function edgeCost(lv, from, to) {
  for (var c = 0; c < lv.connectors.length; c++) {
    var cn = lv.connectors[c];
    if (cn.open &&
        ((cn.a.x === from.x && cn.a.z === from.z && cn.a.h === from.h && cn.b.x === to.x && cn.b.z === to.z && cn.b.h === to.h) ||
         (cn.b.x === from.x && cn.b.z === from.z && cn.b.h === from.h && cn.a.x === to.x && cn.a.z === to.z && cn.a.h === to.h)))
      return cn.kind === 'ladder' ? 1.8 : 1.4;
  }
  return lv.layers[to.h][to.x][to.z] === 'merlon' ? 1.5 : 1.0;
}

/* ---------- 4. 跨层 A*（曼哈顿 + 层差×1.4 启发；1.4=最便宜跨层边，保证可采纳） ---------- */
function aStar(lv, start, goal) {
  var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function key(n) { return n.x + ',' + n.z + ',' + n.h; }
  function hEst(n) {
    return Math.abs(n.x - goal.x) + Math.abs(n.z - goal.z) + Math.abs(n.h - goal.h) * 1.4;
  }
  var open = [{ n: start, g: 0, f: hEst(start) }];
  var gScore = {}; gScore[key(start)] = 0;
  var came = {};
  var visited = 0;

  while (open.length) {
    var bi = 0;
    for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    var cur = open.splice(bi, 1)[0];
    var ck = key(cur.n);
    if (gScore[ck] < cur.g) continue;       // 陈旧堆项
    visited++;
    if (cur.n.x === goal.x && cur.n.z === goal.z && cur.n.h === goal.h) {
      var path = [cur.n], k2 = ck;
      while (came[k2]) { path.unshift(came[k2]); k2 = key(came[k2]); }
      var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      return { path: path, visited: visited, ms: (t1 - t0), ok: true };
    }
    var nb = neighborsOf(lv, cur.n);
    for (var j = 0; j < nb.length; j++) {
      var nn = nb[j], nk = key(nn);
      var ng = cur.g + edgeCost(lv, cur.n, nn);
      if (gScore[nk] === undefined || ng < gScore[nk]) {
        gScore[nk] = ng; came[nk] = cur.n;
        open.push({ n: nn, g: ng, f: ng + hEst(nn) });
      }
    }
  }
  var t2 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return { path: null, visited: visited, ms: (t2 - t0), ok: false };
}

/* ---------- 5. Three.js 场景（灰盒渲染层） ---------- */
function boot() {
  var THREE = window.THREE;                 // 内联 r160（文件尾脚本），零网络
  var lv = buildLevel();
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT.bg);
  scene.fog = new THREE.Fog(NIGHT.bg, 46, 96);

  var camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 300);
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.getElementById('app').appendChild(renderer.domElement);
  addEventListener('resize', function () {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  scene.add(new THREE.AmbientLight(0xbfd0e8, 0.55));
  var key = new THREE.DirectionalLight(0xd8e6ff, 1.0); key.position.set(14, 22, 10); scene.add(key);
  var warm = new THREE.DirectionalLight(0xffb37a, 0.35); warm.position.set(-16, 8, -8); scene.add(warm);

  /* --- 5.1 网格实例化：每层一个 InstancedMesh（切层渲染=直接改层材质，见 5.3） --- */
  var WALLH = 1.2;                          // 层高：顶面 y = h * 1.2
  function cellTop(n) { return new THREE.Vector3(n.x, (n.h || 0) * WALLH, n.z); }
  function cellHeight(hh) { return hh === 0 ? 1.0 : hh * WALLH; } // 盒高 1 / 1.2 / 2.4（顶面对齐）
  function colorOf(tt) { return TYPE_COLORS[tt] || 0xffffff; }

  var cells = [];
  for (var hh = 0; hh < 3; hh++)
    for (var x = 0; x < lv.W; x++) for (var z = 0; z < lv.D; z++)
      if (lv.layers[hh][x][z] !== null) cells.push({ x: x, z: z, h: hh });

  var m4 = new THREE.Matrix4(), col = new THREE.Color();
  function setCellMatrix(mesh, i, c) {
    var hh = cellHeight(c.h);
    m4.makeTranslation(c.x, c.h * WALLH - hh / 2, c.z);  // 顶面恒为 h*WALLH
    m4.scale(new THREE.Vector3(1, hh, 1));
    mesh.setMatrixAt(i, m4);
  }
  var layerMeshes = {};                     // h -> InstancedMesh
  [0, 1, 2].forEach(function (hh) {
    var list = cells.filter(function (c) { return c.h === hh; });
    var mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.94, 1, 0.94),
      new THREE.MeshLambertMaterial(), list.length);
    list.forEach(function (c, i) {
      setCellMatrix(mesh, i, c);
      mesh.setColorAt(i, col.setHex(colorOf(lv.layers[c.h][c.x][c.z])));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    layerMeshes[hh] = mesh;
  });

  /* --- 5.2 连接器可视体（坡道斜板 lookAt 朝向 / 云梯贴墙面外侧） --- */
  function refreshConnectorVisual(cn) {
    if (cn.visual) { scene.remove(cn.visual.mesh); cn.visual = null; }
    var ta = cellTop(cn.a), tb = cellTop(cn.b);
    if (cn.kind === 'ramp') {
      var mid = ta.clone().add(tb).multiplyScalar(0.5); mid.y -= 0.08;
      var len = ta.distanceTo(tb);
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.26, len * 1.05),
        new THREE.MeshLambertMaterial({ color: NIGHT.ramp }));
      mesh.position.copy(mid);
      mesh.lookAt(tb.x, tb.y - 0.08, tb.z);            // 局部 +Z 指向高端
      scene.add(mesh); cn.visual = { mesh: mesh };
    } else {
      var grp = new THREE.Group();
      var lmat = new THREE.MeshLambertMaterial({ color: NIGHT.ladder });
      var railG = new THREE.BoxGeometry(0.07, 1.7, 0.07);
      var r1 = new THREE.Mesh(railG, lmat); r1.position.set(-0.13, 0, 0); grp.add(r1);
      var r2 = new THREE.Mesh(railG, lmat); r2.position.set(0.13, 0, 0); grp.add(r2);
      for (var r = 0; r < 5; r++) {
        var rung = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), lmat);
        rung.position.set(0, -0.55 + r * 0.28, 0); grp.add(rung);
      }
      grp.position.set((ta.x + tb.x) / 2, (ta.y + tb.y) / 2 - 0.05, (ta.z + tb.z) / 2 - 0.58);
      scene.add(grp); cn.visual = { mesh: grp };
    }
  }
  lv.connectors.forEach(refreshConnectorVisual);

  /* --- 5.3 切层渲染：相机档位 focusH 以上的层整层半透明（条件4） --- */
  var ghostOn = true;
  function applyLayerGhost(focusH) {
    [0, 1, 2].forEach(function (hh) {
      var m = layerMeshes[hh].material;
      var ghost = ghostOn && (hh > focusH);
      m.transparent = ghost; m.opacity = ghost ? NIGHT.ghostOpacity : 1.0;
      m.depthWrite = !ghost; m.needsUpdate = true;
    });
  }

  /* --- 5.4 相机固定档位（不做自由镜头） --- */
  function v3(px, py, pz) { return new THREE.Vector3(px, py, pz); }
  var camPose = {
    0: { pos: v3(10, 15.0, 16.0), look: v3(10, 0, 1) },
    1: { pos: v3(9, 9.5, 11.0),  look: v3(7, 1.2, 1) },
    2: { pos: v3(15, 8.5, 9.5),  look: v3(15, 2.4, 2) }
  };
  var camTarget = camPose[0], camLook = camPose[0].look.clone(), camLerpT = 1;
  function setCamTier(tier) {
    camTarget = camPose[tier]; camLook = camTarget.look.clone(); camLerpT = 0;
    [btnC0, btnC1, btnC2].forEach(function (b, i) { b.classList.toggle('on', i === tier); });
    applyLayerGhost(tier);                  // 档位联动切层
  }

  /* --- 5.5 路径可视化 + 单位离散移动（回合制：一格一节拍） --- */
  var pathGroup = new THREE.Group(); scene.add(pathGroup);
  function drawPath(path) {
    while (pathGroup.children.length) pathGroup.remove(pathGroup.children[0]);
    var geo = new THREE.BoxGeometry(0.42, 0.08, 0.42);
    var mat = new THREE.MeshBasicMaterial({ color: NIGHT.path });
    path.forEach(function (n) {
      var q = new THREE.Mesh(geo, mat);
      q.position.copy(cellTop(n)); q.position.y += 0.07;
      pathGroup.add(q);
    });
  }
  var movers = [];
  function moveUnitAlong(grp, path, segMs, onDone) {
    movers.push({ grp: grp, path: path, leg: 0, t: 0, segMs: segMs || 240, onDone: onDone || null });
  }
  var clock = new THREE.Clock();
  function tick() {
    requestAnimationFrame(tick);
    var dt = Math.min(clock.getDelta(), 0.1);
    if (camLerpT < 1) {
      camLerpT = Math.min(1, camLerpT + dt * 2.2);
      var e = 1 - Math.pow(1 - camLerpT, 3);
      camera.position.lerp(camTarget.pos, e * 0.35 + 0.001);
      camLook.lerp(camTarget.look, e * 0.35 + 0.001);
      camera.lookAt(camLook);
      if (camLerpT >= 1) {                    // 到位吸附：插值因子渐近但不恒等于 1
        camera.position.copy(camTarget.pos);
        camLook.copy(camTarget.look);
        camera.lookAt(camLook);
      }
    }
    for (var i = movers.length - 1; i >= 0; i--) {
      var mv = movers[i];
      mv.t += dt * 1000 / mv.segMs;
      while (mv.t >= 1 && mv.leg < mv.path.length - 1) { mv.t -= 1; mv.leg++; }
      var a = cellTop(mv.path[mv.leg]);
      var b = cellTop(mv.path[Math.min(mv.leg + 1, mv.path.length - 1)]);
      mv.grp.position.lerpVectors(a, b, Math.min(mv.t, 1));
      if (mv.leg >= mv.path.length - 1 && mv.t >= 1) {
        if (mv.onDone) { var cb = mv.onDone; mv.onDone = null; cb(); }
        movers.splice(i, 1);
      }
    }
    renderer.render(scene, camera);
  }

  /* --- 5.6 单位（G1 守军 / G2 守军 / 匈奴占位演示） --- */
  function makeUnit(color) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshLambertMaterial({ color: color }));
    body.position.y = 0.25; g.add(body);
    var dot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    dot.position.y = 0.62; g.add(dot);
    scene.add(g); return g;
  }
  var uG1 = makeUnit(0x69b46e);             // G1：地面→云梯→墙顶
  var uG2 = makeUnit(0x69b46e);             // G2：墙顶→坡道→烽燧顶
  var uH  = makeUnit(0xc2563e);             // 匈奴：与 G1 同格 → 演示每格容量 2/2
  function place(grp, n) { grp.position.copy(cellTop(n)); }
  place(uG1, N3(1, 1, 0)); place(uH, N3(1, 1, 0)); place(uG2, N3(9, 1, 1));

  /* --- 5.7 UI 绑定 --- */
  var $ = function (id) { return document.getElementById(id); };
  function findC(id) {
    for (var i = 0; i < lv.connectors.length; i++)
      if (lv.connectors[i].id === id) return lv.connectors[i];
    return null;
  }
  var logEl = $('log'), logCount = 0;
  function log(msg, cls) {
    var d = new Date();
    var ts = ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
    var row = document.createElement('div');
    if (cls) row.className = cls;
    row.innerHTML = '<span class="t">[' + ts + ']</span> ' + msg;
    logEl.appendChild(row); logEl.scrollTop = logEl.scrollHeight;
    if (++logCount > 40) { logEl.removeChild(logEl.firstChild); logCount--; }
  }
  function A2S(n) { return '(' + n.x + ',' + n.z + ',h' + n.h + ')'; }

  function runDemo(which) {
    var res, label, grp;
    if (which === 'g1')      { res = aStar(lv, N3(1, 1, 0),  N3(6, 1, 1));  label = 'G1 地面→云梯→墙顶'; grp = uG1; }
    else if (which === 'g2') { res = aStar(lv, N3(9, 1, 1),  N3(15, 2, 2)); label = 'G2 墙顶→坡道→烽燧顶'; grp = uG2; }
    else                     { res = aStar(lv, N3(15, 2, 2), N3(9, 1, 1));  label = 'G2 烽燧→墙顶'; grp = uG2; }
    if (!res.ok) {
      log('✗ ' + label + '：<b>不可达</b>（展开 ' + res.visited + ' 节点 / ' + res.ms.toFixed(2) + 'ms）', 'bad');
      drawPath([]); return;
    }
    log('✓ ' + label + '：' + res.path.length + ' 格 · 展开 ' + res.visited + ' 节点 · ' +
        res.ms.toFixed(2) + 'ms · ' + A2S(res.path[0]) + ' → ' + A2S(res.path[res.path.length - 1]), 'ok');
    drawPath(res.path);
    grp.position.copy(cellTop(res.path[0]));
    moveUnitAlong(grp, res.path, 230);
  }

  $('btn-g1').onclick  = function () { runDemo('g1'); };
  $('btn-g2').onclick  = function () { runDemo('g2'); };
  $('btn-g2b').onclick = function () { runDemo('g2b'); };

  $('btn-cut').onclick = function () {
    var cn = findC('L1');
    cn.open = false;
    if (cn.visual) cn.visual.mesh.visible = false;
    $('btn-cut').hidden = true; $('btn-fix').hidden = false;
    log('✂ 云梯 L1 被摧毁 → 连接器断边 ' + A2S(cn.a) + ' ↮ ' + A2S(cn.b) +
        '（数据改动仅 open=true→false 一处）', 'bad');
  };
  $('btn-fix').onclick = function () {
    var cn = findC('L1');
    cn.open = true;
    if (cn.visual) cn.visual.mesh.visible = true;
    $('btn-cut').hidden = false; $('btn-fix').hidden = true;
    log('🔧 云梯 L1 重新架设 → 连接器恢复连边', 'ok');
  };

  var btnC0 = $('cam-0'), btnC1 = $('cam-1'), btnC2 = $('cam-2');
  btnC0.onclick = function () { setCamTier(0); };
  btnC1.onclick = function () { setCamTier(1); };
  btnC2.onclick = function () { setCamTier(2); };
  $('btn-ghost').onclick = function () {
    ghostOn = !ghostOn;
    this.textContent = '上层半透明：' + (ghostOn ? '开' : '关');
    this.classList.toggle('on', ghostOn);
    var tier = btnC1.classList.contains('on') ? 1 : (btnC2.classList.contains('on') ? 2 : 0);
    applyLayerGhost(tier);
  };

  /* --- 5.8 诊断：性能与 R2 射线 --- */
  $('btn-perf').onclick = function () {
    var times = [], sumV = 0, loops = 2000, bad = 0;
    for (var i = 0; i < loops; i++) {
      var r = aStar(lv, N3(0, i % 3, 0), N3(15 + (i % 3), 2, 2));
      times.push(r.ms); sumV += r.visited;
      if (!r.ok) bad++;
    }
    var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
    var mx = Math.max.apply(null, times);
    log('▶ 压测 ' + times.length + '/' + loops + ' 次（' + cells.length + ' 格有向图）：平均 ' +
        avg.toFixed(3) + 'ms · 最差 ' + mx.toFixed(3) + 'ms · 平均展开 ' +
        Math.round(sumV / times.length) + ' 节点 · 失败 ' + bad, 'ok');
  };
  $('btn-ray').onclick = function () {
    var origin = cellTop(N3(4, 1, 1)); origin.y += 0.05;
    var rc = new THREE.Raycaster(); rc.far = 14;
    var samples = [-0.18, 0, 0.18];         // z 微调，模拟「一列多目标」采样
    var t0 = performance.now(), REPS = 2000, hits = 0;
    for (var i = 0; i < REPS; i++) {
      for (var s = 0; s < samples.length; s++) {
        var dir = new THREE.Vector3(1, 0, samples[s]).normalize();
        rc.set(origin, dir);
        var arr = rc.intersectObjects(scene.children, true);
        for (var k = 0; k < arr.length; k++) {
          if (arr[k].distance > 0.6) { hits++; break; }   // 跳过自身格
        }
      }
    }
    var dt = (performance.now() - t0) / REPS;
    log('▶ R2 射线压测：' + REPS + ' 帧 × 3 射线 · 平均 ' + dt.toFixed(3) + 'ms/帧 · 命中采样 ' + hits, 'ok');
    log('　R2 结论：同层轴向「列」优先用网格步进 O(列长) 零射线；跨层射线判定代价见报告', '');
  };

  setCamTier(0);
  log('灰盒就绪 · 走廊 ' + lv.W + '×' + lv.D + ' × 3 层 · ' + cells.length + ' 格 · ' +
      lv.connectors.length + ' 连接器（2 坡道 + 2 云梯）· 每格容量 ' + lv.unitCap, 'ok');
  log('操作：① G1 爬梯上墙 → ② G2 上烽燧 → ✂ 毁 L1 → 再点 ① 看绕行 → ③ 返程验证坡道双向', '');
  log('提示：G1 与匈奴单位同格 (1,1,h0) —— 演示占位容量 2/2', '');
  tick();
}

/* ---------- 6. 启动引导（真正的调用在文件尾、THREE 内联之后） ---------- */
function showFatal(msg) {
  var el = document.getElementById('err');
  el.hidden = false;
  el.textContent = msg || 'THREE 内联加载失败（脚本被截断或 CSP 拦截）';
}
</script>

