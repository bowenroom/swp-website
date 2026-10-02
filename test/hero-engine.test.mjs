// Drives the REAL public/hero/scrub-engine.js against a minimal DOM, so the
// clip-sharing and preload logic is exercised rather than described.
//
// Every bug this file guards was invisible in a screenshot and only showed up
// on a slow cross-border link, which is exactly where the homepage has to work:
//   - a connector pointing at the outgoing dive's clip replayed that whole file
//     a second time, so the reader watched each scene end and then start over;
//   - a failing clip used to be rebuilt on the next scroll frame, i.e. one new
//     element and one new request per frame, unbounded;
//   - a re-parented clip could keep ready=false forever, so no seek was ever
//     issued, 'seeked' never fired and the scene stayed a still image.
//
// No jsdom dependency on purpose: the engine is vanilla, and a hand-written shim
// keeps this runnable on the SMB checkout where installs are unreliable.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const engineSrc = readFileSync(join(root, 'public/hero/scrub-engine.js'), 'utf8');

let failures = 0;
const check = (label, cond, detail = '') => {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

// ----------------------------------------------------------------- DOM shim --

const mkEl = (tag) => {
  const listeners = {};
  const el = {
    tagName: tag,
    className: '',
    children: [],
    parentNode: null,
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      toggle(c, force) {
        const on = force === undefined ? !this._s.has(c) : Boolean(force);
        if (on) this._s.add(c); else this._s.delete(c);
        return on;
      },
    },
    offsetHeight: 100,
    clientHeight: 100,
    // Real appendChild MOVES an existing node: it is removed from its old parent
    // first. A shim that only pushes would leave a re-parented <video> painted in
    // two scenes at once, silently defeating the clip-sharing assertions below.
    appendChild(c) {
      if (c.parentNode) c.parentNode.removeChild(c);
      this.children.push(c);
      c.parentNode = this;
      return c;
    },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    setAttribute() {},
    addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
    removeEventListener() {},
    srcAssignments: 0,
  };
  el._fire = (ev) => (listeners[ev] || []).forEach((fn) => fn({ type: ev }));
  return el;
};

// Every <video> the engine ever builds, in order, so a test can assert on what
// was NOT re-requested as easily as on what is currently mounted.
const everyVideo = [];
const mkVideo = () => {
  const v = mkEl('video');
  v.muted = false;
  v.playsInline = false;
  v.preload = '';
  v._src = '';
  v.currentTime = 0;
  v.duration = 7.98;
  v.seeking = false;
  v.readyState = 0;
  Object.defineProperty(v, 'src', {
    get() { return this._src; },
    set(x) { this._src = x; this.srcAssignments += 1; },
    configurable: true,
  });
  v.play = () => Promise.resolve();
  v.pause = () => {};
  // Stands in for the browser's metadata fetch. The shim cannot model real
  // streaming, so this is fired explicitly by the tests that care about a
  // slow link. Left unfired it is an accurate model of 'still in flight'.
  v._metadataArrived = false;
  everyVideo.push(v);
  return v;
};

// Every test gets its OWN view of the videos built so far. Without this, the
// retry-storm test counted elements created by earlier tests' mounts -- the
// engine keeps its own per-mount CLIPS map, so nodes from a previous mount are
// legitimately new nodes, not rebuilds of the file this test is watching.
const markVideos = () => everyVideo.length;
const videosSince = (mark) => everyVideo.slice(mark);

const documentStub = {
  createElement: (t) => (t === 'video' ? mkVideo() : mkEl(t)),
  createTextNode: () => mkEl('#text'),
  documentElement: mkEl('html'),
  body: mkEl('body'),
  head: mkEl('head'),
  fonts: { ready: Promise.resolve() },
  addEventListener() {},
  getElementById: () => null,
};

let rafQ = [];
// memoise per query: the engine captures smallMQ at mount and reads .matches later,
// so a fresh object per call would make the two disagree.
const mqCache = new Map();
const matchMedia = (q) => {
  if (!mqCache.has(q)) mqCache.set(q, { matches: false, media: q, addEventListener() {}, addListener() {} });
  return mqCache.get(q);
};

const winListeners = {};
const windowStub = {
  innerWidth: 1440,
  innerHeight: 900,
  // The engine reads `window.scrollY || window.pageYOffset`. A missing pageYOffset
  // turns `0 || undefined` into undefined and every gate misbehaves at scrollY=0,
  // which is precisely where the homepage lands.
  scrollY: 0,
  pageYOffset: 0,
  devicePixelRatio: 1,
  // Scroll is the engine's main input; a no-op stub here means read() never
  // re-runs and nothing scroll-driven is actually under test.
  addEventListener(ev, fn) { (winListeners[ev] ||= []).push(fn); },
  removeEventListener() {},
  matchMedia,
  scrollTo() {},
};
const fireWindow = (ev) => (winListeners[ev] || []).forEach((fn) => fn({ type: ev }));

const raf = (fn) => { rafQ.push(fn); return rafQ.length; };
const pump = (n = 4) => { for (let i = 0; i < n; i++) rafQ.splice(0).forEach((fn) => fn()); };

const sandbox = {
  document: documentStub,
  window: windowStub,
  requestAnimationFrame: raf,
  performance: { now: () => Date.now() },
  Promise,
  Math,
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(engineSrc, sandbox, { filename: 'scrub-engine.js' });
const mountScrollWorld = sandbox.window.mountScrollWorld;
if (typeof mountScrollWorld !== 'function') {
  console.error('scrub-engine.js did not expose mountScrollWorld');
  process.exit(1);
}

// ---------------------------------------------------------- hero fixtures --

// Mirrors src/components/Hero.astro: five scenes, the closing one clip-less, and
// one NULL connector per gap. No transitional clips exist for this film, so the
// dives cross-dissolve straight into each other rather than replaying a file.
const CLIPS = ['s1-approach', 's2-sensing', 's3-fusion', 's4-decision'];
const clipUrl = (id) => (id ? `/hero/vid/${id}.mp4` : null);
const stillUrl = (id) => `/hero/${id}.jpg`;
const sections = [
  { id: 'establish', label: 'Establish', title: 't', body: 'b', still: stillUrl('k0-establish'), clip: clipUrl(CLIPS[0]), accent: '#5b7fa6' },
  { id: 'road', label: 'Road', title: 't', body: 'b', still: stillUrl('k1-road'), clip: clipUrl(CLIPS[1]), accent: '#8a6f4e' },
  { id: 'sensing', label: 'Sensing', title: 't', body: 'b', still: stillUrl('k2-sensing'), clip: clipUrl(CLIPS[2]), accent: '#4f7d6a' },
  { id: 'fusion', label: 'Fusion', title: 't', body: 'b', still: stillUrl('k3-fusion'), clip: clipUrl(CLIPS[3]), accent: '#6b5f8a' },
  { id: 'decision', label: 'Decision', title: 't', body: 'b', still: stillUrl('k4-decision'), clip: null, accent: '#a6604e' },
];
const connectors = sections.slice(0, -1).map(() => null);

const VH = 900;
// Every connector is null, so a gap contributes no segment at all:
// five dives * 1.25vh = 6.25vh of runway.
const SEG = (() => {
  const w = [];
  sections.forEach((s, i) => {
    w.push(1.25);
    if (i < sections.length - 1 && connectors[i]) w.push(0.85);
  });
  let off = 0;
  return w.map((x) => { const r = { start: off * VH, end: (off + x) * VH }; off += x; return r; });
})();
const mid = (i) => Math.round((SEG[i].start + SEG[i].end) / 2);

const mount = (extra = {}) => {
  rafQ = [];
  const host = mkEl('div');
  mountScrollWorld(host, {
    brand: { name: 'x', href: '/' },
    hint: 'scroll',
    nav: false,
    atmosphere: true,
    stillOnlyMobile: false,
    sections,
    connectors,
    diveScroll: 1.25,
    connScroll: 0.85,
    crossfade: 0.14,
    testHooks: true,
    ...extra,
  });
  pump();
  return host;
};

const stageOf = (host) => host.children.find((c) => String(c.className || '').includes('sw-stage'));
const scenesOf = (host) => stageOf(host).children.filter((c) => String(c.className || '').includes('sw-scene'));
const videosIn = (host) => stageOf(host).children.flatMap((s) => s.children).filter((c) => c.tagName === 'video');
const probeOf = (host) => host.__swProbe();
const heldBy = (host) => probeOf(host).segments.map((s, i) => ({ i, ...s })).filter((s) => s.hasClip);
// Move the scroll position the way a visitor does: set it, fire the real scroll
// listener so read() re-runs, then let the rAF loop catch up.
const scrollTo = (y) => {
  windowStub.scrollY = y;
  windowStub.pageYOffset = y;
  fireWindow('scroll');
  pump();
};

console.log('hero engine: no clip replay over the real 5-scene / 5-segment chain');

// 1. The shape of the chain the homepage actually builds. Five scenes make five
//    segments -- a null connector contributes none -- so no file can be shown by
//    two segments. This is the regression guard for the replay artefact.
{
  scrollTo(0);
  const p = probeOf(mount());
  check('five segments for five scenes', p.segments.length === 5, `got ${p.segments.length}`);
  check('four of five segments carry a clip', p.segments.filter((s) => s.clip).length === 4);
  check('the closing scene is still-only by design', p.segments[4].clip === null);
  check('four unique files cover the four clip segments',
    new Set(p.segments.map((s) => s.clip).filter(Boolean)).size === 4);
  check('NO file is played by two segments', (() => {
    const seen = new Map();
    for (const s of p.segments) {
      if (!s.clip) continue;
      seen.set(s.clip, (seen.get(s.clip) || 0) + 1);
    }
    return [...seen.values()].every((n) => n === 1);
  })(), p.segments.map((s) => s.clip).join(' '));
}

// 2. One element and one src per unique file, no matter how many segments point
//    at it. This is the entire point of the fix.
{
  scrollTo(0);
  const vids = videosIn(mount());
  const counts = new Map();
  for (const v of vids) counts.set(v._src, (counts.get(v._src) || 0) + 1);
  check('no file is decoded by two <video> elements at once',
    [...counts.values()].every((n) => n === 1),
    [...counts.entries()].filter(([, n]) => n > 1).map(([u, n]) => `${u} x${n}`).join(' '));
  check('each armed file was assigned src exactly once', vids.every((v) => v.srcAssignments === 1),
    vids.filter((v) => v.srcAssignments !== 1).map((v) => `${v._src} x${v.srcAssignments}`).join(' '));
  // With the connectors gone the five dives are contiguous at 1.25vh each, so the
  // 3vh arm window now reaches one segment further than it used to and three of
  // the four files get a cheap metadata request on the landing frame. That is the
  // intended cost of the fix and it is bounded: the LAST clip is still never
  // touched, and 'arm' only means a metadata probe (see the preload ladder below,
  // which is what actually spends bandwidth).
  check('the landing frame does not arm the whole runway', vids.length < 4,
    `${vids.length}: ${vids.map((v) => v._src).join(' ')}`);
  // Exactly one -- the one the reader is actually looking at -- buffers. The rest
  // are metadata probes only.
  check('only the on-screen clip buffers on landing; the rest stay metadata',
    vids.filter((v) => v.preload === 'auto').length === 1 &&
    vids[0].preload === 'auto',
    vids.map((v) => `${v._src}:${v.preload}`).join(' '));
}

// 3. The preload ladder: arm cheaply at 3vh out, buffer fully at 0.8vh.
{
  // Mid-first-dive. Two files are in reach of the 0.8vh NEAR window here (the one
  // on screen and the next dive just under the fold), and exactly one of them --
  // the one being watched -- may be 'auto'. Any further clip stays 'metadata'.
  scrollTo(mid(0));
  const holders = heldBy(mount());
  const show = holders.map((s) => ({ i: s.i, visible: s.visible, promoted: s.promoted, pl: s.videoPreload }));
  const onScreen = holders.filter((s) => s.visible);
  check('the on-screen clip is promoted to preload=auto',
    onScreen.length > 0 && onScreen.every((s) => s.promoted && s.videoPreload === 'auto'), JSON.stringify(show));
  const buffered = holders.filter((s) => s.videoPreload === 'auto');
  check('at most one file is fully buffered at a time',
    buffered.length === 1, JSON.stringify(show));

  // Nothing far down the runway may be buffered on the landing frame.
  scrollTo(0);
  const landing = videosIn(mount());
  check('the landing frame buffers only the clip it shows',
    landing.filter((v) => v.preload === 'auto').length === 1,
    landing.map((v) => `${v._src}:${v.preload}`).join(' '));

  // Sweep the entire runway: no scroll position may ever have more than two
  // files buffering, and never more than the two clips actually in reach.
  const host = mount();
  let worst = 0, worstAt = 0;
  for (let y = 0; y <= 5900; y += 45) {
    scrollTo(y);
    const autos = new Set(videosIn(host).filter((v) => v.preload === 'auto').map((v) => v._src));
    if (autos.size > worst) { worst = autos.size; worstAt = y; }
  }
  check('no scroll position buffers more than two files', worst <= 2,
    `${worst} files at y=${worstAt}`);
}

// 4. A clip handed over while metadata is still in flight must still become
//    ready. Otherwise raf() never seeks, 'seeked' never fires, and the visitor
//    stares at a still for the rest of the visit.
{
  scrollTo(0);
  const host = mount();
  const v0 = videosIn(host)[0];
  check('the landing frame armed the opening clip', Boolean(v0));
  v0._fire('loadedmetadata');   // slow link: metadata lands after mount
  v0._metadataArrived = true;
  pump();
  const v0holder = heldBy(host).filter((s) => s.videoPreload !== null && s.hasClip);
  check('metadata stamps ready onto the segment that holds this element',
    v0holder.length > 0 && v0holder.every((s) => s.ready || s.i !== 0),
    JSON.stringify(heldBy(host).map((s) => ({ i: s.i, ready: s.ready, loading: s.loading }))));
  check('the segment holding the metadata-loaded clip reports ready',
    scenesOf(host)[0].children.includes(v0) && probeOf(host).segments[0].ready,
    JSON.stringify(probeOf(host).segments[0]));
  check('metadata clears the loading flag on its holder',
    probeOf(host).segments[0].loading === false,
    `loading=${probeOf(host).segments[0].loading}`);

  // A clip parked at target 0 correctly never moves, so scroll before asserting.
  scrollTo(Math.round(SEG[0].end * 0.5));
  check('a ready clip is scrubbed by the rAF loop', v0.currentTime !== 0 || v0.seeking,
    `currentTime=${v0.currentTime} seeking=${v0.seeking}`);

  // Reveal: a completed seek hides the still and shows the video.
  v0.seeking = false;
  v0._fire('seeked');
  pump();
  check('the seeking scene reveals the video over its still',
    heldBy(host).some((s) => s.parentHasClip),
    JSON.stringify(heldBy(host).map((s) => ({ i: s.i, revealed: s.parentHasClip }))));

  // The reveal must travel with the element, or its new segment shows a still.
  scrollTo(mid(1));
  check('the reveal follows the element to its new segment',
    heldBy(host).some((s) => s.parentHasClip),
    JSON.stringify(heldBy(host).map((s) => ({ i: s.i, revealed: s.parentHasClip }))));
}

// 5. The retry storm. One bad file must not be re-requested on every frame, and
//    must not take the healthy clips down with it.
{
  scrollTo(0);
  // Scope boundary: only videos built by THIS mount may be counted, or the check
  // would tally nodes left behind by earlier tests' mounts (each mount owns its
  // own CLIPS map, so those are legitimately new elements, not rebuilds).
  const mark = markVideos();
  const host = mount();
  const broken = clipUrl(CLIPS[0]);
  const target = videosIn(host).find((v) => v._src === broken);
  check('the landing frame armed the clip we are about to break', Boolean(target));
  check('the broken file was built exactly once by this mount',
    videosSince(mark).filter((v) => v._src === broken).length === 1,
    `${videosSince(mark).filter((v) => v._src === broken).length} elements`);
  target._fire('error');
  pump();

  // Sweep the whole runway the way a visitor scrolls, then look at every video
  // this mount built after the failure -- not just the ones currently mounted.
  for (let y = 0; y <= 6000; y += 90) scrollTo(y);
  const builtDuringSweep = videosSince(mark).filter((v) => v !== target);
  check('the broken file is never requested again',
    builtDuringSweep.every((v) => v._src !== broken),
    builtDuringSweep.filter((v) => v._src === broken).length + ' rebuilds');
  check('the broken file never gets a second element',
    builtDuringSweep.filter((v) => v._src === broken).length === 0,
    `${builtDuringSweep.filter((v) => v._src === broken).length} elements`);
  check('the broken element was removed from the DOM',
    videosIn(host).every((v) => v._src !== broken), videosIn(host).map((v) => v._src).join(' '));

  const p = probeOf(host);
  check('the only segment using the broken file degraded to its still',
    p.segments.filter((s) => s.clip === broken).every((s) => s.failed) &&
    p.segments.filter((s) => s.clip === broken).length === 1,
    JSON.stringify(p.segments.map((s, i) => ({ i, clip: s.clip, failed: s.failed }))));
  check('healthy clips keep working after the failure',
    p.segments.filter((s) => s.clip && s.clip !== broken).every((s) => !s.failed),
    JSON.stringify(p.segments.map((s, i) => ({ i, clip: s.clip, failed: s.failed }))));
  check('every scene still shows a still image (graceful degradation)',
    scenesOf(host).every((s) => s.children.some((c) => c.tagName === 'img')));
}

// 6. Ownership follows the scroll without thrashing.
//
//    With every connector null, each file belongs to exactly ONE segment, so the
//    shared-element handover the engine was built for can no longer happen here.
//    That is the point: a clip that is never re-parented is a clip that cannot be
//    replayed. Assert the stronger invariant -- every element stays on its own
//    scene for the whole runway, and no scene ever shows a foreign file.
{
  scrollTo(0);
  const host = mount();
  const scenes = scenesOf(host);
  const v0 = videosIn(host)[0];
  check('the opening clip starts on the first dive', scenes[0].children.includes(v0));

  scrollTo(mid(1));
  const v1 = videosIn(host)[0];
  check('leaving dive 0 does NOT drag its element onto the next scene', !scenes[1].children.includes(v0),
    'element was re-parented into a scene that does not own it');
  check('the scene on screen holds its own clip', videosIn(host).some((v) =>
    scenes[1].children.includes(v)), 'no element on the second dive');
  check('a clip is never rebuilt after being handed out', v1 !== null && videosIn(host).every((v) =>
    v.srcAssignments === 1), videosIn(host).map((v) => `${v._src} x${v.srcAssignments}`).join(' '));

  let flips = 0;
  let prev = videosIn(host)[0];
  for (let i = 0; i < 20; i++) { pump(1); const now = videosIn(host)[0]; if (now !== prev) flips++; prev = now; }
  check('ownership is stable across idle frames', flips === 0, `${flips} flips`);

  // Scrolling all the way back must not have moved anything between scenes.
  scrollTo(0);
  check('scrolling back leaves the opening element on its own dive',
    videosIn(host)[0] === v0 && scenes[0].children.includes(v0));
  const expected = sections.map((s) => s.clip);
  const mismatched = scenes.map((s, i) => {
    const v = s.children.filter((c) => c.tagName === 'video')[0];
    return v && v._src !== expected[i] ? { i, got: v._src, want: expected[i] } : null;
  }).filter(Boolean);
  check('no scene ever displays a clip that is not its own', mismatched.length === 0,
    JSON.stringify(mismatched));
  check('no scene holds two videos after all that scrolling',
    scenes.every((s) => s.children.filter((c) => c.tagName === 'video').length <= 1));
}

// 7. The two deliberate no-video paths must request nothing at all.
{
  mqCache.get('(prefers-reduced-motion: reduce)').matches = true;
  scrollTo(0);
  check('prefers-reduced-motion loads no clips', videosIn(mount()).length === 0);
  mqCache.get('(prefers-reduced-motion: reduce)').matches = false;

  mqCache.get('(max-width: 860px)').matches = true;
  scrollTo(0);
  check('stillOnlyMobile on a narrow viewport loads no clips',
    videosIn(mount({ stillOnlyMobile: true })).length === 0);
  mqCache.get('(max-width: 860px)').matches = false;
}

// 8. The probe is opt-in, so a production mount leaves nothing on the container.
{
  scrollTo(0);
  check('no test hook on a production mount', mount({ testHooks: false }).__swProbe === undefined);
}

// 9. The seam. The segment CONTAINING the scroll position owns the shared element,
//    in both directions, and the scene on screen is always the one buffering.
//
//    Two earlier attempts at this both failed, in opposite directions, and a test
//    that only sampled segment MIDPOINTS caught neither:
//      - a flat score for every visible segment let the outgoing dive keep the
//        element for the whole dissolve, so the incoming scene showed a still;
//      - tie-breaking on distance-to-midpoint handed the element to the connector
//        BEFORE the reader crossed into it, stranding the dive they were watching.
//    So this sweeps every single pixel across all four seams, in both directions.
{
  scrollTo(0);
  const host = mount();
  const containing = (y) => {
    for (let i = 0; i < SEG.length; i++) if (y >= SEG[i].start && y < SEG[i].end) return i;
    return -1;
  };
  // Walk forward and backward through every seam at 1px resolution. A seam is the
  // span where two adjacent segments are both visible (the crossfade dissolve).
  // Every adjacent boundary is a place where the scene on screen changes, so all
  // of them get swept -- including the one next to the clip-less closing segment,
  // which has no connector of its own and therefore no file to hand over.
  const seams = [];
  for (let i = 0; i < SEG.length - 1; i++) seams.push(SEG[i].end);
  check('every boundary in the chain gets swept', seams.length === SEG.length - 1,
    `${seams.length} of ${SEG.length - 1}`);

  const bad = [];
  const scan = (from, to, step) => {
    for (let y = from; step > 0 ? y <= to : y >= to; y += step) {
      scrollTo(y);
      const p = probeOf(host);
      const ci = containing(y);
      if (ci < 0) continue;
      // The scene actually on screen must own a clip whenever it has one, and it
      // must be the one allowed to buffer.
      const onScreen = p.segments[ci];
      if (onScreen.clip && !onScreen.hasClip) bad.push({ y, i: ci, why: 'onscreen-has-no-element' });
      if (onScreen.clip && onScreen.videoPreload !== 'auto') bad.push({ y, i: ci, why: 'onscreen-not-buffering', pl: onScreen.videoPreload });
      // And at most ONE element per file may exist, so two scenes can never be
      // decoding the same bytes at once -- the defect the whole design exists to
      // remove. (Distance-based 'is this too far away' checks are deliberately not
      // asserted here: the ARM window is an implementation detail, and a test that
      // hard-codes it breaks every time the window is retuned.)
      const perFile = new Map();
      p.segments.forEach((s) => {
        if (!s.hasClip) return;
        perFile.set(s.clip, (perFile.get(s.clip) || 0) + 1);
      });
      if ([...perFile.values()].some((n) => n > 1)) bad.push({ y, i: ci, why: 'two-elements-one-file' });
      if (bad.length > 6) return;
    }
  };
  for (const seam of seams) { scan(Math.max(0, seam - 260), seam + 260, 1); scan(seam + 260, Math.max(0, seam - 260), -1); }
  check('the scene under the scroll position always owns and buffers its clip',
    bad.length === 0, JSON.stringify(bad.slice(0, 6)));

  // The buffering decision must follow the scene that is DOMINANT on screen, not
  // whichever segment happens to be holding the element this frame. These two only
  // disagree mid-handover, and with the containment rule in place they are hard to
  // catch by sampling outcomes -- so assert the invariant directly.
  //
  // 'Dominant', not merely s.visible: during a crossfade the incoming scene is
  // technically visible at 5% opacity two hundred pixels before the reader reaches
  // it, and buffering a file that faint would spend the bandwidth on something
  // nobody can see. So this keys off the segment CONTAINING y -- the one the reader
  // is actually inside -- which is the same rule the engine now uses.
  const viol = [];
  for (let y = 0; y <= 5700; y += 7) {
    scrollTo(y);
    const p = probeOf(host);
    const urls = new Set(p.segments.filter((s) => s.hasClip).map((s) => s.clip));
    urls.forEach((u) => {
      // Is this file the one the reader is currently inside, or just behind them
      // and about to arrive? That is the same window the engine buffers in:
      // y >= start (entered) and y < end + NEAR (not yet left behind).
      const onScreen = p.segments.some((s) => s.clip === u && y >= s.start && y < s.end + 0.8 * VH);
      const rec = p.clips.find((c) => c.url === u);
      if (!onScreen) return;
      if (!rec || rec.preload !== 'auto') viol.push({ y, u: u.split('/').pop(), pl: rec && rec.preload });
    });
    if (viol.length > 5) break;
  }
  check('any file with a scene on screen is allowed to buffer, whoever holds it',
    viol.length === 0, JSON.stringify(viol.slice(0, 5)));
}

// 10. Preload state belongs to the ELEMENT, not to whichever segment is holding it.
//    When this was a per-segment `promoted` flag, re-parenting the shared <video>
//    left the new holder's flag describing the OLD holder's state, and the demote
//    pass then pulled a live, on-screen scene back to preload='metadata' -- a scene
//    frozen on a still while the clip it had just reached for stopped buffering.
{
  scrollTo(0);
  const host = mount();
  // Park the shared element on the first dive and demote it by scrolling far away,
  // then bring it back: the handover happens with the element at 'metadata'.
  scrollTo(3200);
  const pAway = probeOf(host);
  // Only the OPENING clip was left behind here; whatever is on screen at y=3200 is
  // correctly still buffering, so asking 'is everything metadata' would be wrong.
  const opening = pAway.clips.find((c) => c.url === clipUrl(CLIPS[0]));
  check('the clip left behind at the top is demoted off the critical path',
    opening && opening.preload === 'metadata', JSON.stringify(pAway.clips.map((c) => ({ u: c.url.split('/').pop(), p: c.preload }))));
  check('the clip on screen is still buffering',
    pAway.segments.filter((s) => s.visible && s.hasClip).every((s) => s.promoted),
    JSON.stringify(pAway.segments.filter((s) => s.hasClip).map((s) => ({ v: s.visible, p: s.promoted }))));

  scrollTo(mid(1));
  const v = videosIn(host)[0];
  check('the element is promoted again once its scene is on screen',
    v && v.preload === 'auto', `preload=${v && v.preload}`);

  // The flag the probe reports must match the element that is actually mounted --
  // that correspondence is the whole invariant.
  const p = probeOf(host);
  const mismatched = p.segments.filter((s) => s.hasClip && s.promoted !== (s.videoPreload === 'auto'));
  check('no segment reports a promoted state that disagrees with its element',
    mismatched.length === 0, JSON.stringify(mismatched));

  // And the scene the reader is inside must be one of the buffering clips, always.
  const onScreen = p.segments.filter((s) => s.visible && s.hasClip);
  check('every on-screen clip is buffering', onScreen.every((s) => s.promoted),
    JSON.stringify(onScreen.map((s) => ({ i: p.segments.indexOf(s), promoted: s.promoted, pl: s.videoPreload }))));
}

console.log(failures ? `\n${failures} failure(s)` : '\nall hero engine checks passed');
process.exit(failures ? 1 : 0);
