// The homepage scroll-film: four scenes that follow one argument rather than
// four unrelated demos. The through-line is the actual research direction --
// inspection drones and assisted driving meet at road-safety response, and
// the reasoning underneath both is a multimodal model coordinating a team of
// agents.
//
// Copy lives here, not in the component, so the Chinese and English versions
// sit side by side and cannot drift. Scene ids map onto the clip filenames in
// public/hero/vid/ and the stills in public/hero/.
export const HERO = {
  zh: {
    // The masthead carries three things, in reading order: the mark, the
    // person, the lab. `mark` replaces the engine's default gradient tile, and
    // `affiliations` renders on the trailing edge. The logo files live in
    // public/brand/ and are the institutions' official artwork, copied
    // unmodified -- see docs/brand-assets.md for provenance.
    brand: {
      name: '师威鹏',
      href: '/',
      mark: '/brand/lion-avatar.png',
      suffix: 'LionPilotLab',
      affiliations: [
        { logo: '/brand/seu-logo.svg', name: '东南大学' },
        { logo: '/brand/jsnu-logo.png', name: '江苏师范大学' },
      ],
    },
    hint: '向下滚动',
    sections: [
      {
        id: 'establish',
        label: '建立',
        eyebrow: '无人机巡检',
        title: '先看清楚，再谈判断',
        body: '道路巡检的第一件事不是分析，是稳定地拿到画面。无人机沿着规划航线飞行，把裂缝、积水、占道这些容易被司机忽略的东西拍回来。',
        tags: ['航线规划', '视觉巡检', '道路安全'],
        accent: '#5b7fa6',
      },
      {
        id: 'road',
        label: '道路',
        eyebrow: '道路应急',
        title: '事故现场，多视角才完整',
        body: '单一摄像头只能看见一个方向。应急响应需要的是绕着现场走一圈：多机位同时覆盖，才能还原发生了什么、接下来该动哪里。',
        tags: ['多视角融合', '应急响应', '现场重建'],
        accent: '#8a6f4e',
      },
      {
        id: 'sensing',
        label: '感知',
        eyebrow: '多模态理解',
        title: '把画面变成能读的结构',
        body: '视觉语言模型在这里接手：它不只标出哪里有裂缝，而是能回答「这处损伤要不要现在处理」。图像、文本、历史工单一起进上下文。',
        tags: ['视觉语言模型', '多模态', '结构化理解'],
        accent: '#4f7d6a',
      },
      {
        id: 'fusion',
        label: '协同',
        eyebrow: '多智能体协同',
        title: '一个智能体做不完这件事',
        body: '检测、评估、调度、复核各是一个智能体。它们共享同一份现场记忆，互相质证，最后收敛成一个可以执行的处置方案。',
        tags: ['多智能体', '任务编排', '协同决策'],
        accent: '#6b5f8a',
      },
      {
        id: 'decision',
        label: '决策',
        eyebrow: '协同决策与辅助驾驶',
        title: '最终要落回一个动作',
        body: '无论是无人机该往哪飞，还是车辆该怎样变道，输出都必须是可执行、可追溯的动作。这条从感知到决策的链路，就是我现在在做的事。',
        tags: ['协同决策', '辅助驾驶', '可追溯'],
        accent: '#a6604e',
        cta: {
          primary: { label: '看论文', href: '/papers/' },
          secondary: { label: '读技术博客', href: '/blogs/' },
        },
      },
    ],
  },
  en: {
    brand: {
      name: 'Weipeng Shi',
      href: '/en/',
      mark: '/brand/lion-avatar.png',
      suffix: 'LionPilotLab',
      affiliations: [
        { logo: '/brand/seu-logo.svg', name: 'Southeast University' },
        { logo: '/brand/jsnu-logo.png', name: 'Jiangsu Normal University' },
      ],
    },
    hint: 'scroll',
    sections: [
      {
        id: 'establish',
        label: 'Establish',
        eyebrow: 'Drone inspection',
        title: 'Look first, judge second',
        body: 'The first job in road inspection is not analysis but reliable capture. A drone flies its planned route and brings back the cracks, standing water and blocked lanes a driver never notices.',
        tags: ['route planning', 'visual inspection', 'road safety'],
        accent: '#5b7fa6',
      },
      {
        id: 'road',
        label: 'Road',
        eyebrow: 'Emergency response',
        title: 'One accident, many viewpoints',
        body: 'A single camera sees a single direction. Response needs the whole circle: overlapping coverage is what turns a scene into a reconstruction of what happened and what to do next.',
        tags: ['multi-view fusion', 'response', 'scene reconstruction'],
        accent: '#8a6f4e',
      },
      {
        id: 'sensing',
        label: 'Sensing',
        eyebrow: 'Multimodal understanding',
        title: 'Turning frames into something readable',
        body: 'This is where the vision-language model takes over. It does not only mark where the crack is; it can answer whether that damage needs handling now. Image, text and repair history enter the same context.',
        tags: ['vision-language model', 'multimodal', 'structured understanding'],
        accent: '#4f7d6a',
      },
      {
        id: 'fusion',
        label: 'Coordination',
        eyebrow: 'Multi-agent collaboration',
        title: 'No single agent finishes this',
        body: 'Detection, assessment, dispatch and review are each an agent. They share one memory of the scene, argue with each other, and converge on a response plan that can actually be carried out.',
        tags: ['multi-agent', 'task orchestration', 'collaborative decision'],
        accent: '#6b5f8a',
      },
      {
        id: 'decision',
        label: 'Decision',
        eyebrow: 'Decision and assisted driving',
        title: 'It has to end in an action',
        body: 'Whether the question is where a drone should fly next or how a vehicle should change lanes, the output must be an executable, traceable action. That path from perception to decision is what I work on.',
        tags: ['collaborative decision', 'assisted driving', 'traceability'],
        accent: '#a6604e',
        cta: {
          primary: { label: 'Read the papers', href: '/en/papers/' },
          secondary: { label: 'Read the blog', href: '/en/blogs/' },
        },
      },
    ],
  },
};
