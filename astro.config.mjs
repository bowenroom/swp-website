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
  },
});
