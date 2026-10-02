/* ============================================================================
   scroll-world — portable scroll-scrubbed camera-flight engine
   ----------------------------------------------------------------------------
   Framework-agnostic. Vanilla JS, zero dependencies. It builds its own DOM and
   injects its own (namespaced) CSS into a container you give it, so it drops into
   plain HTML, Next.js (call from a ref/useEffect), Vue (onMounted), a server-
   rendered page, anything.

   USAGE
     mountScrollWorld(document.getElementById('world'), {
       brand: { name: 'Pearl & Co.', href: '#top' },
       diveScroll: 1.3,   // viewport-heights of scroll per dive clip
       connScroll: 0.9,   // ...per connector clip
       hint: 'scroll to fly in',
       nav: true,         // show the top section nav
       atmosphere: true,  // subtle gradient + drifting particles behind the clips
       sections: [
         { id, label, still, stillMobile, clip, clipMobile, accent,
           scroll: 1.6,   // optional per-section override of diveScroll — more scroll
                          // distance = a slower, longer dwell in this scene
           linger: 0.5,   // optional 0..1 — remaps time so the camera settles mid-scene
                          // (exactly where the copy peaks) and moves quicker at the
                          // edges. 0 = linear (default). Keep ≤ 0.6; 1 = full pause.
           eyebrow, title, body, tags:[…],
           cta:{ primary:{label,href}, secondary:{label,href} } }, // last section only
         …
       ],
       connectors: [clipUrl, …],          // length = sections.length - 1 (nulls allowed)
       connectorsMobile: [clipUrl, …],    // optional lighter connectors for phones (same length)
       stillOnlyMobile: false,             // true = phones never load the clips at all,
                                          // they cross-dissolve stillMobile/still instead.
                                          // The lightest of all phone fallbacks.

   MOBILE (the clipMobile/connectorsMobile variants are the opt-in mobile version;
   the rest of the phone handling below is always on)
     The engine is phone-aware out of the box: on a coarse-pointer / ≤860px viewport it
       - loads `clipMobile` / `connectorsMobile` when provided (encode these smaller +
         tighter-GOP — seek cost on a phone decoder is dominated by frames-from-keyframe,
         so a 720p, -g 4 file scrubs far smoother than the 1080p desktop master; see
         pipeline.md). Falls back to the desktop `clip` if no mobile variant is given.
       - uses `stillMobile` as the scene poster when provided (pair it with native 9:16
         clipMobile renders so the poster matches the portrait video's first frame instead
         of flashing from a landscape crop). Chosen once at mount; a desktop resize into
         phone width keeps the desktop poster (clips still switch via isMobile()).
       - coalesces seeks (never issues a new currentTime while the decoder is still
         `seeking`) so fast flicks can't pile up and freeze the video.
       - keeps the still as a live poster until the clip actually paints its first frame,
         and primes each video (muted play→pause) on first touch — this is what stops iOS
         from showing a blank scene before the first seek.
       - drops the drifting particles and ignores URL-bar-only resizes (no scroll jump).
     Nothing here is required — a config with only `clip`/`connectors` still works on
     phones; the mobile variants just make it lighter and smoother.

   THEME (CSS custom properties; set on the container or :root to override)
     --sw-bg         page background (match your scene bg for seamless posters)
     --sw-ink        primary text
     --sw-ink-soft   secondary text
     --sw-accent     default accent (each section overrides via its `accent`)
     --sw-font-display / --sw-font-body

   REQUIREMENTS ON YOUR ASSETS
     - clips encoded native-res, crf~20, -g 8, +faststart, no audio (see pipeline.md)
     - connectors' endpoints are the neighbouring dives' ACTUAL frames (see SKILL Step 5)
     - (optional) mobile variants at ~720p, -g 4 for smoother phone scrubbing
  The engine points a <video> straight at the clip and scrubs currentTime, so it streams
  progressively over ordinary HTTP range requests rather than holding a whole file in
  memory first.
   ========================================================================== */

function mountScrollWorld(container, config) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Phone detection. `coarse` is captured once (input type doesn't change mid-session);
  // the ≤860px query is read live via isMobile() so a desktop resize/DevTools toggle
  // switches sources and seek behaviour without a reload.
  const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const smallMQ = window.matchMedia('(max-width: 860px)');
  const isMobile = () => coarse || smallMQ.matches;
  // Phones can be told to stay still entirely — no clip fetch, no decode, no scrub.
  // Stills then cross-dissolve as you scroll, so the page still reads as a sequence.
  const stillOnly = config.stillOnlyMobile === true && isMobile();
  const SECTIONS = config.sections || [];
  const CONNECTORS = config.connectors || [];
  const CONNECTORS_M = config.connectorsMobile || [];
  const DIVE_W = config.diveScroll || 1.3;
  const CONN_W = config.connScroll || 0.9;
  const CROSSFADE = (config.crossfade != null) ? config.crossfade : 0.12;  // seam dissolve width (vh)
  // Pre-roll, for a page that opens with a layer of its own floating OVER the
  // film (the homepage news dock). Such a page puts that layer in the document
  // flow ABOVE this container, which pushes the whole runway -- and therefore
  // the first frame of video -- a full screen down the document. `preRoll` is
  // how much of the FIRST clip plays behind that floating layer before the
  // first dive takes over. Only the first segment carries it, and it is 0 unless
  // the page asks for it, so a page without an overlay is bit-for-bit unchanged.
  const PRE_ROLL = (config.preRoll != null) ? config.preRoll : 0;
  const N = SECTIONS.length;
  if (!N) return;

  injectCSS();
  container.classList.add('sw-root');

  // ---- build the interleaved segment chain: dive0, conn0, dive1, … diveN-1 ----
  const SEGMENTS = [];
  SECTIONS.forEach((s, i) => {
    const dive = { kind: 'dive', si: i, clip: s.clip, clipM: s.clipMobile, still: s.still, stillM: s.stillMobile,
                   accent: s.accent, w: s.scroll || DIVE_W, linger: s.linger || 0,
                   // Only the first dive carries the pre-roll, and only when the
                   // page asked for one (see PRE_ROLL). A connector is a fly-over
                   // BETWEEN two dives, so it never pre-rolls.
                   pre: (i === 0) ? PRE_ROLL : 0 };
    SEGMENTS.push(dive);
    s._seg = dive;
    // A connector is optional: if connectors[i] is falsy, the two dives simply
    // crossfade directly (no fly-over). Lets a page complete even when a
    // connector can't be generated (e.g. a content-filter false-positive).
    if (i < N - 1 && CONNECTORS[i]) {
      SEGMENTS.push({ kind: 'conn', si: i, clip: CONNECTORS[i], clipM: CONNECTORS_M[i],
                      still: SECTIONS[i + 1].still, stillM: SECTIONS[i + 1].stillMobile,
                      accent: SECTIONS[i + 1].accent, w: CONN_W });
    }
  });
  const NSEG = SEGMENTS.length;

  // ---- DOM ----
  const sky = el('div', 'sw-sky');
  if (config.atmosphere !== false) {
    sky.appendChild(el('div', 'sw-sky__grad'));
    sky.appendChild(el('div', 'sw-sky__glow'));
  }
  const particles = el('div', 'sw-particles'); sky.appendChild(particles);

  const scrollbar = el('div', 'sw-scrollbar');
  const scrollbarFill = el('span'); scrollbar.appendChild(scrollbarFill);

  const topbar = el('div', 'sw-topbar');
  if (config.brand) {
    const brand = el('a', 'sw-brand'); brand.href = (config.brand.href || '#');
    // The mark is optional and takes an image when the page supplies one; a
    // page with no mark still renders the wordmark alone.
    if (config.brand.mark) {
      const mk = el('img', 'sw-brand__mark'); mk.src = config.brand.mark; mk.alt = '';
      mk.decoding = 'async'; brand.appendChild(mk);
    } else {
      brand.appendChild(el('span', 'sw-brand__mark'));
    }
    const nm = el('span', 'sw-brand__name'); nm.textContent = config.brand.name || ''; brand.appendChild(nm);
    // The lab / group name sits after the person's name rather than replacing
    // it: the wordmark reads "person + group", and a separator keeps the two
    // from setting as one run of text.
    if (config.brand.suffix) {
      const sx = el('span', 'sw-brand__suffix'); sx.textContent = config.brand.suffix;
      brand.appendChild(sx);
    }
    topbar.appendChild(brand);
  }
  const nav = el('nav', 'sw-nav'); if (config.nav !== false) topbar.appendChild(nav);
  if (config.cta && config.cta.label) {
    const c = el('a', 'sw-topcta'); c.href = config.cta.href || '#'; c.textContent = config.cta.label;
    topbar.appendChild(c);
  }
  // Affiliations sit on the trailing edge of the topbar, opposite the
  // wordmark. They are a static list, so it renders after the nav and CTA have
  // had their chance at that slot and simply becomes the last flex child.
  const affs = config.brand && config.brand.affiliations;
  if (affs && affs.length) {
    const box = el('div', 'sw-affil');
    affs.forEach((a) => {
      const item = el('span', 'sw-affil__item');
      if (a.logo) {
        const lg = el('img', 'sw-affil__logo'); lg.src = a.logo; lg.alt = a.name || '';
        lg.decoding = 'async'; item.appendChild(lg);
      }
      if (a.name) {
        const tx = el('span', 'sw-affil__name'); tx.textContent = a.name; item.appendChild(tx);
      }
      box.appendChild(item);
    });
    topbar.appendChild(box);
  }

  const stage = el('div', 'sw-stage');
  const copylayer = el('div', 'sw-copylayer');
  const route = el('div', 'sw-route');
  const hint = el('div', 'sw-hint');
  const hintText = el('span'); hintText.textContent = config.hint || 'scroll'; hint.appendChild(hintText);
  hint.appendChild(el('i'));
  const track = el('div', 'sw-track');

  [sky, scrollbar, topbar, stage, copylayer, route, hint, track].forEach(n => container.appendChild(n));

  // segment scenes
  SEGMENTS.forEach(s => {
    const scene = el('div', 'sw-scene'); scene.style.setProperty('--sw-accent', s.accent || '');
    const img = el('img', 'sw-scene__still'); img.alt = ''; img.decoding = 'async'; img.loading = 'lazy';
    const poster = (isMobile() && s.stillM) ? s.stillM : s.still;
    if (poster) img.src = poster;
    scene.appendChild(img); stage.appendChild(scene);
    s.el = scene; s.img = img; s.video = null; s.hasClip = false;
    s.loading = false; s.ready = false; s.cur = 0; s.target = 0; s.visible = false;
    s.failed = false;
  });

  // per-section copy / route / nav
  const copies = [], dots = [];
  SECTIONS.forEach((s, i) => {
    const c = el('article', 'sw-copy'); c.style.setProperty('--sw-accent', s.accent || '');
    c.innerHTML =
      `<span class="sw-copy__num">${pad(i + 1)} / ${pad(N)}</span>` +
      (s.eyebrow ? `<span class="sw-copy__eyebrow">${esc(s.eyebrow)}</span>` : '') +
      (s.title ? `<h2 class="sw-copy__title">${esc(s.title)}</h2>` : '') +
      (s.body ? `<p class="sw-copy__body">${esc(s.body)}</p>` : '') +
      (s.tags && s.tags.length ? `<ul class="sw-copy__tags">${s.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '') +
      (s.cta ? `<div class="sw-copy__cta">${ctaBtns(s.cta)}</div>` : '');
    copylayer.appendChild(c); copies.push(c);

    const dot = el('button', 'sw-route__dot'); dot.style.setProperty('--sw-accent', s.accent || '');
    dot.innerHTML = `<span class="sw-route__label">${esc(s.label || '')}</span><i></i>`;
    dot.addEventListener('click', () => jumpTo(i)); route.appendChild(dot); dots.push(dot);

    if (config.nav !== false) {
      const b = el('button', 'sw-nav__item'); b.textContent = s.label || '';
      b.addEventListener('click', () => jumpTo(i)); nav.appendChild(b);
    }
  });

  // ---- math ----
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  // Per-section dwell: monotone remap of scroll→time so the camera settles mid-scene
  // (where the copy peaks) and moves quicker near the seams. L=0 linear, L=1 full
  // mid-scene pause. f(0)=0, f(1)=1 always, so seam frames are untouched.
  const lingerEase = (x, L) => { L = clamp(L); const c = x - 0.5; return (1 - L) * x + L * (4 * c * c * c + 0.5); };
  let vh = window.innerHeight, stageX = 0, totalW = 0, activeIndex = -1, ticking = false;
  // Where the runway BEGINS in document coordinates. The film is a fixed layer,
  // but its segments are positioned off `scrollY`, and `scrollY` is measured
  // from the top of the DOCUMENT, not from the top of the film. When the film
  // is the first thing on the page that difference is zero and nothing is
  // needed; when a section is placed before it (the homepage puts the news
  // dock first), the film's own y is negative for every reader who is looking
  // at the section above it, so segment 0 renders at full opacity ON TOP of it.
  // Measuring the container once per layout keeps every consumer -- segment
  // geometry, jumpTo, the progress bar, the retire test -- in document space.
  let originY = 0;
  // Height the last layout() gave the track — i.e. how far down the document the
  // container's own box ends. The retire test needs it: the runway's end and the
  // container's end are different numbers on a pre-rolled page.
  let trackHeight = 0;
  let retired = false;
  let held = false;
  let laidOutW = window.innerWidth;   // width the current layout was computed at (see onResize)

  function layout() {
    vh = window.innerHeight;
    laidOutW = window.innerWidth;
    stageX = window.innerWidth > 860 ? 4 : 0;
    // getBoundingClientRect().top is viewport-relative, so adding the current
    // scrollY recovers the absolute document offset. The track already carries
    // the full runway height, so the container's own top IS the film origin.
    // A mount target that cannot report a box (a detached node, a stub, a
    // non-element) is treated as sitting at the document top rather than
    // throwing: the film's geometry then matches the old document-space
    // assumption, which is the safe direction to fail in.
    const box = typeof container.getBoundingClientRect === 'function'
      ? container.getBoundingClientRect()
      : null;
    originY = box ? Math.max(0, Math.round(box.top + (window.scrollY || window.pageYOffset))) : 0;
    // A pre-roll is scroll the reader spends with the page's own opening layer
    // still on top, watching clip 0 play behind it. It is a strip of runway in
    // its own right, placed BEFORE the first segment rather than inside it: if
    // it overlapped segment 0, the first dive would start at 28% of its own
    // timeline and its opening frames would be unreachable. `off` therefore
    // begins at PRE_ROLL, and the whole runway is pulled up to the top of the
    // document -- which is the point, since the layer that floats over the film
    // is what pushed the container's own originY a screen down the page.
    const preY = PRE_ROLL > 0 ? 0 : originY;
    let off = 0;
    SEGMENTS.forEach(s => {
      // `off` is the runway already laid down, and `s.pre` is this segment's own
      // pre-roll: a strip in front of it that scrolls clip 0 from its first frame.
      s.start = preY + (off + s.pre) * vh;
      // The pre-roll is added to `off` as well as to `start`. Only adding it to
      // `start` PUSHED the strip in front of dive 0 without extending the total:
      // dive 0 then ran from `pre` to `w`, i.e. 0.4vh instead of 1.25vh (its
      // opening frames scrubbed three times too fast), and the chain came up
      // PRE_ROLL short of the height the track reserved for it — which is dead
      // scroll at the bottom of the page.
      off += s.pre + s.w;
      s.end = preY + off * vh;
    });
    totalW = off;
    // The container must end one screen past the END OF THE RUNWAY, measured in
    // document space. Deriving it from the segments (rather than from
    // `totalW * vh + vh + PRE_ROLL * vh`) is what makes that true on a page with
    // a pre-roll: there the runway is pulled up to the top of the document while
    // the container stays a screen down behind the page's opening layer, so the
    // two do NOT share an origin and the old formula left the container far
    // taller than the film it carries. `originY` is the missing term.
    // One screen of tail is the minimum that lets the reader scroll the last
    // segment to its final frame before the page ends.
    trackHeight = Math.max(vh, SEGMENTS[NSEG - 1].end + vh - originY);
    track.style.height = trackHeight + 'px';
    clampCopyParallax();
    read();
  }

  // How far each copy block may drift before it would leave the viewport. A block
  // centred vertically can move (vh - h)/2 in each direction before an edge is
  // clipped; one bottom-anchored (phones) can only rise. Driving --sw-par through
  // this bound is what keeps the CTA buttons on screen on short laptop windows —
  // the 4vh nominal drift is far more than a 600px-tall viewport can afford when
  // the block is 380px tall.
  const PAR_MAX_VH = 2;   // ±2vh of nominal drift, then clamped to real slack
  function clampCopyParallax() {
    copies.forEach((c) => {
      const h = c.offsetHeight || 0;
      let slack;
      if (isMobile()) {
        // bottom-anchored: drifting downward is what pushes it off, so only the
        // upward direction has room. Keep a small floor for the safe-area inset.
        slack = Math.max(0, vh - h - 8) ;
        c.dataset.swSlack = String(Math.min(slack, PAR_MAX_VH * vh));
      } else {
        slack = Math.max(0, (vh - h) / 2);
        c.dataset.swSlack = String(Math.min(slack, PAR_MAX_VH * vh));
      }
    });
  }

  function jumpTo(i) {
    const seg = SECTIONS[i]._seg;
    window.scrollTo({ top: seg.start + (seg.end - seg.start) * 0.5, behavior: reduce ? 'auto' : 'smooth' });
  }

  // Two thresholds, because arming a clip and playing it are different jobs.
  //
  // ARM only asks for the container. Every clip here is faststart, so the moov
  // atom sits in the first ~11 KB: 'metadata' costs almost nothing but tells us
  // duration and dimensions early enough to scrub against.
  //
  // NEAR is where a clip is close enough to actually be on screen, and only then
  // does the browser pull the body. Before this ladder every clip was created
  // with preload='auto' as soon as it came within 1.6vh, so on a slow link the
  // whole 12 MB began downloading at once and the scene the visitor was actually
  // looking at lost the bandwidth race to scenes they had not scrolled to yet.
  //
  // 0.8 rather than 1.6: at 1.6 a further scene was already at preload='auto' while
  // its predecessor was still on screen, so three files competed for the same link.
  const ARM_VH = 3.0;
  const NEAR_VH = 0.8;
  // When a segment pre-rolls, it is on screen BEFORE its own start, so every
  // window keyed on `s.start` would sit a whole pre-roll too late: the clip
  // would not be armed until the first dive was already meant to be over. Both
  // ladders therefore measure from the same `visStart` the opacity pass uses.
  // For a segment with no pre-roll this is exactly `s.start`, so nothing else
  // on the page moves.
  const visStartOf = (s) => (s.pre ? s.start - s.pre * vh : s.start);

  // Serve the lighter mobile encode on phones when one was provided.
  const clipUrl = (s) => (isMobile() && s.clipM) ? s.clipM : s.clip;

  // One <video> per UNIQUE clip, not one per segment.
  //
  // A connector is built from the outgoing dive's own clip, so five sections here
  // expand to nine segments over four files. Creating a <video> per segment meant
  // eight elements, two of them decoding the same bytes simultaneously, with the
  // rAF loop seeking both every frame. Segments are sequential and never overlap on
  // screen, so one element can serve a dive and the connector after it: the node is
  // moved into whichever segment is closest to the viewport, keeping one decoder,
  // one buffer and one seek target per clip.
  // The element is shared, so its preload state is a property of the ELEMENT, not
  // of whichever segment happens to hold it right now. Reading it off rec.video on
  // every frame keeps that truth in one place; a per-segment `promoted` flag drifts
  // out of sync the moment the element is re-parented, which silently strands a
  // visible scene at preload='metadata' (frozen) or demotes a live one (stall).
  const CLIPS = new Map();   // url -> { url, video, ready, revealed, failed, owner }

  // Single source of truth for "is this file currently allowed to buffer its body".
  const isPromoted = (s) => !!(s.video && s.video.preload === 'auto');

  // How badly a segment wants a clip: lowest wins, and ownership only ever moves to
  // a STRICTLY better-placed segment, so a later-scanned neighbour can never steal
  // the element out from under the scene you are actually watching.
  //
  // Ranked in three tiers, and the order matters more than the distances:
  //   0  the segment CONTAINING the scroll position -- the scene actually on screen;
  //   1  a segment that is merely visible (inside the crossfade dissolve);
  //   2  anything else, ranked by distance from its midpoint.
  //
  // A flat 0 for every visible segment made the outgoing dive and the incoming
  // connector tie at the seam, and armClip's '>=' then let the outgoing dive keep
  // the element for the whole dissolve -- the incoming scene showed its still
  // instead of the fly-over. But tie-breaking purely on distance-to-midpoint is
  // ALSO wrong, and worse: the connector's midpoint arrives before its start, so
  // it would take the element ~90px BEFORE the reader crossed into it, stranding
  // the dive they were still looking at on a still. Containment is the only rank
  // that matches what the reader sees.
  function claimStrength(s, y) {
    // Measured over the segment's VISIBLE span, so a pre-rolling clip is treated
    // as "the scene on screen" during its pre-roll rather than as a scene still
    // a pre-roll away -- otherwise the clip actually being watched would be
    // ranked behind its neighbour and could lose the <video> element at the very
    // moment it starts playing.
    const vs = visStartOf(s);
    const mid = (vs + s.end) / 2;
    if (y >= vs && y < s.end) return 0;                       // the scene on screen
    if (s.visible) return CLAIM_FADE + Math.abs(y - mid);      // fading in or out
    return CLAIM_FAR + Math.abs(y - mid);
  }
  // Separators only need to exceed any distance term (segments are ~1vh wide, so
  // |y - mid| is bounded by a few thousand px), not to be large in absolute terms.
  const CLAIM_FADE = 1e6;
  const CLAIM_FAR = 2e6;

  function armClip(s, y) {
    // Under prefers-reduced-motion we never load the clips at all -- the stills stay up
    // and simply cross-dissolve as you scroll. No scrubbed video motion, no decode cost.
    if (reduce || stillOnly || s.failed || !s.clip) return;
    const url = clipUrl(s);
    if (!url) return;
    let rec = CLIPS.get(url);
    if (rec) {
      if (rec.failed) { s.failed = true; return; }
      if (rec.video) {
        // Only take the element if this segment wants it more than the current holder.
        const holder = rec.owner;
        if (holder && holder !== s && claimStrength(s, y) >= claimStrength(holder, y)) return;
        adopt(s, rec);
        return;
      }
      // Record exists but has no element yet: it is still being built.
      if (s.loading) return;
    } else {
      rec = { url: url, video: null, ready: false, revealed: false, failed: false, owner: null };
      CLIPS.set(url, rec);
    }
    s.loading = true;
    create(s, rec, url, 'metadata');
  }

  // Move an existing element to a different segment. Segments are sequential, so
  // the previous holder is always the one behind us on the timeline; appendChild on
  // an existing node moves it, so no bytes are re-requested.
  function adopt(s, rec) {
    const v = rec.video;
    const prev = rec.owner;
    if (prev && prev !== s) {
      prev.video = null; prev.hasClip = false; prev.ready = false;
      prev.el.classList.remove('has-clip');
    }
    rec.owner = s;
    s.el.appendChild(v);
    s.video = v; s.hasClip = true; s.ready = rec.ready;
    // Seed the playhead from where the scroll actually is, instead of inheriting
    // whatever time the previous holder had scrubbed to. Without this, scrolling
    // back up re-enters a scene and the clip visibly rewinds from its old position
    // before catching up -- a fast reverse play nobody asked for.
    s.cur = s.target;
    // NOTE: deliberately does not set s.loading. `loading` means "a create() for
    // this segment is still in flight"; adopt() is reusing an element that already
    // exists. Setting it here re-armed the flag on every single frame (adopt runs
    // on each scroll pass) and left segments stuck at loading=true forever.
    // The 'seeked' listener below is { once: true } and keys off rec.owner, so a
    // segment that adopts an already-revealed element has to be told it is revealed
    // too, or it would wait forever for an event that has already been spent.
    if (rec.revealed) s.el.classList.add('has-clip');
  }

  // First segment to ask for this url builds the element.
  function create(s, rec, url, preload) {
    const v = document.createElement('video');
    v.className = 'sw-scene__video';
    v.muted = true; v.playsInline = true;
    // The clip streams progressively either way: the first frame paints as soon
    // as the opening chunk lands instead of waiting on the whole body, and later
    // seeks are served from the buffer rather than costing a fresh range request
    // each. What preload controls is only how much is allowed to arrive before
    // the scene is close enough to be seen -- see ARM_VH / NEAR_VH above.
    v.preload = preload || 'metadata';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.src = url;
    v.addEventListener('loadedmetadata', () => {
      rec.ready = true;
      // Also stamp the CURRENT holder. On a slow link the element is routinely
      // re-parented from the dive to its connector before metadata lands, and the
      // holder only ever read rec.ready at adopt time. Leaving s.ready false there
      // meant raf() never issued a seek, so 'seeked' never fired, 'has-clip' was
      // never added, and the scene stayed a still for the rest of the visit -- the
      // exact symptom this whole ladder exists to fix.
      if (rec.owner) rec.owner.ready = true;
      // The arming segment stays flagged as 'loading' forever otherwise, which makes
      // adopt() refuse to hand the element to a neighbour that reaches it while the
      // metadata is still in flight. Cleared here so the handover is always allowed.
      if (rec.owner) rec.owner.loading = false;
      read();
    });
    // Reveal the video (hide the still poster) only once a real frame has
    // painted — on iOS a seeked-but-never-played muted video stays blank, so
    // hiding the still on metadata alone would flash an empty scene.
    v.addEventListener('seeked', () => {
      rec.revealed = true;
      const o = rec.owner; if (o) o.el.classList.add('has-clip');
    }, { once: true });
    v.addEventListener('loadeddata', () => { try { v.pause(); } catch (e) {} if (userReady) primeVideo(v); rec.revealed = true; const o = rec.owner; if (o) o.el.classList.add('has-clip'); });
    // If the video has already loaded (readyState >= 2) by the time the listener
    // is attached, the event has already fired and will never fire again.
    // Manually invoke the reveal logic so the video is shown immediately.
    if (v.readyState >= 2) { try { v.pause(); } catch (e) {} rec.revealed = true; s.el.classList.add('has-clip'); console.log('[SW DEBUG] readyState >= 2, added has-clip to', s.el.className); } else { console.log('[SW DEBUG] readyState < 2:', v.readyState, 'src:', url); }
    // A clip that failed must not be left in the DOM. The old handler only cleared
    // s.loading, so the very next scroll frame rebuilt a <video> for the same
    // failing URL: one element and one request per frame, unbounded, all competing
    // for the bandwidth the clips that would have worked needed. Removing it
    // degrades cleanly, because the still stays up until 'seeked' fires -- so the
    // scene becomes a photograph rather than a blank rectangle.
    v.addEventListener('error', () => {
      if (v.parentNode) v.parentNode.removeChild(v);
      rec.ready = false; rec.failed = true; rec.revealed = false;
      if (rec.owner) {
        rec.owner.video = null; rec.owner.hasClip = false; rec.owner.ready = false;
        rec.owner.loading = false;
        rec.owner.el.classList.remove('has-clip');
      }
      rec.owner = null;
      // Every segment sharing this url degrades to its still. rec.url, not v.src:
      // the src property is the browser's resolved absolute URL and would never
      // compare equal to the relative path clipUrl() returns.
      for (let i = 0; i < NSEG; i++) {
        const x = SEGMENTS[i];
        if (x.clip && clipUrl(x) === rec.url) { x.failed = true; x.loading = false; x.ready = false; }
      }
      CLIPS.delete(rec.url);
    });
    rec.video = v;
    rec.owner = s;
    s.el.appendChild(v); s.video = v; s.hasClip = true; s.ready = rec.ready;
  }

  // Promote an armed clip to full buffering.
  //
  // `preload` is a HINT, not a command, and browsers are free to re-evaluate it:
  // in Chromium/WebKit flipping it on an element that already has a `src` usually
  // continues the existing resource rather than restarting it, but Safari is known
  // to be able to discard a buffer and re-fetch. So do not rely on the already-fetched
  // metadata bytes here for correctness -- the ladder works either way:
  //   * if the response continues, the metadata already in hand is simply reused;
  //   * if it restarts, we pay one extra small range request, and the scene still
  //     resolves through 'loadedmetadata' -> 'seeked' -> `has-clip`.
  // The performance claim (fewer bytes racing for a slow link) holds in both cases.
  // The one thing that is NOT verified here is Safari's real re-request behaviour;
  // that wants a browser check on a real device before this is trusted outright.
  function promoteClip(s) {
    if (!s.video || isPromoted(s) || s.failed) return;
    s.video.preload = 'auto';
  }

  // ...and the reverse. Without this, promotion was a one-way ratchet: once a
  // clip reached preload='auto' it stayed there for the rest of the visit, so a
  // reader who scrolled the whole runway ended up with ALL four hero clips
  // downloading at once -- which is the pile-up the preload ladder was built to
  // avoid, and the reason the homepage felt slow rather than merely heavy.
  //
  // The element itself is kept (so scrolling back reuses the same decoder and the
  // bytes the HTTP cache already holds), but the browser is told it no longer needs
  // to pull the body of a clip nobody is watching.
  function demoteClip(s) {
    if (!s.video || !isPromoted(s) || s.failed) return;
    s.video.preload = 'metadata';
  }

  function read() {
    const y = window.scrollY || window.pageYOffset;
    const fade = CROSSFADE * vh;
    // Where the runway actually begins, in document space. Normally that is the
    // first segment's start, but a pre-rolling segment starts playing a strip of
    // scroll earlier than that, so the film is already owed the reader at the top
    // of the runway. Computed once here because the progress bar, the pending
    // test and the retire test all need the same answer.
    const runwayStart = SEGMENTS[0].start - (SEGMENTS[0].pre || 0) * vh;
    let ci = 0;
    for (let i = 0; i < NSEG; i++) if (y >= SEGMENTS[i].start) ci = i;

    // Pass 1: geometry and opacity only. Visibility has to be settled before any
    // clip is handed out -- armClip ranks candidate segments by how close they are
    // to the viewport, and reading a stale s.visible from the previous frame made
    // the dive on screen lose its element to the connector ahead of it.
    for (let i = 0; i < NSEG; i++) {
      const s = SEGMENTS[i];
      // A pre-rolling segment is visible from the moment the film starts, and
      // its local time is measured across the pre-roll strip PLUS its own body,
      // so the clip plays through both without a jump at the handover. Every
      // other segment is timed across its own body exactly as before.
      const local = s.pre
        ? clamp((y - (s.start - s.pre * vh)) / (s.end - (s.start - s.pre * vh)), 0, 1)
        : clamp((y - s.start) / (s.end - s.start), 0, 1);
      s.target = s.linger ? lingerEase(local, s.linger) : local;
      let outside = 0;
      // Visibility opens at the START OF THE PRE-ROLL, not at s.start, or the
      // first clip would stay invisible for exactly the stretch it is supposed
      // to be playing behind the page's opening layer.
      const visStart = visStartOf(s);
      if (y < visStart) outside = visStart - y;
      // The closing segment does not fade out at its own end. Nothing crossfades
      // in behind it, so the fade was pure loss: the last frame dimmed over the
      // final 0.14vh of scroll and the page ended on an empty stage. It holds
      // until the container itself leaves (see the retire test).
      else if (y > s.end && i < NSEG - 1) outside = y - s.end;
      const op = smooth(1 - outside / fade);
      s.el.style.opacity = op; s.visible = op > 0.001;
      s.el.style.zIndex = (i === ci) ? '120' : String(100 + Math.round(op * 10));
      // Keep the Ken Burns drift running for as long as the still is the thing on
      // screen -- which is not the same as 'no clip yet'. A clip can be armed and
      // ready but still un-revealed (waiting on its first 'seeked'), and freezing the
      // pan at that moment makes the handoff to video look like a stall. 'has-clip'
      // is the class that actually hides the still, so that is the thing to test.
      if (!s.el.classList.contains('has-clip')) {
        const sc = reduce ? 1 : 1.03 + local * 0.14;
        s.img.style.transform = `translateX(${stageX - 2}vw) scale(${sc.toFixed(3)})`;
      }
    }

    // Pass 2: clips. Strongest claim first, so a shared element always lands on the
    // segment that wants it most rather than on whichever the scan reached first.
    const cands = [];
    for (let i = 0; i < NSEG; i++) {
      const s = SEGMENTS[i];
      if (!s.clip || s.failed) continue;
      if (y > visStartOf(s) - ARM_VH * vh && y < s.end + NEAR_VH * vh) cands.push(s);
    }
    cands.sort((a, b) => claimStrength(a, y) - claimStrength(b, y));
    // URLs close enough to be worth full buffering this frame. Collected across the
    // whole segment list first, then applied in a separate pass, so a clip whose
    // current holder has scrolled clean out of the ARM window still gets demoted
    // (see demoteClip) instead of being promoted once and ratcheted for good.
    const buffering = new Set();
    for (let i = 0; i < cands.length; i++) {
      const s = cands[i];
      armClip(s, y);
      // Buffer only once the scene is genuinely close: see ARM_VH / NEAR_VH.
      //
      // Asymmetric on purpose. The symmetric form (`s.start - N … s.end + N`)
      // promoted a clip for its whole duration AND a further N vh after it ended,
      // so a dive the reader had already left kept downloading, and by mid-page
      // four of the four files were buffering at once -- exactly the bandwidth
      // pile-up this ladder exists to prevent. A scene only earns full buffering
      // while the reader is at (or about to reach) it, and a scene left BEHIND is
      // what arms next: y < s.start, not y > s.start - NEAR_VH * vh.
      //
      // Membership is decided per URL, from the segment's own geometry, and is
      // deliberately NOT gated on s.video: during a handover the strongest segment
      // is armed before it necessarily owns the element, and the element's real
      // state has to follow the scene that is on screen. Keying this off the holder
      // instead let the outgoing dive's element be demoted while the connector was
      // fading in over it, stalling the one scene the reader was actually watching.
      if (y >= visStartOf(s) && y < s.end + NEAR_VH * vh) buffering.add(clipUrl(s));
    }
    for (let i = 0; i < NSEG; i++) {
      const s = SEGMENTS[i];
      if (!s.video) continue;   // only the current holder of a shared element acts
      if (buffering.has(clipUrl(s))) promoteClip(s); else demoteClip(s);
    }

    for (let i = 0; i < N; i++) {
      const seg = SECTIONS[i]._seg;
      // Copy is timed on the same VISIBLE span as the scene, not on `seg.start`.
      // A pre-rolling first scene therefore has its text fade in with the video
      // instead of popping in one pre-roll later. The opening page layer is
      // floating over that strip, so the first scene's copy is additionally held
      // back until the pre-roll is most of the way through (see the gate below).
      const cstart = visStartOf(seg);
      const pr = clamp((y - cstart) / (seg.end - cstart), 0, 1);
      const before = y < cstart, after = y > seg.end;
      let cop;
      // Scene 0 normally greets the reader on landing. With a pre-roll it must
      // NOT: the page's own opening layer is sitting on top of exactly that
      // stretch, so text fading in here would collide with it. The copy is held
      // at 0 until the pre-roll strip is spent, then opens on the usual curve
      // measured from the handover -- which is the moment the dock has left.
      if (i === 0) {
        const gate = seg.pre ? smooth((y - seg.start) / (seg.pre * vh)) : 1;
        cop = after ? 0 : Math.min(gate, smooth(1 - pr / 0.62));
      }
      else if (i === N - 1) cop = before ? 0 : smooth(pr / 0.4);       // holds CTA at the end
      else cop = (before || after) ? 0 : smooth(1 - Math.abs(pr - 0.5) / 0.5);
      const c = copies[i];
      c.style.opacity = cop;
      // Parallax drift, written as a custom property so the stylesheet can keep
      // composing it with the centring / bottom anchors. Never `transform` here:
      // assigning transform outright would wipe the -50% centring and let a tall
      // block (last act has title + body + tags + CTA) hang off the bottom of a
      // short viewport. Clamped to the slack the block really has, so on a short
      // screen the copy still breathes instead of sliding out of view.
      // Nominal ±2vh drift, then clamped to the slack measured in layout().
      let par = reduce ? 0 : (0.5 - pr) * PAR_MAX_VH * 2;   // in vh, range ±PAR_MAX_VH
      const slackVh = (parseFloat(c.dataset.swSlack) || 0) / vh;   // slack -> vh
      par = clamp(par, -slackVh, slackVh);
      c.style.setProperty('--sw-par', par.toFixed(3) + 'vh');
      c.style.pointerEvents = cop > 0.5 ? 'auto' : 'none';
    }

    const cur = SEGMENTS[ci];
    const near = clamp(cur.kind === 'dive' ? cur.si
      : (((y - cur.start) / (cur.end - cur.start)) > 0.5 ? cur.si + 1 : cur.si), 0, N - 1);
    if (near !== activeIndex) {
      activeIndex = near;
      dots.forEach((d, k) => d.classList.toggle('is-active', k === near));
      nav.querySelectorAll('.sw-nav__item').forEach((n, k) => n.classList.toggle('is-active', k === near));
      container.style.setProperty('--sw-accent', SECTIONS[near].accent || '');
    }
    // Progress is measured across the runway the reader can actually scroll,
    // which runs from the top of the film to the end of its last segment. With
    // no pre-roll that is the original `y / (totalW * vh)`; with one, the film
    // begins at the top of the document, so dividing by a quantity that still
    // assumed the old origin would peg the bar at 1 long before the last scene.
    const runwayLen = Math.max(1, SEGMENTS[NSEG - 1].end - (SEGMENTS[0].start - (SEGMENTS[0].pre || 0) * vh));
    scrollbarFill.style.transform = `scaleX(${clamp((y - runwayStart) / runwayLen)})`;
    hint.style.opacity = clamp(1 - y / (0.5 * vh));
    if (particles) particles.style.transform = `translate3d(0, ${-y * 0.05}px, 0)`;

    // ── retire the fixed layers once the runway is behind us ──────────────
    // sky / stage / copy / route / hint / topbar are all `position: fixed` and
    // sit at z-index 0-50. That is right WHILE the film plays -- a fixed stage
    // is what makes a scrubbed dive feel like one continuous camera -- but it
    // means every layer stays painted over whatever follows the film. The
    // homepage puts a real content section after the hero, so without this the
    // news dock rendered underneath a permanently-on fixed stage: visible only
    // where the stage happened to be transparent, and never clickable.
    //
    // The runway ends at `totalW * vh`; past that the film is over and the page
    // belongs to the document again. One class on the container does it, so the
    // stylesheet owns the "what does an idle hero look like" answer and this
    // file only owns WHEN.
    // The film retires when its own scroll box has left the document, NOT when
    // the last segment ends. Those two points used to be far apart: the runway
    // (anchored at the top of the document by the pre-roll) ended while the
    // container still had screens of height left, so hiding the fixed layers at
    // the segment end uncovered the container's bare background and the reader
    // scrolled through empty pages before the footer.
    //
    // What follows the film now has to paint OVER it rather than wait for it to
    // disappear — a footer shorter than a viewport can never scroll a fixed
    // stage off before the page ends. The homepage footer does exactly that
    // (see over-film.css). Anything else added after the film must do the same
    // or sit inside this container.
    const past = y > originY + trackHeight;
    if (past !== retired) {
      retired = past;
      container.classList.toggle('is-retired', past);
    }
    // ...and it begins at `originY`. Above that line the reader is looking at
    // whatever the page put before the film, so the film owes them nothing and
    // must not paint. Between the origin and the first segment the runway is
    // in view but no scene owns it yet; the sky fading in over the last few px
    // of the section above reads as the page handing over, which is the seam
    // you want rather than a hard pop at the origin.
    // Pending means "the runway has not started yet, so the film owes the reader
    // nothing". A pre-roll moves the runway's start to the very top of the
    // document, so there is no stretch of page above it and the film is never
    // pending -- which is exactly the point: the video is already playing on the
    // first screen. Without a pre-roll the original meaning is kept untouched.
    const pending = !past && (PRE_ROLL > 0 ? false : y < runwayStart + CROSSFADE * vh);
    if (pending !== held) {
      held = pending;
      container.classList.toggle('is-pending', pending);
    }
    ticking = false;
  }

  function raf() {
    const eps = isMobile() ? 0.02 : 0.008;   // coarser seek step on phones = fewer decodes
    for (let i = 0; i < NSEG; i++) {
      const s = SEGMENTS[i];
      if (!s.hasClip || !s.ready || !s.video) continue;
      // Never queue a seek while the decoder is still resolving the last one.
      // On phones a fast flick would otherwise pile up seeks and freeze the clip;
      // cur keeps lerping, so we snap to the latest target the moment it's free.
      if (s.video.seeking) continue;
      if (!s.visible && Math.abs(s.cur - s.target) < 0.002) continue;
      s.cur += (s.target - s.cur) * (reduce ? 1 : 0.18);
      const dur = s.video.duration || 1;
      const t = clamp(s.cur, 0, 0.999) * dur;
      if (Math.abs(s.video.currentTime - t) > eps) { try { s.video.currentTime = t; } catch (e) {} }
    }
    requestAnimationFrame(raf);
  }

  // iOS needs a user gesture before a muted video will decode/paint reliably. On the
  // first touch we prime every loaded clip (muted play→pause) so the first seek is
  // instant instead of showing a blank frame. `userReady` also makes freshly-loaded
  // clips prime themselves (see the loadeddata handler in create()).
  let userReady = false;
  function primeVideo(v) {
    if (!isMobile() || !v) return;
    try { const p = v.play(); if (p && p.then) p.then(() => { try { v.pause(); } catch (e) {} }).catch(() => {}); }
    catch (e) {}
  }
  function onFirstGesture() {
    if (userReady) return;
    userReady = true;
    SEGMENTS.forEach(s => primeVideo(s.video));
  }
  window.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
  window.addEventListener('touchstart', onFirstGesture, { once: true, passive: true });

  // Particles are a per-frame cost we can't afford alongside video scrubbing on a phone.
  seedParticles(particles, reduce || coarse);
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(read); } }, { passive: true });
  // Mobile browsers fire `resize` every time the URL bar slides in/out. Re-running
  // layout() there rebuilds the track height and yanks the scroll position, so on
  // touch we ignore height-only changes and only relayout when the width actually
  // changes (rotation still comes through orientationchange). layout() records the
  // width it laid out at.
  function onResize() {
    if (coarse && window.innerWidth === laidOutW) return;
    layout();
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', layout);
  window.addEventListener('load', layout);
  // Web fonts can land after first paint and change every block's height, which
  // changes the slack the parallax is clamped to. Re-measure once they settle.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(clampCopyParallax);
  layout();
  requestAnimationFrame(raf);

  // Test hook: read-only snapshot of the internal clip/segment bookkeeping.
  // Exposed so the clip-sharing and preload ladder can be asserted from outside
  // the IIFE without reaching into private state by guesswork. Opt-in only -- a
  // production mount leaves nothing on the container.
  function probe() {
    return {
      vh: vh,
      stillOnly: stillOnly, reduce: reduce,
      segments: SEGMENTS.map(function (s) {
        return { clip: s.clip || null, start: s.start, end: s.end, visible: s.visible,
                 hasClip: s.hasClip, ready: s.ready, loading: s.loading,
                 failed: s.failed, promoted: isPromoted(s),
                 videoPreload: s.video ? s.video.preload : null,
                 parentHasClip: s.el.classList.contains('has-clip') };
      }),
      clips: Array.from(CLIPS.entries()).map(function (e) {
        return { url: e[0], hasVideo: !!e[1].video, ready: e[1].ready, failed: e[1].failed,
                 revealed: e[1].revealed, preload: e[1].video ? e[1].video.preload : null };
      }),
    };
  }
  if (config.testHooks === true) container.__swProbe = probe;

  // ---- helpers ----
  function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function ctaBtns(cta) {
    let h = '';
    if (cta.primary) h += `<a class="sw-btn sw-btn--primary" href="${esc(cta.primary.href || '#')}">${esc(cta.primary.label)}</a>`;
    if (cta.secondary) h += `<a class="sw-btn sw-btn--ghost" href="${esc(cta.secondary.href || '#')}">${esc(cta.secondary.label)}</a>`;
    return h;
  }
}

function seedParticles(host, reduce) {
  if (!host || reduce) return;
  const kinds = ['dot', 'dot', 'ring'];
  const seeds = [7, 23, 41, 58, 71, 88, 12, 34, 52, 66, 83, 95, 18, 29, 47, 63, 77, 91, 5, 38, 55, 69, 82, 97];
  for (let k = 0; k < 20; k++) {
    const s = document.createElement('span');
    s.className = 'sw-pt sw-pt--' + kinds[k % kinds.length];
    s.style.left = seeds[k % seeds.length] + 'vw';
    s.style.top = ((seeds[(k * 3) % seeds.length] * 1.3) % 100) + 'vh';
    s.style.setProperty('--sw-sc', (0.5 + ((seeds[(k * 5) % seeds.length] % 60) / 60) * 1.1).toFixed(2));
    const dur = 14 + (seeds[(k * 7) % seeds.length] % 22);
    s.style.animationDuration = dur + 's';
    s.style.animationDelay = (-(seeds[(k * 2) % seeds.length] % dur)) + 's';
    host.appendChild(s);
  }
}

function injectCSS() {
  if (document.getElementById('sw-css')) return;
  const css = `
  .sw-root{--sw-bg:#F5EDE0;--sw-ink:#241d2b;--sw-ink-soft:#6a6072;--sw-accent:#8a7bb5;
    --sw-font-display:ui-rounded,"SF Pro Rounded","Segoe UI",system-ui,sans-serif;
    --sw-font-body:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;
    color:var(--sw-ink);font-family:var(--sw-font-body);}
  html,body{margin:0;background:var(--sw-bg,#F5EDE0);overflow-x:hidden;}
  .sw-sky{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:var(--sw-bg);}
  .sw-sky__grad{position:absolute;inset:-10%;background:linear-gradient(178deg,color-mix(in srgb,var(--sw-accent) 12%,var(--sw-bg)) 0%,var(--sw-bg) 55%,color-mix(in srgb,var(--sw-accent) 6%,var(--sw-bg)) 100%);}
  .sw-sky__glow{position:absolute;inset:0;background:radial-gradient(60% 42% at 74% 16%,color-mix(in srgb,var(--sw-accent) 22%,transparent),transparent 70%),radial-gradient(46% 34% at 50% 50%,color-mix(in srgb,#fff 45%,transparent),transparent 70%);}
  .sw-particles{position:absolute;inset:-6% -2%;will-change:transform;}
  .sw-pt{position:absolute;width:13px;height:13px;transform:scale(var(--sw-sc,1));opacity:0;animation:sw-drift linear infinite;}
  .sw-pt::before{content:"";position:absolute;inset:0;border-radius:50%;}
  .sw-pt--dot::before{background:radial-gradient(circle at 34% 30%,color-mix(in srgb,var(--sw-accent) 60%,#000),#000 82%);}
  .sw-pt--ring::before{background:transparent;border:2px solid color-mix(in srgb,var(--sw-accent) 55%,transparent);}
  @keyframes sw-drift{0%{opacity:0;transform:scale(var(--sw-sc)) translate(0,12vh) rotate(0)}12%{opacity:.5}88%{opacity:.45}100%{opacity:0;transform:scale(var(--sw-sc)) translate(4vw,-22vh) rotate(210deg)}}
  .sw-scrollbar{position:fixed;top:0;left:0;right:0;height:3px;z-index:60;background:color-mix(in srgb,var(--sw-accent) 14%,transparent);}
  .sw-scrollbar span{display:block;height:100%;width:100%;transform-origin:0 50%;transform:scaleX(0);background:var(--sw-accent);}
  .sw-topbar{position:fixed;top:0;left:0;right:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:clamp(14px,2.4vw,26px) clamp(18px,5vw,64px);}
  .sw-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--sw-ink);}
  .sw-brand__mark{width:24px;height:28px;border-radius:7px 7px 10px 10px;background:linear-gradient(160deg,var(--sw-accent),color-mix(in srgb,var(--sw-accent) 60%,#000));box-shadow:0 6px 14px color-mix(in srgb,var(--sw-accent) 40%,transparent);}
  .sw-brand__name{font-family:var(--sw-font-display);font-weight:700;font-size:1.1rem;}
  /* Scoped to the element TYPE on purpose. The single-class rule above styles
     the span fallback (gradient tile, rounded square, shadow); this one styles
     only a real image mark. Sharing the class without the type qualifier would
     let background:none wipe the gradient for every page that passes no mark. */
  img.sw-brand__mark{width:34px;height:34px;border-radius:50%;object-fit:cover;flex:0 0 auto;background:none;box-shadow:none;}
  .sw-brand__suffix{font-family:var(--sw-font-body);font-weight:500;font-size:.82rem;color:var(--sw-ink-soft);letter-spacing:.06em;padding-left:10px;margin-left:2px;border-left:1px solid color-mix(in srgb,var(--sw-ink) 22%,transparent);}
  /* Affiliations: logos carry the institutions, the text names them. The
     hairline between items is the only separator -- no pills, no background
     cards, because two small marks sitting on a busy film need to stay quiet. */
  .sw-affil{display:flex;align-items:center;gap:14px;}
  .sw-affil__item{display:flex;align-items:center;gap:7px;}
  .sw-affil__item+.sw-affil__item{padding-left:14px;border-left:1px solid color-mix(in srgb,var(--sw-ink) 18%,transparent);}
  .sw-affil__logo{width:26px;height:26px;object-fit:contain;flex:0 0 auto;}
  .sw-affil__name{font-family:var(--sw-font-body);font-weight:500;font-size:.78rem;color:var(--sw-ink-soft);white-space:nowrap;}
  .sw-nav{display:flex;gap:4px;padding:5px;background:color-mix(in srgb,#fff 55%,transparent);backdrop-filter:blur(10px);border:1px solid color-mix(in srgb,var(--sw-accent) 16%,transparent);border-radius:999px;}
  .sw-nav__item{font:inherit;font-size:.82rem;color:var(--sw-ink-soft);border:0;background:transparent;cursor:pointer;padding:7px 14px;border-radius:999px;transition:color .25s,background .25s;}
  .sw-nav__item:hover{color:var(--sw-ink);} .sw-nav__item.is-active{color:#fff;background:var(--sw-accent);}
  .sw-topcta{text-decoration:none;font-weight:600;font-size:.9rem;color:#fff;background:var(--sw-ink);padding:10px 20px;border-radius:999px;white-space:nowrap;}
  .sw-stage{position:fixed;inset:0;z-index:10;pointer-events:none;}
  .sw-scene{position:absolute;inset:0;opacity:0;overflow:hidden;will-change:opacity;}
  .sw-scene__video,.sw-scene__still{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 42%;}
  .sw-scene__still{will-change:transform;} .sw-scene.has-clip .sw-scene__still{opacity:0;} .sw-scene__video{z-index:1;}
  .sw-copylayer{position:fixed;inset:0;z-index:20;pointer-events:none;}
  .sw-copylayer::before{content:"";position:absolute;inset:0;width:min(58vw,780px);background:linear-gradient(90deg,var(--sw-bg) 0%,color-mix(in srgb,var(--sw-bg) 82%,transparent) 34%,color-mix(in srgb,var(--sw-bg) 40%,transparent) 62%,transparent 100%);}
  /* --sw-par is written by the scroll loop. It is COMPOSED with the centring
     offset here (added, not substituted) so the drift can never un-centre the
     block; read() clamps it to the slack the block actually has. */
  .sw-copy{position:absolute;left:clamp(18px,5vw,64px);top:50%;transform:translateY(calc(-50% + var(--sw-par,0px)));width:min(42vw,460px);opacity:0;will-change:opacity,transform;}
  .sw-copy__num{font-family:ui-monospace,Menlo,monospace;font-size:.74rem;letter-spacing:.12em;color:var(--sw-ink-soft);}
  .sw-copy__eyebrow{display:block;margin-top:18px;font-family:var(--sw-font-display);font-weight:700;font-size:.8rem;letter-spacing:.16em;text-transform:uppercase;color:var(--sw-accent);}
  .sw-copy__title{font-family:var(--sw-font-display);font-weight:700;color:var(--sw-ink);font-size:clamp(2rem,4.4vw,3.5rem);line-height:1.03;margin:12px 0 0;letter-spacing:-.01em;text-shadow:0 2px 20px color-mix(in srgb,var(--sw-bg) 70%,transparent);}
  .sw-copy__body{margin-top:18px;font-size:clamp(1rem,1.25vw,1.14rem);line-height:1.55;color:color-mix(in srgb,var(--sw-ink) 78%,var(--sw-ink-soft));max-width:40ch;text-shadow:0 1px 12px color-mix(in srgb,var(--sw-bg) 90%,transparent);}
  .sw-copy__tags{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 0;padding:0;}
  .sw-copy__tags li{font-size:.82rem;font-weight:600;color:color-mix(in srgb,var(--sw-accent) 70%,#000);padding:7px 14px;border-radius:999px;background:color-mix(in srgb,var(--sw-accent) 14%,#fff);border:1px solid color-mix(in srgb,var(--sw-accent) 30%,transparent);}
  .sw-copy__cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px;pointer-events:auto;}
  .sw-btn{text-decoration:none;font-weight:600;font-size:.95rem;padding:13px 24px;border-radius:999px;transition:transform .2s;}
  .sw-btn--primary{color:#fff;background:var(--sw-ink);} .sw-btn--primary:hover{transform:translateY(-2px);}
  .sw-btn--ghost{color:var(--sw-ink);border:1.5px solid color-mix(in srgb,var(--sw-ink) 25%,transparent);} .sw-btn--ghost:hover{transform:translateY(-2px);}
  .sw-route{position:fixed;right:clamp(14px,2.4vw,30px);top:50%;z-index:40;transform:translateY(-50%);display:flex;flex-direction:column;gap:22px;padding:18px 10px;}
  .sw-route::before{content:"";position:absolute;left:50%;top:22px;bottom:22px;width:2px;transform:translateX(-50%);background:var(--sw-accent);opacity:.28;}
  .sw-route__dot{position:relative;border:0;background:transparent;cursor:pointer;width:14px;height:14px;display:grid;place-items:center;}
  .sw-route__dot i{width:9px;height:9px;border-radius:50%;background:color-mix(in srgb,var(--sw-accent) 40%,transparent);transition:transform .3s,background .3s,box-shadow .3s;}
  .sw-route__dot:hover i{transform:scale(1.25);background:var(--sw-accent);}
  .sw-route__dot.is-active i{background:var(--sw-accent);transform:scale(1.4);box-shadow:0 0 0 5px color-mix(in srgb,var(--sw-accent) 22%,transparent);}
  .sw-route__label{position:absolute;right:24px;top:50%;transform:translateY(-50%) translateX(6px);white-space:nowrap;font-size:.78rem;font-weight:600;color:var(--sw-ink);background:color-mix(in srgb,#fff 85%,transparent);backdrop-filter:blur(6px);padding:5px 11px;border-radius:999px;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;border:1px solid color-mix(in srgb,var(--sw-accent) 14%,transparent);}
  .sw-route__dot:hover .sw-route__label,.sw-route__dot.is-active .sw-route__label{opacity:1;transform:translateY(-50%) translateX(0);}
  .sw-hint{position:fixed;left:50%;bottom:26px;z-index:30;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:10px;font-size:.76rem;letter-spacing:.14em;text-transform:uppercase;color:var(--sw-ink-soft);transition:opacity .3s;}
  .sw-hint i{width:22px;height:34px;border-radius:12px;border:2px solid color-mix(in srgb,var(--sw-ink) 28%,transparent);position:relative;}
  .sw-hint i::after{content:"";position:absolute;left:50%;top:7px;width:4px;height:7px;border-radius:2px;background:var(--sw-accent);transform:translateX(-50%);animation:sw-wheel 1.7s ease-in-out infinite;}
  @keyframes sw-wheel{0%{opacity:0;top:6px}40%{opacity:1}100%{opacity:0;top:17px}}
  .sw-track{position:relative;z-index:1;width:100%;pointer-events:none;}
  @media (max-width:860px){
    .sw-nav{display:none;}
    /* Below this width the wordmark, its lab suffix and two institutional
       marks stop fitting on one row. Drop the affiliation TEXT first and keep
       the logos: a visitor still recognises both universities from the marks,
       which is the information the slot is there to carry. The names come back
       at the next breakpoint rather than being dropped entirely. */
    .sw-affil__name{display:none;}
    .sw-affil{gap:10px;} .sw-affil__item+.sw-affil__item{padding-left:10px;}
    .sw-copylayer::before{width:100%;height:60%;top:auto;bottom:0;background:linear-gradient(0deg,var(--sw-bg) 8%,color-mix(in srgb,var(--sw-bg) 70%,transparent) 46%,transparent 100%);}
    /* Anchor copy to the bottom, clear of the home indicator / collapsing URL bar.
       dvh + env() are progressive: browsers that lack them keep the vh fallback line. */
    .sw-copy{left:clamp(18px,5vw,64px);right:clamp(18px,5vw,64px);top:auto;bottom:clamp(64px,14vh,120px);transform:translateY(var(--sw-par,0px));width:auto;max-width:560px;}
    .sw-copy{bottom:calc(clamp(56px,12dvh,110px) + env(safe-area-inset-bottom));}
    .sw-copy__title{font-size:clamp(1.9rem,7.5vw,2.7rem);}
    .sw-copy__body{max-width:none;font-size:clamp(.98rem,3.6vw,1.1rem);} .sw-scene__video,.sw-scene__still{object-position:center 46%;}
    .sw-hint{bottom:calc(20px + env(safe-area-inset-bottom));}
    .sw-route{gap:16px;right:6px;} .sw-route__label{display:none;}
  }
  /* Portrait phones crop a 16:9 clip hard; keep the framing centred so the focal
     subject (which the camera dives toward) stays in view. */
  @media (max-width:860px) and (orientation:portrait){
    .sw-scene__video,.sw-scene__still{object-position:center 44%;}
  }
  /* Touch: give the route dots a finger-sized hit area without growing the visible dot. */
  @media (hover:none) and (pointer:coarse){
    .sw-route{padding:14px 6px;}
    .sw-route__dot{width:28px;height:28px;}
    .sw-btn{padding:15px 26px;}
  }
  /* Below 1120px the desktop row runs out of room before the mobile breakpoint
     takes over, so shed the affiliation names here -- above 860px, where they
     would otherwise sit on the same line as a full-width nav. */
  @media (max-width:1120px) and (min-width:861px){
    .sw-affil__name{display:none;}
  }
  @media (prefers-reduced-motion:reduce){ .sw-hint i::after{animation:none;} .sw-pt{display:none;} }

  /* ── retired: the film is over, hand the page back ──────────────────────
   * Every layer above is 'position: fixed', which is what makes the scrub read
   * as one camera. The cost is that they keep painting over the rest of the
   * document. Once the engine marks the container '.is-retired' (see read()),
   * they stop: the stage, sky and copy go invisible, and the chrome that only
   * makes sense during the film (route rail, scroll hint, topbar, progress
   * bar) is hidden outright so it cannot sit on top of the content below.
   *
   * 'visibility' rather than 'display' on the painted layers, so the crossfade
   * out is a fade rather than a pop. Pointer events go with it: an invisible
   * fixed stage that still swallows clicks is the worst of both. */
  .sw-root.is-retired .sw-sky,
  .sw-root.is-retired .sw-stage,
  .sw-root.is-retired .sw-copylayer,
  .sw-root.is-retired .sw-track{ visibility:hidden; pointer-events:none; }
  .sw-root.is-retired .sw-topbar,
  .sw-root.is-retired .sw-route,
  .sw-root.is-retired .sw-hint,
  .sw-root.is-retired .sw-scrollbar{ display:none; }
  .sw-root.is-retired{ pointer-events:none; }
  /* ── pending: the film is BELOW the fold, so nothing of it may paint ────
   * The mirror image of retirement. When the film is not the first thing on
   * the page, a reader looking at the section above it is at scrollY 0, which
   * is BEFORE the runway starts. Segment opacity alone cannot express that:
   * the crossfade gives every segment a non-zero value just outside its own
   * span, so segment 0 is faintly visible no matter how far away it is. The
   * sky and the chrome are worse -- they are fixed, so they are on screen at
   * the top of the document by definition.
   *
   * So the engine holds the whole film back until the reader is actually
   * inside the runway: read() sets '.is-pending' while scrollY is above the
   * origin but not yet inside the first segment, and the layers below yield.
   * Same treatment as retirement, same reason: a fixed layer that is not the
   * current content must not be painted over the current content. */
  .sw-root.is-pending .sw-sky,
  .sw-root.is-pending .sw-stage,
  .sw-root.is-pending .sw-copylayer,
  .sw-root.is-pending .sw-track{ visibility:hidden; pointer-events:none; }
  .sw-root.is-pending .sw-topbar,
  .sw-root.is-pending .sw-route,
  .sw-root.is-pending .sw-hint,
  .sw-root.is-pending .sw-scrollbar{ display:none; }
  .sw-root.is-pending{ pointer-events:none; }
  /* The runway KEEPS its height once retired. Collapsing it is tempting -- the
   * track exists only to manufacture scroll distance -- but the reader is at
   * the bottom of that distance when this fires, so removing ~6500px of height
   * under their scroll position clamps scrollY and throws them back to the top
   * of the page. The section that follows already sits immediately after the
   * runway, so there is no empty gap to reclaim anyway. */
  `;
  // Wrap in a cascade layer so the page's own theme tokens (unlayered
  // :root / .sw-root { --sw-bg / --sw-ink / --sw-accent … }) always win over
  // these defaults, regardless of injection order. Enables clean dark themes.
  const style = document.createElement('style'); style.id = 'sw-css';
  style.textContent = '@layer sw {\n' + css + '\n}';
  document.head.appendChild(style);
}

// Expose for module + global use.
if (typeof module !== 'undefined' && module.exports) module.exports = { mountScrollWorld };
if (typeof window !== 'undefined') window.mountScrollWorld = mountScrollWorld;
