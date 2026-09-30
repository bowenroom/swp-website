// Every PNG in public/blogs has a WebP sibling produced by
// tools/optimize-images.mjs. Serving the WebP first cuts the blog's image
// weight by roughly 90% (45 MB of covers down to ~2 MB), which matters most
// for readers on slow mainland-China connections; the PNG stays as the
// fallback so nothing breaks in a browser without WebP support.
//
// The width/height that get passed through must describe the WebP, because
// that is the image the browser will actually lay out.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Resolved from the project root rather than from import.meta.url: Vite loads
// this module through its own pipeline during a build, where import.meta.url
// points into the bundler internals and ../../public/ no longer exists.
const publicDir = join(process.cwd(), 'public');

/** The webp sibling of a public-relative png path, or null if there is none. */
export const webpFor = (src) => {
  if (!src?.endsWith('.png')) return null;
  const candidate = src.replace(/\.png$/, '.webp');
  return existsSync(join(publicDir, candidate)) ? candidate : null;
};
