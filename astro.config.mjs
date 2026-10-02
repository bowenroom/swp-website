// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages serves the site from a custom domain (swp.lionpilot.tech), not from
// /<repo>/, so no `base` is needed. `trailingSlash: 'always'` keeps the URL shape
// uniform with the hand-written prototype (/hero/, /papers/) and makes the
// language-switch links predictable.
export default defineConfig({
  site: 'https://swp.lionpilot.tech',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // Inline every stylesheet instead of Astro's default 'auto', which splits a
    // chunk out as a <link> as soon as it crosses 4KB. That threshold sits a
    // few hundred bytes away from this project's shared stylesheet, so an
    // ordinary CSS edit silently flipped the build from inline to linked and
    // failed the skeleton test's "page carries the Kami tokens" check — for a
    // reason that had nothing to do with the tokens. Inline is deterministic,
    // and it costs one fewer request on first paint.
    inlineStylesheets: 'always',
  },
});
