#!/usr/bin/env node
/* vs2-browser-check.js — VS-2 浏览器侧实机验收（零依赖 CDP 直驱）
 * 通道：系统 Edge（Chromium 内核）无头模式 + DevTools Protocol
 * 流程：拉起 Edge(--headless=new --remote-debugging-port) → /json/new 打开
 *       graybox-vs.html → WS 连 target → 收集 exceptionThrown/Log.entryAdded/
 *       consoleAPICalled(level=error) → 按序执行窗口自测桥 → 结果落盘 _browser-check.txt/.json
 * 若页面无 VS2Selftest 桥（构建先于桥存在的旧产物），自动降级：boot 诊断 + 相机/切层逐项 evaluate。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DIR = __dirname;
const PAGE = 'file:///D:/code/building/design/spikes/graybox-vs.html';
const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const PORT = 9333;
const lines = [];
function log(s) { lines.push(s); console.log(s); }

function findBrowser() {
  for (const p of EDGE_CANDIDATES) { try { fs.accessSync(p); return p; } catch (e) {} }
  return null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = findBrowser();
  if (!browser) { log('FATAL: no Edge/Chrome found'); return finish(false); }
  log('browser: ' + browser);

  const profile = path.join(DIR, '_edge-profile');
  const proc = spawn(browser, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--enable-unsafe-swiftshader',
    'about:blank',
  ], { stdio: 'ignore' });
  log('edge pid=' + proc.pid);

  // 1) 等 DevTools 端点就绪
  let version = null;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { version = await r.json(); break; } } catch (e) {}
    await sleep(250);
  }
  if (!version) { log('FATAL: CDP endpoint not ready'); try { proc.kill(); } catch (e) {} return finish(false); }
  log('cdp ready: ' + (version.Browser || ''));

  // 2) 开目标页
  let target = null;
  for (let i = 0; i < 10 && !target; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(PAGE), { method: 'PUT' });
      if (r.ok) { target = await r.json(); break; }
    } catch (e) {}
    await sleep(300);
  }
  if (!target || !target.webSocketDebuggerUrl) { log('FATAL: cannot open page via /json/new'); try { proc.kill(); } catch (e) {} return finish(false); }
  log('target: ' + target.id);

  // 3) WS 连接 + 消息路由
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  const consoleErrors = [];
  const pageErrors = [];
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      pageErrors.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
    } else if (m.method === 'Log.entryAdded') {
      if (m.params.entry.level === 'error') consoleErrors.push(m.params.entry.text);
    } else if (m.method === 'Runtime.consoleAPICalled') {
      if (m.params.type === 'error') consoleErrors.push(m.params.args.map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' '));
    }
  });
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); setTimeout(() => reject(new Error('ws timeout')), 8000); });
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('cdp timeout: ' + method)); } }, 15000);
    });
  }
  async function evaluate(expr, label) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error((label || 'eval') + ' → ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
    return r.result.value;
  }
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  let ok = true;
  try {
    // 4) 页面自测桥（构建产物若含 VS2Selftest 则全链）
    await sleep(800); // 给 three 初始化与 boot 留时间
    const hasBridge = await evaluate("typeof window.VS2Selftest === 'object'", 'bridge-probe').catch(() => false);
    const R = {};
    if (hasBridge) {
      log('[mode] VS2Selftest bridge');
      R.boot   = await evaluate("(function(){try{return window.VS2Selftest.boot()}catch(e){return {ok:false,detail:String(e)}}})()", 'boot');
      R.cam    = await evaluate("(function(){try{return window.VS2Selftest.cameras()}catch(e){return {ok:false,detail:String(e)}}})()", 'cam');
      R.layers = await evaluate("(function(){try{return window.VS2Selftest.layers()}catch(e){return {ok:false,detail:String(e)}}})()", 'layers');
      R.win    = await evaluate("(function(){try{return window.VS2Selftest.demoWin()}catch(e){return {ok:false,detail:String(e)}}})()", 'demoWin');
      R.lose   = await evaluate("(function(){try{return window.VS2Selftest.demoLose()}catch(e){return {ok:false,detail:String(e)}}})()", 'demoLose');
      R.stress = await evaluate("(function(){try{return window.VS2Selftest.stress()}catch(e){return {ok:false,detail:String(e)}}})()", 'stress');
      R.smoke  = await evaluate("(function(){try{return window.VS2Selftest.smoke()}catch(e){return {ok:false,detail:String(e)}}})()", 'smoke');
    } else {
      log('[mode] NO bridge — degraded diagnostics（旧构建产物，桥未编入）');
      R.degraded = true;
      R.bootState = await evaluate("(function(){try{return JSON.stringify({phase:(window.F2&&window.F2.state&&window.F2.state().phase)||'?',turn:(window.F2&&window.F2.state&&window.F2.state().turn)})}catch(e){return String(e)}})()", 'bootState');
      R.cam1 = await evaluate("(function(){try{document.querySelector('[data-cam=low]')&&document.querySelector('[data-cam=low]').click();return 'ok'}catch(e){return String(e)}})()", 'cam1');
      R.cam3 = await evaluate("(function(){try{document.querySelector('[data-cam=high]')&&document.querySelector('[data-cam=high]').click();return 'ok'}catch(e){return String(e)}})()", 'cam3');
      R.L0 = await evaluate("(function(){try{document.querySelector('[data-layer=h0]')&&document.querySelector('[data-layer=h0]').click();return 'ok'}catch(e){return String(e)}})()", 'L0');
      R.L2 = await evaluate("(function(){try{document.querySelector('[data-layer=h2]')&&document.querySelector('[data-layer=h2]').click();return 'ok'}catch(e){return String(e)}})()", 'L2');
      R.heap = await evaluate("performance.memory ? performance.memory.usedJSHeapSize : -1", 'heap');
    }

    // 5) 汇总
    log('---- results ----');
    if (R.degraded) {
      log('bootState=' + R.bootState + ' cam1=' + R.cam1 + ' cam3=' + R.cam3 + ' L0=' + R.L0 + ' L2=' + R.L2 + ' heap=' + R.heap);
    } else {
      for (const k of ['boot', 'cam', 'layers', 'win', 'lose', 'stress', 'smoke']) {
        const r = R[k];
        const pass = r && r.ok === true;
        if (!pass) ok = false;
        log((pass ? 'PASS' : 'FAIL') + '  ' + k.padEnd(6) + ' ' + JSON.stringify(r).slice(0, 300));
      }
    }
    if (pageErrors.length) { ok = false; log('---- page exceptions (' + pageErrors.length + ') ----'); for (const e of pageErrors.slice(0, 10)) log('  ' + String(e).split('\n')[0]); }
    else log('page exceptions: 0');
    if (consoleErrors.length) { ok = false; log('---- console errors (' + consoleErrors.length + ') ----'); for (const e of consoleErrors.slice(0, 10)) log('  ' + String(e).split('\n')[0]); }
    else log('console errors: 0');
  } catch (e) {
    ok = false;
    log('FATAL during checks: ' + (e && e.message || e));
  }

  try { await send('Browser.close'); } catch (e) { try { proc.kill(); } catch (e2) {} }
  setTimeout(() => { try { proc.kill('SIGKILL'); } catch (e) {} }, 2000);
  return finish(ok);
}

function finish(ok) {
  fs.writeFileSync(path.join(DIR, '_browser-check.txt'), lines.join('\n') + '\n');
  log(ok ? '== BROWSER CHECK: ALL PASS ==' : '== BROWSER CHECK: FAILED ==');
  process.exitCode = ok ? 0 : 1;
}

main().catch(e => { log('FATAL: ' + (e && e.message || e)); finish(false); });
