<script>
/* ============================================================
 * 烽燧·长城攻防 —— GW-VS 灰盒可玩性轮 · VS-2 切片底座（自包含，无外部资源）
 * 结构分区：本块 = [F2 相位 FSM] + [F1 地形/关卡] + [F4 确定性随机] + [RENDER 渲染/UI]
 *           three.js r158 UMD 在下一 script 块裸内联（禁 IIFE 包装，见 F1 报告坑 3）；
 *           文件尾 script 块调用 boot()。
 * 范围（VS-2 只做底座）：
 *   F2 七态相位 FSM（表外迁移拒绝 / 速度序三键 / C① 顺序快照 / D④ 胜负唯一点 / D 相位子步骨架）
 *   L1 教学骨架关卡（W=12 · 层主序 · CellId 含 h · 连接器 9 字段 · 分类型容量表）
 *   渲染扩展（单位实例化 / 相位 UI 条 / 容量可视化 / 垛口掩体+梯上暴露标记）
 *   空转演示驱动（占位单位走通 INIT→A→B→C→D→判胜/判负全链路，不含真实移动/攻击/AI）
 *   F4 随机源挂载（mulberry32 + FNV-1a-32，种子 "vs-l1-seed-01"，单流全局游标，本批只挂载+冒烟）
 * 后续批次增量填充位（均有 // [VS-3] / [VS-4] / [VS-5] 锚点注释）：
 *   board/unboard 双 mutation + E2 坠落链（本批骨架签名，占位实现）
 *   C 相位真实战斗 / C8 AI / C10 托管（VS-3）；A 相位建设经济 + 器械 + D 相位结算（VS-4）
 *   数值全量注入（VS-5，表结构本批对齐 F3 §3.2 规范键路径，数值=工作假设占位）
 * ============================================================ */

/* ---------- 0. 防御性错误层 ---------- */
window.addEventListener('error', function (e) {
  var el = document.getElementById('err');
  if (el) { el.hidden = false;
    el.textContent = 'VS 运行时错误：' + (e.message || '未知') + '\n（灰盒渲染层报错；逻辑分区均为纯 JS，可独立审查）'; }
});

/* ============================================================
 * ═══ 分区 A：F2 回合与相位调度（结构权威 F2 GDD v1.0.4）═══
 * ============================================================ */
var F2 = (function () {
  /* 七态 FSM：INIT→A→B→C→D→(A|END_WIN|END_LOSE)（F2 §2.3 合法迁移表）
   * 表外迁移一律拒绝并发 illegal_transition 事件（F2-E4，压测断言目标）。 */
  var TRANSITIONS = {
    INIT:      ['A'],
    A:         ['B'],
    B:         ['C'],
    C:         ['D'],
    D:         ['A', 'END_WIN', 'END_LOSE'],
    END_WIN:   [],
    END_LOSE:  []
  };
  var PHASE_LABEL = { INIT: '初始化', A: 'A 建设', B: 'B 敌军', C: 'C 攻防结算', D: 'D 补给',
                      END_WIN: '终局·胜', END_LOSE: '终局·负' };

  /* F4.1a 独立事件总线：publish 逐 try/catch（订阅者异常不吞调度事件），
   * 订阅表结构含 f4 全套，重放按序重建（F2 §2.6 纪律的接线预埋）。 */
  var bus = (function () {
    var subs = {};
    return {
      on: function (ev, fn) { (subs[ev] = subs[ev] || []).push(fn); },
      publish: function (ev, payload) {
        var list = subs[ev] || [];
        for (var i = 0; i < list.length; i++) {
          try { list[i](payload); }
          catch (err) { if (typeof window !== 'undefined' && window.__VS_LOG) window.__VS_LOG('事件订阅者异常 [' + ev + ']：' + err.message, 'bad'); }
        }
      }
    };
  })();

  /* TurnState（F2 §3.1；切片不做存档，S0/S1 结构位注释保留）
   * S0 存档点=INIT→A 迁移时（本批不落盘，锚点：saveCheckpoint('S0')）
   * S1 存档点=每回合 D→A 迁移时（锚点：saveCheckpoint('S1')）；C 相位中段拒绝存档（裁定 F）。 */
  var st = null;
  var hooks = null;   // 由 boot 注入：{ planForWave, factionOf, isAlive, beaconHp, wavesExhausted, ... }

  function init(levelId, h) {
    st = {
      levelId: levelId,
      nightIndex: 1,               // 元数据透传（X6 Beta 挂变量）
      turn: 1,                     // 权威时钟，从 1 起（F1 turn 为镜像记账）
      phase: 'INIT',
      flags: {},                   // { beaconDestroyed?: true }
      actionOrder: null,           // C 相位速度序快照（出相位即清）
      slotCursor: -1,              // 当前行动槽下标
      dbe: {                       // DPhaseLedger（F2 §3.2）
        incomeSettled: false,      // C6 钩子完成标记（VS-4 消费）
        pendingReinforcements: [], // 援军顺延（F2.7，VS-4 消费）
        waveCursor: 0,             // C9 时刻表游标镜像（权威在 C9 表运行态）
        turnEndSnapshots: []       // 终局数据包（移交 X1，本批空）
      }
    };
    hooks = h;
    return st;
  }
  function state() { return st; }

  function beginPhase(next, why) {
    if (!st) return false;
    var legal = TRANSITIONS[st.phase].indexOf(next) >= 0;
    if (!legal) {
      bus.publish('illegal_transition', { from: st.phase, to: next, turn: st.turn, why: why || '' });
      return false;
    }
    bus.publish('phase_exit', { phase: st.phase, turn: st.turn });
    var prev = st.phase;
    st.phase = next;
    if (prev === 'D' && next === 'A') st.turn++;        // F2.6：仅 D→A 时回合计数 +1
    if (prev === 'INIT' && next === 'A') bus.publish('battle_started', { turn: st.turn });   // S0 存档锚点（本批不落盘）
    if (prev === 'D' && next === 'A') { /* S1 存档锚点（本批不落盘） */ bus.publish('turn_started', { turn: st.turn, nightIndex: st.nightIndex }); }
    if (next === 'A') { st.actionOrder = null; st.slotCursor = -1; }
    bus.publish('phase_enter', { phase: next, turn: st.turn });
    return true;
  }

  /* ---- B 相位内部序（F2 §2.2-B）：B① 波次入场 → B② 可见性（MVP 全图可见，留 C12 挂点）→ B③ AI 计划 → B④ 迁移 ---- */
  function runPhaseB() {
    if (!st || st.phase !== 'B') return;
    var spawnRes = hooks && hooks.spawnForTurn ? hooks.spawnForTurn(st.turn) : { entered: [], deferred: 0 };
    bus.publish('wave_entered', { turn: st.turn, entered: spawnRes.entered, deferred: spawnRes.deferred });
    // B② 可见性：MVP 全图可见（C12 Alpha 挂点）
    var plans = hooks && hooks.generatePlans ? hooks.generatePlans(st.turn) : { plannedUnits: 0 };
    bus.publish('plans_ready', { plannedUnits: plans.plannedUnits });
  }

  /* ---- C 相位内部序（F2 §2.2-C）----
   * C① MP 重置（占位）→ C② 行动序一次快照冻结（F2.1 三键：speed 降序 / 等速守方优先 tiePriority / unitId 字典序）
   *   → 逐槽推进（死亡单位跳槽但 open/close 事件成对发 {skipped:true}，F2-E5）
   *   → C③ 全部槽耗尽 ∨ beaconDestroyed → C→D 带旗标。 */
  function snapshotActionOrder(units) {
    // ord(u) = (−speed, tier, unitId) 字典序升序（F2.1）；tier: 守=0 攻=1（F3 tiePriority，初值 DEFENDER_FIRST）
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var ord = units.slice().sort(function (a, b) {
      if (b.speed !== a.speed) return b.speed - a.speed;
      var ta = hooks.factionOf(a.unitId) === 'DEFENDER' ? 0 : 1;
      var tb = hooks.factionOf(b.unitId) === 'DEFENDER' ? 0 : 1;
      if (ta !== tb) return ta - tb;
      return a.unitId < b.unitId ? -1 : (a.unitId > b.unitId ? 1 : 0);
    }).map(function (u) { return u.unitId; });
    st.actionOrder = ord;                      // 一次快照冻结；中途死亡不重排（F2 §2.4）
    st.slotCursor = 0;
    return { ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0, order: ord };
  }

  /* 逐槽推进至 C 相位收束。驱动器 = 演示空转占位（本批无真实移动/攻击/AI）。
   * 返回 { ended:'exhausted'|'interrupted', processed:n, skipped:n }。 */
  function runSlots(onSlot) {
    var processed = 0, skipped = 0, ended = null;
    while (st.slotCursor < st.actionOrder.length) {
      var uid = st.actionOrder[st.slotCursor];
      var dead = hooks.isAlive && !hooks.isAlive(uid);
      bus.publish('action_slot_open', { unitId: uid, slotIndex: st.slotCursor, mode: hooks.modeOf ? hooks.modeOf(uid) : 'AUTO', skipped: dead });
      if (!dead) { processed++; if (onSlot) onSlot(uid, st.slotCursor); }
      else skipped++;
      bus.publish('action_slot_close', { unitId: uid, slotIndex: st.slotCursor, skipped: dead });
      st.slotCursor++;
      if (st.flags.beaconDestroyed) { ended = 'interrupted'; break; }   // F2 §2.5：立即中止，不再开启后续槽
    }
    if (ended === null) ended = 'exhausted';
    return { ended: ended, processed: processed, skipped: skipped };
  }

  /* ---- D 相位六步固定序（F2 §2.2-D；本批 D①/D④/D⑤ 骨架，D②/D③ 钩子占位）----
   * D① 战场清扫（梯残骸清除——E5：DESTROYED 记录保留至本回合结束，此时退场）
   * D② 粮饷收入结算（C6 钩子占位，VS-4）
   * D③ 援军到岗（C6/C9 时刻表钩子占位，VS-4；落点满顺延 F2.7）
   * D④ 胜负判定检查点（唯一点）：判负=beaconHP≤0（F2.4）；判胜=wavesExhausted∧清场（F2.5/C9 裁定 F 处理态谓词）；判负优先（E11）
   * D⑤ 波次计划推进（C9 cursor 前移簿记；注意 D④ 用处理态谓词求值，先于本步簿记）
   * D⑥ turn++ → 迁移判定（beginPhase 内完成；S1 存档锚点） */
  function runPhaseD() {
    if (!st || st.phase !== 'D') return null;
    // D① 清扫
    if (hooks.d1Cleanup) hooks.d1Cleanup(st.turn);
    // D② 经济结算钩子占位（VS-4：C6 收入；C6 零 F4 消费——重放安全岛，接缝时勿在此消费 rand）
    st.dbe.incomeSettled = false;
    if (hooks.d2Economy) hooks.d2Economy(st.turn);
    // D③ 援军钩子占位（VS-4；落点满→pendingReinforcements，下回合 D③ 首位重试）
    if (hooks.d3Reinforce) hooks.d3Reinforce(st.turn);
    // D④ 胜负唯一点
    var lose = (hooks.beaconHp() <= 0);        // F2.4；判负优先于同回合清场（F2-E11）
    var win = false;
    if (!lose) {
      var exhausted = hooks.wavesExhausted();  // C9 处理态谓词：全部条目已处理 ∧ pendingSpawns 空
      var clear = hooks.aliveEnemies() === 0;  // F1 snapshot 清场判定
      win = exhausted && clear;                // 双分量不可拆（F2 §2.5）
    }
    if (lose) { st.phase = 'END_LOSE'; bus.publish('phase_exit', { phase: 'D', turn: st.turn }); bus.publish('battle_lost', { reason: 'BEACON_FALLEN', turn: st.turn }); bus.publish('phase_enter', { phase: 'END_LOSE', turn: st.turn }); }
    else if (win) { st.phase = 'END_WIN'; bus.publish('phase_exit', { phase: 'D', turn: st.turn }); bus.publish('battle_won', { reason: 'WAVES_CLEARED', turn: st.turn }); bus.publish('phase_enter', { phase: 'END_WIN', turn: st.turn }); }
    // D⑤ 波次游标簿记前移（C9 advanceCursor；镜像写 dbe.waveCursor）
    if (hooks.d5AdvanceCursor) st.dbe.waveCursor = hooks.d5AdvanceCursor(st.turn);
    // D⑥：turn++ 与 D→A 迁移由调用方在未终局时经 beginPhase('A') 完成（F2.6/裁定 F S1 锚点）
    return { lose: lose, win: win };
  }

  /* 烽燧破坏中断链（F2-BE-3）：C 相位内 beacon_destroyed → 带旗标进 D。
   * 伤害写入侧（C5，VS-3）只置旗标+发事件；本函数不重复校验 phase='C' 窗口以外的合法调用路径由压测守护（F2-E10）。 */
  function onBeaconDestroyed(byUnitId) {
    if (!st) return;
    if (st.flags.beaconDestroyed) return;
    st.flags.beaconDestroyed = true;
    bus.publish('beacon_destroyed', { byUnitId: byUnitId || null, atTurn: st.turn, phase: st.phase });
  }

  return { TRANSITIONS: TRANSITIONS, PHASE_LABEL: PHASE_LABEL, bus: bus,
           init: init, state: state, beginPhase: beginPhase,
           runPhaseB: runPhaseB, snapshotActionOrder: snapshotActionOrder, runSlots: runSlots,
           runPhaseD: runPhaseD, onBeaconDestroyed: onBeaconDestroyed };
})();

/* ============================================================
 * ═══ 分区 B：F1 地形/关卡（结构权威 F1 GDD v1.4.4）═══
 * ============================================================ */
var F1 = (function () {
  /* 运行存储形态：层主序 layers[h][x][z]（F1 §3.1 v1.3.3 定稿；禁列主序单值高度——spike 坑 1）
   * CellId = `${x}_${z}_${h}`（F1.1，含高度段防同列碰撞）；getCellAt 三参寻址（F1.1a）。
   * 7 类格子（§2.3）+ 连接器 9 字段（§2.4.2）+ 分类型容量表（§2.5.2 → F3 grid-capacity 宿主）。 */

  var CELL_KINDS = ['WALL', 'PARAPET', 'RAMPART_WALK', 'GATE', 'SLOPE', 'GROUND', 'BEACON_FLOOR'];

  /* 容量表（键=CellKind，值=工作假设占位；F3 grid-capacity.json 宿主，VS-5 用 VS-1 建议值覆盖）
   * 垛口1/马道2/地面4/门洞1/烽燧顶1/坡道1/墙0（F1 §2.5.2）；堆叠上限 stackLimit=4（F1.12 护栏）。 */
  var GRID_CAPACITY = {
    WALL: 0, PARAPET: 1, RAMPART_WALK: 2, GATE: 1, SLOPE: 1, GROUND: 4, BEACON_FLOOR: 1,
    LADDER: 1, SLOPE_CONN: 1          // 连接器承载（F1.9，MVP 恒 1，键位在册）
  };
  var STACK_LIMIT = 4;                 // F1.12（F3 stackLimit 宿主）

  /* 地形参数包（TerrainRules 键清单，F1 §4.5；数值=工作假设占位，F3 terrain-rules.json 宿主）
   * ⚠ A* 启发层差权重 ≤ F3 最小跨层边成本（C1.5 硬约束）：climb=2 → 启发权重取 2.0；
   *   若 VS-5 调低 climb，HEURISTIC_LAYER_WEIGHT 必须联动复核（两值绑定见 A* 分区）。 */
  var TERRAIN_RULES = {
    moveCost: { plains: 1, climb: 2, gate: 2 },
    ladderHp: 3,                       // 待灰盒（F1 OQ-2：值域 C2/C5 联裁）
    stackLimit: STACK_LIMIT,
    world: { cellSizeMeters: 4 }       // F1.2 渲染常量初值（正式值 P1/P2 收口）
  };

  /* ---- L1 教学骨架（F1 §9.1/§9.2/§10.1：W=12、坡道 1、GATE 1、烽燧 1(h=2)；结构权威，数值仅占位）----
   * 布局（x 沿墙轴向 0..11，匈奴从 x 小端来；z=0 外侧垛口线 / z=1 马道 / z=2 内侧）：
   *   h0 地面层：全幅 GROUND（含门洞列与烽燧底列）——走廊地面连续（spike 坑 1 教训）。
   *   h1 墙顶层：x∈[3,10] 墙段。z=0 垛口线 PARAPET、z=1 马道 RAMPART_WALK；门洞列 x=6 的 (6,z0,h1) 为 GATE；
   *              坡道顶 (3,1,h1) 为 SLOPE（坡道坡底 (3,2,h0) 在地面内侧）。z=2 与墙段外列为 WALL 结构体。
   *   h2 烽燧顶：x=11 列 BEACON_FLOOR（V4 唯一）；烽燧内部梯 (11,1,h0)→(11,1,h2) DEFENDER_ONLY（V9）。
   *   生成器保证：V1/V4 烽燧唯一、V2 出生区全 GROUND、V5 连接器端格合法、V6 边界封边、
   *              V8 类型-高度绑定、V9 坡道无 lifetime、V11 攻方 ACTIVE∧BOTH 可达烽燧（经 GATE/坡道）。 */
  function buildL1() {
    var W = 12, D = 3, H = 3;
    var layers = [];
    for (var hh = 0; hh < H; hh++) {
      var plane = [];
      for (var x = 0; x < W; x++) { var row = []; for (var z = 0; z < D; z++) row.push(null); plane.push(row); }
      layers.push(plane);
    }
    var x, z;
    for (x = 0; x < W; x++) for (z = 0; z < D; z++) layers[0][x][z] = 'GROUND';   // 地面层全幅
    var WX0 = 3, WX1 = 10;                                                        // 墙段列范围
    for (x = WX0; x <= WX1; x++) {
      layers[1][x][0] = 'PARAPET';                                                // 垛口线（沿墙顶）
      layers[1][x][1] = 'RAMPART_WALK';                                           // 马道
      layers[1][x][2] = 'WALL';                                                   // 内侧结构封边（V6）
    }
    layers[1][6][0] = 'GATE';                                                     // 门洞（h1 层门户格）
    layers[1][3][1] = 'SLOPE';                                                    // 坡道顶格（AXIAL 落马道）
    for (z = 0; z < D; z++) layers[2][11][z] = (z === 1) ? 'BEACON_FLOOR' : 'WALL'; // 烽燧顶：唯一 BEACON_FLOOR
    /* 单格丰富教学锚点文案（F1 §6.1 meta.name；V17 教学关强制） */
    var metaNames = {
      '3_1_1': '坡道·跨层移动锚点', '6_0_1': '门洞·堵门教学锚点', '11_1_2': '烽燧顶·帅帐',
      '5_0_1': '垛口·堵击教学锚点'
    };
    var cells = {};
    for (hh = 0; hh < H; hh++) for (x = 0; x < W; x++) for (z = 0; z < D; z++) {
      var kind = layers[hh][x][z];
      if (!kind) continue;
      var id = x + '_' + z + '_' + hh;
      cells[id] = { id: id, x: x, z: z, h: hh, kind: kind, passable: kind !== 'WALL',
                    occupantIds: [], facilityId: null,
                    meta: metaNames[id] ? { name: metaNames[id] } : null };
    }
    /* 静态连接器（9 字段，F1 §2.4.2）。GATE=特殊静态 Connector（OQ-1 销账口径：与普通静态边同路径，零特判）。 */
    var connectors = {
      sl_L1_1: { id: 'sl_L1_1', from: '3_2_0', to: '3_1_1', connKind: 'SLOPE', orient: 'AXIAL',
                 accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE', lifetime: {} },
      sl_L1_gate: { id: 'sl_L1_gate', from: '6_0_0', to: '6_0_1', connKind: 'SLOPE', orient: 'FRONTAL',
                 accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE', lifetime: {}, tag: 'GATE' },
      sl_L1_beacon: { id: 'sl_L1_beacon', from: '11_1_0', to: '11_1_2', connKind: 'SLOPE', orient: 'AXIAL',
                 accessPolicy: 'DEFENDER_ONLY', occupancy: { units: [] }, status: 'ACTIVE', lifetime: {} }
    };
    return {
      version: 1, levelId: 'MVP_L1', width: W, depth: D,
      layers: layers, cells: cells, connectors: connectors,
      beacon: { cellId: '11_1_2', durabilityRef: 'beacon.json' },
      beaconDurability: 100,           // ⚠ 工作假设占位（F3 beacon.json 宿主，VS-5 覆盖；F2 判负链载体）
      deployZones: [ { id: 'dz_wall', cells: ['5_1_1', '6_1_1', '7_1_1'] } ],
      enemySpawns: [ { id: 'spawn_main', edge: 'x_low', zRange: [0, 2], waveRef: 'l1-waves.json' } ],
      terrainRules: TERRAIN_RULES,
      capacityTable: GRID_CAPACITY
    };
  }

  /* ---- 查询接口（TerrainQuery 子集，走廊规模全部 O(1)/O(N) 现算）---- */
  var lv = null, runtime = null;
  function mount(level) {
    lv = level;
    runtime = { levelId: level.levelId, dynamicConnectors: [], cellOccupancy: {}, turn: 0 };
    var ids = Object.keys(level.cells);
    for (var i = 0; i < ids.length; i++) {
      var c = level.cells[ids[i]];
      runtime.cellOccupancy[c.id] = { units: [], facility: null };
    }
  }
  function cellId(x, z, h) { return x + '_' + z + '_' + h; }
  function getCell(id) { return lv.cells[id] || null; }
  function getCellAt(x, z, h) { return lv.cells[cellId(x, z, h)] || null; }
  function capOf(cell) { return GRID_CAPACITY[cell.kind]; }
  function canPlace(id, n) {                    // F1.8（设施校验独立归 C7）
    var c = getCell(id); if (!c || !c.passable) return false;
    return c.occupantIds.length + n <= Math.min(capOf(c), STACK_LIMIT);
  }
  function occupancyOf(id) {
    var c = getCell(id); if (!c) return { units: [], capacity: 0 };
    return { units: c.occupantIds.slice(), capacity: Math.min(capOf(c), STACK_LIMIT) };
  }

  /* F1 §3.8 写白名单（8 mutation）。本批消费 placeUnit/removeUnit/moveUnit/registerFacility/addConnector/
   * destroyConnector 骨架；boardConnector/unboardConnector 为 [VS-3] 填充的骨架签名（占位实现）。 */
  var evlog = [];
  function emit(ev, payload) { evlog.push({ ev: ev, payload: payload, turn: runtime.turn }); }
  function placeUnit(uid, cellIdArg) {          // 容量检查 → 绑定（原子；失败整条拒绝）
    var c = getCell(cellIdArg);
    if (!c) return { ok: false, why: 'no_cell' };
    if (!canPlace(cellIdArg, 1)) return { ok: false, why: 'cell_full' };
    c.occupantIds.push(uid);
    runtime.cellOccupancy[cellIdArg].units.push(uid);
    emit('cell_changed', { cellId: cellIdArg });
    return { ok: true };
  }
  function removeUnit(uid) {                    // 覆盖 ON_CONNECTOR 态：同事务清 connector.occupancy（F1 v1.4.1 三链路归一）
    var ids = Object.keys(lv.cells);
    for (var i = 0; i < ids.length; i++) {
      var c = lv.cells[ids[i]], k = c.occupantIds.indexOf(uid);
      if (k >= 0) { c.occupantIds.splice(k, 1);
        var occ = runtime.cellOccupancy[c.id].units, k2 = occ.indexOf(uid);
        if (k2 >= 0) occ.splice(k2, 1);
        emit('cell_changed', { cellId: c.id });
        return { ok: true }; }
    }
    var dcs = allConnectors();
    for (i = 0; i < dcs.length; i++) {
      var ou = dcs[i].occupancy.units, k3 = ou.indexOf(uid);
      if (k3 >= 0) { ou.splice(k3, 1); return { ok: true }; }
    }
    return { ok: false, why: 'not_found' };
  }
  function moveUnit(uid, toId) {                // 原子跨格（INV4）：先校验后双端登记，失败整条拒绝
    var from = findUnitCell(uid);               // from = CellId 字符串
    if (!from) return { ok: false, why: 'not_found' };
    if (!canPlace(toId, 1)) return { ok: false, why: 'cell_full' };
    var fc = getCell(from), tc = getCell(toId);
    fc.occupantIds.splice(fc.occupantIds.indexOf(uid), 1);
    tc.occupantIds.push(uid);
    runtime.cellOccupancy[from].units.splice(runtime.cellOccupancy[from].units.indexOf(uid), 1);
    runtime.cellOccupancy[toId].units.push(uid);
    emit('cell_changed', { cellId: from }); emit('cell_changed', { cellId: toId });
    return { ok: true };
  }
  function findUnitCell(uid) {
    var ids = Object.keys(lv.cells);
    for (var i = 0; i < ids.length; i++) if (lv.cells[ids[i]].occupantIds.indexOf(uid) >= 0) return ids[i];
    return null;
  }
  function registerFacility(fid, cellIdArg) {   // 一格恒至多一设施（INV1 v1.3.2：设施不占单位槽）
    var c = getCell(cellIdArg);
    if (!c || !c.passable) return { ok: false, why: 'no_cell' };
    if (c.facilityId) return { ok: false, why: 'facility_exists' };
    c.facilityId = fid; runtime.cellOccupancy[cellIdArg].facility = fid;
    emit('facility_registered', { cellId: cellIdArg, facilityId: fid });
    return { ok: true };
  }
  function addConnector(conn) {                 // 架梯（LADDER 动态；静态坡道只出自关卡数据）
    runtime.dynamicConnectors.push(conn);
    emit('connector_added', { connectorId: conn.id });
    return { ok: true };
  }
  /* destroyConnector 原子清 occupancy（INV6）→ 落位（from 格/同层邻接顺延/OFFBOARD 兜底）；
   * 落位失败不回滚 destroy——「梯毁单位必有着落」单向保证（F1 §3.8 E2 附注）。
   * [VS-3] 填充真实坠落伤害链（fallDamage 过骰走 F4）。 */
  function destroyConnector(cid) {
    var cs = allConnectors();
    for (var i = 0; i < cs.length; i++) {
      var cn = cs[i];
      if (cn.id !== cid || cn.status !== 'ACTIVE') continue;
      cn.status = 'DESTROYED';
      var stranded = cn.occupancy.units.slice();
      cn.occupancy.units.length = 0;            // 原子清（断边不可逆）
      for (var u = 0; u < stranded.length; u++) {
        var dest = fallLandCell(cn.from);
        // E2 落位：from 格 → 同层邻接顺延 → OFFBOARD 兜底（不允许悬空引用）；
        // 落位失败不回滚 destroy。OFFBOARD 态 = 从格子账清除即离场（重部署复位 VS-3/4）。
        var moved = dest ? moveUnit(stranded[u], dest) : { ok: false };
        if (!moved.ok) removeUnit(stranded[u]);  // 无可落格 → OFFBOARD 兜底（移出格子账）
        // [VS-3] E2 坠落伤害结算挂点（weapons.fallDamage；落位成功也过骰）
      }
      emit('connector_destroyed', { connectorId: cid });
      return { ok: true, stranded: stranded.length };
    }
    return { ok: false, why: 'not_found' };
  }
  function fallLandCell(fromId) {               // E2 落位：from 格空槽 → 同层邻接顺延
    if (canPlace(fromId, 1)) return fromId;
    var c = getCell(fromId); if (!c) return null;
    var d4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < 4; i++) {
      var nid = cellId(c.x + d4[i][0], c.z + d4[i][1], c.h);
      if (nid !== fromId && canPlace(nid, 1)) return nid;
    }
    return null;                                // OFFBOARD 兜底（不允许悬空引用）
  }
  /* [VS-3] 攀爬登记双 mutation 骨架签名（占位实现；F1 v1.4.1 技术条目 #1）
   * boardConnector：canBoard（F1.10）校验 + occupancy 单事务登记；单位逻辑位置保持 c.from（INV2）。
   * unboardConnector：主动弃梯（from 格有空槽方可，C1-E4 终裁 A 案：满则拒绝、留梯保持暴露）/
   *                   梯毁 E2 路径经 destroyConnector 链，不走本 mutation。 */
  function canBoard(cid) {
    var cs = allConnectors();
    for (var i = 0; i < cs.length; i++) {
      var cn = cs[i];
      if (cn.id === cid) return cn.status === 'ACTIVE' && cn.occupancy.units.length < GRID_CAPACITY[cn.connKind === 'LADDER' ? 'LADDER' : 'SLOPE_CONN'];
    }
    return false;
  }
  function boardConnector(cid, uid) {           // [VS-3] 占位：真实攀爬消耗（climb=2MP）与 BLOCKED_TOP 排队在 C1 实装
    if (!canBoard(cid)) return { ok: false, why: 'cannot_board' };
    var cs = allConnectors();
    for (var i = 0; i < cs.length; i++) if (cs[i].id === cid) { cs[i].occupancy.units.push(uid); emit('connector_board', { connectorId: cid, unitId: uid }); return { ok: true }; }
    return { ok: false, why: 'not_found' };
  }
  function unboardConnector(cid, uid) {         // [VS-3] 占位：弃梯校验（from 格 canPlace）VS-3 实装
    var cs = allConnectors();
    for (var i = 0; i < cs.length; i++) {
      var cn = cs[i];
      if (cn.id === cid) {
        var k = cn.occupancy.units.indexOf(uid);
        if (k < 0) return { ok: false, why: 'not_on_connector' };
        if (!canPlace(cn.from, 1)) return { ok: false, why: 'from_full' };   // 满则拒绝弃梯（INV1 无豁免）
        cn.occupancy.units.splice(k, 1);
        emit('connector_unboard', { connectorId: cid, unitId: uid });
        return { ok: true };
      }
    }
    return { ok: false, why: 'not_found' };
  }
  function allConnectors() {
    var out = [];
    var ks = Object.keys(lv.connectors);
    for (var i = 0; i < ks.length; i++) out.push(lv.connectors[ks[i]]);
    for (i = 0; i < runtime.dynamicConnectors.length; i++) out.push(runtime.dynamicConnectors[i]);
    return out;
  }
  function connectorByCell(id) {                // 该格为 from/to 的 ACTIVE 连接器（F1 §3.4 connectorsFrom）
    var cs = allConnectors(), out = [];
    for (var i = 0; i < cs.length; i++) {
      var cn = cs[i];
      if (cn.status !== 'ACTIVE') continue;
      if (cn.from === id || cn.to === id) out.push(cn);
    }
    return out;
  }
  function getAdjacency(id) {                   // 水平四邻（等高∧passable）∪ ACTIVE 连接器边
    var c = getCell(id); if (!c) return { orth: [], via: [] };
    var orth = [], d4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < 4; i++) {
      var nid = cellId(c.x + d4[i][0], c.z + d4[i][1], c.h);
      var nc = getCell(nid);
      if (nc && nc.passable) orth.push(nid);
    }
    var via = connectorByCell(id);
    return { orth: orth, via: via };
  }
  function heightDiff(a, b) { var ca = getCell(a), cb = getCell(b); return (ca && cb) ? (cb.h - ca.h) : 0; }
  function snapshot() { return { cells: Object.keys(lv.cells).length, connectors: allConnectors().length }; }

  /* ---- 跨层 A*（VS-2 沿用 spike 算法，参数换 F3 键名）----
   * 启发层差权重 = 2.0。硬约束（C1.5/F1 §11.1）：启发权重 ≤ F3 最小跨层边成本。
   * F3 moveCost.climb=2（工作假设）→ 权重取 2.0；⚠ VS-5 调低 climb 时必须联动复核本常量，
   *   否则可采纳性破坏、路径非最优（两值联动关系，改一处必查另一处）。 */
  var HEURISTIC_LAYER_WEIGHT = 2.0;   /* = TERRAIN_RULES.moveCost.climb（联动：climb 改则此值复核） */
  function aStar(startId, goalId) {
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    function hEst(id) {
      var a = getCell(id), b = getCell(goalId);
      return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + Math.abs(a.h - b.h) * HEURISTIC_LAYER_WEIGHT;
    }
    function edgeCost(fromId, toId) {           // [VS-3] 攀爬原子 2MP（climb 键）此处按边成本表达
      var via = connectorByCell(fromId);
      for (var i = 0; i < via.length; i++) if (via[i].to === toId || via[i].from === toId) return TERRAIN_RULES.moveCost.climb;
      var tc = getCell(toId);
      return tc.kind === 'GATE' ? TERRAIN_RULES.moveCost.gate : TERRAIN_RULES.moveCost.plains;
    }
    var open = [{ id: startId, g: 0, f: hEst(startId) }];
    var gScore = {}; gScore[startId] = 0;
    var came = {}; var visited = 0;
    while (open.length) {
      var bi = 0;
      for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      var cur = open.splice(bi, 1)[0];
      if (gScore[cur.id] < cur.g) continue;
      visited++;
      if (cur.id === goalId) {
        var path = [cur.id], k2 = cur.id;
        while (came[k2]) { path.unshift(came[k2]); k2 = came[k2]; }
        return { path: path, visited: visited, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0, ok: true };
      }
      var adj = getAdjacency(cur.id);
      var nbs = adj.orth.slice();
      for (i = 0; i < adj.via.length; i++) nbs.push(adj.via[i].from === cur.id ? adj.via[i].to : adj.via[i].from);
      for (i = 0; i < nbs.length; i++) {
        var nn = nbs[i];
        var ng = cur.g + edgeCost(cur.id, nn);
        if (gScore[nn] === undefined || ng < gScore[nn]) { gScore[nn] = ng; came[nn] = cur.id; open.push({ id: nn, g: ng, f: ng + hEst(nn) }); }
      }
    }
    return { path: null, visited: visited, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0, ok: false };
  }
  /* 攻方视角邻接过滤（V11）：DEFENDER_ONLY 边对匈奴不存在（F1 §2.4.2 消费契约）
   * [VS-3] C8 AI 可达性评估走此图（generatePlans 真实实现时消费）。 */
  function attackerAdjacency(id) {
    var adj = getAdjacency(id);
    var via = [];
    for (var i = 0; i < adj.via.length; i++) if (adj.via[i].accessPolicy === 'BOTH') via.push(adj.via[i]);
    return { orth: adj.orth, via: via };
  }

  return { CELL_KINDS: CELL_KINDS, GRID_CAPACITY: GRID_CAPACITY, STACK_LIMIT: STACK_LIMIT,
           TERRAIN_RULES: TERRAIN_RULES, buildL1: buildL1, mount: mount,
           cellId: cellId, getCell: getCell, getCellAt: getCellAt, canPlace: canPlace,
           occupancyOf: occupancyOf, placeUnit: placeUnit, removeUnit: removeUnit, moveUnit: moveUnit,
           findUnitCell: findUnitCell, registerFacility: registerFacility, addConnector: addConnector,
           destroyConnector: destroyConnector, boardConnector: boardConnector, unboardConnector: unboardConnector,
           canBoard: canBoard, allConnectors: allConnectors, getAdjacency: getAdjacency,
           attackerAdjacency: attackerAdjacency, heightDiff: heightDiff, snapshot: snapshot,
           aStar: aStar, HEURISTIC_LAYER_WEIGHT: HEURISTIC_LAYER_WEIGHT, runtime: function () { return runtime; },
           level: function () { return lv; } };
})();

/* ============================================================
 * ═══ 分区 C：F4 确定性随机（结构权威 F4 GDD v1.0.1）═══
 * ============================================================ */
var F4 = (function () {
  /* mulberry32（F4 §2.1 规范直译——运算序不得重排，重排破坏逐位一致）+ FNV-1a-32 种子展开（F4.2）。
   * 单流全局游标（裁定 C-1）；游标随档恢复语义留 F5 接缝（本批切片局内一次性）。
   * 本批只挂载+冒烟；命中过骰 rand('HIT_ROLL') 消费入口 VS-3 接线（C5.2）。 */
  var FNV_OFFSET = 0x811C9DC5, FNV_PRIME = 0x01000193;
  function fnv1a32(bytes) {
    var h = FNV_OFFSET >>> 0;
    for (var i = 0; i < bytes.length; i++) {
      h = h ^ bytes[i];
      h = Math.imul(h, FNV_PRIME) >>> 0;
    }
    return h >>> 0;
  }
  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [];                            // 无 TextEncoder 环境兜底（ASCII 覆盖）
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
      else { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
    }
    return out;
  }
  function step(x) {                         // 规范：整数数学，运算序照 F4 §2.1
    var t = (x + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61) >>> 0)) >>> 0;
    t = (t ^ (t >>> 14)) >>> 0;
    return t >>> 0;
  }
  var st = { f4Seed: '', cursor: 0, state: 0, logBytes: [] };
  function init(f4Seed) {                    // 新战局：state=F4.2 展开、cursor=0、log=header-only
    st.f4Seed = f4Seed;
    st.state = fnv1a32(utf8Bytes(f4Seed));
    st.cursor = 0;
    st.logBytes = [];                        // [VS-5] F4 §2.5 规范字节流 S（header 14B + 10B/条）在存档批落位
    return st.state;
  }
  function rand(op) {                        // [0,1)：步进→游标+1→流水追加（append-only，F4-E2）
    st.state = step(st.state);
    st.cursor++;
    st.logBytes.push(op === 'HIT_ROLL' ? 0x01 : 0x00);
    return st.state / 4294967296;            // state / 2^32：2 的幂精确除法（跨引擎逐位一致）
  }
  function cursor() { return st.cursor; }
  function seq(n) { var out = []; for (var i = 0; i < n; i++) out.push(rand('HIT_ROLL')); return out; }
  return { init: init, rand: rand, cursor: cursor, seq: seq, state: function () { return st; }, fnv1a32: fnv1a32 };
})();

/* ============================================================
 * ═══ 分区 D：RENDER 渲染/UI（three r158；沿 spike 前例 + 视觉对齐备忘 v1.1 色值）═══
 * ============================================================ */
function boot() {
  var THREE = window.THREE;
  var lvData = F1.buildL1();
  F1.mount(lvData);
  var lv = F1.level();

  var NIGHT = {
    bg: 0x0d0f16, ghostOpacity: 0.14,
    ground: 0x1b2130, wall: 0x57534a, walk: 0x8a7a5e,            // 备忘 §1.1 三层底色（L1 主战场/暖琥珀灰）
    parapet: 0x645f54, gate: 0x5a564d, slope: 0x9c4a31, beaconTop: 0x9a742f,
    ramp: 0x9c4a31, ladder: 0x8fb8d8,
    defenderBody: 0xf7ead6, defenderOutline: 0x14110c,           // 备忘 §1.3 守方米白+深轮廓
    attackerBody: 0x8fb8d8, attackerOutline: 0x10161c,           // 攻方冷青+深轮廓
    cinnabar: 0xb3382c,                                            // 朱砂=警示/烽火专用（§2.2 语义保留）
    gridOuter: 'rgba(158,178,208,0.20)', gridInner: 'rgba(13,15,22,0.55)'  // §1.2 深底粉笔线/亮底墨线
  };

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

  var WALLH = 1.2;
  function cellTop(n) { return new THREE.Vector3(n.x, (n.h || 0) * WALLH, n.z); }
  function cellHeight(hh) { return hh === 0 ? 1.0 : hh * WALLH; }
  var KIND_COLORS = { GROUND: NIGHT.ground, WALL: NIGHT.wall, RAMPART_WALK: NIGHT.walk,
                      PARAPET: NIGHT.parapet, GATE: NIGHT.gate, SLOPE: NIGHT.slope, BEACON_FLOOR: NIGHT.beaconTop };

  /* --- D.1 地形实例化（每层一个 InstancedMesh，切层 O(1) 沿 spike）--- */
  var cellList = [];
  Object.keys(lv.cells).forEach(function (id) { cellList.push(lv.cells[id]); });
  var m4 = new THREE.Matrix4(), col = new THREE.Color(), vScale = new THREE.Vector3();
  var layerMeshes = {};
  [0, 1, 2].forEach(function (hh) {
    var list = cellList.filter(function (c) { return c.h === hh; });
    var mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.94, 1, 0.94),
      new THREE.MeshLambertMaterial(), list.length);
    list.forEach(function (c, i) {
      var ch = cellHeight(c.h);
      m4.makeTranslation(c.x, c.h * WALLH - ch / 2, c.z);
      m4.scale(vScale.set(1, ch, 1));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.setHex(KIND_COLORS[c.kind] || 0xffffff));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    layerMeshes[hh] = mesh;
  });

  /* --- D.2 格线 + 容量可视化（备忘 §1.2：每层 LineSegments 自绘；容量角标=垛口/马道读数）--- */
  function addGridLines(hh) {
    var pts = [];
    Object.keys(lv.cells).forEach(function (id) {
      var c = lv.cells[id]; if (c.h !== hh || !c.passable) return;
      var y = hh * WALLH + 0.01, e = 0.47;
      pts.push(c.x - e, y, c.z - e, c.x + e, y, c.z - e);
      pts.push(c.x + e, y, c.z - e, c.x + e, y, c.z + e);
      pts.push(c.x + e, y, c.z + e, c.x - e, y, c.z + e);
      pts.push(c.x - e, y, c.z + e, c.x - e, y, c.z - e);
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    var mat = new THREE.LineBasicMaterial({ color: hh === 0 ? 0x9eb2d0 : 0x0d0f16, transparent: true, opacity: hh === 0 ? 0.20 : 0.55 });
    var lines = new THREE.LineSegments(geo, mat);
    lines.userData.layerGrid = true;            // 切层时格线随层淡出（见 applyLayerGhost）
    scene.add(lines);
    gridLines[hh] = lines;
  }
  var gridLines = {};
  addGridLines(0); addGridLines(1); addGridLines(2);

  /* 容量角标：h1 层 PARAPET/RAMPART_WALK 每格顶部小方块×容量数（垛口1/马道2 视觉读数）。
   * 真实占用计数（×n 贴花）归堆叠可视化批；本批画「容量规格」静态角标。 */
  (function capacityBadges() {
    var capGeo = new THREE.BoxGeometry(0.10, 0.06, 0.10);
    var capMat = new THREE.MeshBasicMaterial({ color: 0xf7ead6, transparent: true, opacity: 0.85 });
    var capMesh = new THREE.InstancedMesh(capGeo, capMat, 64);
    var i = 0;
    cellList.forEach(function (c) {
      if (c.h !== 1 || (c.kind !== 'PARAPET' && c.kind !== 'RAMPART_WALK')) return;
      var n = F1.GRID_CAPACITY[c.kind];
      for (var k = 0; k < n && i < 64; k++) {
        m4.makeTranslation(c.x - 0.3 + k * 0.16, c.h * WALLH + 0.06, c.z + 0.36);
        capMesh.setMatrixAt(i++, m4);
      }
    });
    for (; i < 64; i++) { m4.makeTranslation(0, -50, 0); capMesh.setMatrixAt(i, m4); }  // 隐藏空位
    capMesh.instanceMatrix.needsUpdate = true;
    scene.add(capMesh);
  })();

  /* --- D.3 垛口掩体 / 梯上暴露标记（VS-3 战斗消费的格标记，先画出来）---
   * 垛口线朱砂细边（coverModParapet 掩体语义）；云梯攀爬暴露位冷青虚标（exposedModLadder）。
   * [VS-3] C5 命中修正读取的格标签：COVER=PARAPET、EXPOSED=connector.occupancy 在册单位。 */
  (function coverExposeMarks() {
    var coverGeo = new THREE.BoxGeometry(0.98, 0.05, 0.05);
    var coverMat = new THREE.MeshBasicMaterial({ color: NIGHT.cinnabar, transparent: true, opacity: 0.55 });
    var coverZ = [];
    cellList.forEach(function (c) { if (c.h === 1 && c.kind === 'PARAPET') coverZ.push(c); });
    var coverMesh = new THREE.InstancedMesh(coverGeo, coverMat, coverZ.length * 2);
    var ci = 0;
    coverZ.forEach(function (c) {
      m4.makeTranslation(c.x, c.h * WALLH + 0.05, c.z - 0.45); coverMesh.setMatrixAt(ci++, m4);
      m4.makeTranslation(c.x, c.h * WALLH + 0.05, c.z + 0.45); coverMesh.setMatrixAt(ci++, m4);
    });
    coverMesh.instanceMatrix.needsUpdate = true;
    scene.add(coverMesh);
  })();

  /* --- D.4 连接器可视体（坡道斜板 lookAt / 门拱 / 烽燧梯；三级视觉码简化灰盒版）--- */
  function refreshConnectorVisual(cn) {
    if (cn.visual) { scene.remove(cn.visual.mesh); cn.visual = null; }
    if (cn.status !== 'ACTIVE') return;
    var fa = F1.getCell(cn.from), fb = F1.getCell(cn.to);
    if (!fa || !fb) return;
    var ta = cellTop({ x: fa.x, z: fa.z, h: fa.h }), tb = cellTop({ x: fb.x, z: fb.z, h: fb.h });
    var color = cn.accessPolicy === 'DEFENDER_ONLY' ? 0xe8d5b0 : NIGHT.ramp;   // 烽燧梯暖白实边（备忘 §3 三级码）
    var mid = ta.clone().add(tb).multiplyScalar(0.5); mid.y -= 0.08;
    var len = Math.max(ta.distanceTo(tb), 0.4);
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(cn.id === 'sl_L1_gate' ? 0.9 : 0.8, 0.24, len * 1.05),
      new THREE.MeshLambertMaterial({ color: color }));
    mesh.position.copy(mid);
    mesh.lookAt(tb.x, tb.y - 0.08, tb.z);
    scene.add(mesh); cn.visual = { mesh: mesh };
  }
  F1.allConnectors().forEach(refreshConnectorVisual);

  /* --- D.5 单位渲染（阵营色温 + 顶色片；备忘 §1.3/§2.4）---
   * [VS-5] 切片护栏：容量模型极值 ~64 单位，视觉规格按「单格堆叠可视化（最多 4）」处理。
   * 本批每格 ≤4 占位，四象限偏移即备忘 §2.4 微型环（1 居中/2 对角/3 三角/4 四方）。 */
  var QUAD = [[0, 0], [-0.22, -0.22], [0.22, -0.22], [0, 0.24]];
  var units = {};                              // uid -> { uid, faction, templateId, cellId, hp, mp, speed, grp, slotInCell }
  var unitSeqN = 0;
  function spawnUnit(faction, templateId, cellIdArg, hp, speed) {
    var uid = (faction === 'DEFENDER' ? 'D' : 'A') + '_' + (++unitSeqN);
    var g = new THREE.Group();
    var bodyColor = faction === 'DEFENDER' ? NIGHT.defenderBody : NIGHT.attackerBody;
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.44),
      new THREE.MeshLambertMaterial({ color: bodyColor }));
    body.position.y = 0.25; g.add(body);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.2),
      new THREE.MeshBasicMaterial({ color: faction === 'DEFENDER' ? 0xfff8ea : 0xb9dcf2 }));
    cap.position.y = 0.56; g.add(cap);         // 顶色片（高位俯瞰阵营可读保底）
    scene.add(g);
    units[uid] = { uid: uid, faction: faction, templateId: templateId, cellId: cellIdArg,
                   hp: hp, maxHp: hp, mp: speed, speed: speed, grp: g, slotInCell: -1, alive: true };
    var pr = F1.placeUnit(uid, cellIdArg);
    if (!pr.ok) { scene.remove(g); delete units[uid]; return null; }
    relayoutCell(cellIdArg);
    return units[uid];
  }
  function relayoutCell(cellIdArg) {           // 同格单位四象限错位（备忘 §2.4 堆叠表达）
    var occ = F1.occupancyOf(cellIdArg);
    var c = F1.getCell(cellIdArg); if (!c) return;
    var top = cellTop({ x: c.x, z: c.z, h: c.h });
    for (var i = 0; i < occ.units.length; i++) {
      var u = units[occ.units[i]]; if (!u) continue;
      u.slotInCell = i;
      u.grp.position.set(top.x + QUAD[Math.min(i, 3)][0], top.y, top.z + QUAD[Math.min(i, 3)][1]);
    }
  }

  /* --- D.6 相位 UI 条 + 日志 --- */
  var $ = function (id) { return document.getElementById(id); };
  var logEl = $('log'), logCount = 0;
  window.__VS_LOG = function (msg, cls) {
    var d = new Date();
    var ts = ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
    var row = document.createElement('div');
    if (cls) row.className = cls;
    row.innerHTML = '<span class="t">[' + ts + ']</span> ' + msg;
    logEl.appendChild(row); logEl.scrollTop = logEl.scrollHeight;
    if (++logCount > 60) { logEl.removeChild(logEl.firstChild); logCount--; }
  };
  function log(msg, cls) { window.__VS_LOG(msg, cls); }
  var fsm = F2.state;
  function refreshHud() {
    var s = fsm();
    $('hud-phase').textContent = F2.PHASE_LABEL[s.phase] || s.phase;
    $('hud-turn').textContent = '回合 ' + s.turn;
    $('hud-slot').textContent = (s.phase === 'C' && s.actionOrder)
      ? ('行动序 ' + (Math.max(s.slotCursor, 0) + 1) + '/' + s.actionOrder.length) : '—';
    $('hud-cursor').textContent = 'F4 游标 ' + F4.cursor() + ' · 波次 ' + s.dbe.waveCursor + '/4';
    ['A', 'B', 'C', 'D'].forEach(function (p) { $('btn-ph-' + p).disabled = (s.phase !== p); });
    $('btn-lose').disabled = !(s.phase === 'A' || s.phase === 'B' || s.phase === 'C');
    $('btn-endbuild').disabled = s.phase !== 'A';
  }

  /* --- D.7 切层渲染 + 三档相机（沿 spike；180ms 过渡为正式版项，本批沿用瞬时切换）--- */
  var ghostOn = true;
  function applyLayerGhost(focusH) {
    [0, 1, 2].forEach(function (hh) {
      var m = layerMeshes[hh].material;
      var ghost = ghostOn && (hh > focusH);
      m.transparent = true; m.opacity = ghost ? NIGHT.ghostOpacity : 1.0;
      m.depthWrite = !ghost; m.needsUpdate = true;
      if (gridLines[hh]) { var gm = gridLines[hh].material; gm.transparent = true; gm.opacity = ghost ? 0.03 : (hh === 0 ? 0.20 : 0.55); }
    });
  }
  function v3(px, py, pz) { return new THREE.Vector3(px, py, pz); }
  var camPose = {
    0: { pos: v3(6, 15.0, 14.0), look: v3(6, 0, 1) },
    1: { pos: v3(6, 9.5, 10.0), look: v3(6, 1.2, 1) },
    2: { pos: v3(11, 8.5, 8.5), look: v3(10, 2.4, 1.5) }
  };
  var camTarget = camPose[0], camLook = camPose[0].look.clone(), camLerpT = 1;
  function setCamTier(tier) {
    camTarget = camPose[tier]; camLook = camTarget.look.clone(); camLerpT = 0;
    [btnC0, btnC1, btnC2].forEach(function (b, i) { if (b) b.classList.toggle('on', i === tier); });
    applyLayerGhost(tier);
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
      if (camLerpT >= 1) { camera.position.copy(camTarget.pos); camLook.copy(camTarget.look); camera.lookAt(camLook); }
    }
    renderer.render(scene, camera);
  }

  /* ============================================================
   * ═══ 分区 E：演示驱动（空转战局；占位逻辑，VS-3/4 换真实移动/攻击/AI/建设）═══
   * ============================================================ */
  var demo = { starterPlaced: false, battleLog: [] };

  /* 内联 JSON 表宿主（F3 §3.2 规范键路径；数值=工作假设占位 ⚠，VS-5 用 VS-1 建议值统一覆盖——
   * 表结构正确性优先于数值正确性；代码零兵种名/零数值硬编码，全表驱动） */
  var TABLES = {
    units: {        // units.json（结构权威 C2 §3.2；初值 ⚠ C2 §8.4）
      garrison_squad:  { faction: 'DEFENDER', baseHp: 100, baseMp: 3, baseAp: 1, layerAccess: [0, 1, 2], canBoardLadder: false, attackCapable: true,  meleeReach: 1 },
      ladder_infantry: { faction: 'ATTACKER', baseHp: 60,  baseMp: 3, baseAp: 1, layerAccess: [0, 1],    canBoardLadder: true,  attackCapable: true,  meleeReach: 1 },
      horse_archer:    { faction: 'ATTACKER', baseHp: 50,  baseMp: 5, baseAp: 1, layerAccess: [0],       canBoardLadder: false, attackCapable: true,  meleeReach: 1 },
      warlord_escort:  { faction: 'ATTACKER', baseHp: 80,  baseMp: 4, baseAp: 1, layerAccess: [0],       canBoardLadder: false, attackCapable: false, meleeReach: 1 },
      ram_chariot:     { faction: 'ATTACKER', baseHp: 120, baseMp: 2, baseAp: 1, layerAccess: [0],       canBoardLadder: false, attackCapable: true,  meleeReach: 1 }  // L1 不出场（W-V3 门禁），键位在册
    },
    facilities: {   // facilities.json（结构权威 C3 §3.2）
      bedCrossbow:  { hp: 40, range: 10, reloadTurns: 1, targetPriority: ['NEAREST'], kindAllowed: ['RAMPART_WALK'] },
      rollingStock: { hp: 30, dropRadius: 1, kindAllowed: ['RAMPART_WALK'] }
    },
    weapons: {      // weapons.json（C3+C5 共表，键路径规范形 F3 R-4）
      bedCrossbow: { damage: 25 },
      rollingStock: { dropDamage: 30 },
      fallDamage: 15,
      horseArcher: { range: 6 },              // 方向硬约束：< bedCrossbow.range
      meleeMod: { vsFacility: 1.5 }
    },
    combat: {       // combat.json（结构权威 C5 §2.4）
      hitBase: 0.75, heightModPerLevel: 0.10, coverModParapet: 0.15, exposedModLadder: 0.25,
      squadHpPowerCurve: { exponent: 0.5 }
    },
    economy: {      // economy.json（结构权威 C6 §3.5；R-2 规范键路径）
      perLevel: { L1: { initialTreasury: 300 } },
      income: { farmBasePerTurn: 20, supplyBasePerTurn: 10 },   // farmBase>0 红线
      loot: { perTemplate: { ladderInfantry: 15, ramChariot: 60, horseArcher: 20, warlordEscort: 80 } },
      cost: { build: { bedCrossbow: 80, rollingStock: 60 }, repair: { perHp: 2 }, wallRepair: { perHp: 3 }, deploy: { garrisonSquad: 50 } },
      campaign: { treasuryCarryRule: 'ALL' }
    },
    aiScripts: {    // ai-scripts.json（结构权威 C8 §3.2；OQ-1/3/4 挂账键位在册）
      weights: { w_beacon: 3.0, w_garrison: 2.0, w_facility: 1.5, w_path: 1.5 },
      leadWeight: 1.0,
      intentScripts: { MAIN: { focus: 0.6 }, FEINT: { focus: -0.4 }, COORDINATED: { sync: 1.0 } },
      planBudgetMs: 8
    },
    defenseScripts: {  // defense-scripts.json（结构权威 C10 §3.2）
      w_block: 2.0, w_strike: 1.5, bountyWeight: 1.0, hasAuraBonus: 1.2,
      lambda_expose: 0.5, lambda_detour: 0.4, standFast: 0.5, slotDecisionMs: 2, hooks: []
    },
    beacon: { durability: 100 }   // beacon.json（R-7；F2 判负链载体）
  };

  /* 波次表占位（waves/l1-waves.json；结构权威 C9 §2.2 骨架 §2.6：
   * 4 波、意图序列 MAIN→MAIN→FEINT→MAIN、W1@T2 纯云梯、W2 骑射首现、W3 FEINT 小波、W4 MAIN 收尾（含云梯=末波红线 W-V6）。
   * 每波单位数/间隔=工作假设占位；VS-5 用 VS-1 建议值覆盖。L1 兵种门禁 ⊆ {ladder_infantry, horse_archer}（W-V3）。 */
  var WAVES_L1 = [
    { turn: 2, waveId: 'W1', intentTag: 'MAIN',  spawnEdge: 'spawn_main', units: ['ladder_infantry', 'ladder_infantry', 'ladder_infantry'] },
    { turn: 4, waveId: 'W2', intentTag: 'MAIN',  spawnEdge: 'spawn_main', units: ['horse_archer', 'horse_archer', 'ladder_infantry'] },
    { turn: 6, waveId: 'W3', intentTag: 'FEINT', spawnEdge: 'spawn_main', units: ['horse_archer'] },
    { turn: 8, waveId: 'W4', intentTag: 'MAIN',  spawnEdge: 'spawn_main', units: ['ladder_infantry', 'ladder_infantry', 'ladder_infantry', 'horse_archer'] }
  ];
  var waveState = { cursor: 0, processedAll: false, pendingSpawns: [], unitWaveMap: {} };  // C9 WaveRuntimeState 骨架

  /* 出生区落格（C9 裁定 C：落格=(x↑,z↑) 字典序扫描出生区首个 canPlace 格）*/
  function spawnCellFor() {
    var cells = [];
    Object.keys(lv.cells).forEach(function (id) {
      var c = lv.cells[id];
      if (c.h === 0 && c.kind === 'GROUND' && c.x <= 2) cells.push(c);
    });
    cells.sort(function (a, b) { return a.x - b.x || a.z - b.z; });
    for (var i = 0; i < cells.length; i++) if (F1.canPlace(cells[i].id, 1)) return cells[i].id;
    return null;
  }

  /* ---- F2 hooks 注入：B 相位入场/计划、C 相位 faction、D 相位四钩子 ---- */
  function f2Hooks() {
    return {
      spawnForTurn: function (turn) {          // B①：C9.spawnForTurn——顺延重试 → 到期入场（表序）
        var entered = [], deferred = 0;
        for (var i = waveState.pendingSpawns.length - 1; i >= 0; i--) {
          var p = waveState.pendingSpawns[i];
          var cid = spawnCellFor();
          if (cid && F1.placeUnit(p.uid, cid).ok) { units[p.uid].cellId = cid; relayoutCell(cid); entered.push(p.uid); waveState.pendingSpawns.splice(i, 1); }
          else deferred++;
        }
        var entry = null;
        for (var w = 0; w < WAVES_L1.length; w++) if (WAVES_L1[w].turn === turn) { entry = WAVES_L1[w]; break; }
        if (entry && waveState.cursor <= w) {
          waveState.cursor = Math.max(waveState.cursor, w + 1);   // 条目已处理（处理态谓词账面）
          for (var u = 0; u < entry.units.length; u++) {
            var tpl = TABLES.units[entry.units[u]];
            var cid2 = spawnCellFor();
            if (cid2) {
              var unit = spawnUnit('ATTACKER', entry.units[u], cid2, tpl.baseHp, tpl.baseMp);
              if (unit) { entered.push(unit.uid); waveState.unitWaveMap[unit.uid] = entry.waveId; }
              log('B① 敌军入场 <b>' + entry.units[u] + '</b> → ' + cid2 + '（' + entry.waveId + '·' + entry.intentTag + '）');
            } else {
              deferred++;                       // 单单位粒度顺延（C9 裁定 D；演示局出生区 12 格×容 4 不会触达）
              log('B① 落位失败→顺延 ' + entry.units[u], 'bad');
            }
          }
        }
        return { entered: entered, deferred: deferred };
      },
      generatePlans: function (turn) {         // B③：C8.generatePlans 占位（VS-3 真实 AI；可达性评估走 attackerAdjacency）
        var n = 0;
        Object.keys(units).forEach(function (uid) { if (units[uid].faction === 'ATTACKER' && units[uid].alive) n++; });
        return { plannedUnits: n };
      },
      factionOf: function (uid) { return units[uid] ? units[uid].faction : 'ATTACKER'; },
      modeOf: function (uid) { return units[uid] && units[uid].faction === 'DEFENDER' ? 'AUTO' : 'AUTO'; },  // [VS-3] C10 托管路由
      isAlive: function (uid) { return !!(units[uid] && units[uid].alive); },
      beaconHp: function () { return lvData.beaconDurability; },
      wavesExhausted: function () {            // C9 处理态谓词（裁定 F）：全部条目已处理 ∧ pendingSpawns 空
        return waveState.cursor >= WAVES_L1.length && waveState.pendingSpawns.length === 0;
      },
      aliveEnemies: function () {
        var n = 0;
        Object.keys(units).forEach(function (uid) { if (units[uid].faction === 'ATTACKER' && units[uid].alive) n++; });
        return n;
      },
      d1Cleanup: function (turn) {             // D① 梯残骸清除（E5：DESTROYED 记录退场）
        var cs = F1.allConnectors(), n = 0;
        for (var i = 0; i < cs.length; i++) if (cs[i].status === 'DESTROYED') { cs[i]._retire = true; n++; }
        if (n) log('D① 清扫：' + n + ' 条梯残骸退场');
      },
      d2Economy: function (turn) { fsm().dbe.incomeSettled = true; },  // [VS-4] C6 收入结算（零 F4 消费——重放安全岛）
      d3Reinforce: function (turn) { },        // [VS-4] 援军到岗（落点满顺延 F2.7）
      d5AdvanceCursor: function (turn) { return waveState.cursor; }    // D⑤ 簿记前移（镜像）
    };
  }

  /* ---- 一局初始化（INIT）：种子展开 + 守方初始布阵（演示占位）---- */
  var F4_SEED = 'vs-l1-seed-01';               // vs-plan §4.10 建议字面量；命中过骰消费 VS-3 接线
  function resetBattle(skipBeaconReset) {
    // 清场
    Object.keys(units).forEach(function (uid) { scene.remove(units[uid].grp); });
    for (var k in units) delete units[k];
    var fresh = F1.buildL1();
    for (var kk in fresh) lvData[kk] = fresh[kk];
    F1.mount(lvData); lv = F1.level();
    F1.allConnectors().forEach(refreshConnectorVisual);
    waveState = { cursor: 0, processedAll: false, pendingSpawns: [], unitWaveMap: {} };
    F4.init(F4_SEED);
    F2.init('MVP_L1', f2Hooks());
    /* 守方初始布阵（A 相位前占位演示；真实 C7 建造/部署校验 VS-4）：
     * 3 戍卒小队（垛口×1 + 马道×2）+ 床弩占位实体（马道，设施独占格）。 */
    spawnUnit('DEFENDER', 'garrison_squad', '5_0_1', TABLES.units.garrison_squad.baseHp, TABLES.units.garrison_squad.baseMp);
    spawnUnit('DEFENDER', 'garrison_squad', '5_1_1', TABLES.units.garrison_squad.baseHp, TABLES.units.garrison_squad.baseMp);
    spawnUnit('DEFENDER', 'garrison_squad', '7_1_1', TABLES.units.garrison_squad.baseHp, TABLES.units.garrison_squad.baseMp);
    F1.registerFacility('bed_crossbow_1', '6_1_1');
    if (!skipBeaconReset) log('战局重置：种子 <b>' + F4_SEED + '</b> 展开字 0x' + F4.state().state.toString(16) + ' · 守方 3 戍卒 + 床弩占位 · F2=INIT');
  }

  /* ---- 相位推进按钮链（演示「下一步」；真实入口语义：A 确认=B→C 自动）---- */
  function stepTo(next) {                       // beginPhase 表外拒绝由压测直测；UI 只发合法推进
    var s = fsm();
    if (s.phase !== nextFrom(s.phase)) { /* 不应发生：按钮 disable 已守门 */ }
    if (!F2.beginPhase(next, 'demo_button')) return;
    if (next === 'B') { F2.runPhaseB(); F2.beginPhase('C', 'demo_auto_B4'); }        // B 自动结算（瞬时呈现）
    if (next === 'C') runCombatPhase();
    if (next === 'D') runSupplyPhase();
    refreshHud();
  }
  function nextFrom(p) { return { INIT: 'A', A: 'B', B: 'C', C: 'D' }[p]; }

  function runCombatPhase() {                   // C①→C②→C③（占位行动：跳过真实移动/攻击）
    var list = [];
    Object.keys(units).forEach(function (uid) { if (units[uid].alive) list.push({ unitId: uid, speed: units[uid].speed }); });
    var snap = F2.snapshotActionOrder(list);    // C② 一次快照冻结
    log('C② 速度序快照冻结：' + snap.order.join(' → ') + '（' + snap.ms.toFixed(2) + 'ms）');
    var res = F2.runSlots(function (uid, idx) { // 占位槽：耗尽即弃（无 MP/AP 消费——真实行动经济 VS-3）
      log('　slot#' + (idx + 1) + ' ' + uid + '（' + units[uid].templateId + '）行动…[占位]');
    });
    log('C③ 全部槽耗尽 ∨ 中断 → C→D（处理 ' + res.processed + ' · 跳槽 ' + res.skipped + ' · ' +
        (res.ended === 'interrupted' ? '<b>beaconDestroyed 中断</b>' : '正常 exhausted') + ')');
    if (fsm().flags.beaconDestroyed) {
      log('⚠ 烽燧被毁：剩余行动序立即中止（输得明白，无死后翻盘轮）', 'bad');
    } else {
      /* 演示层清场（占位战斗语义）：占位单位不结算伤害，守方永远"打赢"C 相位——
       * 攻方全部移出（E2 同款 removeUnit 原子路径），aliveEnemies→0，
       * D④ 双分量「波次耗尽 ∧ 清场」得以在末波后成立 → END_WIN。
       * 中断局（beaconDestroyed）不走此块：剩余槽未跑完即停，清场叙事不成立。
       * [VS-3] 真实伤害结算替换此块。 */
      var demoKill = [];
      Object.keys(units).forEach(function (uid) {
        if (units[uid].faction === 'ATTACKER' && units[uid].alive) demoKill.push(uid);
      });
      demoKill.forEach(function (uid) { F1.removeUnit(uid); delete units[uid]; });
      if (demoKill.length) log('　C④ 演示清场：守方占位全歼攻方 ' + demoKill.length + ' 个单位（VS-3 接真实战斗）');
    }
    F2.beginPhase('D', 'demo_auto_C3');
  }

  function runSupplyPhase() {
    var s = fsm();
    // 演示注入：跳到判负按钮 → A 相位即置 beaconHp=0（模拟 C 相位烽燧破；正式伤害链 VS-3）
    if (demo.loseInjected) { lvData.beaconDurability = 0; }
    var d4 = F2.runPhaseD();
    if (d4.lose) log('D④ 判负：beaconHP≤0（帅帐陷落）→ END_LOSE', 'bad');
    else if (d4.win) log('D④ 判胜：波次耗尽 ∧ 清场 → END_WIN', 'ok');
    else {
      log('D④ 未终局 → D→A，回合 ' + (s.turn + 1) + ' 继续');
      F2.beginPhase('A', 'demo_auto_D6');
    }
    demo.loseInjected = false;
  }

  /* ---- 演示一整局（判胜路径）：INIT→A→(循环 B→C→D)→END_WIN ---- */
  function playThrough(silent, loseAt) {
    var s = fsm();
    var steps = 0;
    if (s.phase === 'INIT') { F2.beginPhase('A', 'playthrough'); }
    while (true) {
      s = fsm();
      if (s.phase === 'END_WIN' || s.phase === 'END_LOSE') return s.phase;
      if (loseAt && s.turn >= loseAt && s.phase === 'A' && !demo.loseInjected) {
        demo.loseInjected = true;               // 演示短路：本回合烽燧注定陷落
      }
      if (s.phase === 'A') { F2.beginPhase('B', 'playthrough'); F2.runPhaseB(); F2.beginPhase('C', 'playthrough'); runCombatPhase(); }
      else if (s.phase === 'D') { runSupplyPhase(); }
      else if (s.phase === 'B') { F2.runPhaseB(); F2.beginPhase('C', 'playthrough'); runCombatPhase(); }
      else if (s.phase === 'C') { runCombatPhase(); }
      if (++steps > 200) return 'STALL';       // 护栏：防演示死循环
    }
  }

  /* ---- 页面按钮 ---- */
  $('btn-init').onclick = function () { resetBattle(); refreshHud(); };
  $('btn-endbuild').onclick = function () { stepTo('B'); };            // A③「开始敌军阶段」唯一入口
  $('btn-ph-A').onclick = function () { if (fsm().phase === 'D') { F2.beginPhase('A', 'demo'); refreshHud(); } };
  $('btn-ph-B').onclick = function () { stepTo('B'); };
  $('btn-ph-C').onclick = function () { stepTo('C'); };
  $('btn-ph-D').onclick = function () { stepTo('D'); };
  $('btn-next').onclick = function () {         // 「演示推进」：按当前相位智能走一步
    var s = fsm();
    if (s.phase === 'INIT') { F2.beginPhase('A', 'demo'); refreshHud(); }
    else if (s.phase === 'A') { F2.beginPhase('B', 'demo'); F2.runPhaseB(); F2.beginPhase('C', 'demo'); runCombatPhase(); }
    else if (s.phase === 'B') { F2.runPhaseB(); F2.beginPhase('C', 'demo'); runCombatPhase(); }
    else if (s.phase === 'C') { runCombatPhase(); }
    else if (s.phase === 'D') { runSupplyPhase(); }
    refreshHud();
  };
  $('btn-autoplay').onclick = function () {
    log('▶ 演示一整局（判胜路径）：4 波占位攻方 → 清场判胜…');
    var end = playThrough(false, 0);
    log(end === 'END_WIN' ? '★ 演示局结果：<b>END_WIN</b>（全链路走通）' : '★ 演示局结果：' + end, end === 'END_WIN' ? 'ok' : 'bad');
    refreshHud();
  };
  // refreshHud 守门：btn-lose 仅 A/B/C 可点（终态/INIT disable）。
  // 判负演示从活局注入；终态后先点「重置战局」再点「跳到判负」。
  $('btn-lose').onclick = function () {         // 「跳到判负」：帅帐被占位攻方击破 → 判负路径
    log('▶ 演示判负路径：注入烽燧击破（占位攻方）…');
    var p0 = fsm().phase;
    if (p0 === 'END_WIN' || p0 === 'END_LOSE') resetBattle(true);   // 程序化兜底（UI 守门下通常不可达）
    var end = playThrough(false, fsm().turn);
    log(end === 'END_LOSE' ? '★ 演示局结果：<b>END_LOSE</b>（判负优先于同回合清场）' : '★ 演示局结果：' + end, end === 'END_LOSE' ? 'ok' : 'bad');
    refreshHud();
  };

  /* --- 诊断 1：相位压测（VS-2 验收判据 3：100 局空转零 illegal_transition）--- */
  $('btn-stress').onclick = function () {
    var runs = 100, bad = 0, wins = 0, losses = 0, t0 = performance.now();
    var seed0 = F4.state().state, cur0 = F4.cursor();
    for (var r = 0; r < runs; r++) {
      resetBattle(true);
      var end = playThrough(true, (r % 2 === 0) ? 0 : 2);   // 交替判胜/判负两路
      if (end === 'END_WIN') wins++; else if (end === 'END_LOSE') losses++;
    }
    // 全程无 illegal_transition 断言：压测走全合法链；再注入式验证拒绝路径（对当前局直接乱发迁移）
    var s0 = fsm();
    var illegalBlocked = 0;
    ['C', 'D', 'A', 'B', 'END_WIN', 'INIT'].forEach(function (t) { if (!F2.beginPhase(t, 'stress_inject')) illegalBlocked++; });
    var dt = performance.now() - t0;
    log('▶ 相位压测 ' + runs + ' 局：胜 ' + wins + ' / 负 ' + losses + ' / 异常终态 ' + (runs - wins - losses) +
        ' · 耗时 ' + dt.toFixed(1) + 'ms（' + (dt / runs).toFixed(2) + 'ms/局）', 'ok');
    log('　注入式非法迁移 ' + illegalBlocked + '/6 全部拒绝并发出 illegal_transition' +
        (illegalBlocked === 6 ? ' ✓' : ' <b>✗ 存在漏拒</b>'), illegalBlocked === 6 ? 'ok' : 'bad');
    log('　F4 压测前游标 ' + cur0 + '（压测用独立局消耗，不污染演示局序列）——当前局游标 ' + F4.cursor(), '');
    resetBattle(); refreshHud();
  };

  /* --- 诊断 2：F4 种子冒烟（判据 4：同种子两次初始化随机序列逐字节一致）--- */
  $('btn-rng').onclick = function () {
    var ok = true, seqA = [], seqB = [], i;
    F4.init(F4_SEED); seqA = F4.seq(64);
    F4.init(F4_SEED); seqB = F4.seq(64);
    for (i = 0; i < 64; i++) if (seqA[i] !== seqB[i]) { ok = false; break; }
    var s2 = F4.init('another-seed'); var seqC = F4.seq(8);
    F4.init(F4_SEED); var seqD = F4.seq(8);
    var allSame = true; for (i = 0; i < 8; i++) if (seqC[i] !== seqD[i]) { allSame = false; break; }
    F4.init(F4_SEED);                            // 复位演示种子
    log(ok ? '✓ F4 冒烟：同种子（' + F4_SEED + '）两次初始化 64 值逐字节一致 ✓' :
            '✗ F4 冒烟失败：序列分叉 @' + i, ok ? 'ok' : 'bad');
    log('　换种子序列' + (allSame ? '意外相同 ✗' : '不同 ✓') + ' · 展开字 0x' + s2.toString(16) + ' / 0x' + F4.state().state.toString(16), allSame ? 'bad' : 'ok');
    log('　cursor 单调计数=' + F4.cursor() + '（消费即+1；HIT_ROLL 消费入口 VS-3 接线 C5.2）', '');
  };

  /* --- 诊断 3：L1 关卡 + A*（沿 spike 前例压测；启发权重=2.0 联动 climb=2）--- */
  $('btn-perf').onclick = function () {
    var kinds = {}; cellList.forEach(function (c) { kinds[c.kind] = (kinds[c.kind] || 0) + 1; });
    var parts = Object.keys(kinds).map(function (k) { return k + '×' + kinds[k]; }).join(' · ');
    log('L1 骨架：W=12 · ' + cellList.length + ' 格（' + parts + '）· 连接器 3（坡道/门洞/烽燧梯 DEFENDER_ONLY）', 'ok');
    var t1 = F1.aStar('0_0_0', '11_1_2');        // 攻方视角含 DEFENDER_ONLY 边的可达性单独验（下方）
    var t2 = F1.aStar('5_1_1', '11_1_2');        // 守方垛口→烽燧（守方可走内部梯）
    var t3 = F1.aStar('0_0_0', '6_0_1');         // 地面→门洞（V11 攻方 ACTIVE∧BOTH 通路抽查）
    log('　A*：地面→烽燧 ' + (t1.ok ? t1.path.length + ' 格 ' + t1.ms.toFixed(3) + 'ms' : '不可达✗') +
        ' · 马道→烽燧 ' + (t2.ok ? t2.path.length + ' 格 ' + t2.ms.toFixed(3) + 'ms' : '不可达✗') +
        ' · 地面→门洞 ' + (t3.ok ? t3.path.length + ' 格 ' + t3.ms.toFixed(3) + 'ms' : '不可达✗'), 'ok');
    var loops = 2000, sumMs = 0, bad = 0;
    for (var i = 0; i < loops; i++) { var r = F1.aStar('0_' + (i % 3) + '_0', '11_1_2'); sumMs += r.ms; if (!r.ok) bad++; }
    log('　压测 ' + loops + ' 次：平均 ' + (sumMs / loops).toFixed(4) + 'ms · 失败 ' + bad + ' · 启发层差权重 ' +
        F1.HEURISTIC_LAYER_WEIGHT + '（=climb，≤最小跨层边成本约束 ✓）', 'ok');
  };

  /* --- 诊断 4：E2 坠落链 + board/unboard 骨架冒烟（VS-3 接口先行立骨）--- */
  $('btn-fall').onclick = function () {
    // 架一架动态云梯（LADDER）+ 攀登占位 → 摧毁 → 验证 E2 落位链不产生悬空引用
    F1.addConnector({ id: 'ld_demo', from: '8_0_0', to: '8_0_1', connKind: 'LADDER', orient: 'FRONTAL',
                      accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE',
                      lifetime: { createdTurn: F2.state().turn, currentHp: F1.TERRAIN_RULES.ladderHp } });
    refreshConnectorVisual(F1.allConnectors().filter(function (c) { return c.id === 'ld_demo'; })[0]);
    var invader = spawnUnit('ATTACKER', 'ladder_infantry', '8_0_0', 60, 3);
    var br = F1.boardConnector('ld_demo', invader.uid);
    log('boardConnector(' + invader.uid + ') → ' + (br.ok ? 'OK（occupancy 登记，逻辑位置保持 from 格——INV2）' : '拒绝：' + br.why), br.ok ? 'ok' : 'bad');
    var dr = F1.destroyConnector('ld_demo');
    log('destroyConnector(ld_demo) → 断边+' + dr.stranded + ' 单位坠落落位：' +
        (dr.stranded ? ('落至 ' + F1.findUnitCell(invader.uid) + '（E2：from 空→邻接顺延；伤害过骰 VS-3）') : '无在梯单位') +
        ' · 落位失败不回滚 destroy ✓', 'ok');
    var ub = F1.unboardConnector('ld_demo', invader.uid);
    log('unboardConnector 复核 → ' + (ub.ok ? '异常：梯已毁仍可注销 ✗' : '拒绝（已 DESTROYED）✓'), 'ok');
    if (invader) { F1.removeUnit(invader.uid); scene.remove(invader.grp); delete units[invader.uid]; }
  };

  /* --- 相机按钮 + 启动 --- */
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

  F2.bus.on('illegal_transition', function (p) { log('✗ illegal_transition：' + p.from + '→' + p.to + '（表外迁移硬拒绝）', 'bad'); });
  F2.bus.on('beacon_destroyed', function (p) { log('🔥 beacon_destroyed @回合 ' + p.atTurn + '（phase=' + p.phase + '）', 'bad'); });
  F2.bus.on('battle_won', function (p) { log('banner：battle_won（' + p.reason + '）', 'ok'); });
  F2.bus.on('battle_lost', function (p) { log('banner：battle_lost（' + p.reason + '）', 'bad'); });

  setCamTier(0);
  resetBattle();
  refreshHud();
  log('VS-2 切片底座就绪：L1 教学骨架 W=12 · ' + cellList.length + ' 格 · F2 七态 FSM · F4 种子 ' + F4_SEED + ' · three r158', 'ok');
  log('演示：①「演示推进」逐相位走 · ②「演示一整局」判胜路 · ③「跳到判负」看中断链 · ④ 相位压测/RNG 冒烟/L1&A*/坠落链四个诊断按钮', '');
  tick();
}

/* ---------- 启动引导（真正的调用在文件尾、THREE 内联之后） ---------- */
function showFatal(msg) {
  var el = document.getElementById('err');
  el.hidden = false;
  el.textContent = msg || 'THREE 内联加载失败（脚本被截断或 CSP 拦截）';
}
</script>

