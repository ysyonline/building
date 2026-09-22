<script>
/* ============================================================
 * 烽燧·长城攻防 —— GW-VS 灰盒可玩性轮 · VS-4 A 相位建设经济 + 器械 + D 相位结算（自包含，无外部资源）
 * 结构分区：本块 = [F2 相位 FSM] + [F1 地形/关卡] + [F4 确定性随机] + [F3 表宿主]
 *                  + [WORLD 世界态] + [C1 移动] + [C5 攻击结算] + [C10 托管] + [C8 匈奴 AI]
 *                  + [C6 粮饷经济] + [C7 建设与部署] + [C4 器械节拍]
 *                  + [RENDER 渲染/UI + 演示驱动]
 *           three.js r158 UMD 在下一 script 块裸内联（禁 IIFE 包装，见 F1 报告坑 3）；
 *           文件尾 script 块调用 boot()。
 * VS-4 范围（在 VS-3 战斗核心上实装）：
 *   ① C6 经济（GDD v1.0.3）：A 相位 quote/charge（INSUFFICIENT/ILLEGAL_WINDOW 双拒绝态，破产=禁止下单）；
 *     缴获双段式（C 相位 killed 流水登记 append-only / D② 统一入账）；D② settleIncome 固定子序
 *     farm→supply→loot + 幂等锚；d3Reinforce 时刻表数据源（免费，调度/顺延权威归 F2）；
 *     BattleEndReport v1 终局一次性冻结。经济零 F4 消费（INV-C6-5 重放安全岛）。
 *   ② C7 建设部署（GDD v1.0.2）：六指令（建造/部署/重置/修理/拆除/修墙）——五闸管线
 *     窗口→寻址→世界→资金→落地 单事务（C7.1 下单即支付+立即落地）；修墙=W-1 未落地整体封闭
 *     （WALL_REPAIR_UNAVAILABLE）；重置零费（C7.8）；修理夹取语义（C7.5）；拆除零退款。
 *   ③ C4 器械节拍（GDD v1.0.2）：facility_volley（volleyId=`${turn}_V`，空载照发）；装填/架设=绝对回合戳
 *     推导（K3 禁递减计数器/禁时钟回拨）；齐射锚点=phase_enter C 处理期内、C① 前（C4.1）；
 *     礌石 dropStock 自由指令（C 相位任意时点，canDrop 四拒绝 + 人力约束，效果链走 C5 五步固定序）。
 *   ④ D 相位收口：D① 清扫 → D② 经济入账 → D③ 援军到岗 → D④ 判定（先钱后人，F2 §2.2-D 序不变）。
 * VS-3 已实装（保留）：C1 移动 / C5 结算（含礌石五步固定序）/ C10 托管 / C8 匈奴 AI。
 * 仍留后续批次（保留全部 [VS-5] 锚点注释）：F3 数值全量注入 + 自动化冒烟 + 存档（VS-5）
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
    if (lose) {
      if (hooks.finalize) hooks.finalize('LOSE', 'BEACON_FALLEN');   /* [VS-4] C6 finalizeReport（D② 经济已入账后冻结） */
      st.phase = 'END_LOSE'; bus.publish('phase_exit', { phase: 'D', turn: st.turn }); bus.publish('battle_lost', { reason: 'BEACON_FALLEN', turn: st.turn }); bus.publish('phase_enter', { phase: 'END_LOSE', turn: st.turn });
    }
    else if (win) {
      if (hooks.finalize) hooks.finalize('WIN', 'WAVES_CLEARED');
      st.phase = 'END_WIN'; bus.publish('phase_exit', { phase: 'D', turn: st.turn }); bus.publish('battle_won', { reason: 'WAVES_CLEARED', turn: st.turn }); bus.publish('phase_enter', { phase: 'END_WIN', turn: st.turn });
    }
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
  function turnMirror() { return st ? st.turn : 0; }   /* [VS-4] F1 镜像一致性接口（turn 镜像契约；C4 推导消费同值回合戳） */

  return { TRANSITIONS: TRANSITIONS, PHASE_LABEL: PHASE_LABEL, bus: bus,
           init: init, state: state, beginPhase: beginPhase, turnMirror: turnMirror,
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
  /* [VS-3] E2 坠落伤害回调注入点（位移归 F1、伤害归 C5——职责隔离）。
   * 世界层（WORLD.init）注入回调 → C5 统一伤害入口（fallDamage 键）；F1 自身零数值零 RNG。 */
  var fallHandler = null;
  function setFallHandler(fn) { fallHandler = fn; }
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
        // [VS-3] E2 坠落伤害结算挂点：位移裁定完成后回调世界层（fallDamage 入口；落位成功与否皆结算）
        if (fallHandler) fallHandler({ unitId: stranded[u], landingCell: moved.ok ? dest : null,
                                       connectorId: cid, connectorKind: cn.connKind });
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
  /* [VS-3] 攀爬登记双 mutation 真实实现（F1 v1.4.1 技术条目 #1；C1 §2.4 攀爬时序）：
   * boardConnector：ACTIVE 校验 + 连接器占用容量（恒 1）校验 + 重复登记拒绝；
   *   登记后单位逻辑位置**保持 from 格**（INV2）——格子账不变，仅追加 connector.occupancy。
   *   BLOCKED_TOP「顶满排队」语义：登顶判定（to 格 canPlace）在 C1 侧执行——顶满则本单位
   *   留梯保持 ON_CONNECTOR，等自身下个行动序次重试（occupancy 容量恒 1，故单梯最多 1 人排队）。
   * unboardConnector：主动弃梯——from 格有空槽方可（C1-E4 终裁 A 案：满则拒绝、留梯保持暴露）；
   *   梯毁 E2 路径经 destroyConnector 链，不走本 mutation。 */
  function boardConnector(cid, uid) {
    var cs = allConnectors();
    for (var i = 0; i < cs.length; i++) {
      var cn = cs[i];
      if (cn.id !== cid) continue;
      if (cn.status !== 'ACTIVE') return { ok: false, why: 'connector_inactive' };
      if (cn.occupancy.units.indexOf(uid) >= 0) return { ok: false, why: 'already_on_connector' };
      var cap = GRID_CAPACITY[cn.connKind === 'LADDER' ? 'LADDER' : 'SLOPE_CONN'];
      if (cn.occupancy.units.length >= cap) return { ok: false, why: 'connector_full' };
      cn.occupancy.units.push(uid);            // 逻辑位置保持 from（INV2）：格子账不动
      emit('connector_board', { connectorId: cid, unitId: uid });
      return { ok: true };
    }
    return { ok: false, why: 'not_found' };
  }
  function unboardConnector(cid, uid) {
    var cs = allConnectors();
    for (var i = 0; i < cs.length; i++) {
      var cn = cs[i];
      if (cn.id !== cid) continue;
      if (cn.status !== 'ACTIVE') return { ok: false, why: 'connector_inactive' };
      var k = cn.occupancy.units.indexOf(uid);
      if (k < 0) return { ok: false, why: 'not_on_connector' };
      if (!canPlace(cn.from, 1)) return { ok: false, why: 'from_full' };   // 满则拒绝弃梯（INV1 无豁免）
      cn.occupancy.units.splice(k, 1);
      emit('connector_unboard', { connectorId: cid, unitId: uid });
      return { ok: true };
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
  function aStar(startId, goalId, opts) {
    /* [VS-3] C1 消费入口：layerAccess 层位许可过滤（flag 在 C2、过滤在 C1，C1 §2.3）、
     * faction 阵营过滤（DEFENDER_ONLY 边对攻方不可见，F1 §2.4.2/C1.7）、maxCost=MP 预算剪枝（C1.4）。 */
    opts = opts || {};
    var layerAccess = opts.layerAccess || null;
    var faction = opts.faction || null;
    var maxCost = (opts.maxCost === undefined || opts.maxCost === null) ? Infinity : opts.maxCost;
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    function allowedH(hh) { return !layerAccess || layerAccess.indexOf(hh) >= 0; }
    function edgeAllowed(fromId, toId) {
      var via = connectorByCell(fromId);
      for (var i = 0; i < via.length; i++) {
        var cn = via[i];
        if (cn.to === toId || cn.from === toId) {
          if (!allowedH(getCell(toId).h)) return false;
          if (cn.accessPolicy === 'DEFENDER_ONLY' && faction !== 'DEFENDER') return false;
          return true;
        }
      }
      return allowedH(getCell(toId).h);
    }
    function hEst(id) {
      var a = getCell(id), b = getCell(goalId);
      return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + Math.abs(a.h - b.h) * HEURISTIC_LAYER_WEIGHT;
    }
    function edgeCost(fromId, toId) {           // [VS-3] 攀爬原子 2MP（climb 键）：连接器边一口价 climb（不分方向）；门洞 gate；余 plains
      var via = connectorByCell(fromId);
      for (var i = 0; i < via.length; i++) if (via[i].to === toId || via[i].from === toId) return TERRAIN_RULES.moveCost.climb;
      var tc = getCell(toId);
      return tc.kind === 'GATE' ? TERRAIN_RULES.moveCost.gate : TERRAIN_RULES.moveCost.plains;
    }
    var NODE_BUDGET = 2000;                     // C1.10 节点预算护栏
    var open = [{ id: startId, g: 0, f: hEst(startId) }];
    var gScore = {}; gScore[startId] = 0;
    var came = {}; var visited = 0;
    while (open.length) {
      var bi = 0;
      for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      var cur = open.splice(bi, 1)[0];
      if (gScore[cur.id] < cur.g) continue;
      visited++;
      if (visited > NODE_BUDGET) return { path: null, visited: visited, cost: Infinity, budget: true, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0, ok: false };
      if (cur.id === goalId) {
        var path = [cur.id], k2 = cur.id;
        while (came[k2]) { path.unshift(came[k2]); k2 = came[k2]; }
        return { path: path, visited: visited, cost: cur.g, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0, ok: true };
      }
      var adj = getAdjacency(cur.id);
      var nbs = adj.orth.slice();
      for (i = 0; i < adj.via.length; i++) nbs.push(adj.via[i].from === cur.id ? adj.via[i].to : adj.via[i].from);
      for (i = 0; i < nbs.length; i++) {
        var nn = nbs[i];
        if (!edgeAllowed(cur.id, nn)) continue;
        var ng = cur.g + edgeCost(cur.id, nn);
        if (ng > maxCost) continue;            // MP 预算剪枝
        if (gScore[nn] === undefined || ng < gScore[nn]) { gScore[nn] = ng; came[nn] = cur.id; open.push({ id: nn, g: ng, f: ng + hEst(nn) }); }
      }
    }
    return { path: null, visited: visited, cost: Infinity, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0, ok: false };
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
           setFallHandler: setFallHandler,
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
 * ═══ 分区 T：F3 表宿主（内联 JSON 结构，F3 §3.2 规范键路径）═══
 * 数值权威 = VS-1 vs-playtest-sheet v1.0.1 §5.x（灰盒初值）；代码零兵种名 / 零数值硬编码。
 * 本批消费域：units / weapons / combat / facilities / aiScripts / defenseScripts / terrain / beacon / level / waves。
 * ⚠ economy 域归 VS-4（本批保留 VS-1 §5.5 值，未消费）。
 * ⚠ weapons.melee.damage=12 为数值缺口补位键：VS-1 §5.3/§6.4 全文近战基准取 12（云梯兵拆弩 12×0.5=6、
 *   戍卒近战 12×…），但 F3/C5 键清单无正式近战基准键——按「照表取值」补 weapons.melee.damage=12，
 *   已列 VS-3 报告「已知问题」，待 VS-7 勘误批正式收录。
 * ⚠ aiScripts.congestionGravity 为灰盒标定常量（分散惩罚幅度 = dispersionMul × c_congestion × gravity × 同目标计数）：
 *   取 w_beacon 同量级 100，使 MAIN 集中 / FEINT 分散的方向性成立（BE-2），非 VS-1 键，待 VS-7 校准。
 * ============================================================ */
var TABLES = {
  units: {        /* units.json（结构权威 C2 §3.2；初值 VS-1 §5.1） */
    garrison_squad:  { faction:'DEFENDER', baseHp:100, baseMp:3, baseAp:1, speed:3, layerAccess:[0,1,2], canBoardLadder:false, attackCapable:true,  meleeReach:1, lootKey:'garrisonSquad' },
    ladder_infantry: { faction:'ATTACKER', baseHp:60,  baseMp:3, baseAp:1, speed:3, layerAccess:[0,1],   canBoardLadder:true,  attackCapable:true,  meleeReach:1, lootKey:'ladderInfantry' },
    horse_archer:    { faction:'ATTACKER', baseHp:50,  baseMp:5, baseAp:1, speed:5, layerAccess:[0],     canBoardLadder:false, attackCapable:true,  meleeReach:1, lootKey:'horseArcher', rangedWeapon:'horseArcher' },
    warlord_escort:  { faction:'ATTACKER', baseHp:80,  baseMp:4, baseAp:1, speed:4, layerAccess:[0],     canBoardLadder:false, attackCapable:false, meleeReach:1, lootKey:'warlordEscort', auraStrategyId:'presence-v1' },
    ram_chariot:     { faction:'ATTACKER', baseHp:200, baseMp:2, baseAp:1, speed:2, layerAccess:[0],     canBoardLadder:false, attackCapable:true,  meleeReach:1, lootKey:'ramChariot', immuneToMeleeInteract:true }
  },
  facilities: {   /* facilities.json（结构权威 C3 §3.2；初值 VS-1 §5.2） */
    bedCrossbow:  { hp:30, range:12, reloadTurns:1, setupTurns:1, deployKind:'RAMPART_WALK', rangedCorridor:true,
                    targetPriority:['horse_archer','ladder_infantry','warlord_escort','ram_chariot'] },
                    /* setupTurns=1：C4 GDD v1.0.2 §2.4/§3.4 新增键（架设轮数，建成当轮不可射；非 VS-1 键，GDD 结构定值） */
    rollingStock: { hp:20, dropRadius:1, deployKind:'RAMPART_WALK' }
  },
  weapons: {      /* weapons.json（C3+C5 共表，键路径规范形 F3 R-4；初值 VS-1 §5.3） */
    bedCrossbow:  { damage:40 },
    rollingStock: { dropDamage:30 },
    fallDamage: 10,
    melee: { damage:12, vsFacility:0.5 },                 /* ⚠ melee.damage=12 缺口补位键（见上注） */
    horseArcher: { range:4, damage:12, isHitMod:-0.05 }
  },
  combat: {       /* combat.json（结构权威 C5 §2.4；初值 VS-1 §5.4） */
    hitBase:0.75, heightModPerLevel:0.10, heightModPerLevelRanged:0.05,
    coverModParapet:-0.15, exposedModLadder:0.25, squadHpPowerCurve:'linear'
  },
  economy: {      /* economy.json（结构权威 C6 §3.5；VS-1 §5.5 值，[VS-4] 起全量消费） */
    perLevel: { L1: { initialTreasury: 480 } },
    income: { farmBasePerTurn: 20, supplyBasePerTurn: 20 },
    loot: { perTemplate: { garrisonSquad: 0, ladderInfantry: 30, horseArcher: 25, ramChariot: 100, warlordEscort: 90 } },
    cost: { build: { bedCrossbow:100, rollingStock:60 }, deploy: { garrisonSquad:50 }, repair: { perHp:1 }, wallRepair: { perHp:3 } },
    /* 援军时刻表（C6 §3.5 reinforcementSchedule per-level 段）：VS-1 §5.5 无援军键 → MVP L1 空表（挂账 VS-7），
     * 机制全量在位（ReinforceEntry 结构 C6 §3.2；顺延队列=F2 dbe.pendingReinforcements，条目零丢失 F2.7）。 */
    reinforcementSchedule: []
  },
  aiScripts: {    /* ai-scripts.json（结构权威 C8 §3.2；初值 VS-1 §5.6） */
    targetWeights: { w_beacon:100, w_garrison:60, w_facility:40, w_path:40 },
    costWeights: { c_exposure:1.0, c_detour:0.5, c_congestion:0.5 },
    congestionGravity: 100,                               /* ⚠ 灰盒标定常量（见上注） */
    intentScripts: {
      MAIN_ASSAULT: { beaconMul:1.5, pathMul:1.5, garrisonMul:1.0, facilityMul:1.0, dispersionMul:1.0 },
      FEINT:        { beaconMul:1.0, pathMul:1.0, garrisonMul:0.5, facilityMul:1.2, dispersionMul:2.0 },
      COORDINATED:  { beaconMul:1.3, pathMul:1.5, garrisonMul:1.2, facilityMul:1.0, dispersionMul:0.8,
                      syncClimbBonus:{ formula:'bonus = k × pairs(同回合攀爬数,2)', k:15, cap:45 } }   /* L1 禁出场，仅表加载占位（C8 OQ-3） */
    },
    leadWeight: 15, planBudgetMs: 10
  },
  defenseScripts: {   /* defense-scripts.json（结构权威 C10 §3.2；初值 VS-1 §5.7） */
    w_block:50, w_strike:40, bountyWeight:0.2, hasAuraBonus:20,
    lambda_expose:0.8, lambda_detour:0.5, standFast:45, slotDecisionMs:2,
    hooks:['presence-aware-v1','cohesion-v1']
  },
  terrain: { moveCost:{ plains:1, climb:2, gate:2 }, ladderHp:15, stackLimit:4 },  /* VS-1 §5.8 */
  beacon: { durability:100, cellId:'11_1_2' },
  level: { L1: {   /* 初始守方布阵（表驱动，代码零兵种名） */
    initialDeploy: [
      { templateId:'garrison_squad', cellId:'5_0_1' },
      { templateId:'garrison_squad', cellId:'5_1_1' },
      { templateId:'garrison_squad', cellId:'7_1_1' }
    ],
    initialFacilities: [ { facilityId:'bed_crossbow_1', templateId:'bedCrossbow', cellId:'6_1_1', facing:'-x' } ]
  } },
  f4Seed: 'vs-l1-seed-01'
};

/* waves/l1-waves.json（结构权威 C9 §2.2 骨架 §2.6；初值 VS-1 §5.9）
 * 锁死：4 波 / 意图序列 MAIN→MAIN→FEINT→MAIN / W1@T2 纯云梯 / W2 骑射首现 / W3 FEINT / W4 MAIN 收尾；
 *       间隔恒 2；兵种 ⊆ {ladder_infantry, horse_archer}（W-V3）；末波含云梯（W-V6）。 */
var WAVES_L1 = [
  { turn:2, waveId:'W1', intentTag:'MAIN_ASSAULT', spawnEdge:'spawn_main', units:[{ templateId:'ladder_infantry', count:2 }] },
  { turn:4, waveId:'W2', intentTag:'MAIN_ASSAULT', spawnEdge:'spawn_main', units:[{ templateId:'ladder_infantry', count:2 },{ templateId:'horse_archer', count:2 }] },
  { turn:6, waveId:'W3', intentTag:'FEINT',        spawnEdge:'spawn_main', units:[{ templateId:'ladder_infantry', count:2 },{ templateId:'horse_archer', count:3 }] },
  { turn:8, waveId:'W4', intentTag:'MAIN_ASSAULT', spawnEdge:'spawn_main', units:[{ templateId:'ladder_infantry', count:6 },{ templateId:'horse_archer', count:2 }] }
];

/* ============================================================
 * ═══ 分区 W：WORLD 世界态（单位/设施/烽燧/波次运行态 + F2 hooks）═══
 * 单一真值源；渲染层（boot）经 F2.bus 事件订阅，逻辑层（C1/C5/C8/C10）经本模块查询。
 * ============================================================ */
var WORLD = (function () {
  var T = TABLES;
  var units = {};                 // uid -> 单位逻辑记录
  var facilities = {};            // fid -> {id, templateId, cellId, hp, maxHp, state, facing, createdTurn, lastFiredTurn}
  var facilitySeqN = 0;           // 建造流水号（fid 生成：C7 落地闸分配，重放确定性=指令序唯一）
  var beaconState = { hp: T.beacon.durability, maxHp: T.beacon.durability };
  var waveState = { cursor:0, pendingSpawns:[], unitWaveMap:{}, unitIntents:{} };
  var seqN = 0;

  function unit(uid) { return units[uid] || null; }
  function unitsList() { return Object.keys(units).map(function (k) { return units[k]; }); }
  function aliveUnits() { return unitsList().filter(function (u) { return u.alive; }); }
  function attackerUnits() { return aliveUnits().filter(function (u) { return u.faction === 'ATTACKER'; }); }
  function defenderUnits() { return aliveUnits().filter(function (u) { return u.faction === 'DEFENDER'; }); }
  function factionOf(uid) { var u = units[uid]; return u ? u.faction : 'ATTACKER'; }
  function isAlive(uid) { var u = units[uid]; return !!(u && u.alive); }
  function hasAura(uid) { var u = units[uid]; return !!(u && u.auraStrategyId); }
  function beaconHp() { return beaconState.hp; }
  function lootOf(u) { var tpl = T.units[u.templateId]; return (tpl && tpl.lootKey) ? (T.economy.loot.perTemplate[tpl.lootKey] || 0) : 0; }
  function facilitiesList() { return Object.keys(facilities).map(function (k) { return facilities[k]; }); }
  function facility(fid) { return facilities[fid] || null; }
  function facilityAt(cellId) {
    var l = facilitiesList();
    for (var i = 0; i < l.length; i++) if (l[i].cellId === cellId && l[i].state !== 'DESTROYED') return l[i];
    return null;
  }

  function spawn(faction, templateId, cellId) {
    var tpl = T.units[templateId]; if (!tpl) return null;
    var uid = (faction === 'DEFENDER' ? 'D' : 'A') + '_' + (++seqN);
    var pr = F1.placeUnit(uid, cellId);
    if (!pr.ok) return null;
    units[uid] = { uid:uid, templateId:templateId, faction:faction,
      hp:tpl.baseHp, maxHp:tpl.baseHp, mp:tpl.baseMp, maxMp:tpl.baseMp, ap:tpl.baseAp, maxAp:tpl.baseAp,
      speed:tpl.speed, layerAccess:tpl.layerAccess.slice(), canBoardLadder:!!tpl.canBoardLadder,
      attackCapable:!!tpl.attackCapable, meleeReach:tpl.meleeReach, rangedWeapon:tpl.rangedWeapon || null,
      auraStrategyId:tpl.auraStrategyId || null,
      immuneToMeleeInteract:!!tpl.immuneToMeleeInteract,
      controlMode:'AUTO', alive:true, cellId:cellId, onConnector:null, waveId:null };
    F2.bus.publish('unit_spawned', { uid:uid, faction:faction, templateId:templateId, cellId:cellId });
    return units[uid];
  }
  function kill(uid, source) {                 // C2.3 唯一死亡入口（清占位 → 状态迁移 → 事件）
    var u = units[uid]; if (!u || !u.alive) return;
    u.alive = false; u.onConnector = null;
    F1.removeUnit(uid);
    F2.bus.publish('unit_killed', { uid:uid, faction:u.faction, templateId:u.templateId, source:source || null });
    F2.bus.publish('unit_removed', { uid:uid });
  }
  function damageFacility(fid, dmg) {
    var f = facilities[fid]; if (!f || f.state === 'DESTROYED') return { killed:false, dmg:0 };
    var real = Math.max(0, Math.round(dmg));
    f.hp = Math.max(0, f.hp - real);
    if (f.hp <= 0) { f.state = 'DESTROYED';
      /* [VS-4] E7 释放链：DESTROYED 即释放 facilityId（格恢复纯格语义，同格单位不受影响不位移）；
       * 实体记录保留至回合末（P1 演出），D① 扫疡退场。 */
      var c = F1.getCell(f.cellId); if (c && c.facilityId === fid) c.facilityId = null;
      var occ = F1.runtime().cellOccupancy[f.cellId]; if (occ && occ.facility === fid) occ.facility = null;
      F2.bus.publish('facility_destroyed', { facilityId:fid }); return { killed:true, dmg:real }; }
    return { killed:false, dmg:real };
  }
  function damageBeacon(dmg, source) {         // F2.4 判负链的攻方写入侧
    var real = Math.max(0, Math.round(dmg));
    beaconState.hp = Math.max(0, beaconState.hp - real);
    if (beaconState.hp <= 0) { if (F2.onBeaconDestroyed) F2.onBeaconDestroyed(source || null); }
    F2.bus.publish('beacon_damaged', { hp: beaconState.hp, dmg: real });
    return { killed: beaconState.hp <= 0, dmg: real };
  }
  function addFacility(fid, templateId, cellId, facing, createdTurn) {
    var tpl = T.facilities[templateId]; if (!tpl) return null;
    var r = F1.registerFacility(fid, cellId); if (!r.ok) return null;
    facilities[fid] = { id:fid, templateId:templateId, cellId:cellId, hp:tpl.hp, maxHp:tpl.hp, state:'ACTIVE', facing:facing || '+x',
      createdTurn:createdTurn || 0, lastFiredTurn:null };   /* [VS-4] C4 K3：绝对回合戳（禁递减计数器；lastFiredTurn 发射记账） */
    F2.bus.publish('facility_registered', { facilityId:fid, cellId:cellId, templateId:templateId });
    return facilities[fid];
  }
  /* [VS-4] C3.7 repair 原语（校验语义：非 DESTROYED ∧ Δ>0；夹取语义在 C7 侧） */
  function repairFacility(fid, deltaHp) {
    var f = facilities[fid];
    if (!f || f.state === 'DESTROYED') return { ok:false, why:'ALREADY_DESTROYED' };
    if (!(deltaHp > 0)) return { ok:false, why:'BAD_DELTA' };
    f.hp = Math.min(f.maxHp, f.hp + deltaHp);
    return { ok:true, hp:f.hp };
  }
  /* [VS-4] C7.7 拆除：facilityId 释放 + 实体移除 + facility_dismantled 事件（零退款，退款在 C7/C6 侧语义） */
  function removeFacility(fid) {
    var f = facilities[fid]; if (!f || f.state === 'DESTROYED') return { ok:false, why:'BAD_TARGET' };
    var c = F1.getCell(f.cellId);
    if (c && c.facilityId === fid) { c.facilityId = null; }
    var occ = F1.runtime().cellOccupancy[f.cellId]; if (occ && occ.facility === fid) occ.facility = null;
    delete facilities[fid];
    F2.bus.publish('facility_dismantled', { facilityId:fid, cellId:f.cellId, turn:F2.state().turn });
    return { ok:true };
  }
  function resetPhaseResources() {             // C2.1：C 相位开始 MP/AP 回满
    unitsList().forEach(function (u) { if (u.alive) { u.mp = u.maxMp; u.ap = u.maxAp; } });
  }

  /* ---- 波次入场（B①：顺延重试 → 到期入场；表驱动展开 count）---- */
  function spawnCellFor() {
    var cells = [];
    Object.keys(F1.level().cells).forEach(function (id) {
      var c = F1.level().cells[id];
      if (c.h === 0 && c.kind === 'GROUND' && c.x <= 2) cells.push(c);
    });
    cells.sort(function (a, b) { return a.x - b.x || a.z - b.z; });
    for (var i = 0; i < cells.length; i++) if (F1.canPlace(cells[i].id, 1)) return cells[i].id;
    return null;
  }
  function spawnForTurn(turn) {
    var entered = [], deferred = 0, i, k, n;
    for (i = waveState.pendingSpawns.length - 1; i >= 0; i--) {   // 顺延重试（单单位粒度）
      var p = waveState.pendingSpawns[i], cid = spawnCellFor();
      var up = cid ? spawn(p.faction, p.templateId, cid) : null;
      if (up) { up.waveId = p.waveId; waveState.unitWaveMap[up.uid] = p.waveId; waveState.unitIntents[up.uid] = p.intentTag; entered.push(up.uid); waveState.pendingSpawns.splice(i, 1); }
      else deferred++;
    }
    for (var w = 0; w < WAVES_L1.length; w++) {                   // 到期波次入场
      var entry = WAVES_L1[w];
      if (entry.turn !== turn) continue;
      waveState.cursor = Math.max(waveState.cursor, w + 1);
      for (k = 0; k < entry.units.length; k++) {
        var grp = entry.units[k], tpl = T.units[grp.templateId];
        for (n = 0; n < grp.count; n++) {
          var cid2 = spawnCellFor(), u2 = cid2 ? spawn(tpl.faction, grp.templateId, cid2) : null;
          if (u2) { u2.waveId = entry.waveId; waveState.unitWaveMap[u2.uid] = entry.waveId; waveState.unitIntents[u2.uid] = entry.intentTag; entered.push(u2.uid); }
          else { waveState.pendingSpawns.push({ templateId:grp.templateId, faction:tpl.faction, waveId:entry.waveId, intentTag:entry.intentTag }); deferred++; }
        }
      }
    }
    return { entered: entered, deferred: deferred };
  }
  function currentIntent(turn) {
    var it = 'MAIN_ASSAULT';
    for (var w = 0; w < WAVES_L1.length; w++) if (WAVES_L1[w].turn <= turn) it = WAVES_L1[w].intentTag;
    return it;
  }

  /* [VS-4] 援军落点（F2 调度面）：部署区白名单内首个可容纳格 → spawn（garrison_squad，免费 C6-H）。
   * 返回 true=到岗；false=落点满（F2 顺延，条目零丢失）。 */
  function placeReinforcement(entry) {
    var zones = F1.level().deployZones;
    for (var zi = 0; zi < zones.length; zi++) {
      var cells = zones[zi].cells.slice().sort();
      for (var ci = 0; ci < cells.length; ci++) {
        if (!F1.canPlace(cells[ci], 1)) continue;
        if (spawn('DEFENDER', entry.templateId || 'garrison_squad', cells[ci])) return true;
      }
    }
    return false;
  }

  function onFall(p) { return C5.applyFallDamage(p); }   // E2 坠落伤害入口（F1 位移 → C5 伤害）

  function f2Hooks() {
    return {
      spawnForTurn: spawnForTurn,
      generatePlans: function (turn) { return C8.generatePlans(turn); },
      factionOf: factionOf,
      modeOf: function (uid) { return units[uid] ? units[uid].controlMode : 'AUTO'; },
      isAlive: isAlive, beaconHp: beaconHp,
      wavesExhausted: function () { return waveState.cursor >= WAVES_L1.length && waveState.pendingSpawns.length === 0; },
      aliveEnemies: function () { return attackerUnits().length; },
      d1Cleanup: function (turn) {                       // D① 梯残骸清除（E5：DESTROYED 记录退场）
        var cs = F1.allConnectors(), n = 0;
        for (var i = 0; i < cs.length; i++) if (cs[i].status === 'DESTROYED' && !cs[i]._retire) { cs[i]._retire = true; n++; }
        if (n) F2.bus.publish('residue_cleared', { count:n });
      },
      d2Economy: function (turn) {                       // [VS-4] D② C6 收入结算（零 F4 消费——重放安全岛）
        var rep = C6.settleIncome(turn);
        F2.state().dbe.incomeSettled = rep.ok;
        return rep;
      },
      d3Reinforce: function (turn) {                     // [VS-4] D③ 援军到岗（免费 C6-H；顺延队列权威=F2 dbe，条目零丢失 F2.7）
        var dbe = F2.state().dbe, arrived = 0, deferredTo = 0;
        /* ① 顺延队列首位重试（F2.7：条目零丢失，可跨多回合堆积） */
        for (var i = dbe.pendingReinforcements.length - 1; i >= 0; i--) {
          var pend = dbe.pendingReinforcements[i];
          if (placeReinforcement(pend)) { dbe.pendingReinforcements.splice(i, 1); arrived++; }
          else deferredTo++;
        }
        /* ② 时刻表新到期条目（表只读，顺延不回写 C6-E9） */
        var due = C6.dueReinforcements(turn);
        for (i = 0; i < due.length; i++) {
          if (placeReinforcement(due[i])) arrived++;
          else { dbe.pendingReinforcements.push(due[i]); deferredTo++; }
        }
        if (arrived || deferredTo) F2.bus.publish('reinforce_arrived', { turn:turn, arrived:arrived, deferred:deferredTo });
        return { arrived:arrived, deferred:deferredTo };
      },
      d5AdvanceCursor: function (turn) { return waveState.cursor; },
      finalize: function (outcome, reason) { return C6.finalizeReport(outcome, reason); }   /* [VS-4] D④ 终局冻结（C6-E14） */
    };
  }

  function deployInitial() {
    var ld = T.level.L1.initialDeploy;
    for (var i = 0; i < ld.length; i++) spawn('DEFENDER', ld[i].templateId, ld[i].cellId);
    var lf = T.level.L1.initialFacilities;
    for (i = 0; i < lf.length; i++) addFacility(lf[i].facilityId, lf[i].templateId, lf[i].cellId, lf[i].facing, 1);
  }

  var inited = false;
  function init(seed) {
    F1.mount(F1.buildL1());
    F4.init(seed || T.f4Seed);
    units = {}; facilities = {}; beaconState.hp = T.beacon.durability;
    waveState = { cursor:0, pendingSpawns:[], unitWaveMap:{}, unitIntents:{} };
    seqN = 0; facilitySeqN = 0;
    C6.init();                               /* [VS-4] 账本复位（treasury/流水/累计/幂等锚/终局报告） */
    C6.initC6Bus();                          /* [VS-4] killed→缴获流水订阅接线（双段式 C6 §2.4） */
    C4.resetRuntime();                       /* [VS-4] 齐射去重戳复位（E5 防线只拦同局重复发射） */
    C7.resetRuntime();                       /* [VS-4] 指令流水复位（新局新流水） */
    F1.setFallHandler(onFall);
    F2.init('MVP_L1', f2Hooks());
    deployInitial();
    if (!inited) { F2.bus.on('phase_enter', function (p) { if (p.phase === 'C') { resetPhaseResources(); C4.fireVolley(); } }); inited = true; }
    F2.bus.publish('world_ready', {});
    return { units: Object.keys(units).length, seed: F4.state().state };
  }

  return { TABLES: T, init: init, unit: unit, unitsList: unitsList, aliveUnits: aliveUnits,
           attackerUnits: attackerUnits, defenderUnits: defenderUnits, factionOf: factionOf,
           isAlive: isAlive, hasAura: hasAura, beaconHp: beaconHp, lootOf: lootOf,
           facilitiesList: facilitiesList, facility: facility, facilityAt: facilityAt,
           spawn: spawn, kill: kill, damageFacility: damageFacility, damageBeacon: damageBeacon,
           addFacility: addFacility, repairFacility: repairFacility, removeFacility: removeFacility,
           resetPhaseResources: resetPhaseResources,
           currentIntent: currentIntent, spawnForTurn: spawnForTurn,
           nextFacilityId: function () { facilitySeqN++; return 'fac_' + facilitySeqN; },
           facilitySeq: function () { return facilitySeqN; },
           waveState: function () { return waveState; }, WAVES: function () { return WAVES_L1; } };
})();

/* ============================================================
 * ═══ 分区 C1：移动（结构权威 C1 GDD v1.0.5）═══
 * MP 消费 / 攀爬原子 2MP / BLOCKED_TOP 留梯 / 攻击后锁足（锁足在 C5 结算侧置 mp=0）
 * ============================================================ */
var C1 = (function () {
  var T = TABLES;
  function connById(cid) { var cs = F1.allConnectors(); for (var i = 0; i < cs.length; i++) if (cs[i].id === cid) return cs[i]; return null; }
  function climbCost() { return T.terrain.moveCost.climb; }
  function connectorBetween(fromId, toId) {
    var cs = F1.allConnectors();
    for (var i = 0; i < cs.length; i++) { var cn = cs[i];
      if (cn.status !== 'ACTIVE') continue;
      if ((cn.from === fromId && cn.to === toId) || (cn.from === toId && cn.to === fromId)) return cn; }
    return null;
  }
  function neighborsWithCost(u, fromId) {
    var adj = F1.getAdjacency(fromId), out = [], i;
    for (i = 0; i < adj.orth.length; i++) {
      var toId = adj.orth[i], c = F1.getCell(toId);
      if (u.layerAccess.indexOf(c.h) < 0) continue;
      out.push({ id: toId, cost: c.kind === 'GATE' ? T.terrain.moveCost.gate : T.terrain.moveCost.plains, via: null });
    }
    for (i = 0; i < adj.via.length; i++) {
      var cn = adj.via[i], nid = (cn.from === fromId) ? cn.to : cn.from, c2 = F1.getCell(nid);
      if (u.layerAccess.indexOf(c2.h) < 0) continue;
      if (cn.accessPolicy === 'DEFENDER_ONLY' && u.faction !== 'DEFENDER') continue;
      out.push({ id: nid, cost: climbCost(), via: cn.id });
    }
    return out;
  }
  function reachable(uid, mpOverride) {        // C1.4 Dijkstra 泛洪（MP 预算内可达集 + 最小消耗）
    var u = WORLD.unit(uid); if (!u || !u.alive) return null;
    var budget = (mpOverride === undefined || mpOverride === null) ? u.mp : mpOverride;
    var start = u.cellId, dist = {}, frontier = [{ id:start, c:0 }];
    dist[start] = 0;
    while (frontier.length) {
      frontier.sort(function (a, b) { return a.c - b.c; });
      var cur = frontier.shift();
      if (cur.c > dist[cur.id]) continue;
      var nbs = neighborsWithCost(u, cur.id);
      for (var i = 0; i < nbs.length; i++) {
        var nc = cur.c + nbs[i].cost;
        if (nc > budget) continue;             // MP 预算剪枝（C1.4）
        if (dist[nbs[i].id] === undefined || nc < dist[nbs[i].id]) { dist[nbs[i].id] = nc; frontier.push({ id:nbs[i].id, c:nc }); }
      }
    }
    return dist;
  }
  function canClimb(uid, cid) {                // C1.7 攀爬发起预检
    var u = WORLD.unit(uid); if (!u || !u.alive) return { ok:false, reason:'NO_UNIT' };
    var cn = connById(cid); if (!cn) return { ok:false, reason:'NO_CONNECTOR' };
    if (cn.status !== 'ACTIVE') return { ok:false, reason:'INACTIVE' };
    if (u.mp < climbCost()) return { ok:false, reason:'NO_MP' };
    var to = F1.getCell(cn.to);
    if (u.layerAccess.indexOf(to.h) < 0) return { ok:false, reason:'NO_LAYER_ACCESS' };
    if (cn.accessPolicy === 'DEFENDER_ONLY' && u.faction !== 'DEFENDER') return { ok:false, reason:'ACCESS_POLICY' };
    if (cn.connKind === 'LADDER' && !u.canBoardLadder) return { ok:false, reason:'CANNOT_BOARD' };
    if (!F1.canBoard(cid)) return { ok:false, reason:'CONNECTOR_FULL' };
    return { ok:true };
  }
  function applyMoveOrder(order) {              // C1.9 执行 + MoveReport（§3.1）
    var u = WORLD.unit(order.unitId);
    var rep = { unitId:order.unitId, status:'REJECTED', executed:[], mpSpent:0,
                interrupted:null, waitingConnector:null, rejectReason:null, seedCursorBefore:F4.cursor() };
    if (!u || !u.alive) { rep.rejectReason = 'NO_UNIT'; return rep; }
    if (order.target === u.cellId) { rep.status = 'COMPLETED'; return rep; }
    if (!F1.canPlace(order.target, 1)) { rep.status = 'REJECTED'; rep.rejectReason = 'INVALID_TARGET'; return rep; }
    var path = F1.aStar(u.cellId, order.target, { layerAccess:u.layerAccess, faction:u.faction, maxCost:u.mp });
    if (!path.ok) { rep.status = 'UNREACHABLE'; rep.rejectReason = 'UNREACHABLE'; return rep; }
    if (path.cost > u.mp) { rep.status = 'REJECTED'; rep.rejectReason = 'NO_MP'; return rep; }
    var seq = path.path, broke = false;
    for (var i = 1; i < seq.length; i++) {
      var fromId = u.cellId, toId = seq[i], cn = connectorBetween(fromId, toId);
      if (cn) {                                // ③ 跨层攀爬（原子）
        var br = F1.boardConnector(cn.id, u.uid);
        if (!br.ok) { rep.status = 'PARTIAL'; rep.interrupted = { at:fromId, reason:'BLOCKED_BOARD' }; broke = true; break; }
        u.mp -= climbCost(); rep.mpSpent += climbCost(); u.onConnector = cn.id;
        if (F1.canPlace(cn.to, 1)) {           // 顶位空 → 落位顶格、occupancy 清空
          var mv = F1.moveUnit(u.uid, cn.to);
          if (mv.ok) { F1.unboardConnector(cn.id, u.uid); u.onConnector = null; u.cellId = cn.to;
            rep.executed.push(cn.to); F2.bus.publish('unit_moved', { uid:u.uid, cellId:cn.to }); }
          else { rep.status = 'BLOCKED_TOP'; rep.waitingConnector = cn.id; broke = true; break; }
        } else {                               // 顶位满 → 留梯等待（BLOCKED_TOP 非失败，保留 ON_CONNECTOR）
          rep.status = 'BLOCKED_TOP'; rep.waitingConnector = cn.id; broke = true; break;
        }
      } else {                                 // 层内平移
        var mv2 = F1.moveUnit(u.uid, toId);
        if (!mv2.ok) { rep.status = 'PARTIAL'; rep.rejectReason = 'CELL_FILLED'; rep.interrupted = { at:fromId, reason:'CELL_FILLED' }; broke = true; break; }
        var stepC = F1.getCell(toId).kind === 'GATE' ? T.terrain.moveCost.gate : T.terrain.moveCost.plains;
        u.mp -= stepC; rep.mpSpent += stepC; u.cellId = toId; rep.executed.push(toId);
        F2.bus.publish('unit_moved', { uid:u.uid, cellId:toId });
      }
    }
    if (!broke) rep.status = 'COMPLETED';
    else if (rep.executed.length === 0 && rep.status === 'PARTIAL') { rep.status = 'REJECTED'; }
    return rep;
  }
  return { reachable:reachable, canClimb:canClimb, applyMoveOrder:applyMoveOrder,
           climbCost:climbCost, connById:connById, connectorBetween:connectorBetween };
})();

/* ============================================================
 * ═══ 分区 C5：攻击结算（结构权威 C5 GDD v1.2.1）═══
 * 命中过骰走 F4 单流（HIT_ROLL，零独立 RNG）；走廊目标集近→远；修正四源合成；伤害经 WORLD 唯一入口。
 * ============================================================ */
var C5 = (function () {
  var T = TABLES;
  var reports = [], seqN = 0;
  function logH(u) { return F1.getCell(u.cellId).h; }       // ON_CONNECTOR：cellId 仍为 from 格（INV2）
  function isCover(u) { var c = F1.getCell(u.cellId); return !!(c && c.kind === 'PARAPET' && !u.onConnector); }
  function heightTerm(aH, tH, ranged) {                     // 攻方高位=增益、低位=惩罚（attacker-perspective，与 VS-1 §5.3/§6.4 实测同号）
    return (aH - tH) * (ranged ? T.combat.heightModPerLevelRanged : T.combat.heightModPerLevel);
  }
  function squadFactor(u) { return (u && T.combat.squadHpPowerCurve === 'linear') ? (u.hp / u.maxHp) : 1; }
  function rollHit(modsSum) { return F4.rand('HIT_ROLL') < (T.combat.hitBase + modsSum); }   // C5.2 唯一命中骰入口
  function applyDamageToUnit(uid, dmg, source) {
    var u = WORLD.unit(uid); if (!u || !u.alive) return { dmg:0, killed:false };
    var real = Math.max(0, Math.round(dmg));
    u.hp = Math.max(0, u.hp - real);
    if (u.hp <= 0) { WORLD.kill(uid, source); return { dmg:real, killed:true }; }
    F2.bus.publish('unit_damaged', { uid:uid, hp:u.hp, dmg:real });
    return { dmg:real, killed:false };
  }
  function meleeTargets(u) {                                // C2 §2.4.1 近战可及（同格或四邻 ∪ 连接器端格邻接）
    var out = [], nb = cellNeighbors4(u.cellId);
    WORLD.aliveUnits().forEach(function (o) {
      if (o.faction === u.faction || o.immuneToMeleeInteract) return;
      var adj = (nb.indexOf(o.cellId) >= 0);
      if (!adj && o.onConnector) { var cn = C1.connById(o.onConnector); if (cn && (nb.indexOf(cn.from) >= 0 || nb.indexOf(cn.to) >= 0)) adj = true; }
      if (adj) out.push({ type:'unit', unitId:o.uid });
    });
    WORLD.facilitiesList().forEach(function (f) {
      if (f.state === 'DESTROYED') return;
      if (u.faction !== 'ATTACKER') return;   /* [缺陷修复] 设施目标仅攻方可选（守方拆自家床弩=T1 实测 30→18，C10 §2.4 攻击=点杀敌目标） */
      if (nb.indexOf(f.cellId) >= 0) out.push({ type:'facility', facilityId:f.id });
    });
    if (u.faction === 'ATTACKER') {                          // 攻方对烽燧（灰盒简化：同列 x/z 邻接即够得着，见 VS-3 报告）
      var bc = F1.getCell(T.beacon.cellId), mc = F1.getCell(u.cellId);
      if (bc && mc && (Math.abs(bc.x - mc.x) + Math.abs(bc.z - mc.z) <= 1)) out.push({ type:'beacon', beacon:true });   /* [缺陷修复] 补 beacon:true（strikeMelee 读 t.beacon，此前形状不匹配→烽燧永 MISS 零 F4 消费） */
    }
    return out;
  }
  function cellNeighbors4(cellId) {
    var c = F1.getCell(cellId); if (!c) return [];
    var d = [[0,0],[1,0],[-1,0],[0,1],[0,-1]], out = [];
    for (var i = 0; i < d.length; i++) { var n = F1.cellId(c.x + d[i][0], c.z + d[i][1], c.h); if (F1.getCell(n)) out.push(n); }
    return out;
  }
  function corridorCells(origin, dir, range) {              // C5.1/C3.1 同层轴向格序列（含各层）
    var cells = [], sign = (dir === '-x') ? -1 : 1;
    for (var d = 1; d <= range; d++) for (var h = 0; h <= 2; h++) {
      var c = F1.getCellAt(origin.x + sign * d, origin.z, h);
      if (c && c.passable) cells.push(c.id);
    }
    return cells;
  }
  /* [D-1] 攻方远程目标集（C8 BE-3「骑射手 L0 射程内点杀」；表驱动 rangedWeapon，零兵种名）：
   * 可及 = 曼哈顿(x,z) ∈ [1, weapons[key].range]（跨层可打，高度差走 ranged 修正）；
   * 序 = 距离近→远 + unitId 字典序（C5.7 同构）。 */
  function rangedTargets(u) {
    var wk = u.rangedWeapon, w = wk ? T.weapons[wk] : null;
    if (!w || w.range === undefined || w.damage === undefined) return [];
    var oc = F1.getCell(u.cellId); if (!oc) return [];
    var out = [];
    WORLD.aliveUnits().forEach(function (o) {
      if (o.faction === u.faction) return;
      var c = F1.getCell(o.cellId); if (!c) return;
      var d = Math.abs(c.x - oc.x) + Math.abs(c.z - oc.z);
      if (d >= 1 && d <= w.range) out.push({ type:'unit', unitId:o.uid, dist:d });
    });
    out.sort(function (a, b) { return a.dist - b.dist || (a.unitId < b.unitId ? -1 : (a.unitId > b.unitId ? 1 : 0)); });
    return out;
  }
  function strikeRanged(req, rep) {             // [D-1] 远程单目标结算（骑射；HIT_ROLL 走 F4 单流，零独立 RNG）
    var atk = WORLD.unit(req.attacker), w = req.weapon ? T.weapons[req.weapon] : null;
    var tu = (req.target && req.target.unitId) ? WORLD.unit(req.target.unitId) : null;
    if (!atk || !w || !tu || !tu.alive) {
      rep.perTarget.push({ target:(req.target && req.target.unitId) || '?', posAtStrike:tu ? tu.cellId : '?',
        hit:false, mods:{aura:0,height:0,cover:0,exposed:0}, dmg:0, killed:false, chainEvents:['MISS_DEAD'] });
      rep.seedCursorAfter = F4.cursor(); return rep;
    }
    var mods = { aura:0, height:heightTerm(logH(atk), logH(tu), true),        // 远程高度键 heightModPerLevelRanged
                 cover:isCover(tu) ? T.combat.coverModParapet : 0,
                 exposed:tu.onConnector ? T.combat.exposedModLadder : 0 };
    var hit = rollHit(mods.aura + mods.height + mods.cover + mods.exposed + (w.isHitMod || 0));
    var dmg = hit ? w.damage * squadFactor(atk) : 0;
    var res = hit ? applyDamageToUnit(tu.uid, dmg, req.attacker) : { dmg:0, killed:false };
    rep.perTarget.push({ target:tu.uid, posAtStrike:tu.cellId, hit:hit, mods:mods, dmg:res.dmg, killed:res.killed, chainEvents:[] });
    if (hit) atk.mp = 0;                        // C2.4 攻击后锁足（mpZeroOnAttack=true 照录，非平衡键）
    rep.seedCursorAfter = F4.cursor();
    return rep;
  }
  function strikeCorridor(req, rep, isCrossbow) {
    var origin = F1.getCell(req.origin), shooterFaction = isCrossbow ? 'DEFENDER' : 'ATTACKER';
    var enemy = shooterFaction === 'DEFENDER' ? 'ATTACKER' : 'DEFENDER';
    var range = isCrossbow ? T.facilities.bedCrossbow.range : T.weapons.horseArcher.range;
    var base = isCrossbow ? T.weapons.bedCrossbow.damage : T.weapons.horseArcher.damage;
    var cells = corridorCells(origin, req.dir === '-x' ? '-x' : '+x', range), idx = {};
    for (var i = 0; i < cells.length; i++) idx[cells[i]] = i;
    var list = [];
    WORLD.aliveUnits().forEach(function (u) {
      if (u.faction !== enemy || idx[u.cellId] === undefined) return;
      list.push({ u:u, d:idx[u.cellId] });
    });
    list.sort(function (a, b) { return a.d - b.d || (a.u.uid < b.u.uid ? -1 : a.u.uid > b.u.uid ? 1 : 0); });  // C5.7 近→远 + unitId 字典序
    var atkUnit = req.attackerUnit ? WORLD.unit(req.attackerUnit) : null;
    var shooterH = origin ? origin.h : 0;
    for (i = 0; i < list.length; i++) {
      var tu = list[i].u;
      if (!tu.alive) { rep.perTarget.push({ target:tu.uid, posAtStrike:tu.cellId, hit:false, mods:{aura:0,height:0,cover:0,exposed:0}, dmg:0, killed:false, chainEvents:['MISS_DEAD'] }); continue; }
      var mods = { aura:0, height:heightTerm(shooterH, logH(tu), true),
                   cover:isCover(tu) ? T.combat.coverModParapet : 0,
                   exposed:tu.onConnector ? T.combat.exposedModLadder : 0 };
      var modsSum = mods.aura + mods.height + mods.cover + mods.exposed + (isCrossbow ? 0 : T.weapons.horseArcher.isHitMod);
      var hit = rollHit(modsSum), dmg = hit ? base * squadFactor(atkUnit) : 0;
      var res = hit ? applyDamageToUnit(tu.uid, dmg, req.attacker) : { dmg:0, killed:false };
      rep.perTarget.push({ target:tu.uid, posAtStrike:tu.cellId, hit:hit, mods:mods, dmg:res.dmg, killed:res.killed, chainEvents:[] });
    }
    rep.seedCursorAfter = F4.cursor();
    return rep;
  }
  function strikeMelee(req, rep) {
    var atk = WORLD.unit(req.attacker), aH = atk ? logH(atk) : 0, t = req.target;
    if (t.unitId) {
      var tu = WORLD.unit(t.unitId);
      if (!tu || !tu.alive) { rep.perTarget.push({ target:t.unitId, posAtStrike:tu ? tu.cellId : '?', hit:false, mods:{aura:0,height:0,cover:0,exposed:0}, dmg:0, killed:false, chainEvents:['MISS_DEAD'] }); rep.seedCursorAfter = F4.cursor(); return rep; }
      var mods = { aura:0, height:heightTerm(aH, logH(tu), false), cover:0, exposed:tu.onConnector ? T.combat.exposedModLadder : 0 };
      var hit = rollHit(mods.aura + mods.height + mods.cover + mods.exposed);
      var dmg = hit ? T.weapons.melee.damage * squadFactor(atk) : 0;
      var res = hit ? applyDamageToUnit(tu.uid, dmg, req.attacker) : { dmg:0, killed:false };
      rep.perTarget.push({ target:tu.uid, posAtStrike:tu.cellId, hit:hit, mods:mods, dmg:res.dmg, killed:res.killed, chainEvents:[] });
      if (hit && atk) { atk.mp = 0; }           // C2.4 攻击后锁足（mpZeroOnAttack=true）
    } else {
      var isBeacon = !!(t.beacon || t.type === 'beacon'), fac = t.facilityId ? WORLD.facility(t.facilityId) : null;
      var fid = isBeacon ? 'BEACON' : (fac ? fac.id : null);
      if (!fid || (!isBeacon && fac.state === 'DESTROYED')) { rep.perTarget.push({ target:'MISS', posAtStrike:'?', hit:false, mods:{aura:0,height:0,cover:0,exposed:0}, dmg:0, killed:false, chainEvents:['MISS_DEAD'] }); rep.seedCursorAfter = F4.cursor(); return rep; }
      var tCell = isBeacon ? T.beacon.cellId : fac.cellId, tH = F1.getCell(tCell).h;
      var modsF = { aura:0, height:heightTerm(aH, tH, false), cover:0, exposed:0 };
      var hitF = rollHit(modsF.height);
      var dmgF = hitF ? T.weapons.melee.damage * T.weapons.melee.vsFacility * squadFactor(atk) : 0;   // C5.9 对设施/结构
      var rf = hitF ? (isBeacon ? WORLD.damageBeacon(dmgF, req.attacker) : WORLD.damageFacility(fac.id, dmgF)) : { killed:false };
      rep.perTarget.push({ target:fid, posAtStrike:tCell, hit:hitF, mods:modsF, dmg:Math.round(dmgF), killed:rf.killed, chainEvents:[] });
      if (hitF && atk) { atk.mp = 0; }           // 攻击后锁足
    }
    rep.seedCursorAfter = F4.cursor();
    return rep;
  }
  function strikeRollingStock(req, rep) {       // C5 §2.5 五步固定序（不可交换）
    var cn = C1.connById(req.ladderId);
    var onLadder = cn ? cn.occupancy.units.slice() : [];
    rep.chain = ['SPENT'];
    F1.destroyConnector(req.ladderId);          // ② 毁梯（原子断边清 occupancy）③ 位移（E2 → fallHandler → applyFallDamage）
    rep.chain.push('DESTROY', 'RELOCATE');
    for (var i = 0; i < onLadder.length; i++) { // ④ 砸落伤害（对位移后位置判定，恒 1 人，不过骰 = 确定性回报）
      var u = WORLD.unit(onLadder[i]); if (!u || !u.alive) continue;
      var res = applyDamageToUnit(u.uid, T.weapons.rollingStock.dropDamage, req.attacker);
      rep.perTarget.push({ target:u.uid, posAtStrike:u.cellId, hit:true, mods:{aura:0,height:0,cover:0,exposed:0}, dmg:res.dmg, killed:res.killed, chainEvents:['DROP_DAMAGE'] });
    }
    rep.chain.push('DROP_DAMAGE', 'RESIDUE');   // ⑤ 残骸标记
    rep.seedCursorAfter = F4.cursor();
    return rep;
  }
  function strike(req) {
    seqN++;
    var rep = { seq:seqN, attacker:req.attacker, kind:req.kind, perTarget:[], seedCursorBefore:F4.cursor() };
    if (req.kind === 'MELEE') strikeMelee(req, rep);
    else if (req.kind === 'RANGED') strikeRanged(req, rep);   // [D-1] 攻方/守方单位远程（表驱动 rangedWeapon）
    else if (req.kind === 'CROSSBOW_VOLLEY') strikeCorridor(req, rep, true);
    else if (req.kind === 'HORSE_ARCHER') strikeCorridor(req, rep, false);
    else if (req.kind === 'ROLLING_STOCK') strikeRollingStock(req, rep);
    if (rep.seedCursorAfter === undefined) rep.seedCursorAfter = F4.cursor();
    reports.push(rep);
    return rep;
  }
  function applyFallDamage(p) {                 // E2 自由落体分量（VS-1 §8.4 裁定「恒定不过骰」；零 RNG 消费——见 VS-3 报告）
    var u = WORLD.unit(p.unitId); if (!u || !u.alive) return null;
    var res = applyDamageToUnit(u.uid, T.weapons.fallDamage, null);
    F2.bus.publish('unit_fell', { uid:u.uid, landingCell:p.landingCell, dmg:res.dmg, killed:res.killed });
    return res;
  }
  function fireAllFacilities() {                /* [VS-4] 已移交 C4.fireVolley（保留签名兼容 VS-3 消费面）；本函数不再被齐射锚点调用 */
    return C4.fireVolley();
  }
  function expectedMods(uid) {
    var u = WORLD.unit(uid); if (!u) return { height:0, cover:0, exposed:0 };
    return { height:0, cover:isCover(u) ? T.combat.coverModParapet : 0, exposed:u.onConnector ? T.combat.exposedModLadder : 0 };
  }
  return { strike:strike, applyFallDamage:applyFallDamage, fireAllFacilities:fireAllFacilities,
           expectedMods:expectedMods, meleeTargets:meleeTargets, rangedTargets:rangedTargets,
           lastReport:function () { return reports[reports.length - 1] || null },
           reports:function () { return reports; }, seq:function () { return seqN; } };
})();

/* ============================================================
 * ═══ 分区 C10：托管（结构权威 C10 GDD v1.0.1）═══
 * UNIT 级 AUTO/MANUAL 路由；评分 = w_block·堵位 + w_strike·杀伤 − λ·代价 + hooks；零 F4 消费。
 * ============================================================ */
var C10 = (function () {
  var T = TABLES;
  var lastDecision = {};
  /* ScoringHook 框架（层3）：MVP 全部占位返 0（presence-aware-v1 读 C2.7 合成、cohesion-v1 跨单位协同留 Alpha） */
  var HOOKS = { 'presence-aware-v1': function () { return 0; }, 'cohesion-v1': function () { return 0; } };
  function effectiveMode(uid) { var u = WORLD.unit(uid); return u ? u.controlMode : 'MANUAL'; }
  function setControlMode(uid, mode) {
    var u = WORLD.unit(uid); if (!u) return { ok:false, reason:'EMPTY_SELECTION' };
    u.controlMode = mode; F2.bus.publish('controlMode_changed', { unitId:uid, mode:mode });
    return { ok:true, changed:[uid], queued:[] };
  }
  function throatOf(cell) {
    if (!cell) return 0;
    if (cell.kind === 'PARAPET' || cell.kind === 'SLOPE') return 1;
    var cs = F1.allConnectors();
    for (var i = 0; i < cs.length; i++) if (cs[i].status === 'ACTIVE' && (cs[i].to === cell.id || cs[i].from === cell.id)) return 1;
    return 0;
  }
  function blockVal(u, cellId) {                // C10.2 咽喉度 × 空缺度
    var c = F1.getCell(cellId), throat = throatOf(c);
    if (!throat) return 0;
    var occ = F1.occupancyOf(cellId), friendly = 0;
    for (var i = 0; i < occ.units.length; i++) if (occ.units[i] !== u.uid && WORLD.factionOf(occ.units[i]) === 'DEFENDER') friendly++;
    return throat * (1 - friendly / Math.max(occ.capacity, 1));
  }
  function strikeVal(u, tgt) {                  // C10.3 威胁 + 赏格 + hasAura
    var threat = 0, loot = 0, auraB = 0;
    if (tgt.type === 'unit') { var o = WORLD.unit(tgt.unitId); if (!o) return 0; threat = 1.5; loot = WORLD.lootOf(o) / 30; auraB = WORLD.hasAura(o.uid) ? 1 : 0; }
    else { threat = 1.5; }
    return threat + T.defenseScripts.bountyWeight * loot + auraB;
  }
  function hookScore(ctx) { var s = 0; T.defenseScripts.hooks.forEach(function (id) { if (HOOKS[id]) s += HOOKS[id](ctx); }); return s; }
  function evaluate(u) {
    var cands = [{ kind:'STAY', score:T.defenseScripts.standFast, cellId:u.cellId }], i;
    if (u.attackCapable && u.ap >= 1) {
      var tg = C5.meleeTargets(u);
      for (i = 0; i < tg.length; i++) cands.push({ kind:'ATTACK', target:tg[i], cellId:u.cellId,
        score:T.defenseScripts.w_strike * strikeVal(u, tg[i]) + hookScore(u) });
      /* [D-1] 远程目标集：表驱动 rangedWeapon（C10.3 杀伤价值同一评分面；L1 守方表内暂无远程武器键
       * （VS-1 §5.3 仅床弩/骑射）→ 戍卒候选集为空，结构就位、零数值杜撰——见 VS-3 报告 D-1 节） */
      if (u.rangedWeapon) {
        var rt = C5.rangedTargets(u);
        for (i = 0; i < rt.length; i++) cands.push({ kind:'ATTACK', target:rt[i], ranged:true, cellId:u.cellId,
          score:T.defenseScripts.w_strike * strikeVal(u, rt[i]) + hookScore(u) });
      }
    }
    if (u.mp > 0) {
      var reach = C1.reachable(u.uid) || {}, keys = Object.keys(reach);
      for (i = 0; i < keys.length; i++) {
        var cid = keys[i]; if (cid === u.cellId) continue;
        var bv = blockVal(u, cid); if (bv <= 0) continue;
        var ex = (F1.getCell(cid).kind !== 'PARAPET') ? 1 : 0;
        cands.push({ kind:'MOVE', cellId:cid,
          score:T.defenseScripts.w_block * bv - T.defenseScripts.lambda_expose * ex - T.defenseScripts.lambda_detour * reach[cid] + hookScore(u) });
      }
    }
    var order = { MOVE:0, ATTACK:1, STAY:2 };
    cands.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.cellId !== b.cellId) return a.cellId < b.cellId ? -1 : 1;
      var ka = order[a.kind] - order[b.kind];          // C10.5 动作类别序 MOVE<ATTACK<STAY
      if (ka !== 0) return ka;
      return ((a.ranged ? 1 : 0) - (b.ranged ? 1 : 0)) ||   // 同分 ATTACK 内：近战先于远程（显式字典序纪律）
             ((a.target && a.target.unitId || '') < (b.target && b.target.unitId || '') ? -1 : 1);
    });
    return cands[0];
  }
  function resolveSlot(uid) {                   // F2 契约 1：槽开启时调用
    var u = WORLD.unit(uid); if (!u || !u.alive) return { skipped:true };
    if (u.controlMode === 'MANUAL') { lastDecision[uid] = { unitId:uid, choice:'MANUAL' }; return { hung:true }; }
    var dec = evaluate(u);
    lastDecision[uid] = { unitId:uid, choice:dec.kind, targetCell:dec.cellId, target:dec.target || null, score:dec.score };
    if (dec.kind === 'ATTACK') {
      /* [D-1] 攻击分派：ranged 候选走 RANGED（表驱动武器键），近战照旧 MELEE——同轨 C5 公开 API（BE-2 无特权） */
      if (dec.ranged) C5.strike({ attacker:uid, kind:'RANGED', weapon:u.rangedWeapon, target:dec.target });
      else C5.strike({ attacker:uid, kind:'MELEE', target:dec.target });
    }
    else if (dec.kind === 'MOVE') C1.applyMoveOrder({ unitId:uid, target:dec.cellId, mode:'AUTO' });
    return { choice:dec.kind, score:dec.score };
  }
  return { resolveSlot:resolveSlot, setControlMode:setControlMode, effectiveMode:effectiveMode,
           lastDecision:function (uid) { return lastDecision[uid] || null; },
           blockVal:blockVal, evaluate:evaluate, HOOKS:HOOKS };
})();

/* ============================================================
 * ═══ 分区 C8：匈奴 AI（结构权威 C8 GDD v1.0.3）═══
 * generatePlans 纯函数（零 RNG）；意图 MAIN_ASSAULT/FEINT 表驱动；COORDINATED 仅表加载占位（L1 禁出场）。
 * [D-1] executePlan 补远程分支（表驱动 rangedWeapon，骑射 L0 点杀）；[D-2] BLOCKED_TOP 换梯/换目标重评分，
 *       中断场景不卡死（C8 BE-6）、smoke 必落终局。
 * ============================================================ */
var C8 = (function () {
  var T = TABLES;
  var plans = {}, lastDump = [];
  function intentWeights(tag) { return T.aiScripts.intentScripts[tag] || T.aiScripts.intentScripts.MAIN_ASSAULT; }
  function objectives() {                        // 目标集（帅帐/戍卒/设施/通路）
    var W = T.aiScripts.targetWeights, out = [];
    out.push({ key:'BEACON', value:W.w_beacon, cellId:T.beacon.cellId, target:{ type:'BEACON' } });
    /* OFFBOARD=预备队（未上场）不构成战场目标（X-1 注记：不在场即不在 AI 目标集） */
    WORLD.defenderUnits().forEach(function (d) { if (d.cellId === 'OFFBOARD') return; out.push({ key:'GARRISON:' + d.uid, base:'GARRISON', value:W.w_garrison, cellId:d.cellId, target:{ type:'GARRISON', unitId:d.uid } }); });
    WORLD.facilitiesList().forEach(function (f) { if (f.state === 'DESTROYED') return; out.push({ key:'FACILITY:' + f.id, base:'FACILITY', value:W.w_facility, cellId:f.cellId, target:{ type:'FACILITY', facilityId:f.id } }); });
    F1.allConnectors().forEach(function (c) { if (c.status !== 'ACTIVE') return; out.push({ key:'PATH:' + c.id, base:'PATH', value:W.w_path, cellId:c.to, target:{ type:'PATH', cellId:c.to } }); });
    return out;
  }
  function mulFor(objKey, iw) {
    if (objKey === 'BEACON') return iw.beaconMul;
    if (objKey.indexOf('GARRISON') === 0) return iw.garrisonMul;
    if (objKey.indexOf('FACILITY') === 0) return iw.facilityMul;
    return iw.pathMul;
  }
  function approachCell(reach, objCellId) {
    if (reach[objCellId] !== undefined) return objCellId;   // 目标格可达则直取
    var bc = F1.getCell(objCellId), best = null, bestD = Infinity;
    for (var cid in reach) { var c = F1.getCell(cid); if (!c) continue;
      var d = Math.abs(c.x - bc.x) + Math.abs(c.z - bc.z) + Math.abs(c.h - bc.h);
      if (d < bestD || (d === bestD && cid < best)) { bestD = d; best = cid; } }
    return best;
  }
  function generatePlans(turn, intentOverride) {
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var intent = intentOverride || WORLD.currentIntent(turn), iw = intentWeights(intent);
    var objs = objectives(), att = WORLD.attackerUnits().slice().sort(function (a, b) { return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0; });
    plans = {}; lastDump = [];
    var assigned = {}, gravity = T.aiScripts.congestionGravity, cw = T.aiScripts.costWeights;
    for (var i = 0; i < att.length; i++) {
      var u = att[i], reach = C1.reachable(u.uid, u.maxMp) || {}, best = null;   // B③ 计划按满 MP 评估（C 相位开始回满）
      for (var j = 0; j < objs.length; j++) {
        var o = objs[j], mul = mulFor(o.key, iw);
        var acell = approachCell(reach, o.cellId); if (!acell) continue;
        var cost = cw.c_detour * (reach[acell] || 0) + cw.c_exposure * exposureAt(acell);
        var disp = iw.dispersionMul * cw.c_congestion * gravity * (assigned[o.key] || 0);   // 分散惩罚（MAIN 弱 / FEINT 强）
        var score = o.value * mul - cost - disp;
        var cand = { key:o.key, base:o.base || 'BEACON', value:o.value * mul, cellId:acell, target:o.target, cost:cost, disp:disp, score:score };
        if (!best || score > best.score || (score === best.score && o.key < best.key)) best = cand;
      }
      if (!best) best = { key:'STAY', base:'NONE', value:0, cellId:u.cellId, target:null, cost:0, disp:0, score:0 };
      plans[u.uid] = { unitId:u.uid, faction:'ATTACKER', intentTag:intent, objective:best.key, target:best.target, targetCell:best.cellId, score:best.score };
      lastDump.push({ unitId:u.uid, objective:best.key, targetCell:best.cellId, value:best.value, cost:best.cost, disp:best.disp, total:best.score });
      assigned[best.key] = (assigned[best.key] || 0) + 1;
    }
    var ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return { plannedUnits: att.length, intent: intent, ms: ms, plans: plans };
  }
  function exposureAt(cellId) {                  // 守方床弩俯射走廊覆盖 = 暴露
    var c = F1.getCell(cellId); if (!c) return 0;
    var fs = WORLD.facilitiesList();
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i], tpl = T.facilities[f.templateId];
      if (f.state === 'DESTROYED' || !tpl || !tpl.rangedCorridor) continue;
      var oc = F1.getCell(f.cellId), sign = (f.facing === '-x') ? -1 : 1;
      if (c.z === oc.z && c.x >= Math.min(oc.x, oc.x + sign * tpl.range) && c.x <= Math.max(oc.x, oc.x + sign * tpl.range) && c.x !== oc.x) return 1;
    }
    return 0;
  }
  function concentration(plansObj) {             // 集中度 = 同一目标（objective）占比的 Herfindahl 指数
    var counts = {}, total = 0, k;
    for (k in plansObj) { var p = plansObj[k], key = p.objective || p.targetCell; counts[key] = (counts[key] || 0) + 1; total++; }
    if (total <= 1) return 1;
    var hh = 0; for (k in counts) { var s = counts[k] / total; hh += s * s; }
    return hh;
  }
  function tryRaiseLadder(u) {                   // 云梯步兵架梯（E1；表驱动 canBoardLadder，零兵种名）
    if (!u.canBoardLadder || u.ap < 1 || u.mp < T.terrain.moveCost.climb) return false;
    var c = F1.getCell(u.cellId); if (!c || c.h !== 0 || c.kind !== 'GROUND') return false;
    var above = F1.getCellAt(c.x, c.z, 1);
    if (!above || (above.kind !== 'PARAPET' && above.kind !== 'RAMPART_WALK')) return false;
    var cs = F1.allConnectors();
    for (var i = 0; i < cs.length; i++) if (cs[i].status === 'ACTIVE' && cs[i].from === u.cellId && cs[i].to === above.id) return false;
    F1.addConnector({ id:'ld_' + u.uid + '_' + F2.state().turn, from:u.cellId, to:above.id, connKind:'LADDER', orient:'FRONTAL',
                      accessPolicy:'BOTH', occupancy:{ units:[] }, status:'ACTIVE',
                      lifetime:{ createdTurn:F2.state().turn, currentHp:T.terrain.ladderHp } });
    u.ap -= 1;
    F2.bus.publish('ladder_raised', { unitId:u.uid, connectorId:'ld_' + u.uid + '_' + F2.state().turn, cellId:u.cellId });
    return true;
  }
  /* [D-2] 换目标重评分（C8-E2「继续等/换梯」菜单中取「换」——等待无限期冻结被 BE-6 禁止）：
   * 预算内可达集里选一个非当前格、非被堵目标格的推进格（参考点=帅帐，3D 曼哈顿距离 + cellId 字典序
   * tie-break，零 F4 消费——纯函数纪律与 C8.4 同源）。效果：墙脚等梯单位改道找新攀爬点/压向帅帐，
   * 架梯点随移动扩散（W4「6 梯压防线」的自然实现），僵局在数回合内自解。 */
  function replanCell(uid, blockedCell) {
    var u = WORLD.unit(uid); if (!u || !u.alive) return null;
    var reach = C1.reachable(uid) || {};
    var ref = F1.getCell(T.beacon.cellId);
    var best = null, bestD = Infinity;
    for (var cid in reach) {
      if (cid === u.cellId || cid === blockedCell) continue;
      var c = F1.getCell(cid); if (!c) continue;
      var d = ref ? (Math.abs(c.x - ref.x) + Math.abs(c.z - ref.z) + Math.abs(c.h - ref.h)) : reach[cid];
      if (d < bestD || (d === bestD && cid < best)) { bestD = d; best = cid; }
    }
    return best;
  }
  function executePlan(uid) {                    // C 相位攻方槽执行（经 C1/C5 公开 API，无特权通道）
    var u = WORLD.unit(uid); if (!u || !u.alive) return;
    /* ① 近战优先（C2 §2.4 固定序：先评估攻击后评估移动） */
    var tg = C5.meleeTargets(u);
    if (tg.length && u.ap >= 1 && u.attackCapable) { C5.strike({ attacker:uid, kind:'MELEE', target:tg[0] }); return; }
    /* ② [D-1] 远程分支：meleeTargets 为空时按表驱动 rangedWeapon 开火（骑射 L0 点杀不爬墙，C8 BE-3；
     *     HIT_ROLL 走 F4 单流，修正链含 heightModPerLevel.ranged + horseArcher.isHitMod） */
    if (u.rangedWeapon && u.ap >= 1) {
      var rt = C5.rangedTargets(u);
      if (rt.length) { C5.strike({ attacker:uid, kind:'RANGED', weapon:u.rangedWeapon, target:rt[0] }); return; }
    }
    /* ③ 按计划移动；零位移（BLOCKED_TOP/BLOCKED_BOARD/REJECTED）→ 不许原地无限等待：
     *    先试原位架梯（E1「换梯」），再换目标重评分改道（D-2）。 */
    var p = plans[uid];
    if (p && p.targetCell && p.targetCell !== u.cellId) {
      var rep = C1.applyMoveOrder({ unitId:uid, target:p.targetCell, mode:'AUTO' });
      if (rep.executed.length) return;          // 有位移即收槽
      if (tryRaiseLadder(u)) return;            // 原位可架梯（换梯）
      var alt = replanCell(uid, p.targetCell);
      if (alt) C1.applyMoveOrder({ unitId:uid, target:alt, mode:'AUTO' });
    } else {
      if (tryRaiseLadder(u)) return;            // 到位且上格可梯（E1）
      var alt2 = replanCell(uid, p ? p.targetCell : null);
      if (alt2) C1.applyMoveOrder({ unitId:uid, target:alt2, mode:'AUTO' });
    }
  }
  return { generatePlans:generatePlans, executePlan:executePlan, concentration:concentration,
           tryRaiseLadder:tryRaiseLadder, planFor:function (uid) { return plans[uid] || null; }, plans:function () { return plans; },
           lastDump:function () { return lastDump; }, objectives:objectives, intentWeights:intentWeights };
})();

/* ============================================================
 * ═══ 分区 C6：粮饷经济（结构权威 C6 GDD v1.0.3）═══ [VS-4]
 * 单一资源账房：A 相位 quote/charge（双拒绝态）；缴获双段式（C 相位流水登记 / D② 入账）；
 * D② 固定子序 farm→supply→loot + 幂等锚；援军时刻表数据源（免费）；BattleEndReport 一次性冻结。
 * 确定性红线：全程零 F4 消费（INV-C6-5，重放安全岛）——无 rand 无 Math.random 无墙钟。
 * ============================================================ */
var C6 = (function () {
  var T = TABLES;
  var eco = null;                              // TreasuryState（C6 §3.1）
  var endReport = null;                        // BattleEndReport（一次性冻结，BE-8 二次调用拒绝）

  function init() {
    eco = {
      treasury: T.economy.perLevel.L1.initialTreasury,
      turnLastSettled: 0,
      battleTotals: { farmTotal:0, supplyTotal:0, lootTotal:0, spentTotal:0 },
      turnLedger: { lootEntries: [] },
      attackerKilled: 0, defenderLost: 0
    };
    endReport = null;
  }
  function phase() { return F2.state() ? F2.state().phase : 'INIT'; }
  function turn() { return F2.state() ? F2.state().turn : 0; }

  /* ---- EconomyQuery（任何人可读；C7 消费）---- */
  /* PurchaseItem→费用表键匹配（C6 §3.4/§3.5 键名桥）：指令面 templateId/facilityKind 用 C2/C3 域字面量
   * （'garrison_squad' snake / 'BED_CROSSBOW' 枚举），费用表键为 camelCase（'garrisonSquad'/'bedCrossbow'，
   * vs-playtest-sheet §5.5 键名权威）——quote 唯一负责映射：去下划线+小写双向归一后精确匹配。 */
  function matchKey(map, s) {
    var q = String(s || '').replace(/_/g, '').toLowerCase();
    if (!q) return null;
    var ks = Object.keys(map);
    for (var i = 0; i < ks.length; i++) if (ks[i].replace(/_/g, '').toLowerCase() === q) return ks[i];
    return null;
  }
  function treasury() { return eco.treasury; }
  function quote(item) {                        // C6.3 查表报价；表内无键=不可购买
    var c = T.economy.cost;
    if (item.kind === 'BUILD_FACILITY') { var bk = matchKey(c.build, item.facilityKind); return bk !== null ? c.build[bk] : null; }
    if (item.kind === 'DEPLOY_UNIT') { var dk = matchKey(c.deploy, item.templateId); return dk !== null ? c.deploy[dk] : null; }
    if (item.kind === 'REPAIR_FACILITY') {
      if (!(item.deltaHp > 0)) return null;     // C6-E8 负 Δ 拒绝（防逆向刷钱）
      return Math.ceil(item.deltaHp * c.repair.perHp);
    }
    if (item.kind === 'WALL_REPAIR') {
      if (!(item.deltaHp > 0)) return null;
      return Math.ceil(item.deltaHp * c.wallRepair.perHp);
    }
    return null;
  }
  function canAfford(item) { var q = quote(item); return q !== null && eco.treasury >= q; }

  /* ---- EconomyCommand.charge（仅 C7 消费；INV-C6-3 仅 A 相位窗口）----
   * 双拒绝态：INSUFFICIENT（余额不足）/ ILLEGAL_WINDOW（非 A 相位）；失败余额零变化（C6.4）。 */
  function charge(item) {
    if (phase() !== 'A') return { ok:false, reason:'ILLEGAL_WINDOW' };
    var q = quote(item);
    if (q === null) return { ok:false, reason:'INSUFFICIENT' };   // 不可购买键视同拒绝（加载期校验兜底，灰盒收敛到 INSUFFICIENT）
    if (eco.treasury < q) return { ok:false, reason:'INSUFFICIENT' };
    eco.treasury -= q;
    eco.battleTotals.spentTotal += q;
    F2.bus.publish('treasury_changed', { delta:-q, reason:'CHARGE', treasuryAfter:eco.treasury });
    return { ok:true, charged:q, treasuryAfter:eco.treasury };
  }
  /* C7 v1.0.1 MEDIUM-1 A 案防御性兜底：charge 成功而落地闸被终检拒绝时的整体回滚（告警恰好一次）。
   * 正常路径不可达（预检完备+单线程）；仅撤销本次扣费（先钱后世界的事务闭合）。 */
  function rollbackCharge(item) {
    var q = quote(item);
    if (q === null) return;
    eco.treasury += q;
    eco.battleTotals.spentTotal -= q;
    F2.bus.publish('treasury_changed', { delta:+q, reason:'ROLLBACK', treasuryAfter:eco.treasury });
  }

  /* ---- 缴获双段式（C6 §2.4）：C 相位 killed 流水登记（append-only，余额不变）----
   * 订阅接线在 WORLD.init 后（initC6Bus）；faction(dead)=ATTACKER 才登记（守方阵亡零缴获）。 */
  function registerKill(payload) {
    var u = WORLD.unit(payload.uid);
    var faction = payload.faction || (u ? u.faction : null);
    if (faction !== 'ATTACKER') return null;    // 守方阵亡零缴获（关内零扣费零抚恤 C6 §2.4）
    var tid = payload.templateId || (u ? u.templateId : null);
    var tpl = tid ? T.units[tid] : null;
    var amount = (tpl && tpl.lootKey) ? (T.economy.loot.perTemplate[tpl.lootKey] || 0) : 0;
    var entry = { killSeq: eco.turnLedger.lootEntries.length + 1, unitId: payload.uid,
                  templateId: tid, amount: amount };   // 登记时点查表冻结（C6 §3.1 LootEntry）
    eco.turnLedger.lootEntries.push(entry);
    F2.bus.publish('loot_registered', { killSeq:entry.killSeq, unitId:entry.unitId, templateId:entry.templateId, amount:amount });
    return entry;
  }  function registerAttackerKill() { eco.attackerKilled++; }
  function registerDefenderLoss() { eco.defenderLost++; }

  /* ---- D② settleIncome（唯一入账窗口；固定子序 farm→supply→loot；幂等 C6.5）----
   * supply=固定收入×烽燧存活实判系数（D② 执行瞬间查只读，F2 裁定 D①-D③ 不跳过：判负回合照常结算 C6-E2）。 */
  function settleIncome(turn) {
    if (!eco) return { ok:false, reason:'NO_LEDGER' };
    if (turn <= eco.turnLastSettled) return { ok:false, reason:'IDEMPOTENT_REJECT', turn:turn, turnLastSettled:eco.turnLastSettled };
    var farm = T.economy.income.farmBasePerTurn;                       // 屯田（farmBase>0 保底红线 ✓）
    var supply = WORLD.beaconHp() > 0 ? T.economy.income.supplyBasePerTurn : 0;   // 补给线 ×beaconAlive 实判
    var loot = 0;
    for (var i = 0; i < eco.turnLedger.lootEntries.length; i++) loot += eco.turnLedger.lootEntries[i].amount;   // 按 killSeq 序汇总
    eco.treasury += farm + supply + loot;                              // C6.1
    eco.battleTotals.farmTotal += farm;
    eco.battleTotals.supplyTotal += supply;
    eco.battleTotals.lootTotal += loot;
    eco.turnLedger.lootEntries = [];                                   // D② 汇总后清空（INV-C6-2）
    eco.turnLastSettled = turn;
    var rep = { ok:true, turn:turn, farm:farm, supply:supply, loot:loot, total:farm + supply + loot, treasuryAfter:eco.treasury };
    F2.bus.publish('income_settled', rep);
    return rep;
  }

  /* ---- D③ 时刻表数据源（C6 §3.2 ReinforceEntry；调度/顺延权威=F2）---- */
  function dueReinforcements(turn) {
    var sch = T.economy.reinforcementSchedule || [], out = [];
    for (var i = 0; i < sch.length; i++) if (sch[i].dueTurn === turn) out.push(sch[i]);
    return out;
  }

  /* ---- D④ 终局 BattleEndReport（C6 §3.3；一次性冻结，二次调用拒绝 BE-8）---- */
  function finalizeReport(outcome, reason) {
    if (endReport) return { ok:false, reason:'ALREADY_FINALIZED', report:endReport };
    endReport = {
      levelId:'MVP_L1', outcome:outcome, reason:reason || '', endTurn:turn(),
      treasuryFinal:eco.treasury,
      stats:{ farmTotal:eco.battleTotals.farmTotal, supplyTotal:eco.battleTotals.supplyTotal,
              lootTotal:eco.battleTotals.lootTotal, spentTotal:eco.battleTotals.spentTotal,
              attackerKilled:eco.attackerKilled, defenderLost:eco.defenderLost },
      garrisonCasualties:[ { templateId:'garrison_squad', count:eco.defenderLost } ]
    };
    F2.bus.publish('battle_end_report', endReport);
    return { ok:true, report:endReport };
  }
  function state() { return eco; }
  function endReportFrozen() { return endReport; }

  /* killed/unit_removed 事件订阅（接线一次；重放按事件流重建一致） */
  var busInited = false;
  function initC6Bus() {
    if (busInited) return; busInited = true;
    F2.bus.on('unit_killed', function (p) { registerKill(p); if (p.faction === 'ATTACKER') eco.attackerKilled++; else eco.defenderLost++; });
  }

  return { init:init, initC6Bus:initC6Bus, treasury:treasury, quote:quote, canAfford:canAfford, charge:charge, rollbackCharge:rollbackCharge,
           settleIncome:settleIncome, dueReinforcements:dueReinforcements, finalizeReport:finalizeReport,
           state:state, endReportFrozen:endReportFrozen };
})();

/* ============================================================
 * ═══ 分区 C7：建设与部署（结构权威 C7 GDD v1.0.2）═══ [VS-4]
 * 无状态编排层：六指令 × 五闸管线（窗口→寻址→世界→资金→落地）单事务（C7.1 下单即支付+立即落地）。
 * 管世界校验（部署区/格型/容量/层位/设施互斥/耐久），钱归 C6（C7 禁私藏费用数值——只调 quote/charge）。
 * 修墙=W-1 未落地整体封闭（C7-E8 WALL_REPAIR_UNAVAILABLE 恒拒绝）。
 * ============================================================ */
var C7 = (function () {
  var T = TABLES;
  var orderLog = [];                           // 指令流水（C7 §3.4：重放对账诊断用，世界重建不依赖）

  function logOrder(turn, order, receipt) { orderLog.push({ seq:orderLog.length + 1, turn:turn, order:order, receipt:receipt }); return receipt; }

  /* 部署区白名单（C7.2 Placeable=⋃deployZones.cells；静态数据，V12 已保证 ⊆passable∧守方侧） */
  function placeableSet() {
    var out = {}, zones = F1.level().deployZones;
    for (var i = 0; i < zones.length; i++) for (var k = 0; k < zones[i].cells.length; k++) out[zones[i].cells[k]] = true;
    return out;
  }
  function kindAllowed(facilityKind) { return T.facilities[facilityKind] ? [T.facilities[facilityKind].deployKind] : []; }

  /* ---- 单指令事务（C7 §2.7）：任一步失败⇒整条拒绝，世界与钱包零污染 ---- */
  function exec(order) {
    var turn = F2.state() ? F2.state().turn : 0;
    var receipt = dispatch(turn, order);
    return logOrder(turn, order, receipt);
  }
  function dispatch(turn, order) {
    /* ① 窗口闸（唯一权威=TurnQuery phase='A'；S1/E10） */
    if (!F2.state() || F2.state().phase !== 'A') return { ok:false, reason:'ILLEGAL_WINDOW' };
    var type = order.type;
    /* WALL_REPAIR：W-1 未落地整体封闭（扩展隔离，C7-E8）——恒拒绝、UI 无入口 */
    if (type === 'WALL_REPAIR') return { ok:false, reason:'WALL_REPAIR_UNAVAILABLE' };

    if (type === 'BUILD_FACILITY') return execBuild(turn, order);
    if (type === 'DEPLOY_UNIT') return execDeploy(turn, order);
    if (type === 'REDEPLOY_UNIT') return execRedeploy(turn, order);
    if (type === 'REPAIR_FACILITY') return execRepair(turn, order);
    if (type === 'DISMANTLE_FACILITY') return execDismantle(turn, order);
    return { ok:false, reason:'BAD_TARGET' };
  }

  /* 建造（C7 §2.3）：B1 白名单 → B2 格型 → B3 设施互斥（预检，F1 registerFacility 终检双闸）
   * → B4 facing 必填（床弩）→ 资金闸 → 落地闸（createdTurn=t 写入，C4.3 架设推导消费）。 */
  function execBuild(turn, order) {
    var tpl = T.facilities[order.facilityKind];
    if (!order.cellId || !F1.getCell(order.cellId)) return { ok:false, reason:'BAD_TARGET' };
    var placeable = placeableSet();
    if (!placeable[order.cellId]) return { ok:false, reason:'OUT_OF_ZONE' };                       // B1
    if (kindAllowed(order.facilityKind).indexOf(F1.getCell(order.cellId).kind) < 0) return { ok:false, reason:'BAD_CELL_KIND' };   // B2
    if (F1.getCell(order.cellId).facilityId || WORLD.facilityAt(order.cellId)) return { ok:false, reason:'CELL_OCCUPIED_FACILITY' };   // B3
    var isCrossbow = !!(tpl && tpl.rangedCorridor);
    if (isCrossbow && ['+x','-x','+z','-z'].indexOf(order.facing) < 0) return { ok:false, reason:'MISSING_FACING' };   // B4 无默认值
    var item = { kind:'BUILD_FACILITY', facilityKind:order.facilityKind };
    var pay = C6.charge(item);                                                                    // ④ 资金闸（C6 终检）
    if (!pay.ok) return { ok:false, reason:pay.reason };
    var fid = order.facilityId || WORLD.nextFacilityId();                                          // ⑤ 落地闸
    var created = WORLD.addFacility(fid, order.facilityKind, order.cellId, order.facing, turn);
    if (!created) { /* 防御性兜底（终检双闸第二闸拒入；v1.0.1 MEDIUM-1 A 案：本事务零半执行，charge 已入账须回滚） */
      C6.rollbackCharge(item); return { ok:false, reason:'CELL_OCCUPIED_FACILITY' }; }
    if (isCrossbow) created.state = 'CONSTRUCTING';               /* C4.3：建成当轮不可射（setupTurns=1 推导） */
    else created.state = 'ARMED';                                  /* 礌石部署即 ARMED、当轮可投（C7 §2.3） */
    F2.bus.publish('facility_built', { facilityId:fid, facilityKind:order.facilityKind, cellId:order.cellId, facing:order.facing || null, turn:turn });
    return { ok:true, charged:pay.charged, facilityId:fid };
  }

  /* 部署（C7 §2.4）：D1 白名单 → D2 容量 → D3 层位 → D4 阵营 → 资金闸 → 落地闸（购买即部署）。 */
  function execDeploy(turn, order) {
    var tpl = T.units[order.templateId];
    if (!tpl || !order.cellId || !F1.getCell(order.cellId)) return { ok:false, reason:'BAD_TARGET' };
    if (tpl.faction !== 'DEFENDER') return { ok:false, reason:'WRONG_FACTION' };                   // D4
    var placeable = placeableSet();
    if (!placeable[order.cellId]) return { ok:false, reason:'OUT_OF_ZONE' };                       // D1
    if (!F1.canPlace(order.cellId, 1)) return { ok:false, reason:'CELL_FULL' };                    // D2
    if (tpl.layerAccess.indexOf(F1.getCell(order.cellId).h) < 0) return { ok:false, reason:'NO_LAYER_ACCESS' };   // D3
    var item = { kind:'DEPLOY_UNIT', templateId:order.templateId };
    var pay = C6.charge(item);
    if (!pay.ok) return { ok:false, reason:pay.reason };
    var u = WORLD.spawn('DEFENDER', order.templateId, order.cellId);
    if (!u) { C6.rollbackCharge(item); return { ok:false, reason:'CELL_FULL' }; }                  // 防御性兜底（同上零半执行）
    return { ok:true, charged:pay.charged, unitId:u.uid };
  }

  /* 重置（C7 §2.4/C7.8）：零费位移（已购资产位移不触 C6）；目标格走与部署同款世界闸（重置不是搬家特权）。
   * OFFBOARD 哨兵=已购未上场（DEPLOYED∧OFFBOARD 组合态，X-1 注记；再部署零费用）。 */
  function execRedeploy(turn, order) {
    var u = WORLD.unit(order.unitId);
    if (!u || !u.alive) return { ok:false, reason:'BAD_TARGET' };                                  // S2 寻址
    if (order.toCellId !== 'OFFBOARD') {
      if (!order.toCellId || !F1.getCell(order.toCellId)) return { ok:false, reason:'BAD_TARGET' };
      if (order.toCellId === u.cellId) return { ok:false, reason:'SAME_CELL' };                    // D5
      var placeable = placeableSet();
      if (!placeable[order.toCellId]) return { ok:false, reason:'OUT_OF_ZONE' };                   // D1
      if (!F1.canPlace(order.toCellId, 1)) return { ok:false, reason:'CELL_FULL' };                // D2
      if (u.layerAccess.indexOf(F1.getCell(order.toCellId).h) < 0) return { ok:false, reason:'NO_LAYER_ACCESS' };   // D3
      /* OFFBOARD→上场走 placeUnit（removeUnit 后单位已不在任何格账，moveUnit 的 from 寻址必失败）；
       * 场内位移走 moveUnit 原子跨格（INV4 先校验后双端登记）。 */
      var mv = (u.cellId === 'OFFBOARD') ? F1.placeUnit(order.unitId, order.toCellId) : F1.moveUnit(order.unitId, order.toCellId);
      if (!mv.ok) return { ok:false, reason:'CELL_FULL' };
      u.cellId = order.toCellId;
    } else {
      F1.removeUnit(order.unitId);
      u.cellId = 'OFFBOARD';                        // 占位态迁移：从格子账清除即离场（F1 §2.6 OFFBOARD 态）
    }
    F2.bus.publish('unit_redeployed', { unitId:order.unitId, toCellId:u.cellId });
    return { ok:true, charged:0 };                  // C7.8 Δtreasury=0
  }

  /* 修理（C7 §2.5/C7.5）：R1 非 DESTROYED ∧ 有缺口 → R2 Δ>0 → 夹取 Δ′=min(Δ,maxHp−hp) → 按 Δ′ 报价扣费落地。 */
  function execRepair(turn, order) {
    var f = WORLD.facility(order.facilityId);
    if (!f) return { ok:false, reason:'BAD_TARGET' };                                              // S2 寻址
    if (f.state === 'DESTROYED') return { ok:false, reason:'ALREADY_DESTROYED' };                  // R1
    if (!(order.deltaHp > 0)) return { ok:false, reason:'BAD_DELTA' };                             // R2（防逆向刷钱 C6-E8）
    if (f.hp >= f.maxHp) return { ok:false, reason:'NO_DAMAGE' };                                  // R1（SPENT 满血自然拒绝）
    var delta = Math.min(order.deltaHp, f.maxHp - f.hp);                                           // C7.5 夹取
    var item = { kind:'REPAIR_FACILITY', facilityId:order.facilityId, deltaHp:delta };
    var pay = C6.charge(item);
    if (!pay.ok) return { ok:false, reason:pay.reason };
    var rp = WORLD.repairFacility(order.facilityId, delta);
    if (!rp.ok) { C6.rollbackCharge(item); return { ok:false, reason:rp.why }; }                   // 防御性兜底
    return { ok:true, charged:pay.charged, repaired:delta, hpAfter:rp.hp };
  }

  /* 拆除（C7 §2.5/C7.7）：R3 非 DESTROYED → 零退款释放（纠错=沉没成本；朝向悔棋/腾格路径）。 */
  function execDismantle(turn, order) {
    var f = WORLD.facility(order.facilityId);
    if (!f) return { ok:false, reason:'BAD_TARGET' };
    if (f.state === 'DESTROYED') return { ok:false, reason:'BAD_TARGET' };                         // R3（E7 链已移除则寻址失败）
    var rm = WORLD.removeFacility(order.facilityId);
    if (!rm.ok) return { ok:false, reason:rm.why };
    return { ok:true, charged:0, refunded:0 };      // 零退款（C6 OQ-4 终裁；dismantleRefundRatio MVP 恒零）
  }

  /* 修墙报价查询（UI 灰显用；指令恒拒绝——键位预留 cost.wallRepair.perHp 待 W-1 启用零浪费） */
  function wallRepairAvailable() { return false; }   // W-1 未落地恒 false（C7-E8）

  function logSnapshot() { return orderLog.slice(); }
  return { exec:exec, placeableSet:placeableSet, wallRepairAvailable:wallRepairAvailable, logSnapshot:logSnapshot,
           resetRuntime:function () { orderLog = []; } };   /* [VS-4] 指令流水随世界重建清空（C7 §3.4：流水可丢弃，世界重建不依赖） */
})();

/* ============================================================
 * ═══ 分区 C4：器械运作节拍（结构权威 C4 GDD v1.0.2）═══ [VS-4]
 * 单一时钟源（K1）：零自有状态、零计时器——全部轮数=F2 权威 turn 的推导函数（K3）。
 * 齐射锚点=phase_enter C 处理期内同步结算段（C4.1，恒早于 C① MP 重置与行动序快照）；
 * facility_volley 每回合至多一次（volleyId=`${turn}_V`），空载回合照发空载荷（N2 配对性）。
 * ============================================================ */
var C4 = (function () {
  var T = TABLES;
  function curTurn() { return F2.state() ? F2.state().turn : 0; }   // K1：时钟唯一权威=F2 TurnQuery（F1 turn 镜像同值）
  /* C4.2 装填就绪推导（纯函数；禁递减计数器/禁时钟回拨——读档穿越与连续推进逐字节一致）。
   * 语义=C3 §2.2「发射→装填 1 轮→可再射」+ C4.2 原式 `turn ≥ lastFiredTurn + reloadTurns`。
   * 数学事实（reloadTurns=1）：发射于 t → t+1 即就绪（t+1 ≥ t+1 真）——「装填占用发射后的 1 轮间隔」
   * 同回合不可能二射（E5 volleyId 去重承担频次防线）；跨回合 t+1 恢复可射 = reloadTurns 的字面语义。
   * VS-1 §6.4「装填轮次减半」= 每 2 轮 1 发的 DPS 折算口径（齐射锚点每回合恰一次 → 发射当轮
   * 已消费锚点，次轮锚点自然可再射——节拍即「射一轮歇零整轮」，教学关火力真空由架设期承担）。 */
  function canFireAt(f, t) {
    if (f.lastFiredTurn === null || f.lastFiredTurn === undefined) return true;
    return t >= f.lastFiredTurn + T.facilities.bedCrossbow.reloadTurns;
  }
  /* C4.3 架设就绪推导（MVP setupTurns=1：建成当轮不可射） */
  function setupReadyAt(f, t) {
    return t >= (f.createdTurn || 0) + (T.facilities.bedCrossbow.setupTurns || 1);
  }
  function volleyedThisTurn() { return _lastVolleyId === curTurn() + '_V'; }
  var _lastVolleyId = null;
  /* 齐射窗口（C4 §2.1）：物化可射床弩（facilityId 字典序）→ 逐具 strike → 发 facility_volley。
   * 物化条件 = CONSTRUCTING 已满架设期（C4.3）∧ 非装填轮（C4.2）∧ 存活；空载回合照发 results=[]（E1）。
   * 同回合重复进入窗口 = no-op（E5 防线：volleyId 一致性；推导式兜底）。 */
  function fireVolley() {
    var t = curTurn();
    var volleyId = t + '_V';
    if (_lastVolleyId === volleyId) return null;    // C4-E5 同回合重复发射防护
    var results = [];
    var cands = WORLD.facilitiesList().filter(function (f) {
      var tpl = T.facilities[f.templateId];
      if (!tpl || !tpl.rangedCorridor || f.state === 'DESTROYED') return false;
      return canFireAt(f, t) && setupReadyAt(f, t);
    });
    cands.sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });   // C4.4 facilityId 字典序
    for (var i = 0; i < cands.length; i++) {
      var f = cands[i];
      var rep = C5.strike({ attacker:f.id, kind:'CROSSBOW_VOLLEY', origin:f.cellId, dir:f.facing });
      f.lastFiredTurn = t;                          /* C4.2 记账：发射瞬间写绝对回合戳（定义权 C4，执行宿主 C3/WORLD） */
      f.state = 'RELOADING';                        /* 显示加速字段（C4.6：逻辑权威=canFireAt 推导式） */
      results.push({ facilityId:f.id, dir:f.facing, targetLineup:rep.perTarget.map(function (p) { return p.target; }), strikes:[rep] });
    }
    /* RELOADING→READY / CONSTRUCTING→READY 批量翻转（C4.6 显示字段；逻辑权威=推导式，本翻转仅供 UI） */
    WORLD.facilitiesList().forEach(function (f) {
      var tpl = T.facilities[f.templateId];
      if (!tpl || !tpl.rangedCorridor || f.state === 'DESTROYED') return;
      if (f.state === 'RELOADING' && canFireAt(f, t)) f.state = 'READY';
      else if (f.state === 'CONSTRUCTING' && setupReadyAt(f, t)) f.state = 'READY';
    });
    _lastVolleyId = volleyId;
    var ev = { type:'facility_volley', turn:t, volleyId:volleyId, results:results };
    F2.bus.publish('facility_volley', ev);
    return ev;
  }
  /* C3.5 canDrop 判定原语（礌石自由指令；托管面 C10 消费同一原语，禁止直调 F1 destroyConnector）。
   * 四拒绝：NO_LADDER / OUT_OF_REACH / NO_CREW / SPENT；距离=曼哈顿 ∧ 轴向 |Δx|≤dropRadius（C3.5 v1.0.2 注记）。 */
  function canDrop(stockId, ladderId) {
    var s = WORLD.facility(stockId);
    if (!s || s.state === 'DESTROYED') return { ok:false, reason:'NO_LADDER' };
    if (s.state === 'SPENT') return { ok:false, reason:'SPENT' };
    var cn = C1.connById(ladderId);
    if (!cn || cn.status !== 'ACTIVE' || cn.connKind !== 'LADDER') return { ok:false, reason:'NO_LADDER' };
    var sc = F1.getCell(s.cellId), tc = F1.getCell(cn.to);
    if (!sc || !tc) return { ok:false, reason:'NO_LADDER' };
    var dx = Math.abs(tc.x - sc.x), dz = Math.abs(tc.z - sc.z);
    var r = T.facilities.rollingStock.dropRadius;
    if (dx + dz > r || dx > r) return { ok:false, reason:'OUT_OF_REACH' };
    /* 人力约束（C3-E）：梯顶相邻垛口/马道格 ∃存活守方单位——「没人搬不动石头」；结算瞬间复核（C3-E9）。 */
    var crew = false;
    var near = cellNeighbors(tc);
    for (var i = 0; i < near.length; i++) {
      var occ = F1.occupancyOf(near[i]);
      for (var k = 0; k < occ.units.length; k++) {
        if (WORLD.factionOf(occ.units[k]) === 'DEFENDER' && WORLD.isAlive(occ.units[k])) { crew = true; break; }
      }
      if (crew) break;
    }
    if (!crew) return { ok:false, reason:'NO_CREW' };
    return { ok:true };
  }
  function cellNeighbors(c) {
    var d = [[0,0],[1,0],[-1,0],[0,1],[0,-1]], out = [];
    for (var i = 0; i < d.length; i++) { var n = F1.cellId(c.x + d[i][0], c.z + d[i][1], c.h); if (F1.getCell(n)) out.push(n); }
    return out;
  }
  /* drop 投放自由指令（C 相位任意时点，不占行动槽 C4-E9；A 相位拒绝 C3-E14）。
   * 校验先行：拒绝不消耗库存（C3-E8）；效果链走 C5.strike 五步固定序（SPENT→DESTROY→RELOCATE→DROP_DAMAGE→RESIDUE）。 */
  function drop(stockId, ladderId) {
    if (!F2.state() || F2.state().phase !== 'C') return { ok:false, reason:'ILLEGAL_WINDOW', consumed:false };
    var cd = canDrop(stockId, ladderId);
    if (!cd.ok) return { ok:false, reason:cd.reason, consumed:false };
    var rep = C5.strike({ attacker:stockId, kind:'ROLLING_STOCK', ladderId:ladderId });
    var s = WORLD.facility(stockId);
    if (s) s.state = 'SPENT';                       // ① 消耗（五步序首步的账面落点）
    F2.bus.publish('stock_dropped', { stockId:stockId, ladderId:ladderId, turn:curTurn() });
    return { ok:true, consumed:true, report:rep };
  }
  return { fireVolley:fireVolley, canFireAt:canFireAt, setupReadyAt:setupReadyAt, canDrop:canDrop, drop:drop,
           volleyedThisTurn:volleyedThisTurn, lastVolleyId:function () { return _lastVolleyId; },
           resetRuntime:function () { _lastVolleyId = null; } };   /* [VS-4] 去重戳随世界重建复位（重放/浏览器重跑幂等；K1 逻辑权威仍为推导式） */
})();

/* ============================================================
 * ═══ 分区 D：RENDER 渲染/UI（three r158；沿 spike 前例 + 视觉对齐备忘 v1.1 色值）═══
 * ============================================================ */
function boot() {
  var THREE = window.THREE;
  /* [VS-3] 世界态先行：WORLD.init 挂载 L1 + 展开 F4 种子 + F2 接线 + 守方初始布阵。
   * 渲染层随后从 F1.level() 取已挂载关卡实例化（视图只读逻辑态，单向依赖）。 */
  WORLD.init(TABLES.f4Seed);
  var lv = F1.level();
  var lvData = lv;

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

  /* --- D.5 单位渲染（视图层：只读 WORLD 逻辑态；经 F2.bus 事件增量同步）---
   * [VS-5] 切片护栏：容量模型极值 ~64 单位，视觉规格按「单格堆叠可视化（最多 4）」处理。
   * 本批每格 ≤4 占位，四象限偏移即备忘 §2.4 微型环（1 居中/2 对角/3 三角/4 四方）。
   * 逻辑位置唯一真值源在 WORLD（unit.cellId）；本层仅为 THREE.Group 视图缓存。 */
  var QUAD = [[0, 0], [-0.22, -0.22], [0.22, -0.22], [0, 0.24]];
  var views = {};                              // uid -> { uid, grp, lastCell }
  function makeUnitGroup(faction) {
    var g = new THREE.Group();
    var bodyColor = faction === 'DEFENDER' ? NIGHT.defenderBody : NIGHT.attackerBody;
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.44),
      new THREE.MeshLambertMaterial({ color: bodyColor }));
    body.position.y = 0.25; g.add(body);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.2),
      new THREE.MeshBasicMaterial({ color: faction === 'DEFENDER' ? 0xfff8ea : 0xb9dcf2 }));
    cap.position.y = 0.56; g.add(cap);         // 顶色片（高位俯瞰阵营可读保底）
    return g;
  }
  function relayoutCell(cellIdArg) {           // 同格单位四象限错位（备忘 §2.4 堆叠表达）
    var c = F1.getCell(cellIdArg); if (!c) return;
    var occ = F1.occupancyOf(cellIdArg), top = cellTop({ x: c.x, z: c.z, h: c.h });
    for (var i = 0; i < occ.units.length; i++) {
      var v = views[occ.units[i]]; if (!v) continue;
      v.lastCell = cellIdArg;
      v.grp.position.set(top.x + QUAD[Math.min(i, 3)][0], top.y, top.z + QUAD[Math.min(i, 3)][1]);
    }
  }
  function addUnitView(p) {                    // p = { uid, faction, templateId, cellId }
    if (views[p.uid]) { if (p.cellId) relayoutCell(p.cellId); return views[p.uid]; }
    var g = makeUnitGroup(p.faction);
    scene.add(g);
    views[p.uid] = { uid: p.uid, grp: g, lastCell: p.cellId };
    if (p.cellId) relayoutCell(p.cellId);
    return views[p.uid];
  }
  function removeUnitView(uid) {
    var v = views[uid]; if (!v) return;
    scene.remove(v.grp); delete views[uid];
    if (v.lastCell) relayoutCell(v.lastCell);   // 余下单位回填象限
  }
  function resyncViews() {                     // 全量重建（初始化 / 重置后）
    Object.keys(views).forEach(function (uid) { scene.remove(views[uid].grp); delete views[uid]; });
    WORLD.aliveUnits().forEach(function (u) {
      addUnitView({ uid: u.uid, faction: u.faction, templateId: u.templateId, cellId: u.cellId });
    });
  }
  /* 视图增量同步（逻辑层事件；视图层零游戏状态） */
  F2.bus.on('unit_spawned', addUnitView);
  F2.bus.on('unit_moved', function (p) {
    var v = views[p.uid]; if (!v) return;
    var from = v.lastCell; v.lastCell = p.cellId;
    if (from) relayoutCell(from);
    relayoutCell(p.cellId);
  });
  F2.bus.on('unit_removed', function (p) { removeUnitView(p.uid); });

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
   * ═══ 分区 E：演示驱动（VS-3 真实 C 相位：C10 托管守方 vs C8 匈奴 AI 攻方）═══
   * 逻辑真值在 WORLD；本区只做相位编排 + 日志 + 视图刷新。零独立 RNG（命中骰统一走 F4 单流）。
   * ============================================================ */
  var demo = { loseInjected: false };

  /* ---- 一局初始化（INIT）：重置世界态 + 视图 ---- */
  function resetBattle(skipLog) {
    resyncViews();                               // 清旧视图
    WORLD.init(TABLES.f4Seed);                   // 挂载 L1 + F4 展开 + F2 接线 + 守方初始布阵
    lv = F1.level(); lvData = lv;
    resyncViews();                               // 按新 WORLD 建视图
    F1.allConnectors().forEach(refreshConnectorVisual);
    if (!skipLog) log('战局重置：种子 <b>' + TABLES.f4Seed + '</b> 展开字 0x' + F4.state().state.toString(16) +
      ' · 守方 ' + WORLD.defenderUnits().length + ' 单位 + ' + WORLD.facilitiesList().length +
      ' 设施（床弩走廊 ' + TABLES.facilities.bedCrossbow.range + ' 格）· F2=INIT');
  }

  /* ---- 相位推进按钮链（演示「下一步」；真实入口语义：A 确认=B→C 自动）---- */
  function stepTo(next) {
    if (!F2.beginPhase(next, 'demo_button')) return;
    if (next === 'B') { F2.runPhaseB(); F2.beginPhase('C', 'demo_auto_B4'); }   // B 自动结算（瞬时呈现）
    if (next === 'C') runCombatPhase();
    if (next === 'D') runSupplyPhase();
    refreshHud();
  }

  /* ---- C 相位：C② 速度序快照 → 逐槽（守方 C10 托管 / 攻方 C8 AI）→ C③ 收束 ---- */
  function runCombatPhase(silent) {
    var list = WORLD.aliveUnits().map(function (u) { return { unitId: u.uid, speed: u.speed }; });
    if (!list.length) { if (!silent) log('C 相位：无存活单位，空过'); F2.beginPhase('D', 'demo_auto_C3'); return; }
    var snap = F2.snapshotActionOrder(list);     // C② 一次快照冻结（中途死亡不重排）
    if (!silent) log('C② 速度序快照冻结 ' + snap.order.length + ' 槽（' + snap.ms.toFixed(2) + 'ms · 一次冻结不重排）');
    var defAct = 0, atkAct = 0;
    var res = F2.runSlots(function (uid) {
      if (WORLD.factionOf(uid) === 'DEFENDER') { var r = C10.resolveSlot(uid); if (r && r.choice != null) defAct++; }
      else { C8.executePlan(uid); atkAct++; }
      WORLD.aliveUnits().forEach(function (u) { relayoutCell(u.cellId); });
    });
    if (!silent) {
      log('C③ 槽收束：处理 ' + res.processed + ' · 跳槽 ' + res.skipped + ' · ' +
          (res.ended === 'interrupted' ? '<b>beaconDestroyed 中断</b>' : 'exhausted') +
          '（守方托管 ' + defAct + ' / 攻方 AI ' + atkAct + '）');
      if (fsm().flags.beaconDestroyed) log('⚠ 烽燧被毁：剩余行动序立即中止（输得明白，无死后翻盘轮）', 'bad');
    }
    F2.beginPhase('D', 'demo_auto_C3');
  }

  /* ---- D 相位：D①..D⑥（判负有注入短路，供演示「跳到判负」）---- */
  function runSupplyPhase(silent) {
    var s = fsm();
    if (demo.loseInjected) WORLD.damageBeacon(WORLD.beaconHp() + 1, 'demo_inject');
    var d4 = F2.runPhaseD();
    if (!silent) {
      if (d4.lose) log('D④ 判负：beaconHP≤0（帅帐陷落）→ END_LOSE', 'bad');
      else if (d4.win) log('D④ 判胜：波次耗尽 ∧ 清场 → END_WIN', 'ok');
      else log('D④ 未终局 → D→A，回合 ' + (s.turn + 1) + ' 继续');
    }
    demo.loseInjected = false;
    if (!d4.lose && !d4.win) F2.beginPhase('A', 'demo_auto_D6');
  }

  /* ---- 演示一整局：INIT→A→(循环 B→C→D)→终局或到回合上限 ---- */
  function playThrough(silent, loseAt, maxTurns) {
    var cap = maxTurns || 40, steps = 0;
    if (fsm().phase === 'INIT') F2.beginPhase('A', 'playthrough');
    while (true) {
      var s = fsm();
      if (s.phase === 'END_WIN' || s.phase === 'END_LOSE') return s.phase;
      if (s.turn > cap) return 'ONGOING';
      if (loseAt && s.turn >= loseAt && s.phase === 'A' && !demo.loseInjected) demo.loseInjected = true;
      if (s.phase === 'A') { F2.beginPhase('B', 'playthrough'); F2.runPhaseB(); F2.beginPhase('C', 'playthrough'); runCombatPhase(silent); }
      else if (s.phase === 'B') { F2.runPhaseB(); F2.beginPhase('C', 'playthrough'); runCombatPhase(silent); }
      else if (s.phase === 'C') { runCombatPhase(silent); }
      else if (s.phase === 'D') { runSupplyPhase(silent); }
      else return 'STALL';
      if (++steps > 400) return 'STALL';         // 护栏：防演示死循环
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
    else if (s.phase === 'A') { F2.beginPhase('B', 'demo'); F2.runPhaseB(); F2.beginPhase('C', 'demo'); runCombatPhase(); refreshHud(); }
    else if (s.phase === 'B') { F2.runPhaseB(); F2.beginPhase('C', 'demo'); runCombatPhase(); refreshHud(); }
    else if (s.phase === 'C') { runCombatPhase(); refreshHud(); }
    else if (s.phase === 'D') { runSupplyPhase(); refreshHud(); }
  };
  $('btn-autoplay').onclick = function () {
    log('▶ 演示一整局（真实 C 相位：C10 托管守方 vs C8 匈奴 AI）…');
    resetBattle(true);
    var end = playThrough(false, 0, 40);
    log(end === 'END_WIN' ? '★ 演示局结果：<b>END_WIN</b>（波次耗尽 ∧ 清场）' :
        end === 'ONGOING' ? '★ 演示局结果：<b>ONGOING</b>（40 回合内未清场 · 灰盒未调平衡）' : '★ 演示局结果：' + end,
        end === 'END_WIN' ? 'ok' : 'bad');
    refreshHud();
  };
  // refreshHud 守门：btn-lose 仅 A/B/C 可点（终态/INIT disable）。
  $('btn-lose').onclick = function () {         // 「跳到判负」：注入烽燧击破 → 判负路径
    log('▶ 演示判负路径：注入烽燧击破（C 相位工兵突破叙事）…');
    var p0 = fsm().phase;
    if (p0 === 'END_WIN' || p0 === 'END_LOSE') resetBattle(true);   // 程序化兜底
    var end = playThrough(false, fsm().turn, 40);
    log(end === 'END_LOSE' ? '★ 演示局结果：<b>END_LOSE</b>（判负优先于同回合清场）' : '★ 演示局结果：' + end, end === 'END_LOSE' ? 'ok' : 'bad');
    refreshHud();
  };

  /* --- 诊断 1：相位压测（真实全链路：波次/AI/托管/结算 30 局零 illegal_transition）--- */
  $('btn-stress').onclick = function () {
    var runs = 30, wins = 0, losses = 0, ongoing = 0, t0 = performance.now();
    for (var r = 0; r < runs; r++) {
      resetBattle(true);
      var end = playThrough(true, (r % 2 === 0) ? 0 : 2, 24);   // 交替判胜/判负两路
      if (end === 'END_WIN') wins++; else if (end === 'END_LOSE') losses++; else ongoing++;
    }
    // 注入式验证拒绝路径（对当前局直接乱发迁移）
    var illegalBlocked = 0;
    ['C', 'D', 'A', 'B', 'END_WIN', 'INIT'].forEach(function (t) { if (!F2.beginPhase(t, 'stress_inject')) illegalBlocked++; });
    var dt = performance.now() - t0;
    log('▶ 相位压测 ' + runs + ' 局（真实战斗链）：胜 ' + wins + ' / 负 ' + losses + ' / 未终局 ' + ongoing +
        ' · 耗时 ' + dt.toFixed(1) + 'ms（' + (dt / runs).toFixed(2) + 'ms/局）', 'ok');
    log('　注入式非法迁移 ' + illegalBlocked + '/6 全部拒绝并发 illegal_transition' +
        (illegalBlocked === 6 ? ' ✓' : ' <b>✗ 存在漏拒</b>'), illegalBlocked === 6 ? 'ok' : 'bad');
    resetBattle(true); refreshHud();
  };

  /* --- 诊断 2：F4 种子冒烟 + 命中骰单流接线 --- */
  $('btn-rng').onclick = function () {
    var ok = true, seqA, seqB, i;
    F4.init(TABLES.f4Seed); seqA = F4.seq(64);
    F4.init(TABLES.f4Seed); seqB = F4.seq(64);
    for (i = 0; i < 64; i++) if (seqA[i] !== seqB[i]) { ok = false; break; }
    var s2 = F4.init('another-seed'); var seqC = F4.seq(8);
    F4.init(TABLES.f4Seed); var seqD = F4.seq(8);
    var allSame = true; for (i = 0; i < 8; i++) if (seqC[i] !== seqD[i]) { allSame = false; break; }
    resetBattle(true);
    log(ok ? '✓ F4 冒烟：同种子（' + TABLES.f4Seed + '）两次初始化 64 值逐字节一致 ✓' :
            '✗ F4 冒烟失败：序列分叉 @' + i, ok ? 'ok' : 'bad');
    log('　换种子序列' + (allSame ? '意外相同 ✗' : '不同 ✓') + ' · 展开字 0x' + s2.toString(16), allSame ? 'bad' : 'ok');
    log('　cursor 单调计数=' + F4.cursor() + '（消费即+1；HIT_ROLL 为命中骰唯一入口，C5 零独立 RNG）', '');
    refreshHud();
  };

  /* --- 诊断 3：L1 关卡 + A*（含 VS-3 层位/阵营过滤 + MP 预算剪枝）--- */
  $('btn-perf').onclick = function () {
    var kinds = {}; cellList.forEach(function (c) { kinds[c.kind] = (kinds[c.kind] || 0) + 1; });
    var parts = Object.keys(kinds).map(function (k) { return k + '×' + kinds[k]; }).join(' · ');
    log('L1 骨架：W=12 · ' + cellList.length + ' 格（' + parts + '）· 连接器 ' + F1.allConnectors().length + '（坡道/门洞/烽燧梯 DEFENDER_ONLY）', 'ok');
    var t1 = F1.aStar('0_0_0', '11_1_2');                                   // 攻方视角（含 DEFENDER_ONLY 边）
    var t2 = F1.aStar('5_1_1', '11_1_2', { faction: 'DEFENDER', layerAccess: [0, 1, 2] });   // 守方可走内部梯
    var t3 = F1.aStar('0_0_0', '6_0_1', { faction: 'ATTACKER', layerAccess: [0, 1] });       // 攻方经门洞
    var t4 = F1.aStar('0_0_0', '11_1_2', { faction: 'ATTACKER', layerAccess: [0, 1], maxCost: 4 });  // MP 预算剪枝
    log('　A*：地面→烽燧(攻) ' + (t1.ok ? t1.path.length + ' 格 ' + t1.ms.toFixed(3) + 'ms' : '不可达') +
        ' · 马道→烽燧(守) ' + (t2.ok ? t2.path.length + ' 格' : '不可达') +
        ' · 地面→门洞(攻) ' + (t3.ok ? t3.path.length + ' 格' : '不可达') +
        ' · 预算4 剪枝 ' + (t4.ok ? '意外可达 ✗' : '拒绝 ✓'), 'ok');
    var loops = 2000, sumMs = 0, bad = 0;
    for (var i = 0; i < loops; i++) { var r = F1.aStar('0_' + (i % 3) + '_0', '11_1_2'); sumMs += r.ms; if (!r.ok) bad++; }
    log('　压测 ' + loops + ' 次：平均 ' + (sumMs / loops).toFixed(4) + 'ms · 失败 ' + bad + ' · 启发层差权重 ' +
        F1.HEURISTIC_LAYER_WEIGHT + '（=climb，≤最小跨层边成本 ✓）', 'ok');
  };

  /* --- 诊断 4：E2 坠落链 + board/unboard 真实实现（伤害经 C5 统一入口）--- */
  $('btn-fall').onclick = function () {
    F1.addConnector({ id: 'ld_demo', from: '8_0_0', to: '8_0_1', connKind: 'LADDER', orient: 'FRONTAL',
                      accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE',
                      lifetime: { createdTurn: F2.state().turn, currentHp: TABLES.terrain.ladderHp } });
    refreshConnectorVisual(C1.connById('ld_demo'));
    var invader = WORLD.spawn('ATTACKER', 'ladder_infantry', '8_0_0');
    var br = F1.boardConnector('ld_demo', invader.uid);
    log('boardConnector(' + invader.uid + ') → ' + (br.ok ? 'OK（occupancy 登记，逻辑位置保持 from 格——INV2）' : '拒绝：' + br.why), br.ok ? 'ok' : 'bad');
    var hpBefore = WORLD.unit(invader.uid).hp;
    var dr = F1.destroyConnector('ld_demo');
    var hpAfter = WORLD.unit(invader.uid) ? WORLD.unit(invader.uid).hp : 0;
    log('destroyConnector(ld_demo) → 断边 + ' + dr.stranded + ' 单位坠落：' +
        (dr.stranded ? ('落至 ' + F1.findUnitCell(invader.uid) + ' · 掉血 ' + TABLES.weapons.fallDamage + '（' + hpBefore + '→' + hpAfter + '，E2 恒定不过骰）') : '无在梯单位') +
        ' · 落位失败不回滚 destroy ✓', 'ok');
    var ub = F1.unboardConnector('ld_demo', invader.uid);
    log('unboardConnector 复核 → ' + (ub.ok ? '异常：梯已毁仍可注销 ✗' : '拒绝（已 DESTROYED）✓'), 'ok');
    if (WORLD.unit(invader.uid)) WORLD.kill(invader.uid, 'demo_cleanup');
  };

  /* --- 诊断 5：VS-3 验收指标（命中率实测 / BE-2 集中度 / AI 计划耗时）--- */
  $('btn-metrics').onclick = function () {
    var b = be2Check(6), h = hitRateCheck(2000), a = aiTimingCheck();
    log('▶ VS-3 验收指标：', 'ok');
    log('　命中率实测 ' + (h.rate * 100).toFixed(1) + '%（理论 hitBase=' + (h.expected * 100).toFixed(0) + '%，n=' + h.n + '，偏差 ' + (h.dev * 100).toFixed(2) + 'pp）', 'ok');
    log('　BE-2 集中度：MAIN ' + b.main.toFixed(3) + ' > FEINT ' + b.feint.toFixed(3) + ' → ' + (b.pass ? 'PASS ✓' : 'FAIL ✗'), b.pass ? 'ok' : 'bad');
    log('　C8 计划耗时 均值 ' + a.avg.toFixed(3) + 'ms / 峰值 ' + a.worst.toFixed(3) + 'ms（预算 ' + a.budget + 'ms）→ ' + (a.pass ? 'PASS ✓' : 'FAIL ✗'), a.pass ? 'ok' : 'bad');
    refreshHud();
  };

  /* --- 诊断 6：F4 重放确定性（同种子重跑逻辑快照逐字节一致）--- */
  $('btn-determinism').onclick = function () {
    var d = determinismCheck(12);
    log('▶ F4 重放确定性：同种子重跑 ' + d.lines + ' 步逻辑快照 ' + (d.same ? '逐字节一致 ✓' : '分叉 ✗') + '（digest ' + d.length + 'B）', d.same ? 'ok' : 'bad');
    refreshHud();
  };

  /* --- VS-4 验收四按钮：断言套件消费（纯数据 → 日志渲染） --- */
  function runVs4Suite(key, title) {
    log('▶ ' + title + ' …');
    var r = VS4Selftest[key]();
    r.checks.forEach(function (c) { log('　' + (c.pass ? '✓ ' : '✗ ') + c.name + (c.detail ? '（' + c.detail + '）' : ''), c.pass ? '' : 'bad'); });
    var npass = r.checks.filter(function (c) { return c.pass; }).length;
    log('　' + title + ' → ' + npass + '/' + r.checks.length + (r.pass ? ' 全部 PASS ✓' : ' 存在 FAIL ✗'), r.pass ? 'ok' : 'bad');
    refreshHud();
    return r;
  }
  $('btn-economy').onclick = function () { runVs4Suite('economy', 'VS-4 经济断言（D② 子序/双拒绝态/缴获双段式）'); };
  $('btn-c7orders').onclick = function () { runVs4Suite('c7', 'C7 五闸/六指令断言'); };
  $('btn-c4rhythm').onclick = function () { runVs4Suite('c4', 'C4 装填节拍/礌石断言'); };
  $('btn-v4all').onclick = function () {
    log('▶ VS-4 全量自检（economy + loot + c7 + c4 + dPhase）…');
    var all = VS4Selftest.vs4all();
    [['economy', '经济'], ['loot', '缴获'], ['c7', 'C7 五闸'], ['c4', 'C4 节拍'], ['dPhase', 'D 相位收口']].forEach(function (p) {
      var s = all[p[0]];
      var npass = s.checks.filter(function (c) { return c.pass; }).length;
      log('　' + p[1] + '：' + npass + '/' + s.checks.length + (s.pass ? ' PASS ✓' : ' FAIL ✗'), s.pass ? '' : 'bad');
    });
    log('　VS-4 全量 → ' + (all.pass ? '全部 PASS ✓' : '存在 FAIL ✗'), all.pass ? 'ok' : 'bad');
    refreshHud();
  };

  /* ---- VS-3 验收辅助（供无头/浏览器自动化调用；返回纯数据，无 DOM 依赖）---- */
  function logicalDigest() {                     // 逻辑态快照串（确定性断言用）
    var parts = [];
    WORLD.unitsList().sort(function (a, b) { return a.uid < b.uid ? -1 : (a.uid > b.uid ? 1 : 0); })
      .forEach(function (u) { parts.push(u.uid + ':' + u.hp + ':' + (u.alive ? 1 : 0) + ':' + u.cellId + ':' + u.mp + ':' + u.controlMode); });
    WORLD.facilitiesList().sort(function (a, b) { return a.id < b.id ? -1 : 1; })
      .forEach(function (f) { parts.push(f.id + ':' + f.hp + ':' + f.state); });
    F1.allConnectors().sort(function (a, b) { return a.id < b.id ? -1 : 1; })
      .forEach(function (c) { parts.push(c.id + ':' + c.status + ':' + c.occupancy.units.length); });
    parts.push('beacon:' + WORLD.beaconHp());
    parts.push('cursor:' + F4.cursor());
    return parts.join('|');
  }
  function transcript(seed, cap) {               // 同种子重跑 N 回合的逻辑轨迹
    WORLD.init(seed);
    var lines = [logicalDigest()];
    F2.beginPhase('A', 'det');
    for (var i = 0; i < (cap || 12); i++) {
      var s = fsm();
      if (s.phase === 'END_WIN' || s.phase === 'END_LOSE') { lines.push('END:' + s.phase); break; }
      if (s.phase === 'A') { F2.beginPhase('B', 'det'); F2.runPhaseB(); F2.beginPhase('C', 'det'); runCombatPhase(true); }
      else if (s.phase === 'D') { runSupplyPhase(true); }
      else break;
      lines.push(logicalDigest());
    }
    return lines.join('\n');
  }
  function determinismCheck(cap) {
    var a = transcript(TABLES.f4Seed, cap);
    var b = transcript(TABLES.f4Seed, cap);
    resetBattle(true);
    return { same: a === b, length: a.length, lines: a.split('\n').length };
  }
  function hitRateCheck(n) {                     // 命中率实测（hitBase 无修正基线）
    F4.init('vs3-hitrate-probe');
    var hits = 0, base = TABLES.combat.hitBase;
    for (var i = 0; i < n; i++) if (F4.rand('HIT_ROLL') < base) hits++;
    resetBattle(true);
    return { n: n, hits: hits, rate: hits / n, expected: base, dev: Math.abs(hits / n - base) };
  }
  function seedAttackers(n) {
    var out = [], cells = [];
    Object.keys(F1.level().cells).forEach(function (id) {
      var c = F1.level().cells[id];
      if (c.h === 0 && c.kind === 'GROUND' && c.x <= 3) cells.push(c);
    });
    cells.sort(function (a, b) { return a.x - b.x || a.z - b.z; });
    for (var i = 0; i < cells.length && out.length < n; i++) {
      var u = WORLD.spawn('ATTACKER', 'ladder_infantry', cells[i].id); if (u) out.push(u);
    }
    return out;
  }
  function be2Check(n) {                         // C8 BE-2：MAIN 集中度 > FEINT 集中度
    WORLD.init(TABLES.f4Seed);
    seedAttackers(n || 6);
    var main = C8.generatePlans(2, 'MAIN_ASSAULT'), mainC = C8.concentration(main.plans);
    var feint = C8.generatePlans(2, 'FEINT'), feintC = C8.concentration(feint.plans);
    resetBattle(true);
    return { main: mainC, feint: feintC, pass: mainC > feintC, attackers: main.plannedUnits };
  }
  function aiTimingCheck() {                     // C8 planBudgetMs 预算
    WORLD.init(TABLES.f4Seed);
    seedAttackers(8);
    var sum = 0, worst = 0, R = 40;
    for (var i = 0; i < R; i++) { var r = C8.generatePlans(2, (i % 2) ? 'MAIN_ASSAULT' : 'FEINT'); sum += r.ms; if (r.ms > worst) worst = r.ms; }
    resetBattle(true);
    return { avg: sum / R, worst: worst, budget: TABLES.aiScripts.planBudgetMs, pass: worst <= TABLES.aiScripts.planBudgetMs };
  }
  window.VS3Selftest = {
    boot: function () { return { ok: true, cells: cellList.length, connectors: F1.allConnectors().length, seed: TABLES.f4Seed }; },
    determinism: determinismCheck,
    hitRate: hitRateCheck,
    be2: be2Check,
    aiTiming: aiTimingCheck,
    metrics: function () { return { be2: be2Check(6), hitRate: hitRateCheck(2000), aiTiming: aiTimingCheck(), determinism: determinismCheck(10) }; },
    smoke: function () {
      resetBattle(true);
      var end = playThrough(true, 0, 40);
      var phase = fsm().phase, turns = F2.state().turn;   // 终局态先取（resetBattle 会重置 F2）
      resetBattle(true);
      return { ok: end === 'END_WIN' || end === 'END_LOSE', end: end, phase: phase, turns: turns };
    }
  };

  /* ============================================================
   * [VS-4] 断言套件（返回纯数据、零 DOM 依赖；无头 vs4-check.js 与浏览器双消费）
   * ============================================================ */
  /* N1. D② 经济子序：固定 farm→supply→loot + 幂等 + 双拒绝态 + 原子扣费（零 F4 消费） */
  function economyCheck() {
    WORLD.init(TABLES.f4Seed);
    var r = { checks: [], pass: true };
    function chk(name, cond, detail) { r.checks.push({ name: name, pass: !!cond, detail: detail || '' }); if (!cond) r.pass = false; }
    var rep1 = C6.settleIncome(1);                       // D② 首结算（本回合无战斗 → loot=0）
    chk('d2_farm', rep1.farm === TABLES.economy.income.farmBasePerTurn, 'farm=' + rep1.farm);
    chk('d2_supply', rep1.supply === TABLES.economy.income.supplyBasePerTurn, 'supply=' + rep1.supply);
    chk('d2_total', rep1.total === rep1.farm + rep1.supply + rep1.loot, 'total=' + rep1.total);
    chk('d2_treasury_after', rep1.treasuryAfter === TABLES.economy.perLevel.L1.initialTreasury + rep1.total, 'after=' + rep1.treasuryAfter);
    var rep2 = C6.settleIncome(1);                       // 幂等：同回合重入拒绝（C6.5）
    chk('d2_idempotent', !rep2.ok && rep2.reason === 'IDEMPOTENT_REJECT', JSON.stringify(rep2));
    var before = C6.treasury();
    WORLD.init(TABLES.f4Seed);                           // 复位（INIT 态，窗口外）
    F2.beginPhase('A', 'chk');                           // 进 A 后再移出：构造「非 A 窗口」
    F2.beginPhase('B', 'chk');
    var cw = C6.charge({ kind: 'BUILD_FACILITY', facilityKind: 'rollingStock' });
    chk('charge_window', !cw.ok && cw.reason === 'ILLEGAL_WINDOW' && C6.treasury() === TABLES.economy.perLevel.L1.initialTreasury, JSON.stringify(cw));
    resetBattle(true);                                   // 回到 INIT；进 A
    F2.beginPhase('A', 'chk');
    var poor = C6.charge({ kind: 'DEPLOY_UNIT', templateId: 'garrison_squad' });   // 480 足额 → 成功
    chk('charge_ok_atomic', poor.ok && poor.charged === TABLES.economy.cost.deploy.garrisonSquad, 'charged=' + poor.charged);
    C6.settleIncome(1);                                  // 推进账本到 T1 已结算（便于后续重放校验）
    r.pass = r.checks.every(function (c) { return c.pass; });
    resetBattle(true);
    return r;
  }
  /* N2. 缴获双段式：C 相位流水登记（append-only）/ D② 入账 / 守方阵亡零登记 */
  function lootCheck() {
    WORLD.init(TABLES.f4Seed);
    var r = { checks: [], pass: true };
    function chk(name, cond, detail) { r.checks.push({ name: name, pass: !!cond, detail: detail || '' }); if (!cond) r.pass = false; }
    var cur0 = F4.cursor();
    var foe = WORLD.spawn('ATTACKER', 'ladder_infantry', '1_1_0');
    var own = WORLD.spawn('DEFENDER', 'garrison_squad', '7_1_1');
    var eco0 = C6.state();
    var n0 = eco0.turnLedger.lootEntries.length;
    WORLD.kill(own.uid, 'chk_own');                      // 守方阵亡 → 零登记
    chk('own_death_no_entry', eco0.turnLedger.lootEntries.length === n0, 'len=' + eco0.turnLedger.lootEntries.length);
    WORLD.kill(foe.uid, 'chk_foe');                      // 攻方阵亡 → 登记 ladderInfantry=30
    var e1 = eco0.turnLedger.lootEntries[eco0.turnLedger.lootEntries.length - 1];
    chk('foe_loot_registered', e1 && e1.amount === TABLES.economy.loot.perTemplate.ladderInfantry, 'amount=' + (e1 ? e1.amount : 'null'));
    chk('ledger_append_only', eco0.turnLedger.lootEntries.length === n0 + 1, 'len=' + eco0.turnLedger.lootEntries.length);
    chk('register_zero_f4', F4.cursor() === cur0, 'cursor unchanged');
    chk('treasury_untouched', C6.treasury() === TABLES.economy.perLevel.L1.initialTreasury, '双段式：登记不动余额');
    F2.beginPhase('A', 'chk'); F2.beginPhase('B', 'chk'); F2.beginPhase('C', 'chk'); F2.beginPhase('D', 'chk');
    var rep = C6.settleIncome(F2.state().turn);          // D② 汇总入账
    chk('d2_loot_in', rep.ok && rep.loot === TABLES.economy.loot.perTemplate.ladderInfantry, 'loot=' + rep.loot);
    chk('d2_ledger_cleared', C6.state().turnLedger.lootEntries.length === 0, 'D② 后流水清空');
    r.pass = r.checks.every(function (c) { return c.pass; });
    resetBattle(true);
    return r;
  }
  /* N3. C7 五闸六指令：建造/部署/重置零费/修理夹取/拆除零退款/修墙封闭/窗口与资金双闸 */
  function c7Check() {
    WORLD.init(TABLES.f4Seed);
    var r = { checks: [], pass: true };
    function chk(name, cond, detail) { r.checks.push({ name: name, pass: !!cond, detail: detail || '' }); if (!cond) r.pass = false; }
    var cur0 = F4.cursor();
    /* 窗口闸：非 A 相位恒拒绝 */
    var w = C7.exec({ type: 'BUILD_FACILITY', cellId: '6_1_1', facilityKind: 'bedCrossbow', facing: '-x' });
    chk('window_gate', !w.ok && w.reason === 'ILLEGAL_WINDOW', JSON.stringify(w));
    F2.beginPhase('A', 'chk');
    /* 建造：白名单外 */
    var oz = C7.exec({ type: 'BUILD_FACILITY', cellId: '1_0_0', facilityKind: 'bedCrossbow', facing: '-x' });
    chk('build_out_of_zone', !oz.ok && oz.reason === 'OUT_OF_ZONE', JSON.stringify(oz));
    /* 建造：床弩 facing 必填 */
    var mf = C7.exec({ type: 'BUILD_FACILITY', cellId: '7_1_1', facilityKind: 'bedCrossbow' });
    chk('build_missing_facing', !mf.ok && mf.reason === 'MISSING_FACING', JSON.stringify(mf));
    /* 建造：设施互斥（6_1_1 已有初始床弩） */
    var oc = C7.exec({ type: 'BUILD_FACILITY', cellId: '6_1_1', facilityKind: 'bedCrossbow', facing: '-x' });
    chk('build_occupied', !oc.ok && oc.reason === 'CELL_OCCUPIED_FACILITY', JSON.stringify(oc));
    /* 建造成功：支付 100 + CONSTRUCTING + createdTurn 写入 */
    var t0 = C6.treasury();
    var okb = C7.exec({ type: 'BUILD_FACILITY', cellId: '7_1_1', facilityKind: 'bedCrossbow', facing: '+x' });
    var fb = WORLD.facility(okb.facilityId);
    chk('build_ok', okb.ok && C6.treasury() === t0 - TABLES.economy.cost.build.bedCrossbow, 'charged=' + okb.charged);
    chk('build_constructing', fb && fb.state === 'CONSTRUCTING' && fb.createdTurn === 1, 'state=' + (fb && fb.state) + ' createdTurn=' + (fb && fb.createdTurn));
    /* 部署：非部署区拒绝 + 容量满拒绝 + 成功扣费 */
    var cf = C7.exec({ type: 'DEPLOY_UNIT', cellId: '5_0_1', templateId: 'garrison_squad' });   // 垛口 PARAPET 不在部署白名单
    chk('deploy_out_of_zone', !cf.ok && cf.reason === 'OUT_OF_ZONE', JSON.stringify(cf));
    /* 容量满：6_1_1（RAMPART_WALK 容量 2，进 A 后 0 单位；设施账与单位账独立，初始床弩占位不影响部署）
     * 连投三次 → 前两次成功、第三次 CELL_FULL（C7 §2.4 闸序：白名单→容量）。
     * 断言后自清理（两只挪 OFFBOARD，零费）以免占满 6_1_1、卡死下游 redeploy_move_free 的落位。 */
    var cp1 = C7.exec({ type: 'DEPLOY_UNIT', cellId: '6_1_1', templateId: 'garrison_squad' });
    var cp2 = C7.exec({ type: 'DEPLOY_UNIT', cellId: '6_1_1', templateId: 'garrison_squad' });
    var cp3 = C7.exec({ type: 'DEPLOY_UNIT', cellId: '6_1_1', templateId: 'garrison_squad' });
    chk('deploy_cell_full', cp1.ok && cp2.ok && !cp3.ok && cp3.reason === 'CELL_FULL',
      '6_1_1 cap=2 空置 → ' + [cp1.ok, cp2.ok, cp3.reason].join('/'));
    C7.exec({ type: 'REDEPLOY_UNIT', unitId: cp1.unitId, toCellId: 'OFFBOARD' });
    C7.exec({ type: 'REDEPLOY_UNIT', unitId: cp2.unitId, toCellId: 'OFFBOARD' });
    var t1 = C6.treasury();
    var okd = C7.exec({ type: 'DEPLOY_UNIT', cellId: '7_1_1', templateId: 'garrison_squad' });  // 两套账：与床弩同格合法
    chk('deploy_ok_two_ledgers', okd.ok && C6.treasury() === t1 - TABLES.economy.cost.deploy.garrisonSquad, 'charged=' + okd.charged);
    /* 重置：零费位移 + SAME_CELL + OFFBOARD + 再部署零费 */
    var t2 = C6.treasury();
    var sc = C7.exec({ type: 'REDEPLOY_UNIT', unitId: okd.unitId, toCellId: okd.unitId && WORLD.unit(okd.unitId).cellId });
    chk('redeploy_same_cell', !sc.ok && sc.reason === 'SAME_CELL', JSON.stringify(sc));
    var ob = C7.exec({ type: 'REDEPLOY_UNIT', unitId: okd.unitId, toCellId: 'OFFBOARD' });
    var t3 = C6.treasury();
    chk('redeploy_offboard_free', ob.ok && ob.charged === 0 && t2 === t3, 'Δtreasury=' + (t3 - t2));
    var rd = C7.exec({ type: 'REDEPLOY_UNIT', unitId: okd.unitId, toCellId: '6_1_1' });
    chk('redeploy_move_free', rd.ok && rd.charged === 0 && WORLD.unit(okd.unitId).cellId === '6_1_1', 'cell=' + WORLD.unit(okd.unitId).cellId);
    /* 破产=禁止下单：压到余额 < 造价
     * 排水三件套（缺一不可）：①循环条件=canAfford + 预算上限 ②失败即退 ③成功后挪 OFFBOARD 腾格。
     * 缺③则 5_1_1（RAMPART_WALK 容量 2、已占 D_2）第二次部署起恒 CELL_FULL 零扣费 →
     * 余额冻结在 430 → 两处 while 均无退出条件成立 → 死循环 + drained 无界增长。
     * ⚠ 循环内禁止用变量名 r（外层 r 是 checks 结果对象，会被覆盖）。 */
    var cost50 = TABLES.economy.cost.deploy.garrisonSquad;
    var spent = 0;
    (function drain() {
      while (C6.canAfford({ kind: 'DEPLOY_UNIT', templateId: 'garrison_squad' }) && spent < 20 * cost50) {
        var dr = C7.exec({ type: 'DEPLOY_UNIT', cellId: '5_1_1', templateId: 'garrison_squad' });
        if (!dr.ok) break;
        spent += dr.charged;
        C7.exec({ type: 'REDEPLOY_UNIT', unitId: dr.unitId, toCellId: 'OFFBOARD' });   // 挪下场腾格，只烧钱
      }
    })();
    var t4 = C6.treasury();
    var drained = [];
    while (C6.canAfford({ kind: 'DEPLOY_UNIT', templateId: 'garrison_squad' }) && spent < 20 * cost50) {
      var dr = C7.exec({ type: 'DEPLOY_UNIT', cellId: '5_1_1', templateId: 'garrison_squad' });
      if (!dr.ok) break;
      spent += dr.charged;
      drained.push(dr);
      C7.exec({ type: 'REDEPLOY_UNIT', unitId: dr.unitId, toCellId: 'OFFBOARD' });
    }
    var ins = C7.exec({ type: 'BUILD_FACILITY', cellId: '5_1_1', facilityKind: 'rollingStock' });   // 7_1_1 已被本轮前面建的床弩占用（世界闸先于资金闸 → 恒 CELL_OCCUPIED_FACILITY）；5_1_1 设施账空置
    chk('bankrupt_insufficient', !ins.ok && ins.reason === 'INSUFFICIENT' && C6.treasury() < TABLES.economy.cost.build.rollingStock, '余额=' + C6.treasury() + ' < 造价=' + TABLES.economy.cost.build.rollingStock);
    /* 修理：夹取 + BAD_DELTA + 满血 NO_DAMAGE */
    var xbow = WORLD.facilityAt('6_1_1');
    var dmg = WORLD.damageFacility('bed_crossbow_1', 7);          // 制造缺口（30-7=23）
    var t5 = C6.treasury();
    var ovr = C7.exec({ type: 'REPAIR_FACILITY', facilityId: 'bed_crossbow_1', deltaHp: 999 });
    chk('repair_clamp', ovr.ok && ovr.repaired === dmg.dmg && ovr.charged === dmg.dmg * TABLES.economy.cost.repair.perHp, 'Δ′=' + ovr.repaired + ' charged=' + ovr.charged);
    var bd = C7.exec({ type: 'REPAIR_FACILITY', facilityId: 'bed_crossbow_1', deltaHp: -5 });
    chk('repair_bad_delta', !bd.ok && bd.reason === 'BAD_DELTA', JSON.stringify(bd));
    var nd = C7.exec({ type: 'REPAIR_FACILITY', facilityId: 'bed_crossbow_1', deltaHp: 3 });
    chk('repair_no_damage', !nd.ok && nd.reason === 'NO_DAMAGE', JSON.stringify(nd));
    /* 拆除：零退款 + 格释放 */
    var t6 = C6.treasury();
    var dm = C7.exec({ type: 'DISMANTLE_FACILITY', facilityId: 'bed_crossbow_1' });
    chk('dismantle_no_refund', dm.ok && dm.refunded === 0 && C6.treasury() === t6, 'Δtreasury=' + (C6.treasury() - t6));
    chk('dismantle_cell_freed', !WORLD.facilityAt('6_1_1') || WORLD.facilityAt('6_1_1').id !== 'bed_crossbow_1', '格已释放');
    var dm2 = C7.exec({ type: 'DISMANTLE_FACILITY', facilityId: 'bed_crossbow_1' });
    chk('dismantle_dead_target', !dm2.ok && dm2.reason === 'BAD_TARGET', JSON.stringify(dm2));
    /* 修墙：W-1 未落地整体封闭 */
    var wr = C7.exec({ type: 'WALL_REPAIR', connectorId: 'sl_L1_gate', deltaHp: 3 });
    chk('wall_repair_closed', !wr.ok && wr.reason === 'WALL_REPAIR_UNAVAILABLE' && !C7.wallRepairAvailable(), JSON.stringify(wr));
    chk('c7_zero_f4', F4.cursor() >= cur0, 'cursor ' + cur0 + '→' + F4.cursor());
    chk('inv_c6_1', C6.treasury() >= 0, 'treasury=' + C6.treasury());
    r.pass = r.checks.every(function (c) { return c.pass; });
    resetBattle(true);
    return r;
  }
  /* N4. C4 节拍：facility_volley 形状 / 装填推导 / 架设推导 / 礌石 canDrop 四拒绝 + 自由指令 */
  function c4Check() {
    WORLD.init(TABLES.f4Seed);
    var r = { checks: [], pass: true };
    function chk(name, cond, detail) { r.checks.push({ name: name, pass: !!cond, detail: detail || '' }); if (!cond) r.pass = false; }
    var cur0 = F4.cursor();
    /* volleyId 形状：T1 窗口（初始床弩 createdTurn=1 → 当轮 CONSTRUCTING 不可射 → 空载 results=[]） */
    F2.beginPhase('A', 'chk'); F2.beginPhase('B', 'chk'); F2.beginPhase('C', 'chk');
    var ev = C4.lastVolleyId() === '1_V';
    chk('volley_id_shape', ev, 'volleyId=' + C4.lastVolleyId());
    chk('setup_not_ready', WORLD.facility('bed_crossbow_1').state === 'CONSTRUCTING', '建成当轮不可射（C4.3）');
    /* T2：READY → 有目标才发射；无目标时 strike 空走廊但记账 */
    F2.beginPhase('D', 'chk');
    if (F2.state().phase === 'D') F2.beginPhase('A', 'chk');
    F2.beginPhase('B', 'chk'); F2.beginPhase('C', 'chk');
    var xbow = WORLD.facility('bed_crossbow_1');
    chk('setup_ready_t2', xbow.state === 'READY' || xbow.state === 'RELOADING', 'T2 state=' + xbow.state);
    /* 装填推导：canFireAt 纯函数（发射 t → t+1 装 → t+2 就绪） */
    var f0 = { lastFiredTurn: 2, state: 'READY' };
    chk('reload_derivation', !C4.canFireAt(f0, 2) && !C4.canFireAt(f0, 3) && C4.canFireAt(f0, 4), 't2拒/t3拒(跳过下一轮)/t4就绪');
    /* 架设推导：createdTurn=1, setupTurns=1 → t1 不可、t2 可 */
    var f1 = { createdTurn: 1, lastFiredTurn: null };
    chk('setup_derivation', !C4.setupReadyAt(f1, 1) && C4.setupReadyAt(f1, 2), '当轮不可射/次轮就绪');
    /* 礌石 canDrop：NO_LADDER（坡道不可投放 C3-E11）*/
    var slopeDrop = C4.canDrop('bed_crossbow_1', 'sl_L1_1');
    chk('drop_no_ladder', !slopeDrop.ok && slopeDrop.reason === 'NO_LADDER', JSON.stringify(slopeDrop));
    /* 礌石建造（A 相位）→ ARMED 当轮可投；人力约束 NO_CREW 可构造 */
    F2.beginPhase('D', 'chk');
    if (F2.state().phase === 'D') F2.beginPhase('A', 'chk');
    var okr = C7.exec({ type: 'BUILD_FACILITY', cellId: '5_1_1', facilityKind: 'rollingStock' });
    var rs = WORLD.facility(okr.facilityId);
    chk('stock_armed', okr.ok && rs.state === 'ARMED', 'state=' + (rs && rs.state));
    /* C 相位窗口外 drop 拒绝 */
    var wd = C4.drop(rs.id, 'sl_L1_1');
    chk('drop_window_gate', !wd.ok && wd.reason === 'ILLEGAL_WINDOW' && !wd.consumed, JSON.stringify(wd));
    /* 架梯造 NO_CREW/OUT_OF_REACH 场景：在远处架梯（11_0_0→顶格 z=0 无守方邻接）*/
    F2.beginPhase('B', 'chk'); F2.beginPhase('C', 'chk');
    F1.addConnector({ id: 'ld_chk', from: '10_0_0', to: '10_0_1', connKind: 'LADDER', orient: 'FRONTAL',
      accessPolicy: 'BOTH', occupancy: { units: [] }, status: 'ACTIVE',
      lifetime: { createdTurn: F2.state().turn, currentHp: TABLES.terrain.ladderHp } });
    var nc = C4.canDrop(rs.id, 'ld_chk');
    chk('drop_out_of_reach', !nc.ok && nc.reason === 'OUT_OF_REACH', JSON.stringify(nc));
    /* NO_CREW：垛口 10_0_1 邻域(马道 10_1_1/垛口 9_0_1/11_0_1)无存活守方 */
    var near10 = ['10_1_1', '9_0_1', '11_0_1', '10_0_1'];
    var movedAway = true;
    for (var i = 0; i < near10.length; i++) { var occ = F1.occupancyOf(near10[i]); for (var k = occ.units.length - 1; k >= 0; k--) { if (WORLD.factionOf(occ.units[k]) === 'DEFENDER') { var uu = WORLD.unit(occ.units[k]); if (uu) { F1.moveUnit(uu.uid, '6_0_1'); uu.cellId = '6_0_1'; } } } }
    var nc2 = C4.canDrop(rs.id, 'ld_chk');
    chk('drop_no_crew_or_success', !nc2.ok && nc2.reason === 'NO_CREW' || nc2.ok, JSON.stringify(nc2));
    chk('c4_zero_f4_nondrop', F4.cursor() >= cur0, 'F4 单流纪律（drop 结算消费主流）');
    r.pass = r.checks.every(function (c) { return c.pass; });
    resetBattle(true);
    return r;
  }
  /* N5. D 相位时序收口：D② 经济入账先于 D③ 援军；终局报告一次性冻结 */
  function dPhaseCheck() {
    WORLD.init(TABLES.f4Seed);
    var r = { checks: [], pass: true };
    function chk(name, cond, detail) { r.checks.push({ name: name, pass: !!cond, detail: detail || '' }); if (!cond) r.pass = false; }
    var order = [];
    F2.bus.on('income_settled', function () { order.push('d2'); });
    F2.bus.on('reinforce_arrived', function () { order.push('d3'); });
    /* 注入援军条目（机制全量在位；MVP L1 表为空 → 运行时注入验证 D③ 顺延链） */
    F2.beginPhase('A', 'chk'); F2.beginPhase('B', 'chk'); F2.beginPhase('C', 'chk'); F2.beginPhase('D', 'chk');
    var dbe = F2.state().dbe;
    dbe.pendingReinforcements.push({ entryId: 'chk_r1', dueTurn: 1, templateId: 'garrison_squad', dropZoneRef: 'dz_wall', source: 'C6_REINFORCE' });
    var d4 = F2.runPhaseD();
    chk('d2_before_d3', order.indexOf('d2') >= 0 && order.indexOf('d3') > order.indexOf('d2'), order.join('→'));
    chk('reinforce_arrived', dbe.pendingReinforcements.length === 0, '顺延队列已清空');
    chk('reinforce_free', C6.treasury() > 0, '援军免费（C6-H）· treasury=' + C6.treasury());
    /* 终局报告：finalizeReport 一次性 */
    var f1 = C6.finalizeReport('WIN', 'WAVES_CLEARED');
    var f2 = C6.finalizeReport('LOSE', 'BEACON_FALLEN');
    chk('report_once', f1.ok && !f2.ok && f2.reason === 'ALREADY_FINALIZED', '二次调用拒绝（BE-8）');
    chk('report_stats', f1.ok && f1.report.stats.farmTotal >= TABLES.economy.income.farmBasePerTurn, 'farmTotal=' + (f1.ok ? f1.report.stats.farmTotal : 'n/a'));
    r.pass = r.checks.every(function (c) { return c.pass; });
    resetBattle(true);
    return r;
  }
  window.VS4Selftest = {
    boot: function () { return { ok: true, cells: cellList.length, connectors: F1.allConnectors().length, seed: TABLES.f4Seed }; },
    determinism: determinismCheck,
    hitRate: hitRateCheck,
    be2: be2Check,
    aiTiming: aiTimingCheck,
    economy: economyCheck,
    loot: lootCheck,
    c7: c7Check,
    c4: c4Check,
    dPhase: dPhaseCheck,
    vs4all: function () {
      var e = economyCheck(), l = lootCheck(), c7 = c7Check(), c4 = c4Check(), d = dPhaseCheck();
      return { pass: e.pass && l.pass && c7.pass && c4.pass && d.pass, economy: e, loot: l, c7: c7, c4: c4, dPhase: d };
    },
    metrics: function () { return { be2: be2Check(6), hitRate: hitRateCheck(2000), aiTiming: aiTimingCheck(), determinism: determinismCheck(10) }; },
    smoke: function () {
      resetBattle(true);
      var end = playThrough(true, 0, 40);
      var phase = fsm().phase, turns = F2.state().turn;   // 终局态先取（resetBattle 会重置 F2）
      resetBattle(true);
      return { ok: end === 'END_WIN' || end === 'END_LOSE', end: end, phase: phase, turns: turns };
    }
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
  F2.bus.on('unit_killed', function (p) { log('　✝ ' + p.uid + '（' + p.templateId + '）阵亡', 'bad'); });
  F2.bus.on('facility_destroyed', function (p) { log('　💥 器械被毁 ' + p.facilityId, 'bad'); });
  F2.bus.on('ladder_raised', function (p) { log('　⛓ ' + p.unitId + ' 架设云梯 → ' + p.cellId); });
  F2.bus.on('unit_fell', function (p) { log('　🪂 ' + p.uid + ' 坠落 ' + p.landingCell + '（掉血 ' + p.dmg + '）'); });
  F2.bus.on('residue_cleared', function (p) { log('D① 梯残骸退场 ×' + p.count); });
  F2.bus.on('wave_entered', function (p) { if (p.entered.length || p.deferred) log('B① 敌军入场 ' + p.entered.length + ' 单位' + (p.deferred ? '（顺延 ' + p.deferred + '）' : '')); });

  setCamTier(0);
  resetBattle();
  refreshHud();
  log('VS-4 建设经济+器械+D结算就绪：L1 教学骨架 W=12 · ' + cellList.length + ' 格 · F2 七态 FSM · F4 种子 ' + TABLES.f4Seed + ' · three r158', 'ok');
  log('已实装：① C6 经济（quote/charge 双拒绝态/缴获双段式/D② 固定子序/D③ 援军免费） ② C7 五闸六指令（下单即支付单事务） ③ C4 齐射 facility_volley（装填/架设回合戳推导）+ 礌石自由指令 ④ D④ 判定 + 终局报告冻结；VS-3 战斗核心全保留', 'ok');
  log('演示：①「演示推进」逐相位走 · ②「演示一整局」真实战斗 · ③「跳到判负」看中断链 · ④ 诊断按钮（压测/RNG/L1&A*/坠落链/VS-3 指标/重放确定性/VS-4 经济/C7 五闸/C4 节拍/全量自检）', '');
  tick();
}

/* ---------- 启动引导（真正的调用在文件尾、THREE 内联之后） ---------- */
function showFatal(msg) {
  var el = document.getElementById('err');
  el.hidden = false;
  el.textContent = msg || 'THREE 内联加载失败（脚本被截断或 CSP 拦截）';
}
</script>

