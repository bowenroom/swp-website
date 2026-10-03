// Typesetting helpers backed by Pretext (github.com/chenglou/pretext).
//
// Why a text-layout engine rather than CSS: both homepage panels are 180px
// columns, which is narrow enough that the browser's first-guess breaks are
// visible — one short word orphaned on the last line, or a CJK run broken at
// its worst point. CSS can balance in Chrome (`text-wrap: balance`), but it
// cannot (a) tell us the height of a paragraph BEFORE it is expanded, which
// the research steps need for a zero-shift animation, or (b) let us hold a
// chosen break in the DOM so a late-arriving web font cannot re-break a
// headline after the marquee has already timed its travel against the row
// heights. Pretext does both with no DOM reads: `prepare()` measures the font
// once, `layout()` is arithmetic.
//
// Everything here is deliberately defensive: a measurement failure falls back
// to plain text, never to an empty element.
import {
  prepareWithSegments,
  layout,
  layoutWithLines,
  layoutNextLineRange,
  materializeLineRange,
  measureLineStats,
  measureNaturalWidth,
} from '@chenglou/pretext';

// The browser's canvas font shorthand: `weight size family`. The size comes
// back from getComputedStyle already in px, so it can be interpolated as-is.
// lineHeight is not part of that shorthand — it is passed separately, and must
// match the element's own line-height or the computed heights drift.
const fontOf = (el) => {
  const cs = getComputedStyle(el);
  const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
  return { font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, lineHeight, size: parseFloat(cs.fontSize) };
};

/**
 * Re-break `el`'s text to the narrowest width that still fits the same number
 * of lines (a balance search — monotone, so binary search is exact), then
 * write the chosen breaks into the DOM as one block per line.
 *
 * Floor of 55% / 48px: below that the search "balances" by breaking words,
 * which looks worse than the orphan it was fixing.
 */
/**
 * Break `text` into `lineCount` lines of as-equal width as possible, laying
 * them out one at a time with Pretext's per-line cursor (`layoutNextLineRange`
 * takes its own max width for every line, which CSS has no equivalent for).
 *
 * Why not just narrow the width and let the browser wrap: greedy wrapping
 * fills every line to the width and leaves whatever is over at the end. The
 * panel's 41-character description came back 9-9-9-9-5 at 108px — a
 * five-character orphan tail. Here each line is given its share of what is
 * left (remaining natural width ÷ lines still to place), so the tail lands the
 * same size as its neighbours: 8-8-8-8-9.
 *
 * Returns null when the pass cannot place everything in exactly `lineCount`
 * lines, in which case the caller falls back to ordinary wrapping — a missing
 * sentence is never an acceptable price for tidier ones.
 */
function balanceLines(prep, raw, font, width, lineCount) {
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  let consumed = 0;
  const lines = [];
  for (let i = 0; i < lineCount; i += 1) {
    const rest = raw.slice(consumed);
    if (!rest.trim()) break;
    const restWidth = measureNaturalWidth(prepareWithSegments(rest, font));
    const linesLeft = lineCount - i;
    // A little slack so a line may take slightly more than its exact share
    // rather than stopping a word early; without it the shares drift short in
    // the other direction. Capped at the column width — the last line's share
    // is the whole of whatever is left, and for English that can be WIDER than
    // the column ("where the research starts." at 154px in a 112px box), which
    // would put a line back inside its span and let it re-wrap silently.
    const target = Math.max(48, Math.min(width, Math.ceil(restWidth / linesLeft) + 4));
    const range = layoutNextLineRange(prep, cursor, target);
    if (!range) break;
    const line = materializeLineRange(prep, range);
    if (!line.text) break;
    lines.push(line.text);
    cursor = range.end;
    consumed += line.text.length;
    // Break-point whitespace is not part of the line text; skip it so `consumed`
    // tracks the raw string exactly (a stray space would skew every later share).
    while (/\s/.test(raw[consumed] || '')) consumed += 1;
  }
  const placed = raw.slice(consumed).trim();
  if (lines.length === 0 || placed) return null;
  return lines;
}

/**
 * Re-break `el`'s text across as-equal lines as possible, then write the
 * chosen breaks into the DOM as one block per line — so what is painted is
 * what was computed, and a late-arriving web font (re-typeset on
 * document.fonts.ready) can move them without the panel reflowing underneath
 * the reader.
 */
export function typesetBalanced(el) {
  const text = el.dataset.pretext ?? el.textContent;
  el.dataset.pretext = text;
  if (!text.trim()) return;
  const width = el.clientWidth;
  if (!width) return;
  try {
    const { font, lineHeight } = fontOf(el);
    const prep = prepareWithSegments(text, font);
    const lineCount = measureLineStats(prep, width).lineCount;
    if (lineCount <= 1) {
      // Single line: no spans, no wrapper — the plain string is the truth.
      if (el.firstElementChild) el.textContent = text;
      return;
    }
    let lines = balanceLines(prep, text, font, width, lineCount);
    if (!lines) {
      lines = layoutWithLines(prep, width, lineHeight).lines.map((l) => l.text);
    }
    if (lines.length <= 1) {
      el.textContent = text;
      return;
    }
    const frag = document.createDocumentFragment();
    for (const value of lines) {
      const span = document.createElement('span');
      span.className = 'pt-line';
      span.textContent = value;
      frag.appendChild(span);
    }
    el.textContent = '';
    el.appendChild(frag);
  } catch (err) {
    el.textContent = text;
  }
}

export function typesetAll(root, selector) {
  root.querySelectorAll(selector).forEach(typesetBalanced);
}

/**
 * Height this element's text needs at its CURRENT width, without rendering it.
 * This is the one CSS genuinely cannot do: the research steps animate from
 * height 0, and at that moment the element has no laid-out text to measure.
 */
export function measureTextHeight(el) {
  const text = el.dataset.pretext ?? el.textContent;
  const { font, lineHeight } = fontOf(el);
  const width = el.clientWidth;
  if (!width) return 0;
  try {
    return layout(prepareWithSegments(text, font), width, lineHeight).height;
  } catch (err) {
    return 0;
  }
}
