// Points the post bodies at their webp siblings. Astro 7's default markdown
// processor does not accept rehype plugins without pulling in an extra
// package, and hand-editing 32 files to swap image extensions guarantees
// drift, so the rewrite happens here instead.
//
// Only references whose webp actually exists are touched. The optimizer skips
// images that are already small, so a handful of posts keep their png -- that
// is deliberate, not a miss.
//
// Idempotent: running it twice changes nothing the second time.
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const postsDir = join(root, 'src/content/posts');
const publicDir = join(root, 'public');

let rewritten = 0;
let kept = 0;

for (const name of await readdir(postsDir)) {
  if (!name.endsWith('.md')) continue;
  const file = join(postsDir, name);
  const before = await readFile(file, 'utf8');

  const after = before.replaceAll(/(\/blogs\/[\w./-]+)\.png/g, (match, base) => {
    if (existsSync(join(publicDir, `${base}.webp`))) {
      rewritten += 1;
      return `${base}.webp`;
    }
    kept += 1;
    return match;
  });

  if (after !== before) await writeFile(file, after);
}

console.log(`${rewritten} image reference(s) now point at webp; ${kept} kept as png (no webp sibling).`);
