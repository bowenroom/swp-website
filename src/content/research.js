// 研究方向 / Research directions — the right-hand panel of the homepage's first
// screen, laid out as a directory tree because that is how the reference design
// reads: a static panel that says what the work is organised into, next to a
// left-hand column that says what happened most recently. One is a filing cabinet,
// one is a log, and the pairing only works if neither pretends to be the other.
//
// The tree notation is deliberate rather than decorative: 师威鹏's work really is
// two application domains (无人机巡检, 无人驾驶) standing on one shared method
// (多模态视觉语言大模型 + 多智能体协同决策), and an indented tree states that
// relationship in a way a flat list of tags cannot.

export const RESEARCH = {
  zh: {
    root: '研究方向',
    // The accent word is rendered in brand colour by the renderer, so only the
    // token to emphasise is marked, never a colour value here.
    groups: [
      {
        id: 'domain',
        label: '应用领域',
        children: [
          { id: 'uav', label: '无人机智能巡检' },
          { id: 'driving', label: '无人驾驶与辅助驾驶' },
        ],
      },
      {
        id: 'method',
        label: '方法底座',
        children: [
          { id: 'vlm', label: '多模态视觉语言大模型' },
          { id: 'agents', label: '多智能体协同与决策' },
          { id: 'emergency', label: '道路应急协同决策' },
        ],
      },
    ],
  },
  en: {
    root: 'Research',
    groups: [
      {
        id: 'domain',
        label: 'Domains',
        children: [
          { id: 'uav', label: 'Intelligent UAV inspection' },
          { id: 'driving', label: 'Autonomous & assisted driving' },
        ],
      },
      {
        id: 'method',
        label: 'Method',
        children: [
          { id: 'vlm', label: 'Vision-language models' },
          { id: 'agents', label: 'Multi-agent decision' },
          { id: 'emergency', label: 'Road-emergency response' },
        ],
      },
    ],
  },
};

// Same contract as newsFor: a missing translation must fail the build rather than
// ship a half-Chinese panel to an English reader.
export const researchFor = (lang) => {
  if (lang !== 'zh' && lang !== 'en') throw new Error('unknown language: ' + lang);
  const data = RESEARCH[lang];
  for (const g of data.groups) {
    if (!g.label) throw new Error(`missing ${lang} label for research group ${g.id}`);
    for (const c of g.children || []) {
      if (!c.label) throw new Error(`missing ${lang} label for research item ${g.id}/${c.id}`);
    }
  }
  return data;
};
