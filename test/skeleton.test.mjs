// TDD seam for ticket 01: the bilingual skeleton.
//
// Runs `astro build`, then asserts on the generated HTML only — the same seam
// ticket 02 will extend with a real browser. Nothing here reaches into Astro
// internals; every assertion is about what a visitor (or a crawler) receives.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const site = 'https://swp.lionpilot.tech';

let failures = 0;
const check = (label, cond, detail = '') => {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const html = (route) => {
  const p = join(dist, route, 'index.html');
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

console.log('building…');
// Telemetry writes to ~/Library/Preferences on first run; CI and sandboxes may
// not be able to create it, and a missing preferences dir must not fail a build
// that is otherwise correct.
if (!process.env.SWP_SKIP_BUILD) {
  execFileSync('npm', ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
  });
}

console.log('\nroutes');
const ROUTES = ['', 'papers', 'projects', 'blogs', 'courses', 'about'];
for (const r of ROUTES) {
  const zh = html(r);
  const en = html(r === '' ? 'en' : `en/${r}`);
  check(`/${r}/ exists (zh)`, zh !== null);
  check(`/${r === '' ? '' : r + '/'} exists (en)`, en !== null);
  if (!zh || !en) continue;

  check(`/${r}/ lang=zh-CN`, zh.includes('<html lang="zh-CN"'), 'missing or wrong lang');
  check(`/en/${r}/ lang=en`, en.includes('<html lang="en"'), 'missing or wrong lang');

  const zhTitle = zh.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  const enTitle = en.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  check(`/${r}/ has a title`, zhTitle.trim().length > 0);
  check(`/en/${r}/ has a title`, enTitle.trim().length > 0);
  check(`/${r}/ title differs from en`, zhTitle !== enTitle, 'both titles identical');

  const zhCanon = zh.match(/rel="canonical" href="([^"]*)"/)?.[1];
  const enCanon = en.match(/rel="canonical" href="([^"]*)"/)?.[1];
  check(`/${r}/ canonical absolute`, Boolean(zhCanon?.startsWith(site)), zhCanon ?? 'missing');
  check(`/en/${r}/ canonical absolute`, Boolean(enCanon?.startsWith(site)), enCanon ?? 'missing');
  check(`/${r}/ canonical ≠ en canonical`, zhCanon !== enCanon);

  // The language switch must work in both directions, not just exist.
  const otherForZh = r === '' ? '/en/' : `/en/${r}/`;
  const otherForEn = r === '' ? '/' : `/${r}/`;
  check(`/${r}/ links to ${otherForZh}`, zh.includes(`href="${otherForZh}"`));
  check(`/en/${r}/ links to ${otherForEn}`, en.includes(`href="${otherForEn}"`));

  // Kami tokens must live in the shared layout, so every page inherits them.
  // Compare case-insensitively: the CSS minifier lowercases hex values, so a
  // literal '#1B365D' would fail on correct output.
  const zhLower = zh.toLowerCase();
  check(`/${r}/ has Kami ink`, zhLower.includes('#1b365d'));
  check(`/${r}/ has Kami parchment`, zhLower.includes('#f5f4ed'));

  // Exactly one h1, always. The homepage renders no visible heading block — its
  // subject lives in the scroll-film copy the engine builds at runtime — so the
  // layout supplies a clipped one for that page alone. Two h1s on a page is as
  // wrong as none, so the count is asserted rather than just the presence.
  const h1Count = (page) => (page.match(/<h1[\s>]/g) || []).length;
  check(`/${r}/ has exactly one h1`, h1Count(zh) === 1, `found ${h1Count(zh)}`);
  check(`/en/${r}/ has exactly one h1`, h1Count(en) === 1, `found ${h1Count(en)}`);
  // A clipped heading must stay in the accessibility tree, which is exactly
  // what display:none or visibility:hidden would break.
  if (r === '') {
    check('/ carries a clipped h1 for assistive tech',
      /<h1 class="visually-hidden">/.test(zh));
    check('/en/ carries a clipped h1 for assistive tech',
      /<h1 class="visually-hidden">/.test(en));
  }
}

console.log('\nnav');
// The nav is asserted on the ENGLISH home: the ZH home renders Chinese labels
// (论文/项目/…), so English section names only appear in the /en/ tree.
const home = html('en');
if (home) {
  // Match the anchor by href and check the label sits inside it. Asserting on a
  // bare `>Label<` would be brittle: it would also match body copy and would
  // break on any attribute between the tag and the text.
  const anchorFor = (label, href) =>
    new RegExp(`<a[^>]*href="${href}"[^>]*>\\s*${label}\\s*</a>`).test(home);
  for (const label of ['Papers', 'Projects', 'Blogs', 'Courses', 'About']) {
    check(`nav has ${label}`, anchorFor(label, `/en/${label.toLowerCase()}/`));
  }
  check('nav has Home', anchorFor('Home', '/en/'));
}

console.log('\nrecent updates (bilingual)');
// The homepage news block is the one place the two languages must stay in
// lockstep: it is a single hand-maintained data file, so a drift between the
// two rendered lists is a content bug, not a layout difference.
for (const [route, lang, heading, sample] of [
  ['', 'zh', '近期动态', '很荣幸与林教授交流'],
  ['en', 'en', 'Recent updates', 'A great honor to meet Prof. Lin'],
]) {
  const page = html(route);
  if (!page) {
    check(`/${route}/ home exists for news`, false);
    continue;
  }

  check(`/${route}/ has news block`, page.includes('class="news"'));
  check(`/${route}/ news heading is ${heading}`, page.includes(heading));

  // Ten entries, newest first. Read them back out of the rendered HTML rather
  // than the data file: this asserts what a visitor actually receives.
  const items = [...page.matchAll(/data-date="([0-9-]+)"/g)].map((m) => m[1]);
  check(`/${route}/ renders 10 entries`, items.length === 10, `found ${items.length}`);
  check(
    `/${route}/ entries are newest first`,
    items.every((d, i) => i === 0 || items[i - 1] >= d),
    items.join(' ')
  );
  check(`/${route}/ renders its own translation`, page.includes(sample));

  // A paper's date must not be the old site's blanket 2024.2.22 stamp: five
  // different papers across three journals cannot share one publication day.
  const paperDates = [...page.matchAll(/data-kind="paper" data-date="([0-9-]+)"/g)].map(
    (m) => m[1]
  );
  check(`/${route}/ paper dates are not all identical`, new Set(paperDates).size > 1,
    paperDates.join(' '));

  // Partial dates are honest: the source fixes a month or a year, and the
  // rendered datetime must not invent a day.
  check(`/${route}/ keeps month-only precision`, items.includes('2022-11'));
  check(`/${route}/ keeps year-only precision`, items.includes('2022'));
  check(`/${route}/ hotlinks no legacy image host`, !page.includes('loli.net'));
}

// ── blog system ────────────────────────────────────────────────────────────
// The blog is the largest surface on the site: 16 posts x 2 languages, plus an
// index that has to keep its featured rail and year counts honest. The
// skeleton suite predates all of it, so without these assertions a post can
// lose its body, a translation can go missing, or the archive can silently
// reorder itself and the deploy gate would still be green.

// The slug list is the only thing this suite needs from posts.js, and that is
// a flat, unambiguous literal in the file. Parsing it out with a regex beats
// trying to evaluate the module: the assertions below are about the built
// HTML, and a clever eval here would be the one place a syntax slip in an
// unrelated helper could take the whole deploy gate down.
const POST_SLUGS = [
  ...readFileSync(join(root, 'src/content/posts.js'), 'utf8').matchAll(/^\s{4}slug: '([^']+)',$/gm),
].map((m) => m[1]);

console.log('\nblog');
check('posts.js declares 16 posts', POST_SLUGS.length === 16, `found ${POST_SLUGS.length}`);

const YEAR_COUNTS = { 2023: 1, 2021: 13, 2020: 2 };

for (const slug of POST_SLUGS) {
  const zh = html(`blogs/${slug}`);
  const en = html(`en/blogs/${slug}`);
  check(`/blogs/${slug}/ exists (zh)`, zh !== null);
  check(`/en/blogs/${slug}/ exists (en)`, en !== null);
  if (!zh || !en) continue;

  // A route that renders its title but no body is the exact failure the eager
  // glob in the page is meant to prevent — assert the prose actually shipped.
  check(`/blogs/${slug}/ has a real body`, zh.includes('class="prose"') && zh.length > 4000);
  check(`/en/blogs/${slug}/ has a real body`, en.includes('class="prose"') && en.length > 4000);

  check(`/blogs/${slug}/ declares zh-CN`, zh.includes('<html lang="zh-CN">'));
  check(`/en/blogs/${slug}/ declares en`, en.includes('<html lang="en">'));

  // A post renders its own h1 from the collection entry. The layout used to
  // clip a second, hidden one for any page missing `heading`, which put two
  // top-level headings on every post. Assert both halves: exactly one h1, and
  // it is the visible title rather than a clipped site-name placeholder.
  const h1Count = (page) => (page.match(/<h1[\s>]/g) || []).length;
  check(`/blogs/${slug}/ has exactly one h1`, h1Count(zh) === 1, `found ${h1Count(zh)}`);
  check(`/en/blogs/${slug}/ has exactly one h1`, h1Count(en) === 1, `found ${h1Count(en)}`);
  check(`/blogs/${slug}/ h1 is the visible post title`, zh.includes('<h1 class="post-title">'));
  check(`/en/blogs/${slug}/ h1 is the visible post title`, en.includes('<h1 class="post-title">'));

  // The switch must land on the same post in the other language, not the
  // section index and not itself.
  check(
    `/blogs/${slug}/ switches to the same post in en`,
    zh.includes(`href="/en/blogs/${slug}/"`)
  );
  check(
    `/en/blogs/${slug}/ switches to the same post in zh`,
    en.includes(`href="/blogs/${slug}/"`)
  );

  // Legacy-notebook screenshots and the generated cover are both local files;
  // an external hotlink here would leak a reader off-site and break offline.
  check(`/blogs/${slug}/ hotlinks no remote image`, !/src="https?:/.test(zh));
  check(`/en/blogs/${slug}/ hotlinks no remote image`, !/src="https?:/.test(en));

  const coverSrc = `/blogs/covers/${slug}.png`;
  check(`/blogs/${slug}/ cover file is published`, existsSync(join(dist, coverSrc)));

  // Every image a post body references must actually be in the bundle.
  for (const [, src] of zh.matchAll(/<img[^>]+src="(\/[^"]+)"/g)) {
    check(`/blogs/${slug}/ image ${src} exists`, existsSync(join(dist, src)));
  }
}

const blogZh = html('blogs');
const blogEn = html('en/blogs');
if (blogZh && blogEn) {
  check('zh blog index renders the featured rail', blogZh.includes('blog-featured-grid'));
  check('en blog index renders the featured rail', blogEn.includes('blog-featured-grid'));
  check('zh blog index has 3 featured cards',
    (blogZh.match(/class="blog-card"/g) || []).length === 3);

  for (const [year, n] of Object.entries(YEAR_COUNTS)) {
    // The label span carries the year once; the count is a sibling span.
    const row = new RegExp(`blog-year-label">${year}<`);
    check(`zh blog archive has a ${year} row`, row.test(blogZh));
    const count = new RegExp(`blog-year-count">${n} 篇`);
    check(`zh blog archive counts ${n} post(s) in ${year}`, count.test(blogZh));
  }
  check('en blog archive counts 13 posts in 2021', /blog-year-count">13 posts/.test(blogEn));

  // Newest first, or the archive reads as a shuffled deck.
  const firstEntry = blogZh.match(/class="blog-entry-date" datetime="([0-9-]+)"/);
  check('zh blog archive leads with the newest post', firstEntry?.[1] === '2023-10-18',
    `first entry ${firstEntry?.[1]}`);
}

console.log('\n404');
const notFound = existsSync(join(dist, '404.html')) ? readFileSync(join(dist, '404.html'), 'utf8') : null;
check('404.html is published', notFound !== null);
if (notFound) {
  check('404 keeps the site chrome', notFound.includes('class="masthead"'));
  check('404 offers a way back home', notFound.includes('href="/"'));
  check('404 is branded for 师威鹏', notFound.includes('师威鹏'));
}

console.log('\nidentity');
for (const r of [...ROUTES.map((x) => (x === '' ? '' : x)), ...POST_SLUGS.map((s) => `blogs/${s}`)]) {
  for (const [prefix, page] of [['', html(r)], ['en/', r === '' ? html('en') : html(`en/${r}`)]]) {
    if (!page) continue;
    check(`/${prefix}${r}/ has no wrong-name spelling`, !page.includes('施伟鹏'));
  }
}

console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} assertion(s)`}`);
process.exit(failures === 0 ? 0 : 1);
