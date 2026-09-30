// Walks the built site and proves every internal href and every local <img>
// actually resolves. Astro will happily emit a link to a page that was never
// generated, and a markdown image typo survives into dist/ untouched -- so
// this has to be checked against the build output, not the source.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;

const htmlFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) htmlFiles.push(full);
  }
})(dist);

const failures = [];
let linkCount = 0;
let imageCount = 0;

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const route = file.slice(dist.length);

  for (const [, href] of html.matchAll(/href="(\/[^"#?]*)"/g)) {
    if (href.startsWith('//')) continue;
    linkCount += 1;
    const target = href.endsWith('/') ? join(dist, href, 'index.html') : join(dist, href);
    if (!existsSync(target)) failures.push(`broken link  ${route} -> ${href}`);
  }

  for (const [, src] of html.matchAll(/<img[^>]+src="(\/[^"]+)"/g)) {
    imageCount += 1;
    if (!existsSync(join(dist, src))) failures.push(`missing image ${route} -> ${src}`);
  }
}

console.log(`\nlink graph (${htmlFiles.length} pages, ${linkCount} internal links, ${imageCount} images)`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
console.log(failures.length === 0 ? 'PASS' : `FAIL \u2014 ${failures.length} broken reference(s)`);
process.exit(failures.length === 0 ? 0 : 1);
