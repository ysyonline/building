#!/usr/bin/env node
/* vs3-probe.js — VS-3 临时探针：点「演示一整局」后读页面事件日志 + HUD，定位 ONGOING 成因 */
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

function findBrowser() {
  for (const p of EDGE_CANDIDATES) { try { fs.accessSync(p); return p; } catch (e) {} }
  return null;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = findBrowser();
  const proc = spawn(browser, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(DIR, '_edge-profile'), '--no-first-run', '--disable-gpu', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
  let version = null;
  for (let i = 0; i < 80 && !version; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) version = await r.json(); } catch (e) {} await sleep(250); }
  if (!version) { console.error('FATAL cdp'); process.exit(1); }
  let target = null;
  for (let i = 0; i < 10 && !target; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(PAGE), { method: 'PUT' }); if (r.ok) target = await r.json(); } catch (e) {} await sleep(300); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  function send(method, params) { return new Promise((resolve, reject) => { const id = ++msgId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {} })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)); } }, 120000); }); }
  async function evaluate(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text); return r.result.value; }
  await send('Runtime.enable');
  await sleep(800);

  // 1) 判胜路：点 autoplay
  await evaluate("document.getElementById('btn-autoplay').click()");
  await sleep(500);
  const log1 = await evaluate("document.getElementById('log').innerText");
  const hud1 = await evaluate("document.getElementById('hud-phase').innerText + ' | ' + document.getElementById('hud-turn').innerText");
  console.log('===== 判胜路（btn-autoplay，40 回合上限）=====');
  console.log('HUD: ' + hud1);
  console.log(log1);

  // 2) 判负路：点 btn-lose（从当前终态会先程序化兜底重置）
  await evaluate("document.getElementById('btn-lose').click()");
  await sleep(500);
  const log2 = await evaluate("document.getElementById('log').innerText");
  const hud2 = await evaluate("document.getElementById('hud-phase').innerText + ' | ' + document.getElementById('hud-turn').innerText");
  console.log('===== 判负路（btn-lose，烽燧击破注入）=====');
  console.log('HUD: ' + hud2);
  console.log(log2.slice(log1.length)); // 只打增量

  try { await send('Browser.close'); } catch (e) {}
  setTimeout(() => { try { proc.kill('SIGKILL'); } catch (e) {} }, 1500);
}
main().catch(e => { console.error('FATAL', e && e.message || e); process.exit(1); });
