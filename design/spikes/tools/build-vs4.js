#!/usr/bin/env node
'use strict';
/* build-vs4.js —— 组装 graybox-vs.html（VS-4 A 相位建设经济+器械+D 结算批次，VS-3 战斗核心原地迭代）
 * 结构：_vs4-shell.html 头（含 UI/样式）+ _vs4-app.js（应用逻辑，F2/F1/F4/C1/C5/C10/C8/C6/C7/C4/RENDER 分区）
 *       + three r158 UMD 库体裸内联（禁 IIFE 包装，graybox-f1-report 坑 3）+ boot 存根。
 * 可重复执行（幂等：从源片重建）。产物 design/spikes/graybox-vs.html。
 * ⚠ 禁止字符串模式 replace（库体尾部字面 `$$` 陷阱，见 build-vs2.js 注释），一律函数式。
 * 禁止与 build-vs3.js / build-vs2.js / build-spike.js 混用（各自对应不同源片）。
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SHELL = path.join(DIR, '_vs4-shell.html');
const APP = path.join(DIR, '_vs4-app.js');
const LIB = path.join(DIR, 'three.min.js');
const OUT = path.join(DIR, '..', 'graybox-vs.html');

const shell = fs.readFileSync(SHELL, 'utf8');
const app = fs.readFileSync(APP, 'utf8');
const lib = fs.readFileSync(LIB, 'utf8');

if (shell.indexOf('<!--APP_BLOCK-->') < 0) { console.error('FAIL: shell has no <!--APP_BLOCK-->'); process.exit(1); }
if (app.indexOf('window.VS4Selftest') < 0) { console.error('FAIL: app missing VS4Selftest bridge'); process.exit(1); }
if (shell.indexOf('backdrop-filter') >= 0) {
  console.error('FAIL: shell contains backdrop-filter — 本机 Intel UHD + ANGLE/D3D11 组合下会把整层渲染成黑（2026-09-20 实测），禁止使用');
  process.exit(1);
}

const libInline =
  '<script>\n' +
  '/* three.js r158 (minified UMD) 原样内联 —— 零网络 / 零动态导入 / 零包装。\n' +
  ' * ⚠ 禁止包 IIFE：UMD 依赖 globalThis 副作用挂载 window.THREE，包装会让赋值表达式\n' +
  ' *   把挂载结果覆盖为 undefined（spike 联调实际踩到此坑，见 graybox-f1-report §4-3）。 */\n' +
  '/* THREE_INLINE_START */\n' +
  lib + '\n' +
  '</script>';

const bootBlock =
  '<script>\n' +
  '  if (window.THREE) boot(); else showFatal();\n' +
  '</script>\n</body>\n</html>\n';

// 函数式替换：库体尾部 `$$` 若走字符串模式会被解释为 `$` 吞字符（VS-2 实际事故）
let html = shell.replace('<!--APP_BLOCK-->', () => app + '\n' + libInline + '\n' + bootBlock);
fs.writeFileSync(OUT, html);

/* ---- 静态校验 ---- */
function fail(msg) { console.error('FAIL:', msg); process.exit(1); }
const out = fs.readFileSync(OUT, 'utf8');

// 1. script 块配平
const openN = (out.match(/<script>/g) || []).length;
const closeN = (out.match(/<\/script>/g) || []).length;
if (openN !== closeN) fail('script tags unbalanced: ' + openN + ' vs ' + closeN);
if (openN !== 3) fail('expected 3 script blocks (app/lib/boot), got ' + openN);

// 2. 应用块 + 库体全量编译（拦截 EOF 类语法损伤）
const appStart = out.indexOf(app);
if (appStart < 0) fail('app block not found verbatim in output');
const appBody = out.slice(out.indexOf('<script>') + '<script>'.length, out.indexOf('</script>'));
try { new Function(appBody); } catch (e) { fail('app block syntax: ' + e.message); }
const libMark = '/* THREE_INLINE_START */';
const libStart = out.indexOf(libMark) + libMark.length;
const libClose = out.indexOf('</script>', libStart);
const libBody = out.slice(libStart, libClose);
try { new Function(libBody); } catch (e) { fail('lib block syntax: ' + e.message + '（若为 Unexpected end of input，检查 replace 是否吞字符）'); }

// 3. 库体裸内联断言（坑 3）
const inlineIdx = out.indexOf('/* THREE_INLINE_START */');
if (inlineIdx < 0) fail('THREE_INLINE_START marker missing');
const libHead = out.slice(inlineIdx + '/* THREE_INLINE_START */'.length, inlineIdx + 220);
if (/\(function\s*\(\s*\)\s*\{/.test(libHead.trim().slice(0, 40))) fail('lib wrapped in IIFE — forbidden (pit 3)');

// 4. 关键锚点（VS-2 底座锚点全保留 + VS-3 + VS-4 新增）
const anchors = [
  // VS-2 底座
  ['F2 七态 FSM', 'TRANSITIONS'],
  ['速度序三键', 'snapshotActionOrder'],
  ['D④ 胜负唯一点', 'runPhaseD'],
  ['illegal_transition', 'illegal_transition'],
  ['CellId 含 h', 'cellId(x, z, h)'],
  ['连接器 9 字段', 'accessPolicy'],
  ['容量表', 'GRID_CAPACITY'],
  ['启发权重联动', 'HEURISTIC_LAYER_WEIGHT'],
  ['mulberry32', 'step('],
  ['FNV-1a-32', 'fnv1a32'],
  ['种子字面量', 'vs-l1-seed-01'],
  ['单位生成', 'function spawn(faction'],
  ['相位压测按钮', 'btn-stress'],
  ['判负演示按钮', 'btn-lose'],
  ['F4 冒烟按钮', 'btn-rng'],
  ['L1 波次骨架', 'WAVES_L1'],
  ['表宿主结构', 'TABLES'],
  ['切层渲染', 'applyLayerGhost'],
  ['掩体标记', 'coverExposeMarks'],
  // VS-3 新增：C1 移动
  ['C1 board', 'boardConnector'],
  ['C1 unboard', 'unboardConnector'],
  ['C1 顶满排队', 'BLOCKED_TOP'],
  ['C1 攻击锁足', 'mpZeroOnAttack'],
  // VS-3 新增：C5 结算
  ['C5 命中骰', 'HIT_ROLL'],
  ['C5 走廊齐射', 'fireAllFacilities'],
  // VS-3 新增：C10 托管
  ['C10 托管权重', 'standFast'],
  ['C10 堵位权重', 'w_block'],
  // VS-3 新增：C8 AI
  ['C8 计划生成', 'generatePlans'],
  ['C8 意图脚本', 'intentScripts'],
  ['C8 MAIN 意图', 'MAIN_ASSAULT'],
  ['C8 FEINT 意图', 'FEINT'],
  ['C8 规划预算', 'planBudgetMs'],
  // VS-3 新增：自测桥
  ['VS-3 自测桥', 'VS4Selftest'],
  ['VS-3 指标按钮', 'btn-metrics'],
  ['VS-3 重放按钮', 'btn-determinism'],
  // VS-4 新增：C6 经济
  ['C6 账本幂等锚', 'turnLastSettled'],
  ['C6 扣费窗口拒绝态', 'ILLEGAL_WINDOW'],
  ['C6 缴获流水事件', 'loot_registered'],
  ['C6 D② 结算入口', 'settleIncome'],
  ['C6 援军时刻表', 'reinforcementSchedule'],
  ['C6 终局报告冻结', 'finalizeReport'],
  // VS-4 新增：C7 建设部署
  ['C7 修墙扩展隔离', 'WALL_REPAIR_UNAVAILABLE'],
  ['C7 指令流水', 'orderLog'],
  ['C7 重置同格拒绝', 'SAME_CELL'],
  ['C7 拒绝码-设施互斥', 'CELL_OCCUPIED_FACILITY'],
  // VS-4 新增：C4 器械节拍
  ['C4 齐射事件', 'facility_volley'],
  ['C4 装填推导戳', 'lastFiredTurn'],
  ['C4 架设推导键', 'setupTurns'],
  ['C4 礌石判定原语', 'canDrop']
];
let miss = 0;
for (const [name, needle] of anchors) {
  const ok = out.indexOf(needle) >= 0;
  if (!ok) { console.error('  anchor missing:', name, '(' + needle + ')'); miss++; }
}
if (miss) fail((anchors.length - miss) + '/' + anchors.length + ' anchors, ' + miss + ' missing');

// 5. 库体尾部哨兵：逐字节比对断言库体原样落盘（replace 吞字符事故检测）
const libTailSentinel = 'sRGBEncoding=Ot}));';
if (!out.includes(libTailSentinel)) fail('lib tail sentinel missing — lib body corrupted?');
const libStartOut = out.indexOf('/* THREE_INLINE_START */');
const libEndOut = out.indexOf('</script>', libStartOut);
if (libEndOut < libStartOut) fail('lib block misplaced');
const libSlice = out.slice(libStartOut, libEndOut);
const libExpect = '/* THREE_INLINE_START */\n' + lib + '\n';
if (libSlice.length !== libExpect.length) {
  fail('lib byte-length mismatch in output (' + libSlice.length + ' vs ' + libExpect.length + ') — replace swallowed chars?');
}

console.log('OK: built', path.resolve(OUT));
console.log('    size', fs.statSync(OUT).size, 'bytes ·', openN, 'script blocks ·', anchors.length, 'anchors pass');
