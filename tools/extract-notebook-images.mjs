// Pull the real notebook output images out of the legacy .ipynb files and
// write them into public/blogs/<slug>/. The old site hotlinked these from
// loli.net and a GitHub figure bed, both of which are unreliable from
// mainland China; the new site serves them from its own origin.
//
//   node tools/extract-notebook-images.mjs <postsRoot> <outRoot>
//
// Also prints every remote image URL found in the notebooks' markdown so the
// remaining hotlinks are visible instead of silently shipped.

import fs from 'node:fs';
import path from 'node:path';

const postsRoot = process.argv[2];
const outRoot = process.argv[3];

if (!postsRoot || !outRoot) {
  console.error('usage: extract-notebook-images.mjs <postsRoot> <outRoot>');
  process.exit(2);
}

const SLUGS = {
  '01.torch-unfold': 'torch-unfold',
  '02.hrnet': 'hrnet',
  '03.transformer': 'transformer',
  '04.pytorch-basics': 'pytorch-basics',
  '05.fastai-dataloaders': 'fastai-dataloaders',
  '06.d3net': 'd3net',
  '06.fastai-dataTransform': 'fastai-datatransform',
  '07. fastai-datacore': 'fastai-datacore',
  '08.data-explore': 'data-explore',
  '09.mmsegmentation': 'mmsegmentation',
  '10. dataset-augmentation': 'dataset-augmentation',
  '11. einops': 'einops',
  '12. robustness': 'robustness',
  '13. segformer': 'segformer',
  '14. JLDCF': 'jldcf',
};

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

const REMOTE_IMG = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;

let totalImages = 0;
const hotlinks = [];

for (const [dir, slug] of Object.entries(SLUGS)) {
  const src = path.join(postsRoot, dir);
  if (!fs.existsSync(src)) {
    console.log('MISS ' + dir);
    continue;
  }
  const nbFile = fs.readdirSync(src).find((f) => f.endsWith('.ipynb'));
  if (!nbFile) {
    console.log('NO-NB ' + dir);
    continue;
  }
  const nb = JSON.parse(fs.readFileSync(path.join(src, nbFile), 'utf8'));
  const outDir = path.join(outRoot, slug);
  fs.mkdirSync(outDir, { recursive: true });

  let n = 0;
  for (const cell of nb.cells || []) {
    if (cell.cell_type === 'markdown') {
      const text = (cell.source || []).join('');
      for (const m of text.matchAll(REMOTE_IMG)) hotlinks.push(slug + '  ' + m[1]);
      continue;
    }
    for (const out of cell.outputs || []) {
      const data = out.data;
      if (!data) continue;
      for (const [mime, payload] of Object.entries(data)) {
        if (!mime.startsWith('image/')) continue;
        const ext = MIME_EXT[mime] || 'png';
        n += 1;
        totalImages += 1;
        const b64 = Array.isArray(payload) ? payload.join('') : String(payload);
        const name = String(n).padStart(2, '0') + '.' + ext;
        fs.writeFileSync(path.join(outDir, name), Buffer.from(b64, 'base64'));
      }
    }
  }
  console.log(slug + '  images=' + n + '  ->  ' + path.relative(process.cwd(), outDir));
}

console.log('');
console.log('total notebook images: ' + totalImages);
console.log('remote image hotlinks still referenced in markdown (' + hotlinks.length + '):');
for (const h of hotlinks) console.log('  ' + h);
