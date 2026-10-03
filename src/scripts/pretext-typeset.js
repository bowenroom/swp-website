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
import { prepareWithSegments, layout, layoutWithLines, measureLineStats } from '@chenglou/pretext';

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
export function typesetBalanced(el) {
  const text = el.dataset.pretext ?? el.textContent;
  el.dataset.pretext = text;
  if (!text.trim()) return;
  const width = el.clientWidth;
  if (!width) return;
  try {
    const { font, lineHeight } = fontOf(el);
    const prep = prepareWithSegments(text, font);
    const base = measureLineStats(prep, width);
    if (base.lineCount <= 1) {
      // Single line: no spans, no wrapper — the plain string is the truth.
      if (el.firstElementChild) el.textContent = text;
      return;
    }
    let lo = Math.max(48, Math.floor(width * 0.55));
    let hi = width;
    let best = width;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (measureLineStats(prep, mid).lineCount <= base.lineCount) {
        best = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    const { lines } = layoutWithLines(prep, best, lineHeight);
    if (lines.length <= 1) {
      el.textContent = text;
      return;
    }
    const frag = document.createDocumentFragment();
    for (const line of lines) {
      const span = document.createElement('span');
      span.className = 'pt-line';
      span.textContent = line.text;
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
