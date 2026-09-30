// Reports what a reader actually downloads for a page, counting the webp
// source ahead of its png fallback rather than summing the directory. The
// directory total is misleading: it counts every png fallback that no modern
// browser ever requests.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const pages = process.argv.slice(2);
const targets = pages.length ? pages : ['index.html', 'blogs/index.html', 'blogs/pytorch-basics/index.html'];

const SOURCE_RE = /<source[^>]+srcset="(\/[^"]+)"/g;
const IMG_RE = /<img[^>]+src="(\/[^"]+)"/g;

for (const page of targets) {
  const file = join(dist, page);
  if (!existsSync(file)) {
    console.log(`${page.padEnd(36)} MISSING PAGE`);
    continue;
  }
  const html = readFileSync(file, 'utf8');

  const chosen = new Set();
  const shadowed = new Set();
  for (const [, src] of html.matchAll(SOURCE_RE)) chosen.add(src);
  for (const [, src] of html.matchAll(IMG_RE)) {
    const webp = src.replace(/\.png$/, '.webp');
    if (chosen.has(webp)) shadowed.add(src);
    else chosen.add(src);
  }

  let bytes = 0;
  const missing = [];
  for (const asset of chosen) {
    const target = join(dist, asset);
    if (existsSync(target)) bytes += statSync(target).size;
    else missing.push(asset);
  }

  console.log(
    `${page.padEnd(36)} ${String(chosen.size).padStart(3)} assets  ` +
      `${(bytes / 1024 / 1024).toFixed(2).padStart(6)} MB` +
      (shadowed.size ? `  (${shadowed.size} png fallback(s) skipped)` : '') +
      (missing.length ? `  MISSING: ${missing.join(', ')}` : '')
  );
}
