// Collapsible panels — the mobile presentation of the two homepage sidebars.
//
// Wide screens keep both panels permanently open and side by side; below 760px
// they stack into one column and each becomes a toggle: the heading row is the
// control, the content is the panel body. Collapsed by default, because at
// 390px the news card alone measured 1241px of scroll before a reader saw
// anything else (that figure includes a duplicate lap of the list — see the
// loop gate in RecentUpdates — but even halved it is half a screen).
//
// Two rules the implementation has to honour:
//   * Above the breakpoint the button is hidden and the body MUST come back to
//     `height: auto`, or a resize from phone to desktop leaves a cropped panel.
//   * The choice is the reader's and persists (localStorage). The stored value
//     is only ever consulted at the breakpoint — desktop is always open.

const MEDIA = '(max-width: 760px)';

const read = (key) => {
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) return null;
    return value === 'open';
  } catch (err) {
    return null;
  }
};

const write = (key, open) => {
  try {
    window.localStorage.setItem(key, open ? 'open' : 'closed');
  } catch (err) {
    // Private mode / disabled storage: the panel still works, it just forgets.
  }
};

/**
 * Wire one panel. `container` must hold a [data-panel-toggle] button and a
 * [data-panel-body]; the button's aria-expanded always mirrors the body.
 */
export function initPanelToggle(container) {
  const button = container.querySelector('[data-panel-toggle]');
  const body = container.querySelector('[data-panel-body]');
  if (!button || !body) return;

  const key = `swp.panel.${button.dataset.panelKey || 'default'}`;
  const mq = window.matchMedia(MEDIA);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let open = true;

  // Ends the animation by handing the height back to layout, so a font load or
  // a resize can reflow the panel instead of leaving a stale pixel value.
  body.addEventListener('transitionend', (event) => {
    if (event.propertyName !== 'height') return;
    if (open) {
      body.style.height = '';
      body.style.overflow = '';
    }
  });

  const apply = (animate) => {
    if (!mq.matches) {
      open = true;
      button.setAttribute('aria-expanded', 'true');
      body.style.transition = 'none';
      body.style.height = '';
      body.style.overflow = '';
      body.inert = false;
      // Restore before the next frame so the desktop rule doesn't animate in.
      requestAnimationFrame(() => { body.style.transition = ''; });
      return;
    }

    button.setAttribute('aria-expanded', String(open));
    body.inert = !open;

    if (!animate || reduced.matches) {
      body.style.transition = 'none';
      body.style.height = open ? '' : '0px';
      body.style.overflow = open ? '' : 'hidden';
      requestAnimationFrame(() => { body.style.transition = ''; });
      return;
    }

    const current = body.getBoundingClientRect().height;
    body.style.transition = 'none';
    body.style.height = `${current}px`;
    body.style.overflow = 'hidden';
    void body.offsetHeight; // commit the starting point before the transition
    body.style.transition = '';
    body.style.height = open ? `${body.scrollHeight}px` : '0px';
  };

  const stored = read(key);
  open = mq.matches ? stored === null ? false : stored : true;
  apply(false);

  button.addEventListener('click', () => {
    open = !open;
    if (mq.matches) write(key, open);
    apply(true);
  });

  const onChange = () => apply(false);
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}
