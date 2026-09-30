// One place that knows the site's bilingual shape.
//
// Every page is reachable at two URLs, and the language switch links between
// them. Keeping the mapping here (rather than hand-writing href="/en/..." in
// each page) is what lets the build FAIL when a translation is missing
// instead of quietly linking to a 404.

export const LANGS = ['zh', 'en'];

export const DEFAULT_LANG = 'zh';

export const isLang = (lang) => LANGS.includes(lang);

// Every language-taking helper validates first. Twelve hand-written pages pass
// a literal `lang`, and a single mistyped character would otherwise silently
// produce an /en/ page with Chinese markup, a zh-CN <html lang>, a canonical
// pointing at the other language, and a language switch pointing at itself —
// all of it shipping green. Throwing at build time is the whole point.
export const htmlLang = (lang) => {
  if (!isLang(lang)) throw new Error('unknown language: ' + lang);
  return lang === 'zh' ? 'zh-CN' : 'en';
};

export const siteName = (lang) => {
  if (!isLang(lang)) throw new Error('unknown language: ' + lang);
  return lang === 'zh' ? '师威鹏' : 'Weipeng Shi';
};

// The canonical, language-neutral page id. '' is the home page; everything
// else is a top-level section. Blog posts add their slug later.
export const routeFor = (id, lang) => {
  if (!isLang(lang)) throw new Error('unknown language: ' + lang);
  const prefix = lang === 'zh' ? '' : '/en';
  const tail = id === '' ? '' : id + '/';
  return prefix + '/' + tail;
};

// The other language's URL for the same page. Throws rather than guessing if
// handed a language outside LANGS — a typo here would silently ship a broken
// switch, which is exactly the failure this design is meant to prevent.
export const alternateRoute = (id, fromLang) => {
  if (!isLang(fromLang)) throw new Error('unknown language: ' + fromLang);
  return routeFor(id, fromLang === 'zh' ? 'en' : 'zh');
};

export const switchHref = (id, lang) => alternateRoute(id, lang);
