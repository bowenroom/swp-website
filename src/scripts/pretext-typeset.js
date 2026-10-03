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
 * Word tokens of `raw` with their UTF-16 offsets, via Intl.Segmenter.
 *
 * This is the piece greedy wrapping cannot supply. Chinese has no spaces, so
 * the browser is free to end a line after "交" and start the next with "通事
 * 故" — correct by the line-breaking rules, and wrong for reading. English
 * fares worse under a narrowed budget: "Multimodal" came back as "Multimod"
 * + "al". Segmentation gives us word boundaries to break ON.
 */
function wordTokens(raw) {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter === 'undefined') return null;
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'word' });
    const out = [];
    for (const part of seg.segment(raw)) {
      out.push({ index: part.index, len: part.segment.length });
    }
    // The segmenter's last token always ends where the string does; anything
    // it skipped (it does not, but guard anyway) would corrupt `intact`.
    if (!out.length) return null;
    return out;
  } catch (err) {
    return null;
  }
}

/**
 * Break `raw` into at most `lineCount` lines of as-equal width as possible,
 * breaking ONLY between words.
 *
 * A small exact DP over token boundaries: every line must fit the column, the
 * number of lines is fixed (so the rendered height equals what a no-JS page
 * would have), and the cost is the squared deviation of each line from the
 * average line width — the classic raggedness objective. O(n²·k), with n in
 * the tens here, so it runs inside a single frame.
 *
 * Returns null when no word-boundary solution exists (a token wider than the
 * column, no segmenter, or an impossible line count), in which case the caller
 * falls back to ordinary greedy wrapping.
 */
const NO_LINE_START = new Set([
  '!', '%', ')', ',', '.', ':', ';', '?', ']', '}', '”', '’',
  '。', '、', '，', '、', '；', '：', '！', '？', '）', '】', '》',
  '〉', '」', '』', '〕', '…', '～', 'ー',
]);

function breakByWords(raw, font, width, lineCount, prep, lineHeight) {
  const tokens = wordTokens(raw);
  if (!tokens || tokens.length < lineCount) return null;
  const widths = tokens.map((t) => measureNaturalWidth(prepareWithSegments(raw.slice(t.index, t.index + t.len), font)));
  const total = widths.reduce((a, b) => a + b, 0);
  const avg = total / lineCount;
  const INF = Number.POSITIVE_INFINITY;
  const n = tokens.length;
  // dp[i][k]: best cost covering tokens[0..i) with k lines; prev[i][k] = split.
  const dp = Array.from({ length: n + 1 }, () => Array(lineCount + 1).fill(INF));
  const prev = Array.from({ length: n + 1 }, () => Array(lineCount + 1).fill(-1));
  dp[0][0] = 0;
  for (let k = 1; k <= lineCount; k += 1) {
    for (let i = 1; i <= n; i += 1) {
      let sum = 0;
      for (let j = i; j >= 1; j -= 1) {
        sum += widths[j - 1];
        if (sum > width + 0.5) break; // a line that cannot fit is not a candidate
        // 禁则 (kinsoku): a line may not open with closing punctuation — a
        // 、 at the head of a line, or English's ":" and ",", is the one way
        // this algorithm could look WORSE than the browser's own wrapping,
        // which follows the line-breaking rules. Ruling those candidates out
        // is what makes the fallback (greedy) the exception, not the result.
        if (k > 1 && NO_LINE_START.has(raw[tokens[j - 1].index] || '')) continue;
        const cost = dp[j - 1][k - 1];
        if (cost === INF) continue;
        const score = cost + (sum - avg) * (sum - avg);
        if (score < dp[i][k]) {
          dp[i][k] = score;
          prev[i][k] = j;
        }
      }
    }
  }
  if (dp[n][lineCount] === INF) return null;
  const cuts = [];
  let i = n;
  for (let k = lineCount; k > 0; k -= 1) {
    const j = prev[i][k];
    if (j < 0) return null;
    cuts.unshift(j);
    i = j - 1;
  }
  // prev[i][k] = j says the k-th line STARTS at token j-1 (the transition
  // that reached state (i, k)), so line k runs tokens[j-1 .. j(+1)-2] and the
  // last line runs to the end. Reading those as line ENDS — one off — silently
  // dropped the final line: the join check caught it at 34 characters against
  // a 41-character source.
  const lines = [];
  for (let k = 0; k < lineCount; k += 1) {
    const from = k === 0 ? 0 : cuts[k] - 1;
    const to = k === lineCount - 1 ? n - 1 : cuts[k + 1] - 2;
    if (to < from) return null;
    lines.push(raw.slice(tokens[from].index, tokens[to].index + tokens[to].len));
  }
  if (lines.length !== lineCount) return null;
  // Text fidelity is non-negotiable: the slices must concatenate back to the
  // source, or a word has been silently dropped.
  if (lines.join('') !== raw) return null;
  return lines;
}

/**
 * The single breaking decision both panels rely on: word-boundary lines when
 * possible, greedy wrapping when not. Keeping it in one place is what makes
 * `measureTextHeight` agree with what actually gets painted — the research
 * steps animate to this height, and a disagreement would clip the very text
 * this replaced `max-height` to protect.
 */
export function breakLines(raw, font, width, lineHeight, lineCount) {
  // The kinsoku constraint can make the target line count unreachable — then
  // one extra line is the cheap fix, and since this same function decides the
  // height the research steps animate to, the extra line costs nothing but a
  // few pixels of panel.
  for (let extra = 0; extra <= 2; extra += 1) {
    const balanced = breakByWords(raw, font, width, lineCount + extra, null, lineHeight);
    if (balanced) return balanced;
  }
  const prep = prepareWithSegments(raw, font);
  return layoutWithLines(prep, width, lineHeight).lines.map((l) => l.text);
}

/**
 * Re-break `el`'s text and write the chosen lines into the DOM as one block
 * per line, so what is painted is what was computed and a late web font
 * (re-typeset on document.fonts.ready) cannot move the breaks underneath the
 * reader after the marquee has timed its travel against the row heights.
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
      if (el.firstElementChild) el.textContent = text;
      return;
    }
    const lines = breakLines(text, font, width, lineHeight, lineCount);
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
 * Height this element's text needs at its CURRENT width — from the SAME
 * breaking decision `typesetBalanced` makes.
 *
 * That agreement is the whole point: the research steps animate from height 0
 * to this number, and if it disagreed with the lines actually painted by even
 * one line the step would clip its own text — which is exactly what the old
 * `max-height: 200px` did. The painted line spans are used when they exist,
 * so the value is literally the height of what is in the DOM.
 */
export function measureTextHeight(el) {
  const painted = el.querySelectorAll('.pt-line').length;
  const { lineHeight } = fontOf(el);
  if (painted > 0) return painted * lineHeight;
  const text = el.dataset.pretext ?? el.textContent;
  const { font } = fontOf(el);
  const width = el.clientWidth;
  if (!width || !text.trim()) return 0;
  try {
    const lineCount = measureLineStats(prepareWithSegments(text, font), width).lineCount;
    return breakLines(text, font, width, lineHeight, lineCount).length * lineHeight;
  } catch (err) {
    return 0;
  }
}
