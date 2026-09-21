#!/usr/bin/env node
'use strict';
/* build-spike.js —— 把下载的 three.min.js 内联进 graybox-f1.html 的占位块
 * 用法：node build-spike.js
 * 替换目标：占位 IIFE  window.THREE = window.THREE || (function(){ ... PLACEHOLDER_TRUNCATED ... })();
 * 幂等：若占位已不存在则报错退出（不重复注入）。
 */
const fs = require('fs');

const HTML = 'D:/code/building/design/spikes/graybox-f1.html';
const LIB  = 'D:/code/building/design/spikes/tools/three.min.js';

let html = fs.readFileSync(HTML, 'utf8');
const lib = fs.readFileSync(LIB, 'utf8');

if (!html.includes('PLACEHOLDER_TRUNCATED')) {
  console.error('FAIL: placeholder not found (already built?)');
  process.exit(1);
}

const HEAD = 'window.THREE = window.THREE || (function(){';
const start = html.indexOf(HEAD);
if (start < 0) { console.error('FAIL: placeholder IIFE head not found'); process.exit(1); }
const tailIdx = html.indexOf('})();', start);
if (tailIdx < 0) { console.error('FAIL: placeholder IIFE tail not found'); process.exit(1); }

// 顶部加裸标识 window；库体本身是 IIFE 挂载，直接拼接即可
const replacement = 'window.THREE = window.THREE || (function(){\n' + lib + '\n})();';
html = html.slice(0, start) + replacement + html.slice(tailIdx + '})();'.length);

fs.writeFileSync(HTML, html);
console.log('inlined', lib.length, 'chars; html now', html.length, 'chars');
