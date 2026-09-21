#!/usr/bin/env node
'use strict';
/* graybox-check.js —— GW-P2-SPIKE-F1 原型语法验证器
 * 用法：node graybox-check.js <html路径>
 * 动作：
 *   1) 抽取所有 <script> 无 src 内联块
 *   2) new Function() 编译校验（语法错误即失败；不执行任何代码）
 *   3) 检查 THREE 占位标记（构建脚本未替换则失败，防止带占位入库）
 *   4) 静态断言：灰盒需求锚点（三层/坡道/云梯×2/寻路/摧毁/相机档/切层/容量）
 */
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('need <html>'); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');

const blocks = [];
const re = /<script>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html)) !== null) blocks.push(m[1]);
if (blocks.length === 0) { console.error('FAIL: no inline <script> blocks'); process.exit(1); }

let fails = 0;
blocks.forEach((code, i) => {
  try { new Function(code); console.log(`script[${i}] OK  (${code.length} chars)`); }
  catch (e) { fails++; console.error(`script[${i}] SYNTAX FAIL: ${e.message}`); }
});

if (/PLACEHOLDER_TRUNCATED/.test(html)) {
  fails++; console.error('FAIL: THREE placeholder not replaced');
}

const anchors = [
  ['层主序数据结构 layers[0]', /layers\[0\]\[x\]\[z\] = 'ground'/],
  ['墙顶层 h1',              /layers\[1\]\[x\]\[z\] = 'wall'/],
  ['烽燧顶层 h2',            /layers\[2\]\[x\]\[2\] = 'tower'/],
  ['静态连接器 ramp',        /kind: 'ramp'/],
  ['动态连接器 ladder ×2',   /(kind: 'ladder'[\s\S]*?){2}/],
  ['跨层 A*',                /function aStar\(/],
  ['连接器断边 (摧毁生效)',  /if \(!cn\.open\) continue/],
  ['相机固定档位',           /camPose/],
  ['上层半透明切层',         /applyLayerGhost/],
  ['占位容量字段',           /unitCap/],
];
for (const [name, rx] of anchors) {
  if (rx.test(html)) console.log(`anchor OK : ${name}`);
  else { fails++; console.error(`anchor FAIL: ${name}`); }
}

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
