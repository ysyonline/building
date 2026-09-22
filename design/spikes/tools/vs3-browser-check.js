#!/usr/bin/env node
/* vs3-browser-check.js — VS-3 浏览器侧实机验收（零依赖 CDP 直驱，沿 vs2-browser-check.js 范式）
 * 通道：系统 Edge（Chromium 内核）无头模式 + DevTools Protocol
 * 验收面：VS3Selftest 桥（boot / hitRate / be2 / aiTiming / determinism / smoke）
 *         + 相位压测/判负按钮存活 + 页面异常与 console error 收集。
 * 结果落盘 vs3-check-out.txt
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
const PORT = 9334;
const OUT_TXT = path.join(DIR, 'vs3-check-out.txt');
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

  let version = null;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { version = await r.json(); break; } } catch (e) {}
    await sleep(250);
  }
  if (!version) { log('FATAL: CDP endpoint not ready'); try { proc.kill(); } catch (e) {} return finish(false); }
  log('cdp ready: ' + (version.Browser || ''));

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
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('cdp timeout: ' + method)); } }, 120000);
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
  const fails = [];
  // 桥返回形状不统一：boot 用 ok / be2·aiTiming 用 pass / determinism 用 same —— 三者任一为真即过；
  // 纯测量型（无判定字段）传 shapeOk=null 跳过形状检查，由 extra 裁定。
  function judge(name, r, extra, shapeOk) {
    const shape = shapeOk === null ? true : (r && (r.ok === true || r.pass === true || r.same === true));
    const pass = r && shape && (!extra || extra(r) === true);
    if (!pass) { ok = false; fails.push(name); }
    log((pass ? 'PASS' : 'FAIL') + '  ' + name.padEnd(12) + ' ' + JSON.stringify(r).slice(0, 400));
    return pass;
  }
  try {
    await sleep(800); // three 初始化 + boot
    const hasBridge = await evaluate("typeof window.VS3Selftest === 'object'", 'bridge-probe').catch(() => false);
    if (!hasBridge) { log('FATAL: VS3Selftest bridge missing'); ok = false; return finishAfter(false); }

    log('[mode] VS3Selftest bridge');
    judge('boot', await evaluate("(function(){try{return window.VS3Selftest.boot()}catch(e){return {ok:false,detail:String(e)}}})()", 'boot'));

    // C5 命中率：桥签名 hitRateCheck(n)，纯测量无判定字段 → 按 3σ 统计容差裁
    // （n=2000、p=0.75 → σ≈0.0097，容差 0.03）
    judge('hitRate', await evaluate("(function(){try{return window.VS3Selftest.hitRate(2000)}catch(e){return {ok:false,detail:String(e)}}})()", 'hitRate'),
      (r) => typeof r.dev === 'number' && r.dev <= 0.03, null);

    // C8 BE-2：MAIN 集中度 > FEINT 集中度（方向性断言）
    judge('be2', await evaluate("(function(){try{return window.VS3Selftest.be2()}catch(e){return {ok:false,detail:String(e)}}})()", 'be2'));

    // C8 规划预算：最差单次 ≤ planBudgetMs
    judge('aiTiming', await evaluate("(function(){try{return window.VS3Selftest.aiTiming()}catch(e){return {ok:false,detail:String(e)}}})()", 'aiTiming'));

    // F4 确定性：同种子重放逐字节一致
    judge('determinism', await evaluate("(function(){try{return window.VS3Selftest.determinism()}catch(e){return {ok:false,detail:String(e)}}})()", 'determinism'));

    // 冒烟：真实战斗打一局，须落到终局态（WIN 或 LOSE 皆可，不得 STALL/异常态）
    judge('smoke', await evaluate("(function(){try{return window.VS3Selftest.smoke()}catch(e){return {ok:false,detail:String(e)}}})()", 'smoke'),
      (r) => r.end === 'WIN' || r.end === 'LOSE' || /WIN|LOSE/.test(String(r.end)));

    // 全量指标复跑（按钮同路径；hitRate 子项按 3σ 容差、其余按 pass/same 判）
    judge('metrics', await evaluate("(function(){try{return window.VS3Selftest.metrics()}catch(e){return {ok:false,detail:String(e)}}})()", 'metrics'),
      (r) => r && r.be2 && r.be2.pass === true && r.aiTiming && r.aiTiming.pass === true
          && r.determinism && r.determinism.same === true
          && r.hitRate && typeof r.hitRate.dev === 'number' && r.hitRate.dev <= 0.03, null);

    // UI 存活：诊断按钮在档
    const uiProbe = await evaluate("(function(){var ids=['btn-stress','btn-rng','btn-metrics','btn-determinism','btn-lose','btn-autoplay'];var miss=ids.filter(function(i){return !document.getElementById(i)});return {ok:miss.length===0,missing:miss}})()", 'ui');
    judge('uiButtons', uiProbe);

    function finishAfter(v) { return finish(v); }
  } catch (e) {
    ok = false;
    log('FATAL during checks: ' + (e && e.message || e));
  }

  try { await send('Browser.close'); } catch (e) { try { proc.kill(); } catch (e2) {} }
  setTimeout(() => { try { proc.kill('SIGKILL'); } catch (e) {} }, 2000);
  return finish(ok);
}

function finish(ok) {
  fs.writeFileSync(OUT_TXT, lines.join('\n') + '\n');
  log(ok ? '== VS-3 BROWSER CHECK: ALL PASS ==' : '== VS-3 BROWSER CHECK: FAILED ==');
  process.exitCode = ok ? 0 : 1;
}

main().catch(e => { log('FATAL: ' + (e && e.message || e)); finish(false); });
