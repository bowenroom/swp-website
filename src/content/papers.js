// The three papers the site shows, and only those three (the user confirmed
// "就这三个论文吧" — the old site's other seven stay in the archive).
//
// The IF / JCRQ / 中科院分区 labels are the substantive signal of an academic
// identity, so they are data here and rendered prominently rather than
// weakened into grey metadata. Q1 and 中科院一区 TOP get the solid ink-blue
// badge; everything else gets the hairline badge.
//
// Every DOI here was re-derived from the volume/issue evidence in CONTEXT.md.
// The old site shipped three wrong links (TGRS and GRSL pointing at one URL,
// JES 2023 and Remote Sensing 2022 pointing at another, and GRSL carrying the
// IEEE document id 9787926 instead of 9812620), so a link is never copied
// from the old markup without checking the identifier.

export const PAPERS = [
  {
    id: 'isj-2024',
    year: 2024,
    firstAuthor: true,
    venue: 'IEEE Sensors Journal',
    volume: '24(7)',
    date: '2024-04-01',
    impact: { if: '4.3', jcrq: 'Q1', cas: '二区' },
    doi: 'https://doi.org/10.1109/JSEN.2024.3364150',
    paperHref: 'https://ieeexplore.ieee.org/document/10466234',
    figure: '/papers/figures/isj-2024-snr-framework.png',
    figureCaption: {
      zh: '方法示意图：雾天场景下的 SNR 表征框架。',
      en: 'Method figure: the SNR representation framework for foggy scenes.',
    },
    authors: ['Weipeng Shi', 'Wenhu Qin', 'Zhonghua Yun', 'Chao Wu', 'Tao Zhao', 'Yukun Yang'],
    zh: '《雾天场景下鲁棒地表覆盖分类的多模态表示学习》',
    en: 'Learning Rich Multimodal Representation for Robust Land Cover Classification in Fog',
    abstract: {
      zh: '雾天条件下的地表覆盖分类是多模态遥感中的一个困难场景：雾不仅降低对比度，还同时污染可见光与热红外模态，使单模态模型在两类模态上同时退化。本文提出一个多模态表示学习框架，在统一表示空间中显式建模两类模态的互补性与各自的退化路径，从而在雾天条件下获得更鲁棒的地表覆盖分类结果。',
      en: 'Land cover classification under fog is a hard case in multimodal remote sensing: fog lowers contrast and degrades both the visible and thermal-infrared modalities at once, so a single-modality model fails on both. This work proposes a multimodal representation-learning framework that explicitly models the complementarity of the two modalities and their separate degradation paths in a shared representation space, yielding more robust land cover classification in foggy conditions.',
    },
  },
  {
    id: 'tgrs-2023',
    year: 2023,
    firstAuthor: true,
    venue: 'IEEE Transactions on Geoscience and Remote Sensing',
    volume: '61',
    date: '2023-12-06',
    impact: { if: '8.8', jcrq: 'Q1', cas: '一区TOP' },
    doi: 'https://doi.org/10.1109/TGRS.2023.3280158',
    paperHref: 'https://ieeexplore.ieee.org/document/10136767',
    figure: '/papers/figures/tgrs-2023-fusion-network.png',
    figureCaption: {
      zh: '方法示意图：语义表示融合网络结构。',
      en: 'Method figure: the semantic representation fusion network.',
    },
    authors: ['Weipeng Shi', 'Wenhu Qin', 'Zhonghua Yun', 'Allshine Chen', 'Kai Huang', 'Peng Ping'],
    zh: '《雾天条件下鲁棒地表覆盖分类的语义表示融合网络》',
    en: 'Semantic Representation Fusion-Based Network for Robust Land Cover Classification in Foggy Conditions',
    abstract: {
      zh: '针对现有雾天地表覆盖分类方法中各分支独立编码、融合阶段信息利用不充分的问题，本文提出语义表示融合网络：在多个语义层次上逐步融合不同网络的表示，使浅层的空间细节与深层的语义上下文在融合过程中互相校正，从而提升分类边界的稳定性。',
      en: 'Existing methods for land cover classification in fog encode each branch independently, which underuses information at the fusion stage. This work proposes a semantic representation fusion network that fuses representations from multiple networks progressively across several semantic levels, letting shallow spatial detail and deep semantic context correct each other during fusion and stabilising the class boundaries.',
    },
  },
  {
    id: 'rs-2022',
    year: 2022,
    firstAuthor: true,
    venue: 'Remote Sensing',
    volume: '14(18)',
    date: '2022-09-12',
    impact: { if: '5.6', jcrq: 'Q1', cas: '二区TOP' },
    doi: 'https://doi.org/10.3390/rs14184551',
    paperHref: 'https://www.mdpi.com/2072-4292/14/18/4551',
    figure: '/papers/figures/rs-2022-mrfm-framework.png',
    figureCaption: {
      zh: '方法示意图：MRFM 雾天鲁棒分类框架。',
      en: 'Method figure: the MRFM framework for robust classification in fog.',
    },
    authors: ['Weipeng Shi', 'Wenhu Qin', 'Zhonghua Yun', 'Yukun Yang'],
    zh: '《面向雾天地表覆盖的鲁棒语义分割研究》',
    en: 'Towards Robust Semantic Segmentation of Land Covers in Foggy Conditions',
    abstract: {
      zh: '本文把雾天地表覆盖分类重新表述为鲁棒语义分割问题：不仅要判断像素属于哪一类，还要在能见度下降时保持类别边界的连贯。为此提出多尺度特征融合策略，在不同感受野之间传递上下文，使分割结果在雾造成的大范围弱纹理区域中仍保持结构完整。',
      en: 'This work reframes land cover classification in fog as robust semantic segmentation: the task is not only to label each pixel, but to keep class boundaries coherent when visibility drops. A multi-scale feature fusion strategy propagates context across receptive fields of different sizes, so the segmentation keeps its structure across the large weakly-textured regions fog creates.',
    },
  },
];

// A Q1 paper, or a 中科院一区 TOP paper, gets the solid ink-blue badge. The
// distinction is the point of the badge, so it is derived from the data rather
// than set by hand per entry.
export const isLead = (p) => p.impact.jcrq === 'Q1' || p.impact.cas === '一区TOP';

export const papersFor = (lang) => {
  if (lang !== 'zh' && lang !== 'en') throw new Error('unknown language: ' + lang);
  return PAPERS.map((p) => {
    if (!p[lang]) throw new Error(`missing ${lang} text for paper ${p.id}`);
    if (!p.abstract[lang]) throw new Error(`missing ${lang} abstract for paper ${p.id}`);
    if (!p.figureCaption[lang]) throw new Error(`missing ${lang} figure caption for paper ${p.id}`);
    return { ...p, title: p[lang], abstractText: p.abstract[lang], caption: p.figureCaption[lang] };
  });
};
