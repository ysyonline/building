#!/usr/bin/env node
'use strict';
/* build-vs2.js —— 组装 graybox-vs.html（VS-2 切片底座单文件）
 * 结构：_vs2-shell.html 头（含 UI/样式）+ _vs2-app.js（应用逻辑，F2/F1/F4/RENDER/UI 分区）
 *       + three r158 UMD 库体裸内联（禁 IIFE 包装，F1 报告坑 3）+ boot 存根。
 * 可重复执行（幂等：从源片重建）。产物 design/spikes/graybox-vs.html。
 * 禁止与 build-spike.js 混用（那是 graybox-f1.html 的历史脚本）。
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SHELL = path.join(DIR, '_vs2-shell.html');
const APP = path.join(DIR, '_vs2-app.js');
const LIB = path.join(DIR, 'three.min.js');
const OUT = path.join(DIR, '..', 'graybox-vs.html');

const shell = fs.readFileSync(SHELL, 'utf8');
const app = fs.readFileSync(APP, 'utf8');
const lib = fs.readFileSync(LIB, 'utf8');

if (shell.indexOf('<!--APP_BLOCK-->') < 0) { console.error('FAIL: shell has no <!--APP_BLOCK-->'); process.exit(1); }
if (lib.indexOf('define') >= 0 && lib.indexOf('this.THREE') < 0 && lib.indexOf('global.THREE') < 0) {
  // 仅提示，r158 UMD 内部含 UMD 探测代码属正常
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

// ⚠ 必须函数式替换：库体（minified UMD）尾部含字面 `$$`，若作为 replace 字符串
// 参数会被解释为 `$` 特殊模式（`$$`→`$`），吞掉一个字符 → 浏览器侧 SyntaxError
// "Unexpected end of input"（node new Function 编译的是原文件，故构建期测不出）。
let html = shell.replace('<!--APP_BLOCK-->', () => app + '\n' + libInline + '\n' + bootBlock);
fs.writeFileSync(OUT, html);

/* ---- 静态校验（沿 graybox-check.js 思路）---- */
function fail(msg) { console.error('FAIL:', msg); process.exit(1); }
const out = fs.readFileSync(OUT, 'utf8');

// 1. script 块配平
const openN = (out.match(/<script>/g) || []).length;
const closeN = (out.match(/<\/script>/g) || []).length;
if (openN !== closeN) fail('script tags unbalanced: ' + openN + ' vs ' + closeN);
if (openN !== 3) fail('expected 3 script blocks (app/lib/boot), got ' + openN);

// 2. 应用块语法编译（+ 库体：node 侧全量编译三块，拦截 EOF 类语法损伤）
const appStart = out.indexOf(app);
const appEnd = appStart + app.length;
const appBody = out.slice(out.indexOf('<script>') + '<script>'.length, out.indexOf('</script>'));
try { new Function(appBody); } catch (e) { fail('app block syntax: ' + e.message); }
const libMark = '/* THREE_INLINE_START */';
const libStart = out.indexOf(libMark) + libMark.length;
const libClose = out.indexOf('</script>', libStart); // 库块自身的闭合（首个后续闭合标签）
const libBody = out.slice(libStart, libClose);
try { new Function(libBody); } catch (e) { fail('lib block syntax: ' + e.message + '（若为 Unexpected end of input，检查 replace 是否吞字符）'); }

// 3. 库体裸内联断言（坑 3）：库体前不得有包装痕迹
const inlineIdx = out.indexOf('/* THREE_INLINE_START */');
if (inlineIdx < 0) fail('THREE_INLINE_START marker missing');
const libHead = out.slice(inlineIdx + '/* THREE_INLINE_START */'.length, inlineIdx + 220);
if (/\(function\s*\(\s*\)\s*\{/.test(libHead.trim().slice(0, 40))) fail('lib wrapped in IIFE — forbidden (pit 3)');

// 4. 关键锚点
const anchors = [
  ['F2 七态 FSM', 'TRANSITIONS'],
  ['速度序三键', 'snapshotActionOrder'],
  ['D④ 胜负唯一点', 'runPhaseD'],
  ['illegal_transition', "illegal_transition"],
  ['CellId 含 h', "cellId(x, z, h)"],
  ['连接器 9 字段', 'accessPolicy'],
  ['容量表', 'GRID_CAPACITY'],
  ['启发权重联动', 'HEURISTIC_LAYER_WEIGHT'],
  ['mulberry32', 'step('],
  ['FNV-1a-32', 'fnv1a32'],
  ['种子字面量', 'vs-l1-seed-01'],
  ['board 骨架', 'boardConnector'],
  ['unboard 骨架', 'unboardConnector'],
  ['E2 坠落链', 'destroyConnector'],
  ['InstancedMesh 单位', 'spawnUnit'],
  ['相位压测按钮', 'btn-stress'],
  ['判负演示按钮', 'btn-lose'],
  ['F4 冒烟按钮', 'btn-rng'],
  ['L1 波次骨架', 'WAVES_L1'],
  ['表宿主结构', 'TABLES'],
  ['切层渲染', 'applyLayerGhost'],
  ['掩体标记', 'coverExposeMarks']
];
let miss = 0;
for (const [name, needle] of anchors) {
  const ok = out.indexOf(needle) >= 0;
  if (!ok) { console.error('  anchor missing:', name, '(' + needle + ')'); miss++; }
}
if (miss) fail(anchors.length - miss + '/' + anchors.length + ' anchors, ' + miss + ' missing');

// 5. 库体尾部哨兵：原库尾为 `sRGBEncoding=Ot}));\n$$`（$$ 为噪声后缀）。
//    replace 吞字符事故会把 `$$` 变 `$` —— 用逐字节比对断言库体原样落盘。
const libTailSentinel = 'sRGBEncoding=Ot}));';
if (!out.includes(libTailSentinel)) fail('lib tail sentinel missing — lib body corrupted?');
const libStartOut = out.indexOf('/* THREE_INLINE_START */');
const libEndOut = out.indexOf('</script>', libStartOut); // 前向取库块自身闭合，勿用 lastIndexOf（会切到 boot 块）
if (libEndOut < libStartOut) fail('lib block misplaced');
const libSlice = out.slice(libStartOut, libEndOut);
const libExpect = '/* THREE_INLINE_START */\n' + lib + '\n';
if (libSlice.length !== libExpect.length) {
  fail('lib byte-length mismatch in output (' + libSlice.length + ' vs ' + libExpect.length + ') — replace swallowed chars?');
}

console.log('OK: built', path.resolve(OUT));
console.log('    size', fs.statSync(OUT).size, 'bytes ·', openN, 'script blocks ·', anchors.length, 'anchors pass');
