// Runtime verification for the scroll-scrubbed hero.
// Drives a headless Edge over CDP: loads the page, scrolls it, and samples every
// <video>'s currentTime so we can prove each shot actually loads AND scrubs.
//
//   node prototype/hero/verify-scrub.mjs [url] [--mobile]
//
// Exit code 0 = every expectation held. Anything else = a real failure to fix.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_ = /^(https?|file):/.test(process.argv[2] || '')
  ? process.argv[2]
  : 'http://127.0.0.1:8901/prototype/hero/';
const MOBILE = process.argv.includes('--mobile');
const PORT = 9333 + (MOBILE ? 1 : 0);
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, what, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${what}`);
}

const profile = mkdtempSync(join(tmpdir(), 'swp-edge-'));
const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required',
  MOBILE ? '--window-size=430,932' : '--window-size=1600,1000',
  'about:blank',
], { stdio: 'ignore' });

let code = 1;
try {
  const target = await waitFor(async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`).catch(() => null);
    if (!r || !r.ok) return null;
    const list = await r.json();
    return list.find((t) => t.type === 'page') || null;
  }, 'edge devtools target');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      logs.push(`${e.level}: ${e.text}${e.url ? ` <${e.url}>` : ''}`);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      logs.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };

  await send('Log.enable');
  await send('Runtime.enable');
  await send('Page.enable');
  // --window-size is unreliable in headless=new; pin the viewport over CDP so the
  // desktop run really is a desktop viewport (otherwise isMobile() fires and the
  // still-only fallback hides the clips, which is correct but not what we test here).
  await send('Emulation.setDeviceMetricsOverride', MOBILE
    ? { width: 430, height: 932, deviceScaleFactor: 2, mobile: true }
    : { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ });
  // Wait for the engine to actually mount (it builds the scroll track in JS), not
  // merely for readyState — the track can be 0px for a tick after load.
  await waitFor(async () => await evalJS(
    `(document.querySelectorAll('.sw-scene').length || 0) >= 4 &&
     document.documentElement.scrollHeight > window.innerHeight * 2`
  ), 'scroll world to mount (4 scenes + scrollable track)');
  await sleep(1000);

  const height = await evalJS('document.documentElement.scrollHeight');
  const vh = await evalJS('window.innerHeight');
  console.log(`page height ${height}px, viewport ${vh}px, ${MOBILE ? 'MOBILE' : 'DESKTOP'}`);

  // Sample video state at a series of scroll depths.
  const sample = async (frac) => {
    await evalJS(`window.scrollTo(0, ${Math.round((height - vh) * frac)})`);
    await sleep(700);
    return await evalJS(`(() => {
      const vs = [...document.querySelectorAll('.sw-scene__video')];
      return {
        y: Math.round(window.scrollY),
        vids: vs.map(v => ({ t: +v.currentTime.toFixed(3), d: +(v.duration||0).toFixed(2),
                             rs: v.readyState, w: v.videoWidth })),
        hasClip: [...document.querySelectorAll('.sw-scene')].map(e => e.classList.contains('has-clip')),
        stills: [...document.querySelectorAll('.sw-scene__still')].map(i => i.complete && i.naturalWidth > 0),
      };
    })()`);
  };

  const fracs = [0, 0.18, 0.35, 0.5, 0.68, 0.85, 1];
  const rows = [];
  for (const f of fracs) rows.push(await sample(f));
  for (const r of rows) {
    console.log(`y=${String(r.y).padStart(6)}  videos=[${r.vids.map(v => `${v.t}s/${v.d}s rs${v.rs} ${v.w}px`).join(' | ')}]`);
  }

  // ---- expectations ----
  const fails = [];
  const stillBroken = rows.some(r => r.stills.some(v => !v));
  if (stillBroken) fails.push('a still image failed to decode');

  if (MOBILE) {
    const anyVideo = rows.some(r => r.vids.length > 0);
    if (anyVideo) fails.push('MOBILE loaded video clips — stillOnlyMobile is not working');
    else console.log('PASS mobile: zero <video> elements (still-only degradation)');
  } else {
    const all = rows.flatMap(r => r.vids);
    if (all.length < 4) fails.push(`expected 4 clips to load, saw ${all.length}`);
    const zeroDur = all.filter(v => !(v.d > 1));
    if (zeroDur.length) fails.push(`${zeroDur.length} clip(s) never got a real duration`);
    // Each clip must actually move across the scroll, not just sit at t=0.
    const perClip = new Map();
    for (const r of rows) r.vids.forEach((v, i) => {
      if (!perClip.has(i)) perClip.set(i, new Set());
      perClip.get(i).add(v.t);
    });
    for (const [i, times] of perClip) {
      if (times.size < 2) fails.push(`clip ${i} never scrubbed (t stayed ${[...times].join(',')})`);
      else console.log(`PASS desktop clip ${i}: scrubbed across ${times.size} distinct times`);
    }
  }

  // favicon.ico is the browser's own automatic request, not something the page
  // references — don't let it masquerade as a real broken asset.
  const bad = logs.filter(l => /404|Failed to load|net::ERR/i.test(l))
    .filter(l => !/favicon/i.test(l));
  if (bad.length) fails.push(`network errors: ${bad.join(' ; ')}`);
  if (logs.length) console.log('console:\n  ' + logs.join('\n  '));

  if (fails.length) { console.log('\nFAIL:\n  - ' + fails.join('\n  - ')); code = 1; }
  else console.log('\nALL CHECKS PASSED');
} catch (e) {
  console.error('verify-scrub error:', e.message);
  code = 1;
} finally {
  child.kill('SIGKILL');
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(code);
}
