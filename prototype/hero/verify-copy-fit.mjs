// Geometry check for the hero copy blocks.
// The last act carries title + body + tags + CTA. On short viewports the scroll
// loop's parallax used to overwrite the CSS centring transform, so the block's
// TOP sat at mid-screen and everything below (the CTA buttons) fell off the
// bottom edge. This drives a headless browser at several viewport heights and
// asserts every visible copy block — and specifically the CTA — is fully inside
// the viewport at the point where its copy is fully faded in.
//
//   node prototype/hero/verify-copy-fit.mjs [url]
//
// Exit code 0 = copy and CTA fit at every tested size.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_ = /^(https?|file):/.test(process.argv[2] || '')
  ? process.argv[2]
  : 'http://127.0.0.1:8901/prototype/hero/';
const PORT = 9411;
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';

// Realistic desktop/laptop viewports, shortest first — 1366x600 is a 13" laptop
// with browser chrome, which is where the buttons used to disappear.
const SIZES = [
  [1366, 600],
  [1440, 720],
  [1512, 800],
  [1600, 1000],
  [1920, 1080],
  [2560, 1440],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, what, tries = 80) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${what}`);
}

const profile = mkdtempSync(join(tmpdir(), 'swp-fit-'));
const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=1600,1000', 'about:blank',
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
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const n = ++id; pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.text || 'eval threw');
    }
    return r.result?.result?.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: SIZES[0][0], height: SIZES[0][1], deviceScaleFactor: 1, mobile: false,
  });
  await send('Page.navigate', { url: URL_ });
  await waitFor(async () => (await evalJs('document.readyState')) === 'complete', 'page load');
  await sleep(900);   // let layout() + fonts settle

  const failures = [];
  for (const [w, h] of SIZES) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(450);   // resize -> layout() -> clampCopyParallax()

    // The engine writes copy opacity inside a requestAnimationFrame callback, and
    // headless throttles rAF unpredictably, so we never await rAF from inside the
    // page. Node drives the scroll one step at a time and sleeps, letting the
    // engine's own rAF loop run read() before we read geometry synchronously.
    const steps = 24;
    const scrollable = await evalJs('document.body.scrollHeight - window.innerHeight');
    const perAct = Array.from({ length: 4 }, () => ({ worst: null, hasCta: false }));
    let vh = 0, vw = 0;
    for (let k = 0; k <= steps; k++) {
      const y = Math.round(scrollable * (k / steps));
      await evalJs(`window.scrollTo(0, ${y}); window.dispatchEvent(new Event('scroll')); 0`);
      await sleep(70);   // let the engine's rAF loop settle
      const snap = await evalJs(`(() => {
        const out = [];
        document.querySelectorAll('.sw-copy').forEach((b, i) => {
          const cta = b.querySelector('.sw-copy__cta');
          const r = b.getBoundingClientRect();
          const cr = cta ? cta.getBoundingClientRect() : null;
          out.push({
            i,
            op: parseFloat(getComputedStyle(b).opacity) || 0,
            top: r.top, bottom: r.bottom, h: r.height,
            hasCta: !!cta,
            ctaTop: cr ? cr.top : null, ctaBottom: cr ? cr.bottom : null,
          });
        });
        return { vh: window.innerHeight, vw: window.innerWidth, out };
      })()`);
      vh = snap.vh; vw = snap.vw;
      for (const s of snap.out) {
        if (s.op < 0.9) continue;              // only judge while actually visible
        const cur = perAct[s.i];
        cur.hasCta = s.hasCta;
        if (!cur.worst || s.bottom > cur.worst.bottom) cur.worst = s;
      }
    }
    const res = { vw, vh, out: perAct.map((p, i) => ({ i, hasCta: p.hasCta, worst: p.worst })) };
    await evalJs('window.scrollTo(0, 0); 0');

    const lines = [];
    for (const b of res.out) {
      if (!b.worst) { lines.push(`  act${b.i + 1}: never reached opacity>=0.9 (FAIL)`); failures.push(`${w}x${h} act${b.i + 1} never visible`); continue; }
      const t = b.worst.top, bt = b.worst.bottom;
      const overTop = Math.round(-t), overBot = Math.round(bt - res.vh);
      const ctaOver = b.hasCta ? Math.round(b.worst.ctaBottom - res.vh) : 0;
      const bad = overTop > 1 || overBot > 1 || ctaOver > 1;
      lines.push(`  act${b.i + 1}: top=${Math.round(t)} bottom=${Math.round(bt)} (vh=${res.vh})` +
        (b.hasCta ? ` ctaBottom=${Math.round(b.worst.ctaBottom)}` : '') +
        (bad ? `  <-- OVERFLOW top+${overTop} bottom+${overBot} cta+${ctaOver}` : '  ok'));
      if (bad) failures.push(`${w}x${h} act${b.i + 1} overflow top+${overTop} bottom+${overBot} cta+${ctaOver}`);
    }
    console.log(`${w}x${h}`);
    console.log(lines.join('\n'));
  }

  if (failures.length) {
    console.log('\nFAIL: copy/CTA does not fit at some viewport sizes');
    failures.forEach((f) => console.log('  - ' + f));
  } else {
    console.log('\nPASS: every copy block and CTA fits at all tested sizes');
    code = 0;
  }
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
 try { child.kill('SIGKILL'); } catch (e) {}
 try { rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  process.exit(code);
}
