// Nav labels and per-page copy live here, split by language. A page renders its
// own language's entry; if that entry is missing the build throws (see
// pageCopy) — no silent fallback to the other language.

export const nav = {
  zh: {
    home: '首页',
    papers: '论文',
    projects: '项目',
    blogs: '博客',
    courses: '课程',
    about: '关于',
  },
  en: {
    home: 'Home',
    papers: 'Papers',
    projects: 'Projects',
    blogs: 'Blogs',
    courses: 'Courses',
    about: 'About',
  },
};

const TABLE = {
  '': {
    zh: {
      title: '师威鹏 — 道路场景智能与多智能体协同',
      heading: '道路场景智能与多智能体协同',
      lede: '大模型与智能体、无人机与无人驾驶。研究聚焦道路安全应急。',
    },
    en: {
      title: 'Weipeng Shi — Road Scene Intelligence and Multi-Agent Coordination',
      heading: 'Road Scene Intelligence and Multi-Agent Coordination',
      lede: 'Large language models, agents, UAVs and autonomous driving. Focused on road safety and emergency response.',
    },
  },
  papers: {
    zh: { title: '论文 · 师威鹏', heading: '论文', lede: '在遥感与道路场景理解方向发表的论文。' },
    en: { title: 'Papers — Weipeng Shi', heading: 'Papers', lede: 'Published work in remote sensing and road scene understanding.' },
  },
  projects: {
    zh: { title: '项目 · 师威鹏', heading: '项目', lede: '正在做的项目与开源实践。' },
    en: { title: 'Projects — Weipeng Shi', heading: 'Projects', lede: 'Projects and open-source work in progress.' },
  },
  blogs: {
    zh: { title: '博客 · 师威鹏', heading: '博客', lede: '技术笔记与阅读记录。' },
    en: { title: 'Blogs — Weipeng Shi', heading: 'Blogs', lede: 'Technical notes and reading notes.' },
  },
  courses: {
    zh: { title: '课程 · 师威鹏', heading: '课程', lede: '开设的课程与大纲。' },
    en: { title: 'Courses — Weipeng Shi', heading: 'Courses', lede: 'Courses I teach and their outlines.' },
  },
  about: {
    zh: { title: '关于 · 师威鹏', heading: '关于', lede: '个人介绍与研究经历。' },
    en: { title: 'About — Weipeng Shi', heading: 'About', lede: 'Background and research experience.' },
  },
};

export const pageCopy = (id, lang) => {
  const page = TABLE[id];
  if (!page) throw new Error('no copy declared for page id "' + id + '"');
  const copy = page[lang];
  if (!copy) throw new Error('missing ' + lang + ' translation for page id "' + id + '"');
  return copy;
};

// Nav labels get the same guard as page copy. Without it, a missing key
// renders an <a> with an empty label — an invisible link in the primary
// navigation, which is precisely what pageCopy's throw exists to prevent.
export const navLabel = (lang, id) => {
  const group = nav[lang];
  if (!group) throw new Error('no nav labels for language "' + lang + '"');
  const label = group[id];
  if (!label) throw new Error('missing ' + lang + ' nav label for "' + id + '"');
  return label;
};

export const pageIds = Object.keys(TABLE);
