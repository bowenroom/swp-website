// The generated watercolor covers and the legacy notebook screenshots were
// written out as full-size PNGs: 16 covers alone ship ~45 MB, which is a real
// penalty for the readers in mainland China this site is written for. This
// rewrites each one in place as WebP at a sane display width and keeps a PNG
// fallback next to it, so the <picture> markup in BlogIndex can offer WebP and
// still degrade cleanly.
//
// Idempotent: re-running on already-optimised files is a no-op because the
// outputs already exist and are smaller than the source.
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, parse } from 'node:path';
import sharp from 'sharp';

const publicDir = new URL('../public/', import.meta.url).pathname;

// Covers are shown as card art and blog headers; 1200px wide is generous for
// a 16:9 card on a 2560px display once the browser scales it down.
const MAX_WIDTH = 1200;
const QUALITY = 78;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.png$/i.test(entry.name)) yield full;
  }
}

const targets = process.argv.slice(2);
const files = targets.length ? targets : await Array.fromAsync(walk(join(publicDir, 'blogs')));

let saved = 0;
let touched = 0;

for (const file of files) {
  const out = file.replace(/\.png$/i, '.webp');
  if (!existsSync(file)) continue;

  const before = (await stat(file)).size;
  const meta = await sharp(file).metadata();

  // Already small enough that re-encoding would not pay for itself.
  if (before < 120 * 1024) continue;
  if (existsSync(out) && (await stat(out)).size < before) continue;

  await sharp(file)
    .resize({ width: Math.min(MAX_WIDTH, meta.width ?? MAX_WIDTH), withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(out);

  const after = (await stat(out)).size;
  if (after < before) {
    saved += before - after;
    touched += 1;
    console.log(
      `${parse(file).name.padEnd(26)} ${(before / 1024).toFixed(0).padStart(5)}K -> ` +
        `${(after / 1024).toFixed(0).padStart(5)}K  webp`
    );
  } else {
    console.log(`${parse(file).name.padEnd(26)} skipped (webp not smaller)`);
  }
}

console.log(
  `\n${touched} file(s) encoded, ${(saved / 1024 / 1024).toFixed(1)} MB saved as webp siblings.`
);
