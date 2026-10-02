// 近期动态 / Recent updates.
//
// A hand-maintained file, not a CMS (Q20: 静态数据). The old site kept these as
// <li> elements inside index.qmd; they are data here so both languages render
// from one source and the build can check the two stay in step.
//
// DATES ARE CORRECTED, NOT COPIED. The old ticker dated five different papers
// all 2024.2.22 because they were grouped by thumbnail rather than by when the
// work actually shipped. Every date below is the publication date backed by a
// volume/issue in the old site's rendered papers page:
//   IEEE Sensors Journal 24(7), 1 Apr 2024 · TGRS 61, 6 Dec 2023
//   J. Energy Storage 57, 1 Jan 2023 · 55, Nov 2022 · 52, 15 Aug 2022
//   Remote Sensing 14(18), 12 Sep 2022 · IEEE GRSL 19, 2022
// We use publication date throughout and never invent an acceptance date.
//
// PARTIAL DATES ARE PARTIAL ON PURPOSE. The evidence for the Student-T filter
// paper and the GRSL paper fixes a month and a year respectively, not a day. A
// date string is therefore only as precise as its source: "2022-11" and
// "2022" are valid, and padding them to the 1st would be a fabricated date
// wearing a precise costume. The renderer formats whatever precision exists.

// kind drives the label and the accent the entry gets in the rail. Keeping the
// vocabulary this small is what lets the list scan: four kinds, four treatments.
//
// `short` is the headline the rail shows next to the date. It is a COMPRESSION
// of the same sentence, never a new claim: the entry's own `zh`/`en` text stays
// the authority, and `short` is what a 300px card can hold on one line.
//
// `art` is the image the hover preview card shows, and it is a deliberate
// two-source split rather than "whatever image we happen to have":
//
//   - paper entries reuse the paper's own figure, downscaled into
//     /news/preview/ at 640px wide (35-80 KB each). The figure IS the paper's
//     method, so the preview shows what the citation is actually about instead
//     of a generic stock illustration.
//   - the personal entries (advisor / phd / family) have no figure to reuse, so
//     they get a generated watercolor in the site-wide illustration style, kept
//     beside them in /news/. Same palette, same paper ground, so a hover never
//     looks like it came from somewhere else on the site.
export const KINDS = {
  paper: { zh: '论文', en: 'Paper' },
  milestone: { zh: '里程碑', en: 'Milestone' },
  thanks: { zh: '致谢', en: 'Thanks' },
  family: { zh: '家庭', en: 'Family' },
};

// Newest first. The order is the design: a visitor reads the list top-down, so
// recency is the only ordering that needs no sort control and no explanation.
const UPDATES = [
  {
    id: 'advisor-2024',
    date: '2024-06-08',
    kind: 'thanks',
    short: { zh: '林教授致谢', en: 'Prof. Lin' },
    art: '/news/advisor-thanks.jpg',
    zh: '很荣幸与林教授交流，感谢他的指导。',
    en: 'A great honor to meet Prof. Lin — thank you for the guidance.',
  },
  {
    id: 'isj-2024',
    date: '2024-04-01',
    kind: 'paper',
    short: { zh: '雾天地表分类', en: 'Fog land cover' },
    art: '/news/preview/isj-2024-snr-framework.jpg',
    href: 'https://doi.org/10.1109/JSEN.2024.3364150',
    venue: 'IEEE Sensors Journal',
    zh: '《雾天场景下鲁棒地表覆盖分类的多模态表示学习》发表于 IEEE Sensors Journal。',
    en: 'Learning Rich Multimodal Representation for Robust Land Cover Classification in Fog, in IEEE Sensors Journal.',
  },
  {
    id: 'phd-2024',
    date: '2024-02-22',
    kind: 'milestone',
    short: { zh: '东南大学博士', en: 'Ph.D. at SEU' },
    art: '/news/phd-seu.jpg',
    zh: '于东南大学获得博士学位，衷心感谢秦老师的指导，以及求学期间给予帮助的师长、同学与家人。',
    en: 'Received my Ph.D. from Southeast University. Grateful to Prof. Qin for the guidance, and to the teachers, classmates and family who helped over these years.',
  },
  {
    id: 'tgrs-2023',
    date: '2023-12-06',
    kind: 'paper',
    short: { zh: '雾天表示融合', en: 'Fog fusion' },
    art: '/news/preview/tgrs-2023-fusion-network.jpg',
    href: 'https://doi.org/10.1109/TGRS.2023.3280158',
    venue: 'IEEE TGRS',
    zh: '《雾天条件下鲁棒地表覆盖分类的语义表示融合网络》发表于 IEEE Transactions on Geoscience and Remote Sensing。',
    en: 'Semantic Representation Fusion-Based Network for Robust Land Cover Classification in Foggy Conditions, in IEEE Transactions on Geoscience and Remote Sensing.',
  },
  {
    id: 'spring-2023',
    date: '2023-02-28',
    kind: 'family',
    short: { zh: '家庭新成员', en: 'New arrival' },
    art: '/news/family-spring.jpg',
    zh: '春天来了，也迎来了家庭新成员。感谢妻子，也感谢父母的照顾。',
    en: 'Spring has arrived in our family, along with a new member. Thank you to my wife, and to my parents for their care.',
  },
  {
    id: 'jes-flyback-2023',
    date: '2023-01-01',
    kind: 'paper',
    short: { zh: '电池荷电均衡', en: 'Battery SoC' },
    art: '/news/preview/jes-2023-balance-circuit.jpg',
    href: 'https://doi.org/10.1016/j.est.2022.106183',
    venue: 'Journal of Energy Storage',
    zh: '《基于双可控反激变换器的电池包主动荷电状态均衡研究》发表于 Journal of Energy Storage。',
    en: 'Research on Active State of Charge Balance of Battery Pack Based on Two Controllable Flyback Converters, in Journal of Energy Storage.',
  },
  {
    id: 'jes-filter-2022',
    date: '2022-11',
    kind: 'paper',
    short: { zh: '离群荷电估计', en: 'Outlier SoC' },
    art: '/news/preview/jes-2022-tfilter-pipeline.jpg',
    href: 'https://doi.org/10.1016/j.est.2022.105825',
    venue: 'Journal of Energy Storage',
    zh: '《含非忽略离群观测的锂电池荷电状态估计：基于 Student-t 滤波》发表于 Journal of Energy Storage。',
    en: 'State of Charge Estimation of Lithium-Ion Batteries with Non-Negligible Outlier Observations Based on Student\'s-T Filter, in Journal of Energy Storage.',
  },
  {
    id: 'rs-segmentation-2022',
    date: '2022-09-12',
    kind: 'paper',
    short: { zh: '雾天语义分割', en: 'Fog labels' },
    art: '/news/preview/rs-2022-mrfm-framework.jpg',
    href: 'https://doi.org/10.3390/rs14184551',
    venue: 'Remote Sensing',
    zh: '《面向雾天地表覆盖的鲁棒语义分割研究》发表于 Remote Sensing。',
    en: 'Towards Robust Semantic Segmentation of Land Covers in Foggy Conditions, in Remote Sensing.',
  },
  {
    id: 'jes-vb-2022',
    date: '2022-08-15',
    kind: 'paper',
    short: { zh: '噪声下荷电估计', en: 'Noisy SoC' },
    art: '/news/preview/jes-2022b-vbe-error-curves.jpg',
    href: 'https://doi.org/10.1016/j.est.2022.104916',
    venue: 'Journal of Energy Storage',
    zh: '《时变噪声下锂电池荷电状态的变分贝叶斯估计》发表于 Journal of Energy Storage。',
    en: 'State of Charge Estimation of Lithium-Ion Battery under Time-Varying Noise Based on Variational Bayesian Estimation Methods, in Journal of Energy Storage.',
  },
  {
    id: 'grsl-2022',
    date: '2022',
    kind: 'paper',
    short: { zh: '鲁棒地表分类', en: 'Land cover' },
    art: '/news/preview/grsl-2022-fog-challenges.jpg',
    href: 'https://doi.org/10.1109/LGRS.2022.3187779',
    venue: 'IEEE GRSL',
    zh: '《雾天地表覆盖分类：迈向鲁棒模型》发表于 IEEE Geoscience and Remote Sensing Letters。',
    en: 'Land Cover Classification in Foggy Conditions: Toward Robust Models, in IEEE Geoscience and Remote Sensing Letters.',
  },
];

export const newsCount = UPDATES.length;

// The English switch must not be able to ship a half-translated list the way a
// hand-written <li> could, so a missing translation throws at build time the
// same way pageCopy and navLabel do.
export const newsFor = (lang) => {
  if (lang !== 'zh' && lang !== 'en') throw new Error('unknown language: ' + lang);
  return UPDATES.map((u) => {
    if (!u[lang]) throw new Error(`missing ${lang} text for news item ${u.id}`);
    if (!u.short || !u.short[lang]) throw new Error(`missing short.${lang} for news item ${u.id}`);
    if (!KINDS[u.kind]) throw new Error(`unknown kind "${u.kind}" on ${u.id}`);
    if (!u.art) throw new Error(`missing art for news item ${u.id}`);
    return { ...u, text: u[lang], kindLabel: KINDS[u.kind][lang] };
  });
};
