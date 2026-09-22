#!/usr/bin/env node
/* vs2-ui-check.js — 判据②③④实机验收：CDP 驱动页面真实按钮，读 #log 与 F2.state 断言。
 * ①页面零异常+三档相机+切层（复验） ②演示判胜/判负 ③压测×100 ④F4 冒烟 附加 L1&A* / 坠落链。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DIR = __dirname;
const PAGE = 'file:///D:/code/building/design/spikes/graybox-vs.html';
const PORT = 9335;
const lines = [];
function log(s) { lines.push(s); console.log(s); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const proc = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(DIR, '_edge-profile'),
    '--no-first-run', '--disable-gpu', '--enable-unsafe-swiftshader', 'about:blank',
  ], { stdio: 'ignore' });

  for (let i = 0; i < 80; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) break; } catch (e) {}
    await sleep(250);
  }
  let target = null;
  for (let i = 0; i < 10 && !target; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(PAGE), { method: 'PUT' }); if (r.ok) target = await r.json(); } catch (e) {}
    if (!target) await sleep(300);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 0; const pending = new Map(); const errs = []; const cerrs = [];
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errs.push(((d.exception && (d.exception.description || d.exception.value)) || d.text).split('\n')[0]);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      cerrs.push(m.params.args.map(a => a.value !== undefined ? String(a.value) : '').join(' '));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      cerrs.push(m.params.entry.text);
    }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++msgId; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    setTimeout(() => reject(new Error('timeout ' + method)), 30000);
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EVALERR: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Runtime.enable');
  await send('Log.enable');
  await sleep(1000);

  let ok = true;
  const click = async (id) => ev(`(function(){var b=document.getElementById('${id}');if(!b)return 'NO_BTN';b.click();return 'clicked'})()`);
  const phase = async () => ev("(window.F2&&window.F2.state)?window.F2.state().phase:'?'");
  const logTail = async (n) => ev(`(function(){var t=(document.getElementById('log').innerText||'');return t.slice(-${n})})()`);

  // 等待谓词：轮询 log 尾部直到 contains(key) 或超时
  async function waitLog(key, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const t = await logTail(1500);
      if (typeof t === 'string' && t.indexOf(key) >= 0) return t;
      await sleep(400);
    }
    return null;
  }

  try {
    // 启动健全性
    const boot = await ev("JSON.stringify({phase:(window.F2&&window.F2.state)?window.F2.state().phase:'?',THREE:typeof window.THREE,err:(document.getElementById('err').hidden?'':'VISIBLE:'+document.getElementById('err').textContent)})");
    log('boot: ' + boot);
    if (boot.indexOf('"phase":"INIT"') < 0 || boot.indexOf('THREE":"') < 0 || boot.indexOf('VISIBLE') >= 0) { log('FAIL boot sanity'); ok = false; }

    // ① 三档相机 + 切层
    for (const id of ['cam-0', 'cam-1', 'cam-2', 'btn-ghost', 'btn-ghost']) {
      const r = await click(id); if (r !== 'clicked') { log('FAIL click ' + id + ' → ' + r); ok = false; }
    }
    const camState = await ev("(function(){var on=[].slice.call(document.querySelectorAll('.row button.on')).map(function(b){return b.id});return JSON.stringify(on)})()");
    log('cam/ghost toggled, buttons.on=' + camState);
    if (errs.length) { log('FAIL errors after cam ops: ' + errs[0]); ok = false; }

    // ② 判胜：演示一整局
    log('---- 判胜路 ----');
    await click('btn-autoplay');
    const winLog = await waitLog('END_WIN', 20000);
    const winPhase = await phase();
    log('phase=' + winPhase + ' logTail=' + JSON.stringify(winLog ? winLog.slice(-320) : '(timeout)'));
    if (!winLog || winPhase !== 'END_WIN') { log('FAIL 判胜路未到 END_WIN'); ok = false; }

    // ② 判负：重置战局 → 跳到判负（btn-lose 守门仅在 A/B/C 可点；终态须先重置）
    log('---- 判负路 ----');
    await click('btn-init');
    const loseGuard = await ev("(function(){return 'loseDisabledAfterInit='+document.getElementById('btn-lose').disabled})()");
    log(loseGuard + '（INIT 态守门验证：true=正确禁用）');
    await click('btn-next');                    // INIT→A（活局，btn-lose 解禁）
    await click('btn-lose');
    const loseLog = await waitLog('END_LOSE', 20000);
    const losePhase = await phase();
    log('phase=' + losePhase + ' logTail=' + JSON.stringify(loseLog ? loseLog.slice(-320) : '(timeout)'));
    if (!loseLog || losePhase !== 'END_LOSE') { log('FAIL 判负路未到 END_LOSE'); ok = false; }

    // ③ 压测 ×100 —— 判定：异常终态 0 ∧ 注入 6/6 全拒（日志本就会打印有意注入的拒绝，不能按字面非法计数）
    log('---- 相位压测×100 ----');
    await click('btn-stress');
    const stressLog = await waitLog('异常终态', 60000) && await waitLog('全部拒绝', 60000);
    log('logTail=' + JSON.stringify(stressLog ? stressLog.slice(-400) : '(timeout)'));
    const mStress = stressLog && stressLog.match(/异常终态\s*(\d+)/);
    const mInject = stressLog && stressLog.match(/(\d+)\/6 全部拒绝/);
    const mAbn = stressLog && stressLog.match(/✗ 存在漏拒/);
    if (!stressLog || !mStress || mStress[1] !== '0' || !mInject || mInject[1] !== '6' || mAbn) { log('FAIL 压测判定不过'); ok = false; }

    // ④ F4 冒烟
    log('---- F4 种子冒烟 ----');
    await click('btn-rng');
    const rngLog = await waitLog('F4', 15000) || await waitLog('种子', 15000) || await waitLog('一致', 15000);
    log('logTail=' + JSON.stringify(rngLog ? rngLog.slice(-320) : '(timeout)'));
    if (!rngLog || /不一致|FAIL|mismatch/i.test(rngLog)) { log('FAIL F4 冒烟未确认一致性'); ok = false; }

    // 附加：L1&A* / 坠落链
    log('---- L1&A* / 坠落链 ----');
    await click('btn-perf');
    const perfLog = await waitLog('A*', 15000);
    log('logTail=' + JSON.stringify(perfLog ? perfLog.slice(-280) : '(no A* marker — read raw) ' + JSON.stringify((await logTail(280)))));
    await click('btn-fall');
    await sleep(800);
    log('fall logTail=' + JSON.stringify(await logTail(280)));

    // 终态错误盘点
    log('---- totals ----');
    log('page exceptions: ' + errs.length + (errs.length ? ' | first: ' + errs[0] : ''));
    log('console errors: ' + cerrs.length + (cerrs.length ? ' | first: ' + cerrs[0] : ''));
    if (errs.length || cerrs.length) ok = false;
  } catch (e) {
    ok = false;
    log('FATAL during UI checks: ' + (e && e.message || e));
  }

  try { await send('Browser.close'); } catch (e) { try { proc.kill(); } catch (e2) {} }
  setTimeout(() => { try { proc.kill('SIGKILL'); } catch (e) {} }, 1500);
  fs.writeFileSync(path.join(DIR, '_ui-check.txt'), lines.join('\n') + '\n');
  log(ok ? '== UI CHECK: ALL PASS ==' : '== UI CHECK: FAILED ==');
  process.exitCode = ok ? 0 : 1;
}
main().catch(e => { log('FATAL: ' + (e && e.message || e)); fs.writeFileSync(path.join(DIR, '_ui-check.txt'), lines.join('\n') + '\n'); process.exitCode = 1; });
