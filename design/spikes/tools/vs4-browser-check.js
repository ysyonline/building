#!/usr/bin/env node
/* vs4-browser-check.js — VS-4 浏览器侧实机验收（零依赖 CDP 直驱，沿 vs3-browser-check.js 范式）
 *
 * 通道：系统 Edge（Chromium 内核）无头 + DevTools Protocol（Node 原生 WebSocket / fetch，零 npm 依赖）
 * 页面：file:///D:/code/building/design/spikes/graybox-vs.html
 * 桥：  window.VS4Selftest（graybox-vs.html:2774）
 *       ⚠️ 页面内仍残留 VS-3 旧桥 window.VS3Selftest（:2551）。本脚本显式断言两者非同一对象，
 *          杜绝「照抄 vs3 脚本只改文件名」→ 静默测到旧桥 = 等于没建。
 * 落盘：vs4-browser-out.txt（勿与无头套件 vs4-check.js 的 vs4-check-out.txt 撞名）
 *
 * 架构：一口一会话（per-check target isolation）。每个自测口开独立 target，跑完即关。
 *       理由：桥内代码从未在浏览器中运行过，任一口若挂死会永久占住渲染进程主线程，
 *       单会话串行会让「一个口挂死 → 后续全部口无结果」。本设计把故障半径压到单口。
 *
 * 纪律：
 *   R-1 纯测试新增，不改动 graybox-vs.html / _vs4-app.js / _vs4-shell.html 任一字节。
 *   R-2 不触任何数值（冻结令生效中）。
 *   R-3 c4 口 reload_derivation 断言（:2715）禁止修改 —— [DISPUTED · 待 VS-7 D1]。
 *   R-4 c4 口单独跑、单独报告，标注 [DISPUTED · 待 VS-7 D1]，不并入总 PASS/FAIL；FAIL 亦如实留痕。
 *   R-5 端口 9335 / profile _edge-profile-vs4（与 vs3 的 9334 / _edge-profile 隔离）。
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
const PORT = 9335;
const PROFILE = path.join(DIR, '_edge-profile-vs4');
const OUT_TXT = path.join(DIR, 'vs4-browser-out.txt');
const EVAL_TIMEOUT_MS = 45000;   // 单口上限：正常口 <1s，留足 45s 区分「慢」与「挂死」
const BOOT_SETTLE_MS = 1200;     // three r158 内联解析 + boot() + 首帧

const lines = [];
function log(s) { lines.push(String(s)); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function findBrowser() {
  for (const p of EDGE_CANDIDATES) { try { fs.accessSync(p); return p; } catch (e) {} }
  return null;
}

/* ---------------- 判定 ---------------- */
const verdicts = [];   // {name, verdict}  verdict ∈ PASS / FAIL / TIMEOUT / ISOLATED-*
let ok = true;
const fails = [];
const isolated = [];

function judge(name, r, extra, shapeOk) {
  // 桥返回形状不统一：boot/smoke 用 ok · be2/aiTiming/economy/loot/c7/dPhase 用 pass · determinism 用 same。
  // 三者任一为真即过形状关；纯测量型（hitRate / metrics 顶层无判定字段）传 shapeOk=null，由 extra 裁定。
  const shape = shapeOk === null ? true : !!(r && (r.ok === true || r.pass === true || r.same === true));
  const pass = !!r && shape && (!extra || extra(r) === true);
  if (!pass) { ok = false; fails.push(name); }
  verdicts.push({ name: name, verdict: pass ? 'PASS' : 'FAIL' });
  log((pass ? 'PASS' : 'FAIL') + '  ' + name.padEnd(14) + ' ' + JSON.stringify(r).slice(0, 420));
  // 套件型结果（带 checks[]）：全量点名 + 失败子项 detail。覆盖保全靠这条留痕（防「删断言换绿灯」）
  if (r && Array.isArray(r.checks)) {
    log('        checks(' + r.checks.length + '): ' + r.checks.map(c => c.name + (c.pass ? '' : '[FAIL]')).join(', '));
    if (!pass) r.checks.filter(c => !c.pass).forEach(c => log('        └ ' + c.name + '   detail=' + JSON.stringify(c.detail)));
  }
  return pass;
}
function judgeTimeout(name, err) {
  ok = false; fails.push(name);
  verdicts.push({ name: name, verdict: 'TIMEOUT' });
  log('HANG  ' + name.padEnd(14) + ' 单口 ' + (EVAL_TIMEOUT_MS / 1000) + 's 内无返回 → 页面主线程被占死（' + (err && err.message || err) + '）');
  log('      → 判 FAIL（非 PASS、非静默跳过）。已按 R-1 不改动实现，改由上层裁定。');
}
/* R-4：隔离口只记录、不并入 ok/fails。原文 JSON 全量留痕，FAIL 亦如实落盘，绝不粉饰。 */
function judgeIsolated(name, r, note) {
  const bad = !(r && (r.ok === true || r.pass === true || r.same === true));
  const failedChecks = (r && Array.isArray(r.checks)) ? r.checks.filter(c => !c.pass) : [];
  isolated.push({ name: name, verdict: bad ? 'ISOLATED-FAIL' : 'ISOLATED-PASS', failed: failedChecks.map(c => c.name) });
  verdicts.push({ name: name, verdict: bad ? 'ISOLATED-FAIL' : 'ISOLATED-PASS' });
  log('[ISOLATED · ' + (bad ? 'FAIL' : 'PASS') + ' · 不计入总判定]  ' + name + (note ? '\n  note: ' + note : ''));
  log('  raw: ' + JSON.stringify(r));
  if (failedChecks.length) {
    log('  failed checks (' + failedChecks.length + '/' + r.checks.length + '):');
    failedChecks.forEach(c => log('    - ' + c.name + '   detail=' + JSON.stringify(c.detail)));
  }
  return !bad;
}

/* ---------------- CDP 会话（一口一个 target） ---------------- */
const consoleErrors = [];
const pageErrors = [];
let browserProc = null;

async function newSession() {
  let target = null;
  for (let i = 0; i < 10 && !target; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(PAGE), { method: 'PUT' });
      if (r.ok) { target = await r.json(); break; }
    } catch (e) {}
    await sleep(300);
  }
  if (!target || !target.webSocketDebuggerUrl) throw new Error('cannot open page via /json/new');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      pageErrors.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
    } else if (m.method === 'Log.entryAdded') {
      if (m.params.entry.level === 'error') consoleErrors.push(m.params.entry.text);
    } else if (m.method === 'Runtime.consoleAPICalled') {
      if (m.params.type === 'error') consoleErrors.push(m.params.args.map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' '));
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve); ws.addEventListener('error', reject);
    setTimeout(() => reject(new Error('ws timeout')), 8000);
  });
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('cdp timeout: ' + method)); } }, EVAL_TIMEOUT_MS);
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
  await sleep(BOOT_SETTLE_MS);

  return {
    id: target.id,
    evaluate: evaluate,
    call: (expr, label) => evaluate('(function(){try{return window.VS4Selftest.' + expr + '}catch(e){return {ok:false,detail:String(e)}}})()', label),
    close: async () => {
      try { ws.close(); } catch (e) {}
      // 主线程挂死的 target 也要能回收：走 HTTP /json/close（浏览器进程侧处理，与渲染主线程无关）
      try { await fetch('http://127.0.0.1:' + PORT + '/json/close/' + target.id); } catch (e) {}
    },
  };
}

/* 单口执行器：开会话 → 取数 → 判定 → 关会话；超时按 HANG 记录且不妨碍后续口 */
async function runPort(name, expr, extra, shapeOk) {
  let s = null;
  try {
    s = await newSession();
    const r = await s.call(expr, name);
    judge(name, r, extra, shapeOk);
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (/timeout/i.test(msg)) judgeTimeout(name, e);
    else { ok = false; fails.push(name); verdicts.push({ name: name, verdict: 'ERROR' }); log('ERROR ' + name.padEnd(13) + ' ' + msg.slice(0, 300)); }
  } finally { if (s) { try { await s.close(); } catch (e) {} } }
}
async function runIsolatedPort(name, expr, note) {
  let s = null;
  try {
    s = await newSession();
    const r = await s.call(expr, name);
    judgeIsolated(name, r, note);
  } catch (e) {
    const msg = (e && e.message) || String(e);
    isolated.push({ name: name, verdict: /timeout/i.test(msg) ? 'ISOLATED-HANG' : 'ISOLATED-ERROR', failed: [] });
    verdicts.push({ name: name, verdict: 'ISOLATED-HANG' });
    log('[ISOLATED · HANG · 不计入总判定]  ' + name + '  ' + msg.slice(0, 300));
  } finally { if (s) { try { await s.close(); } catch (e) {} } }
}

/* ---------------- 主流程 ---------------- */
async function main() {
  const browser = findBrowser();
  if (!browser) { log('FATAL: no Edge/Chrome found'); return finish(false); }
  log('browser: ' + browser);
  log('page:    ' + PAGE);
  log('port:    ' + PORT + '   profile: ' + PROFILE);
  log('mode:    per-check target isolation · eval timeout ' + (EVAL_TIMEOUT_MS / 1000) + 's');

  browserProc = spawn(browser, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--enable-unsafe-swiftshader',
    'about:blank',
  ], { stdio: 'ignore' });
  log('edge pid=' + browserProc.pid);

  let version = null;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { version = await r.json(); break; } } catch (e) {}
    await sleep(250);
  }
  if (!version) { log('FATAL: CDP endpoint not ready'); return finish(false); }
  log('cdp ready: ' + (version.Browser || ''));

  try {
    /* --- 0. 桥身份 + 参数签名实测（informational，不判 PASS/FAIL） --- */
    let s = await newSession();
    try {
      const probe = await s.evaluate(
        "(function(){return {v4: typeof window.VS4Selftest, v3: typeof window.VS3Selftest, same: window.VS4Selftest === window.VS3Selftest, keys: Object.keys(window.VS4Selftest||{})}})()", 'bridge-probe');
      log('bridge probe: ' + JSON.stringify(probe));
      if (probe.v4 !== 'object') { log('FATAL: VS4Selftest bridge missing'); return finish(false); }
      if (probe.v3 === 'object') log('NOTE: VS-3 旧桥 window.VS3Selftest 仍在页面内（graybox-vs.html:2551）；本脚本全部走 VS4Selftest，勿混淆。');
      judge('bridgeIsV4', { ok: probe.v4 === 'object' && probe.same === false });

      const sig = await s.evaluate(
        "(function(){function t(k){try{return JSON.stringify(window.VS4Selftest[k]()).slice(0,150)}catch(e){return 'THROW: '+e}}" +
        "return {hitRate:t('hitRate'), be2:t('be2'), determinism:t('determinism'), aiTiming:t('aiTiming')}})()", 'sig-probe');
      log('sig probe (无参调用实测):');
      Object.keys(sig).forEach(k => log('  ' + k.padEnd(12) + ' -> ' + sig[k]));
    } finally { await s.close(); }
  } catch (e) { ok = false; log('FATAL bridge probe: ' + ((e && e.message) || e)); return finish(false); }

  log('--- VS-3 继承口 ---');
  await runPort('boot', 'boot()');
  await runPort('determinism', 'determinism(10)');
  // hitRateCheck(n)（:2516）无默认参 → 必须显式传 n；n=2000, p=0.75 → σ≈0.0097，容差 0.03
  await runPort('hitRate', 'hitRate(2000)',
    (r) => typeof r.dev === 'number' && isFinite(r.dev) && r.dev <= 0.03, null);
  await runPort('be2', 'be2(6)');                 // be2Check(n) 内部 n||6 → 显式 6，与 metrics 同参
  await runPort('aiTiming', 'aiTiming()');        // aiTimingCheck() 无参

  log('--- VS-4 新增口 ---');
  await runPort('economy', 'economy()');
  await runPort('loot', 'loot()');
  await runPort('c7', 'c7()');
  await runPort('dPhase', 'dPhase()');

  log('--- 端到端 / 聚合 ---');
  await runPort('smoke', 'smoke()',
    (r) => /^(END_)?WIN$/.test(String(r.end)) || /^(END_)?LOSE$/.test(String(r.end)));
  await runPort('metrics', 'metrics()',
    (r) => r && r.be2 && r.be2.pass === true && r.aiTiming && r.aiTiming.pass === true
        && r.determinism && r.determinism.same === true
        && r.hitRate && typeof r.hitRate.dev === 'number' && isFinite(r.hitRate.dev) && r.hitRate.dev <= 0.03, null);

  log('--- UI 存活 ---');
  {
    let s = null;
    try {
      s = await newSession();
      const ui = await s.evaluate(
        "(function(){var ids=['btn-stress','btn-rng','btn-metrics','btn-determinism','btn-lose','btn-autoplay','btn-economy'];" +
        "var miss=ids.filter(function(i){return !document.getElementById(i)});return {ok:miss.length===0,missing:miss}})()", 'ui');
      judge('uiButtons', ui);
      const ui4 = await s.evaluate(
        "(function(){var ids=['btn-c7orders','btn-c4rhythm','btn-v4all'];" +
        "var miss=ids.filter(function(i){return !document.getElementById(i)});return {ok:miss.length===0,missing:miss}})()", 'ui4');
      judge('uiButtonsVs4', ui4);
    } catch (e) { ok = false; log('ERROR uiButtons: ' + ((e && e.message) || e)); }
    finally { if (s) { try { await s.close(); } catch (e) {} } }
  }

  /* ============ R-4 隔离区：c4 ============ */
  log('--- 隔离区（R-4）---');
  await runIsolatedPort('c4', 'c4()',
    '[DISPUTED · 待 VS-7 D1] graybox-vs.html:2715 reload_derivation 断言口径（跳过下一轮）与 GDD C4.2 字面式（次轮即可再射）相反；' +
    '本批按 R-3 禁止修改该断言，豁免类别 b 只授权「D1 裁定后一次性改对」。');

  /* ============ c7 挂死根因取证（只读探测，不改实现） ============ */
  const c7v = verdicts.filter(v => v.name === 'c7').pop();
  if (c7v && c7v.verdict === 'TIMEOUT') {
    log('--- c7 挂死根因取证（只读探测，加 200 次护栏；不改动任何实现） ---');
    let s = null;
    try {
      s = await newSession();
      const a = await s.evaluate(
        "(function(){WORLD.init(TABLES.f4Seed);F2.beginPhase('A','diag');var c=F1.getCell('5_1_1');var o=F1.occupancyOf('5_1_1');" +
        "var out={cell:c.id+'/'+c.kind+'/h'+c.h, capacity:o.capacity, preOccupiedBy:o.units.slice(), steps:[]};" +
        "for(var i=0;i<4;i++){var r=C7.exec({type:'DEPLOY_UNIT',cellId:'5_1_1',templateId:'garrison_squad'});" +
        "out.steps.push('i'+i+' ok='+r.ok+' reason='+(r.reason||'-')+' treasury='+C6.treasury());}return out})()", 'diag-a');
      log('  目标格: ' + JSON.stringify(a));
      const b = await s.evaluate(
        "(function(){WORLD.init(TABLES.f4Seed);F2.beginPhase('A','diag');var n=0;" +
        "while(C6.treasury()>=TABLES.economy.cost.build.rollingStock && n<200){" +
        "C7.exec({type:'DEPLOY_UNIT',cellId:'5_1_1',templateId:'garrison_squad'});n++;" +
        "if(!C6.canAfford({kind:'BUILD_FACILITY',facilityKind:'rollingStock'}))break;}" +
        "return {loop:':2664 drain()', iters:n, hitGuard:n>=200, treasuryStuckAt:C6.treasury()}})()", 'diag-b');
      log('  ' + JSON.stringify(b));
      const c = await s.evaluate(
        "(function(){WORLD.init(TABLES.f4Seed);F2.beginPhase('A','diag');var d=[],n=0;" +
        "while(C6.treasury()>=TABLES.economy.cost.deploy.garrisonSquad && n<200){" +
        "d.push(C7.exec({type:'DEPLOY_UNIT',cellId:'5_1_1',templateId:'garrison_squad'}));n++;}" +
        "return {loop:':2667 排水 while', iters:n, hitGuard:n>=200, treasuryStuckAt:C6.treasury(), lastReason:(d[d.length-1]||{}).reason}})()", 'diag-c');
      log('  ' + JSON.stringify(c));
    } catch (e) { log('  diag error: ' + ((e && e.message) || e)); }
    finally { if (s) { try { await s.close(); } catch (e) {} } }
  }

  /* ---------------- 异常面 / 汇总 ---------------- */
  log('--- 异常面 ---');
  log('pageErrors: ' + (pageErrors.length ? pageErrors.length : '(none)'));
  pageErrors.forEach(p => log('  ! ' + String(p).slice(0, 300)));
  log('consoleErrors: ' + (consoleErrors.length ? consoleErrors.length : '(none)'));
  consoleErrors.forEach(p => log('  ! ' + String(p).slice(0, 300)));
  if (pageErrors.length || consoleErrors.length) ok = false;

  log('--- 汇总 ---');
  log('judged: ' + (fails.length ? 'FAIL -> ' + fails.join(', ') : 'ALL PASS'));
  verdicts.forEach(v => log('  ' + v.name.padEnd(14) + v.verdict));
  isolated.forEach(i => log('isolated: ' + i.name + ' = ' + i.verdict +
    (i.failed.length ? '（失败子项: ' + i.failed.join(', ') + '）' : '') + '  [DISPUTED · 待 VS-7 D1 · 不计入总判定]'));

  return finish(ok);
}

function finish(v) {
  fs.writeFileSync(OUT_TXT, lines.join('\n') + '\n', 'utf8');
  log('== VS-4 BROWSER CHECK: ' + (v ? 'ALL PASS（隔离项另计）' : 'FAILED') + ' ==');
  process.exitCode = v ? 0 : 1;
}

main().catch(e => {
  log('FATAL: ' + ((e && e.message) || e));
  finish(false);
}).finally(() => {
  if (browserProc) { try { browserProc.kill(); } catch (e) {} }
  setTimeout(() => { if (browserProc) { try { browserProc.kill('SIGKILL'); } catch (e) {} } }, 2000);
});
