// Courses page content.
//
// SOURCE OF TRUTH
//   /Volumes/01.MyFiles/01.InProgress/08-agent-working/03-course-NLP/deck/course-manifest.json
// The course object and every lesson field below (id / title / summary / phase /
// status / available / path) are copied verbatim from that file. Nothing is
// re-typed from memory and nothing is paraphrased: the manifest is the authored
// course copy, and rewriting it would fork the two sites' wording.
//
// WHY A COPIED STATIC MODULE AND NOT AN `import` OF THE JSON
//   The manifest lives in a sibling project outside this repository. Importing
//   it with a relative path (`../../03-course-NLP/...`) type-checks and builds
//   fine on this laptop and then fails in CI and on GitHub Pages, where the
//   sibling checkout does not exist. A vendored data module keeps the site
//   self-contained. Re-sync procedure: copy the JSON, re-run the counts below,
//   and diff — do not hand-edit individual lessons.
//
// THE ONE FIELD NOT IN THE MANIFEST: `slides` (deck page count).
//   The manifest marks a lesson available but does not say how long it is. The
//   counts below were measured, not recalled — for each lesson directory,
//   `node -e "require('./<id>/deck-manifest.json').slides.length"` against
//   ../03-course-NLP/deck/. Result: 01=60, 02=41, 03=60, 04=39, 05=39 (239 in
//   total). Lessons 06-12 have no directory on disk at all, which is why they
//   carry no `slides` key rather than a zero.

export const COURSE = {
  title: '大模型与自然语言处理',
  eyebrow: 'Jiangsu Normal University · NLP Course',
  subtitle: '从语言模型原理，到可运行、可解释、可演进的 Agent 系统',
  description:
    '一学期 12 次课，以真实工程问题为入口，以生产级实现为落点，逐步建立大模型应用与 Agent 工程能力。',
  url: 'https://llm.lionpilot.tech/',
};

export const LESSONS = [
  {
    id: '01',
    title: 'Hermes Agent 功能与用法',
    summary: '12 幕上手 Hermes｜学习闭环·技能·记忆｜委派·Kanban·自动化｜成本',
    phase: '阶段二 · 会思考、会做事',
    path: '/01/',
    status: 'available',
    available: true,
    slides: 60,
  },
  {
    id: '02',
    title: 'LLM API 与 Prompt Engineering',
    summary: '参数·流式·错误处理·成本｜提示设计与失败模式',
    phase: '阶段一 · 把模型调起来',
    path: '/02/',
    status: 'available',
    available: true,
    slides: 41,
  },
  {
    id: '03',
    title: '从聊天到执行：ChatGPT Desktop + Codex',
    summary: 'Chat/Work/Codex 决策｜Desktop 多工具任务｜Codex 工程工作流｜权限与验证',
    phase: '阶段二 · 会思考、会做事',
    path: '/03/',
    status: 'available',
    available: true,
    slides: 60,
  },
  {
    id: '04',
    title: '推理效率与 KV Cache',
    summary: '自回归瓶颈｜KV Cache 与前缀缓存｜长上下文影响',
    phase: '阶段一 · 把模型调起来',
    path: '/04/',
    status: 'available',
    available: true,
    slides: 39,
  },
  {
    id: '05',
    title: 'Reasoning 技术',
    summary: 'CoT · Self-Consistency · ToT｜Test-time compute',
    phase: '阶段二 · 会思考、会做事',
    path: '/05/',
    status: 'available',
    available: true,
    slides: 39,
  },
  {
    id: '06',
    title: 'Context Engineering',
    summary: '上下文稀缺 · lost-in-the-middle｜选择·压缩·装配',
    phase: '阶段三 · 信息与记忆',
    path: '/06/',
    status: 'planned',
    available: false,
  },
  {
    id: '07',
    title: 'Memory 系统（Agentic Memory）',
    summary: '分层架构｜读写更新遗忘｜跨会话持久化',
    phase: '阶段三 · 信息与记忆',
    path: '/07/',
    status: 'planned',
    available: false,
  },
  {
    id: '08',
    title: 'Planning 与任务分解',
    summary: '层次分解｜动态重规划｜Reflection',
    phase: '阶段四 · 自主运行',
    path: '/08/',
    status: 'planned',
    available: false,
  },
  {
    id: '09',
    title: 'Skills 与 MCP',
    summary: '渐进披露｜MCP 架构｜与 Tool 的区别·安全·版本',
    phase: '阶段四 · 自主运行',
    path: '/09/',
    status: 'planned',
    available: false,
  },
  {
    id: '10',
    title: '子智能体与多智能体',
    summary: 'Subagent 委派｜多智能体模式｜通信与冲突',
    phase: '阶段四 · 自主运行',
    path: '/10/',
    status: 'planned',
    available: false,
  },
  {
    id: '11',
    title: 'Harness Engineering + PI/Hermes 架构案例',
    summary: 'Harness 组成｜PI 极简 vs Hermes 学习型',
    phase: '阶段五 · 工程化与自进化',
    path: '/11/',
    status: 'planned',
    available: false,
  },
  {
    id: '12',
    title: 'Loop Engineering（综合提升）',
    summary: '外层循环｜Long Horizon｜Self-Evolve｜AI for AI',
    phase: '阶段五 · 工程化与自进化',
    path: '/12/',
    status: 'planned',
    available: false,
  },
];

// Phase names are not declared here on purpose. They are lifted out of the
// lessons' own `phase` field and ordered by the numeral each name starts with,
// so a phase heading can never disagree with the lessons filed under it, and a
// lesson that moves phase cannot leave a stale duplicate heading behind.
//
// The ordinal is parsed from the leading 「阶段N」 token. It is the one place
// the layout reads lesson text, and it throws rather than defaulting: a
// silently misordered outline is worse than a failed build.
const CN_DIGITS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

const phaseOrder = (phase) => {
  const m = /^阶段([一二三四五六七八九])/.exec(phase);
  if (!m) throw new Error(`phase name carries no 阶段N ordinal: "${phase}"`);
  return CN_DIGITS[m[1]];
};

export const PHASES = [...new Set(LESSONS.map((l) => l.phase))]
  .sort((a, b) => phaseOrder(a) - phaseOrder(b))
  .map((name) => ({
    name,
    lessons: LESSONS.filter((l) => l.phase === name),
  }));

// Headline counts, derived rather than typed, so the summary line can never
// drift from the list below it.
export const COURSE_STATS = {
  lessons: LESSONS.length,
  available: LESSONS.filter((l) => l.available).length,
  planned: LESSONS.filter((l) => !l.available).length,
  slides: LESSONS.reduce((sum, l) => sum + (l.slides ?? 0), 0),
};

// The English page is a pointer, not a translation. These are the words this
// site wrote about the course's language coverage; the course title, subtitle,
// description, lesson titles and lesson summaries stay in Chinese at the
// source and are never machine-translated here.
export const COURSES_EN_POINTER = {
  courseUrlLabel: 'llm.lionpilot.tech',
  body: [
    'The course I teach, 大模型与自然语言处理 (Large Language Models and Natural Language Processing), is currently published in Chinese only. The full description, the five-stage structure and all twelve lesson summaries live on the Chinese page of this site.',
    'I have deliberately not machine-translated them. An unreviewed translation drifts from the terminology the course decks actually use, and a syllabus that quietly disagrees with the material students read is worse than one that is honestly monolingual.',
    'The lesson decks themselves are hosted separately and are password-protected, so they are neither reproduced nor linked from here.',
  ],
  zhLinkLabel: 'Read the course page in Chinese',
};
