// The blog's single source of truth. One entry per post, one body per
// language, so adding a post never means writing a second content file and a
// language switch can never point at a translation that does not exist.
//
// Bodies live in src/content/posts/<slug>.<lang>.md and are imported by the
// dynamic route; this file owns only the metadata the index and the archive
// need. Every field here is either verified against the legacy notebook or
// explicitly marked as editorial.

// The 16 posts that actually exist on the legacy site. `15.slicing` is absent
// because its directory is empty in both the source and _site; `welcome`,
// `test` and `post-with-code` are Quarto scaffolding and never shipped.
export const posts = [
  {
    slug: 'torch-unfold',
    cover: {
      zh: { src: '/blogs/covers/torch-unfold.png', alt: '用 unfold 与 fold 手工搭滑动窗口：水彩技术插画，一张连续风景被滑动窗口切分，再重新拼回原图', width: 1672, height: 941 },
      en: { src: '/blogs/covers/torch-unfold.png', alt: 'Building a sliding window by hand: watercolor technical illustration of one continuous landscape cut into patches and reassembled', width: 1672, height: 941 },
    },
    legacy: '01.torch-unfold',
    date: '2020-06-01',
    year: 2020,
    featured: true,
    group: 'a',
    images: 13,
    title: { zh: '用 unfold 与 fold 手工搭滑动窗口', en: 'Building a Sliding Window with unfold and fold' },
    summary: {
      zh: '不借助 unfold 之后的 magic，直接用 tensor.unfold 与 tensor.fold 手动构造滑动窗口，并从零重建原图。',
      en: 'Constructing a sliding window by hand with tensor.unfold and tensor.fold, and rebuilding the original image from the extracted patches.',
    },
    tags: { zh: ['PyTorch', 'Tensor'], en: ['PyTorch', 'Tensor'] },
  },
  {
    slug: 'hrnet',
    cover: {
      zh: { src: '/blogs/covers/hrnet.png', alt: '读懂 HRNet 的代码：水彩技术插画，多条不同分辨率的并行分支在保持清晰的同时互相交换信息', width: 1672, height: 941 },
      en: { src: '/blogs/covers/hrnet.png', alt: 'Understanding HRNet, with code: watercolor technical illustration of parallel multi-resolution streams exchanging information', width: 1672, height: 941 },
    },
    legacy: '02.hrnet',
    date: '2020-08-03',
    year: 2020,
    featured: false,
    group: 'c',
    images: 0,
    title: { zh: '读懂 HRNet 的代码', en: 'Understanding HRNet, with Code' },
    summary: {
      zh: '沿着 HRNet + OCR 的实现逐段读代码：base part、HighResolution Module 与 OCR head 各自在解决什么问题。',
      en: 'A code-level reading of HRNet + OCR: what the base part, the HighResolution Module and the OCR head each solve.',
    },
    tags: { zh: ['PyTorch', '语义分割', 'HRNet'], en: ['PyTorch', 'semantic segmentation', 'HRNet'] },
  },
  {
    slug: 'transformer',
    cover: {
      zh: { src: '/blogs/covers/transformer.png', alt: 'Self-Attention 方法：水彩技术插画，画面中每个元素都向远处与近处的其他元素投出带权重的连线', width: 1672, height: 941 },
      en: { src: '/blogs/covers/transformer.png', alt: 'The Self-Attention Method: watercolor technical illustration where every element casts weighted lines toward every other', width: 1672, height: 941 },
    },
    legacy: '03.transformer',
    date: '2021-01-10',
    year: 2021,
    featured: false,
    group: 'b',
    images: 1,
    title: { zh: 'Self-Attention 方法', en: 'The Self-Attention Method' },
    summary: {
      zh: '从 self-attention 的定义出发，写出注意力权重、QKV 投影与多头切分，并用真实输出观察注意力分布。',
      en: 'Starting from the definition of self-attention: attention weights, QKV projections and multi-head splitting, checked against real outputs.',
    },
    tags: { zh: ['Transformer', '注意力机制'], en: ['Transformer', 'attention'] },
  },
  {
    slug: 'pytorch-basics',
    cover: {
      zh: { src: '/blogs/covers/pytorch-basics.png', alt: 'PyTorch 基础：map function 与 lazy generator，水彩技术插画，延迟求值的工作按顺序逐个实现', width: 1672, height: 941 },
      en: { src: '/blogs/covers/pytorch-basics.png', alt: 'PyTorch Basics: map functions and lazy generators, watercolor illustration of deferred work realized step by step', width: 1672, height: 941 },
    },
    legacy: '04.pytorch-basics',
    date: '2021-01-17',
    year: 2021,
    featured: false,
    group: 'a',
    images: 11,
    title: { zh: 'PyTorch 基础：map function 与 lazy generator', en: 'PyTorch Basics: map Functions and Lazy Generators' },
    summary: {
      zh: '把 PyTorch 里最常用的类型转换与 map 风格函数写一遍，顺手理清 lazy generator 的求值时机。',
      en: 'A walk through the type conversions and map-style functions PyTorch leans on, and when a lazy generator actually evaluates.',
    },
    tags: { zh: ['PyTorch', 'Python'], en: ['PyTorch', 'Python'] },
  },
  {
    slug: 'fastai-dataloaders',
    cover: {
      zh: { src: '/blogs/covers/fastai-dataloaders.png', alt: 'fastai DataLoader 里的辅助函数：水彩技术插画，层层漏斗把大量文件收束成打乱并分好的批次', width: 1672, height: 941 },
      en: { src: '/blogs/covers/fastai-dataloaders.png', alt: 'Helper Functions in the fastai DataLoader: watercolor illustration of a funnel narrowing many files into shuffled batches', width: 1672, height: 941 },
    },
    legacy: '05.fastai-dataloaders',
    date: '2021-01-27',
    year: 2021,
    featured: false,
    group: 'a',
    images: 0,
    title: { zh: 'fastai DataLoader 里的辅助函数', en: 'Helper Functions in the fastai DataLoader' },
    summary: {
      zh: 'fastai 在 DataLoader 之上加的那一层封装：它替你做了什么，以及在什么情况下该退回原生 DataLoader。',
      en: 'The layer fastai adds on top of DataLoader: what it does for you, and when to fall back to the plain thing.',
    },
    tags: { zh: ['fastai', 'DataLoader'], en: ['fastai', 'DataLoader'] },
  },
  {
    slug: 'd3net',
    cover: {
      zh: { src: '/blogs/covers/d3net.png', alt: 'D3Net：去噪网络怎么搭，水彩技术插画，嘈杂的图像与从中恢复的干净信号汇聚到同一答案', width: 1672, height: 941 },
      en: { src: '/blogs/covers/d3net.png', alt: 'D3Net: how the denoising network is built, watercolor illustration of a noisy image and its clean recovered signal converging', width: 1672, height: 941 },
    },
    legacy: '06.d3net',
    date: '2021-12-08',
    year: 2021,
    featured: false,
    group: 'd',
    images: 0,
    title: { zh: 'D3Net：去噪网络怎么搭', en: 'D3Net: How the Denoising Network Is Built' },
    summary: {
      zh: 'D3Net 的去噪分支如何嵌进分割网络，以及为什么去噪监督对遥感小目标是有效的正则。',
      en: 'How D3Net folds a denoising branch into a segmentation network, and why denoising supervision regularizes small remote-sensing objects.',
    },
    tags: { zh: ['去噪', '语义分割', '正则化'], en: ['denoising', 'semantic segmentation', 'regularization'] },
  },
  {
    slug: 'fastai-datatransform',
    cover: {
      zh: { src: '/blogs/covers/fastai-datatransform.png', alt: 'fastai 数据处理与基础变换：水彩技术插画，同一张原图穿过有序变换链并分成训练与验证两条路', width: 1672, height: 941 },
      en: { src: '/blogs/covers/fastai-datatransform.png', alt: 'fastai Data Processing and Basic Transforms: watercolor illustration of one image through a chain that splits for train and validation', width: 1672, height: 941 },
    },
    legacy: '06.fastai-dataTransform',
    date: '2021-01-31',
    year: 2021,
    featured: false,
    group: 'd',
    images: 9,
    title: { zh: 'fastai 数据处理与基础变换', en: 'fastai Data Processing and Basic Transforms' },
    summary: {
      zh: 'fastai 的 Transform 体系：自定义变换怎么写、训练与验证为什么要用不同的变换链。',
      en: 'The fastai Transform system: writing your own, and why train and validation need different chains.',
    },
    tags: { zh: ['fastai', '数据增强'], en: ['fastai', 'augmentation'] },
  },
  {
    slug: 'fastai-datacore',
    cover: {
      zh: { src: '/blogs/covers/fastai-datacore.png', alt: 'fastai DataCore：取数据的核心逻辑，水彩技术插画，归档被索引，一个存储项被找出并取出', width: 1672, height: 941 },
      en: { src: '/blogs/covers/fastai-datacore.png', alt: 'fastai DataCore: watercolor illustration of an archive being indexed and one stored item found and drawn out', width: 1672, height: 941 },
    },
    legacy: '07. fastai-datacore',
    date: '2021-01-31',
    year: 2021,
    featured: false,
    group: 'a',
    images: 0,
    title: { zh: 'fastai Data Core：取数据的核心逻辑', en: 'fastai Data Core: The Logic of Getting Data' },
    summary: {
      zh: 'Data core 是 fastai 取数、索引与批量读取的核心。本篇拆开它的取数函数，说明每个分支在解决什么。',
      en: 'The data core is where fastai fetches, indexes and batches. This post unpacks its getter functions and what each branch solves.',
    },
    tags: { zh: ['fastai', 'DataCore'], en: ['fastai', 'DataCore'] },
  },
  {
    slug: 'data-explore',
    cover: {
      zh: { src: '/blogs/covers/data-explore.png', alt: '图像数据集的探索性分析：水彩技术插画，景观被测量与抽样，分布成形，样本被摊开检视', width: 1672, height: 941 },
      en: { src: '/blogs/covers/data-explore.png', alt: 'Exploratory Data Analysis of Images: watercolor illustration of a landscape surveyed and sampled for close inspection', width: 1672, height: 941 },
    },
    legacy: '08.data-explore',
    date: '2021-03-17',
    year: 2021,
    featured: true,
    group: 'c',
    images: 3,
    title: { zh: '图像数据集的探索性分析', en: 'Exploratory Data Analysis of Images' },
    summary: {
      zh: '拿到一个遥感图像数据集先看什么：类别分布、尺寸分布、标注质量与可视化样本，逐项过一遍。',
      en: 'What to look at first in a remote-sensing image dataset: class balance, size distribution, label quality, and a visual pass over samples.',
    },
    tags: { zh: ['数据集', '探索性分析'], en: ['dataset', 'EDA'] },
  },
  {
    slug: 'mmsegmentation',
    cover: {
      zh: { src: '/blogs/covers/mmsegmentation.png', alt: 'MMSegmentation 实战教程：水彩技术插画，配置在中心把分割流水线从多个模块组装起来', width: 1672, height: 941 },
      en: { src: '/blogs/covers/mmsegmentation.png', alt: 'A Practical MMSegmentation Tutorial: watercolor illustration of a configuration assembling a modular segmentation pipeline', width: 1672, height: 941 },
    },
    legacy: '09.mmsegmentation',
    date: '2021-11-18',
    year: 2021,
    featured: true,
    group: 'c',
    images: 5,
    title: { zh: 'MMSegmentation 实战教程', en: 'A Practical MMSegmentation Tutorial' },
    summary: {
      zh: '从安装到训练到推理，把 MMSegmentation 的配置驱动工作流走一遍：数据集注册、训练配置、权重与推理。',
      en: 'Install through training to inference, following MMSegmentation config-driven workflow: dataset registration, configs, weights and inference.',
    },
    tags: { zh: ['MMSegmentation', 'OpenMMLab', '语义分割'], en: ['MMSegmentation', 'OpenMMLab', 'semantic segmentation'] },
  },
  {
    slug: 'dataset-augmentation',
    cover: {
      zh: { src: '/blogs/covers/dataset-augmentation.png', alt: '数据增强实操：什么时候该增强什么，水彩技术插画，一张原图扇出为多个不同变体', width: 1672, height: 941 },
      en: { src: '/blogs/covers/dataset-augmentation.png', alt: 'Data Augmentation in Practice: watercolor illustration of one original image fanning into many distinct variants', width: 1672, height: 941 },
    },
    legacy: '10. dataset-augmentation',
    date: '2021-11-25',
    year: 2021,
    featured: false,
    group: 'd',
    images: 0,
    title: { zh: '数据增强实操：什么时候该增强什么', en: 'Data Augmentation in Practice: What to Augment, and When' },
    summary: {
      zh: '几何变换、颜色抖动与组合策略在遥感分割上的实际差异，以及那些看起来有效其实有害的增强。',
      en: 'What geometric and photometric augmentation actually changes in remote-sensing segmentation, and which ones look helpful but hurt.',
    },
    tags: { zh: ['数据增强', '遥感'], en: ['augmentation', 'remote sensing'] },
  },
  {
    slug: 'einops',
    cover: {
      zh: { src: '/blogs/covers/einops.png', alt: 'einops：把张量变形写成一句话，水彩技术插画，纠缠的多维团块收束成一条干净可读的行', width: 1672, height: 941 },
      en: { src: '/blogs/covers/einops.png', alt: 'einops: reshaping a tensor in one line, watercolor illustration of a tangled mass resolving into one readable line', width: 1672, height: 941 },
    },
    legacy: '11. einops',
    date: '2021-11-29',
    year: 2021,
    featured: false,
    group: 'b',
    images: 2,
    title: { zh: 'einops：把张量变形写成一句话', en: 'einops: Reshaping a Tensor in One Line' },
    summary: {
      zh: '用 einops 的记法重写 reshape、permute、einsum，让注意力头的切分与合并变成可读的字符串。',
      en: 'Rewriting reshape, permute and einsum in einops notation, so splitting and merging attention heads reads as a sentence.',
    },
    tags: { zh: ['einops', 'Tensor'], en: ['einops', 'Tensor'] },
  },
  {
    slug: 'robustness',
    cover: {
      zh: { src: '/blogs/covers/robustness.png', alt: '走向鲁棒的 Vision Transformer：水彩技术插画，小结构在扰动与不确定中保持稳定', width: 1672, height: 941 },
      en: { src: '/blogs/covers/robustness.png', alt: 'Towards Robust Vision Transformer: watercolor illustration of a small structure holding firm under degrading conditions', width: 1672, height: 941 },
    },
    legacy: '12. robustness',
    date: '2021-11-30',
    year: 2021,
    featured: false,
    group: 'b',
    images: 0,
    title: { zh: '走向鲁棒的 Vision Transformer', en: 'Towards Robust Vision Transformer' },
    summary: {
      zh: '视觉 Transformer 在分布外数据上失效的原因，以及注意力正则、token 重排等补救手段的实际效果。',
      en: 'Why vision transformers break out of distribution, and what attention regularization and token rearrangement actually recover.',
    },
    tags: { zh: ['ViT', '鲁棒性'], en: ['ViT', 'robustness'] },
  },
  {
    slug: 'segformer',
    cover: {
      zh: { src: '/blogs/covers/segformer.png', alt: 'SegFormer 模型笔记：水彩技术插画，层级化编码器逐级变粗，汇入顶部的轻量解码器', width: 1672, height: 941 },
      en: { src: '/blogs/covers/segformer.png', alt: 'Notes on the SegFormer Model: watercolor illustration of a hierarchical encoder rising into a light minimal decoder', width: 1672, height: 941 },
    },
    legacy: '13. segformer',
    date: '2021-12-02',
    year: 2021,
    featured: false,
    group: 'b',
    images: 0,
    title: { zh: 'SegFormer 模型笔记', en: 'Notes on the SegFormer Model' },
    summary: {
      zh: 'SegFormer 的层级化 Transformer 编码器与轻量 MLP 解码头，为什么它对遥感小目标格外友好。',
      en: 'SegFormer hierarchical transformer encoder and its all-MLP decoder, and why it suits small remote-sensing objects.',
    },
    tags: { zh: ['SegFormer', 'Transformer'], en: ['SegFormer', 'Transformer'] },
  },
  {
    slug: 'jldcf',
    cover: {
      zh: { src: '/blogs/covers/jldcf.png', alt: 'JLDCF 数据集导读：水彩技术插画，航拍道路在地形中被逐像素勾勒出来', width: 1672, height: 941 },
      en: { src: '/blogs/covers/jldcf.png', alt: 'A Tour of the JLDCF Dataset: watercolor illustration of an aerial road traced pixel by pixel across terrain', width: 1672, height: 941 },
    },
    legacy: '14. JLDCF',
    date: '2021-12-03',
    year: 2021,
    featured: false,
    group: 'c',
    images: 2,
    title: { zh: 'JLDCF 数据集导读', en: 'A Tour of the JLDCF Dataset' },
    summary: {
      zh: 'JLDCF 的采集方式、类别体系与标注格式，以及它作为遥感道路分割基准的定位。',
      en: 'How JLDCF was collected, its class scheme and label format, and where it sits as a road-segmentation benchmark.',
    },
    tags: { zh: ['数据集', 'JLDCF', '道路分割'], en: ['dataset', 'JLDCF', 'road segmentation'] },
  },
  {
    slug: 'dataset-introduce',
    cover: {
      zh: { src: '/blogs/covers/dataset-introduce.png', alt: 'NJLCC2022 数据集介绍：水彩技术插画，同一片土地在晴空与浓雾两种天气下并置', width: 1672, height: 941 },
      en: { src: '/blogs/covers/dataset-introduce.png', alt: 'Introducing the NJLCC2022 Dataset: watercolor illustration of the same land shown under clear sky and thick fog', width: 1672, height: 941 },
    },
    legacy: '16.dataset-introduce',
    date: '2023-10-18',
    year: 2023,
    featured: false,
    group: 'd',
    images: 0,
    title: { zh: 'NJLCC2022 数据集介绍', en: 'Introducing the NJLCC2022 Dataset' },
    summary: {
      zh: '南京实地采集的雾天与晴空地表覆盖数据集：22 张正射影像、5 类地物，以及它在鲁棒性评测里的用途。',
      en: 'A land-cover dataset collected in Nanjing under fog and clear skies: 22 orthoimages, 5 classes, and its role in robustness evaluation.',
    },
    tags: { zh: ['数据集', '地表覆盖', '鲁棒性'], en: ['dataset', 'land cover', 'robustness'] },
  },
];

export const FEATURED = posts.filter((p) => p.featured);

export const YEARS = [...new Set(posts.map((p) => p.year))].sort((a, b) => b - a);

export const postBySlug = (slug) => posts.find((p) => p.slug === slug);

// Newest first. The array above is written in the legacy site's own order,
// which is neither chronological nor reverse-chronological — fastai-* sits
// between 2021-01-27 and 2021-12-08. Every consumer (the archive, the
// prev/next rail in Post.astro) reads index 0 as "most recent", so the sort
// happens once, here, instead of in three places that can disagree.
posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

// The index needs a date display, the post page needs the exact date, and the
// archive groups by year. Keeping all three off the entry avoids three
// slightly different date formats drifting across the site.
export const formatDate = (iso, lang) => {
  const [y, m, d] = iso.split('-').map(Number);
  if (lang === 'zh') return d ? y + ' 年 ' + m + ' 月 ' + d + ' 日' : m ? y + ' 年 ' + m + ' 月' : y + ' 年';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return d ? months[m - 1] + ' ' + d + ', ' + y : m ? months[m - 1] + ' ' + y : String(y);
};
