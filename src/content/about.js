// The About page's copy, split by language, in one file so the two trees
// cannot drift apart.
//
// EVERY FACT HERE IS TRACEABLE. The biography, positions, degrees, advisers
// and reviewing venues come from the old site's index.qmd (the Bio section).
// The research direction is stated the way CONTEXT.md defines it: a causal
// chain, not three parallel topics. The published record is described as what
// it is - robust land-cover classification under adverse conditions - rather
// than being retrofitted into the current framing.

export const ABOUT = {
  zh: {
    // ── identity ──────────────────────────────────────────
    identity: {
      name: '师威鹏',
      latinName: 'Weipeng Shi',
      role: '江苏师范大学 人工智能学院 讲师',
      roleDetail: '电气工程与自动化学院人工智能系（江苏南京）',
      portrait: '/about/original.png',
      portraitAlt: '师威鹏证件照',
    },

    // ── bio ───────────────────────────────────────────────
    bio: [
      {
        h: '我是谁',
        p: [
          '我是师威鹏（Weipeng Shi），江苏师范大学人工智能学院讲师。我的工作围绕一个具体问题展开：当道路、气象或能见度条件变差时，如何让机器仍然看懂现场，并据此做出可执行的判断。',
          '博士毕业于东南大学仪器科学与工程学院，导师是秦文虎教授；此前在河海大学获得硕士学位，导师是孙永辉教授。博士之前，我曾作为研究工程师在国网电力科学研究院工作，做过一段时间的电力设备侧研究——那段经历让我习惯了对现场数据保持怀疑。',
        ],
      },
      {
        h: '研究主线：一条因果链',
        p: [
          '我的研究不是三个并列的关键词，而是一条从问题到手段的因果链。应用场景在最上面，决定了研究要解决什么；研究对象在中间，决定了感知发生在什么物理载体上；技术手段在最下面，决定了用什么方法去理解和决策。',
        ],
      },
    ],

    // ── the causal chain, application -> object -> means ───
    chain: [
      {
        tier: '应用',
        title: '道路安全应急',
        body:
          '要解决的实际问题。交通事故、路面损毁、能见度骤降、道路巡查中发现的事故与隐患，都需要在现场证据有限、时间窗口很短的情况下被识别、定位和处置。',
        note: '场景决定了评价标准：不是平均精度，而是漏检与误报在真实处置流程里各自的后果。',
      },
      {
        tier: '对象',
        title: '无人机与无人驾驶',
        body:
          '感知与执行的物理载体。无人机提供空中视角和灵活调度，无人驾驶提供连续、可复用的道路视角与可执行的底盘控制；两者感知尺度互补，同一套理解与决策逻辑可以在两者之间迁移。',
        note: '载体不同，但对「看不清」的处理方式高度相似——这正是把两者放在一起研究的原因。',
      },
      {
        tier: '手段',
        title: '多模态视觉语言大模型 + 多智能体协同与决策',
        body:
          '支撑层。视觉语言大模型负责多视角、非结构化场景的理解与跨模态融合，把图像、时序与文本证据落到同一个语义空间；多智能体负责在分解出来的子任务上协同、互相校验，并最终收敛为一个决策。',
        note: '这是支撑手段，不是与前两层平级的独立方向——它服务于上面两个层级，而不是取代它们。',
      },
    ],

    // ── adjacent direction, explicitly second-tier ────────
    alsoDoing: {
      h: '也在做的方向',
      items: [
        {
          title: 'L2 级辅助驾驶',
          body:
            '也在做的相关方向。辅助驾驶与主线共享道路场景理解与多模态感知的问题内核，但它面向的是量产车上的可执行边界（行为可预期、责任可归属），评价标准与研究约束都和主线不同，因此不与上面那条因果链并列。',
        },
        {
          title: '视觉与遥感影像理解',
          body:
            '博士阶段的工作底子。我的已发表论文集中在雾等恶劣天气下的地表覆盖分类与语义分割——也就是「看不清的时候地表是什么」这个问题。它训练出的核心能力，正是主线里第一步要用的：在退化输入下保住可靠的场景语义。',
        },
      ],
    },

    // ── published work, honestly framed ───────────────────
    published: {
      h: '已发表的工作',
      lead:
        '正式收录 3 篇（全部为第一作者），覆盖 IEEE Sensors Journal、IEEE TGRS 与 Remote Sensing。论文的共同主题是恶劣条件下地表覆盖的鲁棒分类：雾同时压低对比度并污染不同模态，所以模型不能只在单一模态上做增强就算解决。',
      cta: '查看论文列表',
      ctaHref: '/papers/',
    },

    // ── service ───────────────────────────────────────────
    service: {
      h: '期刊评审',
      body:
        '为 npj Climate and Atmospheric Science、IEEE Transactions on Intelligent Transportation Systems、IEEE Transactions on Industrial Informatics、IEEE Transactions on Industrial Electronics、Artificial Intelligence Review、Knowledge-Based Systems 等期刊审稿。',
    },

    // ── legacy site ───────────────────────────────────────
    legacy: {
      h: '旧站',
      body: '这是我的旧站，由 Quarto 搭建。它仍然在线，但不再更新——文章、论文与新闻的完整正文只在那里保留。本站是新的正式地址。',
      linkLabel: 'weipengshi.quarto.pub（旧站）',
      href: 'https://weipengshi.quarto.pub',
      caution: '旧站地址既不改写也不重定向：已经分享出去的链接，仍然指向它原来的位置。',
    },
  },

  en: {
    identity: {
      name: 'Weipeng Shi',
      latinName: '师威鹏',
      role: 'Lecturer, Department of Artificial Intelligence',
      roleDetail: 'School of Electrical Engineering and Automation, Jiangsu Normal University',
      portrait: '/about/original.png',
      portraitAlt: 'Portrait of Weipeng Shi',
    },

    bio: [
      {
        h: 'Who I am',
        p: [
          'I am Weipeng Shi (师威鹏), a lecturer in the Department of Artificial Intelligence at Jiangsu Normal University. My work starts from one concrete problem: when road, weather or visibility conditions deteriorate, how can a machine still read a scene well enough to act on it.',
          'I received my PhD from the School of Instrument Science and Engineering at Southeast University, advised by Prof. Wenhu Qin, and my master\'s degree from Hohai University, advised by Prof. Yonghui Sun. Before the PhD I worked as a research engineer at the State Grid Electric Power Research Institute, on the power-equipment side — a stretch of work that trained me to stay sceptical of field data.',
        ],
      },
      {
        h: 'The main thread: a causal chain',
        p: [
          'My research is not three parallel keywords but a chain running from problem to method. The application sits at the top and decides what has to be solved; the objects of study sit in the middle and decide where sensing physically happens; the technical means sit underneath and decide how a scene is understood and acted on.',
        ],
      },
    ],

    chain: [
      {
        tier: 'Application',
        title: 'Road safety and emergency response',
        body:
          'The problem being solved. Collisions, pavement damage, sudden drops in visibility, incidents and hazards found during road inspection — each has to be detected, located and handled from limited on-site evidence inside a short window.',
        note: 'The scenario sets the evaluation criteria: not average accuracy, but what a missed detection and a false alarm each cost inside a real response workflow.',
      },
      {
        tier: 'Object of study',
        title: 'UAVs and autonomous driving',
        body:
          'The physical carriers of sensing and actuation. UAVs provide an aerial viewpoint and flexible scheduling; autonomous driving provides a continuous, repeatable road perspective together with a drivable platform. The two see at different scales, and the same understanding and decision logic transfers between them.',
        note: 'Different carriers, but the problem of not being able to see is strikingly similar in both — which is the reason to study them together.',
      },
      {
        tier: 'Means',
        title: 'Multimodal vision-language models and multi-agent coordination',
        body:
          'The supporting layer. Vision-language models handle multi-view, unstructured scene understanding and cross-modal fusion, bringing image, temporal and textual evidence into one semantic space. Multi-agent systems then divide the task, cross-check one another, and converge on a single decision.',
        note: 'This is a means, not a direction at the same level as the two layers above: it serves them rather than competing with them.',
      },
    ],

    alsoDoing: {
      h: 'Adjacent directions',
      items: [
        {
          title: 'Level-2 assisted driving',
          body:
            'A direction I also work on. It shares the same problem core as the main thread — road-scene understanding and multimodal perception — but it is bounded by what can be shipped on a production vehicle: predictable behaviour and attributable responsibility. Those are not the constraints of the main thread, which is why it sits alongside the chain above rather than inside it.',
        },
        {
          title: 'Vision and remote-sensing image understanding',
          body:
            'The foundation my PhD work was built on. My published papers concentrate on robust land-cover classification and semantic segmentation under fog and other adverse conditions — in effect, on answering what the ground surface is when you cannot see it clearly. The capability that builds is precisely the one the main thread needs first: holding scene semantics together under degraded input.',
        },
      ],
    },

    published: {
      h: 'Published work',
      lead:
        'Three papers are listed on this site, all as first author, in IEEE Sensors Journal, IEEE Transactions on Geoscience and Remote Sensing, and Remote Sensing. They share one theme: robust land-cover classification under adverse conditions. Fog lowers contrast and contaminates each modality at once, so enhancing a single modality is not a solution in itself.',
      cta: 'See the paper list',
      ctaHref: '/en/papers/',
    },

    service: {
      h: 'Reviewing',
      body:
        'I review for npj Climate and Atmospheric Science, IEEE Transactions on Intelligent Transportation Systems, IEEE Transactions on Industrial Informatics, IEEE Transactions on Industrial Electronics, Artificial Intelligence Review, and Knowledge-Based Systems.',
    },

    legacy: {
      h: 'The old site',
      body: 'This is my old site, built with Quarto. It is still online but no longer updated — the full text of the posts, papers and news items is kept only there. This site is the current, official address.',
      linkLabel: 'weipengshi.quarto.pub (old site)',
      href: 'https://weipengshi.quarto.pub',
      caution: 'Old URLs are neither rewritten nor redirected: links that have already been shared still resolve to where they always did.',
    },
  },
};

export const aboutCopy = (lang) => {
  const copy = ABOUT[lang];
  if (!copy) throw new Error('no About copy for language "' + lang + '"');
  return copy;
};
