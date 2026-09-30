# swp.lionpilot.tech — 术语表

本文件是**词汇表**，不是规格书、不是待办、不是实现笔记。只记录已经达成共识的词与它们的含义。

## 站点身份

**swp.lionpilot.tech** — 新站的唯一正式域名。部署在 GitHub Pages。旧站 `weipengshi.quarto.pub`
降级为存档，不再更新，但**不关闭**（外链仍需可用）。

**旧站** — 指 `weipengshi.quarto.pub` 及其源目录
`/Volumes/01.MyFiles/01.InProgress/08-agent-working/quartoBlog/publishing`。它是新站的**素材来源**，
不是新站的一部分。

**新站** — 指本项目产出的站点。模块划分为：首页（滚动片头）、Papers、Blogs、Courses、
以及「近期动态」区块。

## 研究方向（首页片头要讲的内容）

Q31 已确认的真实结构，是**一条因果链**，不是三个并列方向：

**道路安全应急** — 应用点，是研究要解决的实际问题。

**无人机 + 无人驾驶** — 感知与执行的物理载体。

**多模态视觉语言大模型 + 多智能体协同与决策** — 手段层。VLM 做多模态理解与融合，
多智能体做协同与决策。它是支撑层，不是与前两者平级的独立方向。

首页片头与方向区**必须**按这条链的层级来表达：应用在最上/最前，手段在底层支撑，
不可把手段抬成平级主题。

**辅助驾驶** — 本人也在做的相关方向，级别低于上述主线，属于「也在做」而非主线。

## 页面职责

**首页片头** — 滚动视频演示。只出现在首页，是一次性的第一印象，**不是**全站导航的一部分。
内容聚焦上述研究方向。

**近期动态** — 站内某个区块展示的近期情况，取代旧站的 `personal-ticker`。不是全站横幅。

**Projects 页面** — 展示用户 GitHub 上的项目。本轮交付**结构**（路由、数据文件、列表渲染、
双语、空态「即将补充」），**内容留空**由用户后期补充。空结构交付、内容后补是已确认的分工，
不是遗漏。

**Courses 页面** — 课程列表。数据来源是已存在的独立课程站 `llm.lionpilot.tech`
（Jiangsu Normal University · NLP Course），课程名为「大模型与自然语言处理」，
一学期 12 次课，分 5 个阶段：把模型调起来（LLM API 与 Prompt、推理效率与 KV Cache）、
会思考会做事（Hermes Agent、ChatGPT Desktop + Codex、Reasoning）、
信息与记忆（Context Engineering、Agentic Memory）、
自主运行（Planning、Skills 与 MCP、子智能体与多智能体）、
工程化与自进化（Harness Engineering、Loop Engineering）。
课程站已有 `course-manifest.json` 作为结构化数据源，新站应复用而非重新录入。

**旧站 Courses** — 指旧站 `teaching/teaching.qmd`，含 NLP（2024-2025-1 校内课）与
Speech Signal Processing 两个条目。NLP 条目的周次表格**全部为空**，是历史遗留的未完成记录。
它与「大模型与自然语言处理」是两门不同的课程，不可混淆。

## 视觉语言

**Kami 视觉语言** — 暖羊皮纸底色 `#f5f4ed`、单一墨蓝强调色 `#1B365D`、衬线字体主导的排版体系。
由 Kami 技能定义。

**Papers / Blogs / Courses 页面** — 使用 Kami 技能制作。设计细节 1:1 复刻 `blog.openviking.ai`。

**期刊分区标注** — Papers 页面每篇论文的 `IF=` / `JCRQ` / 中科院分区标签。**保留并保持醒目**，
不做弱化处理。这是学术身份的实质信号，应与 Kami 的克制排版共存。

**blog.openviking.ai** — 指定的视觉参考站。经查证其 CSS 使用 `--th-bg: #f5f4ed`、
`--th-accent: #1B365D`、`--font-latin-serif` 含 `TsangerJinKai02`，即**该站本身由 Kami 建成**。
因此「1:1 复刻」与「用 Kami 制作」是同一件事，不冲突。

## 内容语言

**中英文切换** — 站点支持中英文一键切换。这是硬需求，不是可选项。

## 配图策略（Q28 / Q29 已确认）

**站点需要大量配图** — 用户明确要求：个人网站要有足够多的图像以吸引注意。

**统一风格提示词** — 所有生成图共用一个提示词骨架，只替换 `[topic]` 槽位：

```
Abstract conceptual illustration of [TOPIC], in the style of minimalist modern tech
product illustration, clean geometric forms and soft abstract shapes, soft muted
blue-gray and cool gray color palette with subtle cyan accents, generous white space,
flat to semi-flat design with gentle gradients, professional and restrained engineering
aesthetic, high clarity, no text, no logos, no people, no photorealism, no neon colors,
no heavy shadows, suitable for technical blog cover illustration, 16:9 aspect ratio
```

**风格已升级为 watercolor 象牙纸**（Q31 确认，全站统一）— 早期测试的"蓝灰扁平科技插画"
风格作废。改用 editorial watercolor technical illustration：暖象牙 archival paper、
muted indigo / dusty blue / desaturated sage / antique gold、charcoal 线稿、纸纹与水彩晕染。
此风格与 Kami 的 `#f5f4ed` 底 + `#1B365D` 强调色天然一致；旧风格反而与 Kami 暖调冲突。
参考实现：`/tmp/swpshots2/imgtest2/agentic-memory.png`（Agentic Memory 群岛隐喻）。

**唯一的例外：首页片头视频**（Q34 确认）— 片头是「世界入口」，用 scroll-world 风格的
**微缩 3D 黏土等距模型**（isometric clay diorama、tilt-shift 移轴、纯色暖奶油底、
圆润黏土小人、暖光长投影）。全站**其余所有配图**（首页方向主图、Papers、Blogs 封面、
Courses、About）一律 watercolor 象牙纸。

这个分层是有意的：片头 = 世界入口（微缩冲击感强），内容区 = 图文并茂（水彩克制）。
两者同属暖象牙色系，不冲突，反而有清晰节奏。**不要把黏土风格扩散到内容区。**

**scroll-world README 视频实测**（用户提供文件，2026-09-28 分析）
`618022131-b08e641e-985b-4bd4-83ff-6750272d0c37.mp4`，1280x648，60fps，59.8 秒。
关键观察：

- **它不是 scroll-scrub 的**，是预渲染的线性连续镜头。相机真的在飞，滚动不驱动时间。
- 5 幕结构各 4–5 秒：茶山农场 → 厨房 → 旗舰店 → 配送街道 → 广场。
- 每幕转场 = 拉出 → 上浮 → 掠过 → 推进，无剪辑。
- 调色板极窄：taro 紫 `#9B7EBD`、cream `#F5EDE0`、caramel `#C88A5A`、
  matcha 绿 `#8FB98A`、plum `#3A2E48`。背景是纯色暖奶油，非纯白。
- 人物是圆润的黏土小人，有手有脚。
- 移轴虚化：焦点在中间带，远近都虚。
- **UI 是贴在视频上的网页层**，不是视频内容：顶部胶囊导航（当前幕高亮+发光点）、
  左侧衬线大标题+说明+标签、右侧竖向进度点。我们要做的是这一层。

**首页片头 4 幕结构**（Q34 确认，6 幕改 4 幕）：

1. **道路全景** — 微缩高速公路跨越山谷，弯道，远处事故，稀疏车流
2. **感知编队** — 3 台小型无人机 + 1 台地面无人车在事故上空/周围编队悬停，扇形感知
3. **融合理解** — 多视角影像在一个中心节点汇聚，形成「共同理解」结构
4. **协同决策 → 恢复通行** — agent 节点网络连线，决策信号发出，路面恢复畅通

这 4 幕正好对应因果链：道路场景 → 分布式感知 → 多模态融合理解 → 多智能体协同决策。

**已知的模型偏差** — 模型会自行补充未被明确禁止的元素。实例：Agentic Memory 图中
帆船上出现了拟人化身影，违反提示词的 `no humanoid robots`。凡涉及"agent / vessel /
vehicle"等可能被拟人化的主体，必须在 prompt 中**显式正面禁止**（如
`unmanned autonomous vessel, no passengers, no figures aboard`），不能只写 `avoid` 段。

**尺寸行为不稳定** — 同一端点同一 `--size` 有时精确生效（1536x1024）、有时返回
1672x941。出图后必须以**实际文件尺寸**为准做校验与裁切，不要假设请求值。
1672x941 恰好是 16:9，可直接用。

**首页方向区 = 一张主图**（Q31 确认），不是三张并列卡片。理由：用户的实际研究结构
是一条因果链而非三个并列方向——

- **应用**：道路安全应急
- **对象**：无人机 + 无人驾驶
- **手段**：多模态视觉语言大模型 + 多智能体协同与决策

把手段和对象抬成与"应用"平级的三张卡是错误的。早期 `CONTEXT.md` 中
"智能化无人机巡检 / 道路应急 / 大模型协同"的三分法已被本条取代。

**Papers 保留真实图** — 论文方法图/结果图是学术可信度的实质来源，不替换。

**Blogs 封面用生成图** — 用户 Q28 修正意见：16 篇博客封面统一用生成图，
理由是风格统一、观感更好、更"高大上"。文章内部配图仍用真实 notebook 输出。

**生图端点** — `https://cli.lionpilot.tech/v1`，model `gpt-image-2.5`。
密钥不写入仓库，只在调用时通过环境变量传入。

**实测行为**（2026-09-28 验证，勿假设）：

- 直连 REST：`POST /v1/images/generations` 返回 `data[0].b64_json`，HTTP 200，约 27s。
- 直连 REST **会忽略 `quality` 与 `size` 参数**：`quality=high` 仍返回 `low`，
  `size=1024x1024` 返回 1254x1254。`n` 也固定为 1。**不要用直连 REST 做正式出图。**
- 官方 CLI（`imagegen/scripts/image_gen.py` + `OPENAI_BASE_URL`）**参数完全生效**：
  `--size 1536x1024 --quality high` 正确产出 1536x1024 PNG，约 20s。**正式出图走这条。**
- CLI 需要 `openai` 包。系统 Python 无此包且受 PEP 668 保护；venv 建在项目目录会因
  外接卷权限失败（`Operation not permitted`）。可用 venv 位于 `/tmp`。

## 技术栈（已确认）

**Astro** — 新站的框架。Astro + MDX，静态输出，构建期生成中英文两棵路由树
（`/` 中文、`/en/` 英文），客户端 JS 尽量少。Kami 的排版令牌直接实现在 Astro 组件里，
不走 Kami 的 PDF/文档流水线。

**部署** — GitHub Pages，域名 `swp.lionpilot.tech`。
旧站 `weipengshi.quarto.pub` 保持在线，作为归档，不再更新。

**适配** — 首版只做桌面版；手机端走静帧降级。

**Pretext** — 接入，但**只取排版测量内核**（`@chenglou/pretext`）：Astro 构建期对中英文字符串
跑溢出校验，用于捕捉中英文长度差异导致的截断。不采用 `designing-course-ppt` 的投影页证据矩阵。
安装失败必须报 `blocked_dependency`，不得用浏览器量测的临时判断冒充通过。

**Papers 数量** — 正式站只展示 3 篇（2024 IEEE Sensors Journal / 2023 IEEE TGRS /
2022 Remote Sensing），用户已确认。旧站 10 篇不进新站。

## 旧站素材盘点

**旧站图片**（已逐张查看）：

- `original.png` — 正式证件照（正装、蓝底）。**保留**，作为 About 页主头像。
- `profile.jpg` — 光绘人像照（夜色山景 + 光线人像）。有个人辨识度，**可保留**，
  适合放在 About 的「个人」小节或近期动态区，不适合当学术主视觉。
- `cartoon.jpg` — 黄色掌机边框里的乐高风头像。偏个人趣味，**归档不发布**。
- `DLAM.png` — 哆啦A梦图标。**归档不发布**。

`profile.jpg` 与 `papers/profile.jpg` 内容相同，`news/` 下是前三张的副本，去重后只保留一份。

**旧博客图片存量**（按已构建站点统计 `<img>` 数量）：
`01.torch-unfold` 15、`04.pytorch-basics` 11、`16.dataset-introduce` 9、
`06.fastai-dataTransform` 9、`03.transformer` 6、`09.mmsegmentation` 5、
`08.data-explore` 3、`14.JLDCF` 3、`12.robustness` 3、`11.einops` 2、
`13.segformer` 1、`07.fastai-datacore` 1。
`02.hrnet`、`05.fastai-dataloaders`、`06.d3net`、`10.dataset-augmentation` 为 0。

旧站远端图片共 29 个唯一 `s2.loli.net` 地址，抽样仍返回 200，可恢复。

**Papers 旧站数据**（`papers/index.qmd`，共 10 条，已核对）：

| 年份 | 期刊 | 一作 | IF / JCRQ / 中科院 |
| --- | --- | --- | --- |
| 2024 | IEEE Sensors Journal | 是 | 4.3 / Q1 / 二区 |
| 2023 | IEEE TGRS | 是 | 8.8 / Q1 / 一区TOP |
| 2023 | Journal of Energy Storage | 否（第3作者） | 8.9 / Q1 / 二区TOP |
| 2022 | Journal of Energy Storage | 否（第3作者） | 8.9 / Q1 / 二区TOP |
| 2022 | Remote Sensing | 是 | 5.6 / Q1 / 二区TOP |
| 2022 | Journal of Energy Storage | 否（第3作者） | 8.9 / Q1 / 二区TOP |
| 2022 | IEEE GRSL | 是 | 5.5 / Q1 / 二区 |
| 2021 | Springer LNCS / CGI 2022 | 否（第2作者） | 无 |
| 2021 | Sensors | 是 | 4.2 / Q2 / 三区 |
| 2021 | Energies | 否（第3作者） | 3.4 / Q2 / 三区 |

10 张配图（`s2.loli.net`）逐一复测，全部返回 200，可全部本地化。
**修正**：这些图**不是期刊封面**，而是论文内部插图（网络结构框图、实验对比图、电路图）。
旧站把它们当封面缩略图使用是误用。新站应按「方法示意图」定位，标注为方法/结果图。
注意：2023 JES 条目的 `[Paper]` 链接与 2022 RS 条目**指向同一个 URL**（`S2352152X22021727`），
新站需按 DOI 重新校正。2022 GRL 与 2023 TGRS 的链接也相同（`10136767`）。

全部 10 个 DOI 已实测可解析：IEEE 4 条 → `ieeexplore.ieee.org/document/{id}`，
Elsevier 3 条 → `linkinghub.elsevier.com/retrieve/pii/{pii}`，MDPI 2 条 403（反爬，
链接本身有效）、Springer 1 条正常。其中 GRSL 的正确 IEEE document id 是 **9812620**
（旧站的 `9787926` 是错的）。

**共同作者与机构** — Papers 页要显示。合作者高频出现：Wenhu Qin、Zhonghua Yun、
Chao Wu、Tao Zhao、Yukun Yang、Allshine Chen、Kai Huang、Peng Ping 等。

**近期动态数据** — 静态维护。站内保存一份 YAML/JSON，手动更新，不做自动拉取。

**精选重写博客** — 由 agent 依图量与主题契合度决定，用户不指定（Q18 / Q25 确认）。

**旧博客可改写** — 16 篇旧博客不是「原文照搬」，而是**素材来源**。允许 agent 在迁移时
更新内容、修正过时表述、重写行文与结构，使其配图、文风、论点密度与新站一致。
不可改的只有两样：技术事实本身（方法名、API 名、代码语义）与真实 notebook 输出图。
**可改**：文字、章节顺序、增删过时小节、补充解释。
这让 Blogs 从「迁移搬运」升级为「重写并升级」，也决定了每篇 blog 要开独立子智能体
（一篇一个 agent）而不是批量套模板。

**旧博客是英文的** — 实测 16 篇原文 CJK 字符数几乎为 0，全部是英文。

**Blogs 中英双语** — 用户 2026-09-29 选定：每篇博客都做**中英两版**，共 32 篇。
- **英文版是主版本**，由旧英文原文重写升级而来。
- **中文版是英文版的忠实翻译**，不是独立重写；标准技术术语（PyTorch、Tensor、KV Cache、
  attention 等）保留英文原词，不强行意译。
- 这与 Courses 的规则**不同**：Courses 明确禁止 agent 机翻课程文案，Blogs 则是用户
  明确授权翻译。两者的边界不要混。

**Blogs 首页结构** — 「精选 + 全部文章归档」两段式（Q25 = B）。不是纯时间流。

**精选区** — 3 篇横向 feature，各配一张真实旧文配图。Q26 已确认定稿：

1. `MMSegmentation for Remote Sensing`（`09.mmsegmentation`，图 `mmseg-semantic.png`）
2. `pytorch unfold：extract patches from image`（`01.torch-unfold`，图 `unfold-river.png`）
3. `Exploratory data analysis of Images`（`08.data-explore`，图 `eda-grid.png`）

选它们的理由：与当前遥感/视觉方向有真实关联、图片可用、且能形成
「PyTorch 基础 → 数据探索 → 遥感分割实践」的阅读弧。**用户已确认，不再改动。**

**归档区** — 按年份折叠，保留日期、标题、图片数量。年份分布：2023 = 1 篇、
2021 = 13 篇、2020 = 2 篇，共 16 篇。不含 `welcome`、`test`、`post-with-code`。

**Blogs 原型** — `prototype/blogs/index.html`。已验证 1280px 与 375px 均零横向溢出，
正文行高 1.6，导航/章节标签的宽字距为 Kami 短标签惯例（沿用 papers 原型的 scoped ignore）。

## 原型验证记录

**Papers 原型** — 10 篇全保留、共同作者显示、合作者论文不折叠、IF/JCRQ/中科院分区醒目，
Q1 与中科院一区 TOP 用墨蓝实底。Q21 认可，Q22 归档。

**Impeccable scoped ignore** — `.impeccable/config.json` 中对 `prototype/papers/index.html`
忽略了 `cream-palette=*`、`tight-leading=*`、`wide-tracking=*`（用户 Q24 确认奶油纸底与
衬线大标题为有意设计）。

## 首页片头 4 幕黏土场景图（已生成，2026-09-28）

提示词与出图同目录（`prototype/hero/scenes/*.txt` / `*.png`），尺寸全部 1672x941（16:9）。

1. `scene-01-road-valley.png` — 道路全景。高速跨越岛屿，隧道/服务区/池塘，远处事故与两架无人机。
2. `scene-02-sensing.png` — 感知编队。3 架同款四旋翼 + 1 台地面无人车，扇形感知锥重叠处变深靛蓝。
   **失败重做记录**：v1 中央机被模型画成固定翼飞机（违反四旋翼约束），已在 prompt 中
   显式加「no fixed-wing / no wings / no tail fins」正面禁止后重生成通过。
3. `scene-03-fusion.png` — 融合理解。四路证据碎片（路面/地形/车辆/天气）汇聚成一枚整体理解瓦片。
4. `scene-04-decision.png` — 协同决策。4 个 agent 节点闭环连线，一道暖光落到路面，车流恢复畅通。

四幕调色板一致（暖奶油底 + 靛蓝/灰蓝/苔绿/赭石），岛屿基座与公路元素复用，可连续推移。
四张均无人物。**待用户逐张确认**。

## 首页片头视频（Flow 生成，2026-09-29）

用户用 Google Flow 的 Frames to Video（只放首帧）模式生成，4 段原始文件：
`prototype/hero/scenes/scene-0X.mp4`，**均为 1920x1080 / 24fps / 4.0s / h264**。
用户自行在提示词里补了 `time:4s`（与 Flow 实际时长一致，保留）。

逐帧检查结果：

- **scene-01 道路全景 ✅** — 缓慢推进，车流在动，岛完整，无变形
- **scene-02 感知编队 ✅** — 环绕运镜，3 架同款四旋翼 + 1 台地面车保持一致，感知锥稳定。**最佳**
- **scene-03 融合理解 ❌ 需重做** — 相机几乎不动（整段同一俯视角），末帧整岛缩到画面底部
  只剩一条绿边、大片空白，融合瓦片过小
- **scene-04 协同决策 ✅** — 拉远升高，agent 节点闭环连线清晰，暖光落路面，车流恢复

**scene-03 失败根因**：原 CAMERA 段同时要求「低位贴近路面 → 高处俯视」，这是 180° 视角
跨越 + tilt 翻转，Veo 在 4s 内做不到，于是退化为「相机完全静止」这个最安全的解。
**修法**：全程锁定同一等距视角，只做纯位移（垂直上升 + 向后拉），明确禁止 rotate/tilt；
STYLE 段追加「构图任何时候必须完整在画面内」。已写入 `video-prompts.md`。

**拼接产物**（3 段版本，临时）：`prototype/hero/video/`
`hero.mp4` 2.8MB / `hero.webm` 2.5MB / `poster.jpg` 247KB，统一 1920x1080 30fps 16s。
scene-03 重做后需重新拼接。总长 16s 短于原计划 20s，可在剪辑阶段补足。

## 首页片头 v2 — scroll-world 黏土世界（2026-09-29，rb.coolhs.com）

上一版 Flow 生成的 4 段被判定「不像 scroll-world」后废弃（保留在
`prototype/hero/scenes/`，不删）。v2 改用 `tail_frame` 首尾帧预设重做，
工作目录 `prototype/hero/scroll-world-v2/`。

**卡密配额** — 初始 10 次，**不必用完**。只做 4 个镜头，剩余次数仅用于重做失败镜头。

**关键帧链** — 5 张关键帧 K0..K4，4 段视频首尾相接：

```
s1 = f(K0 全景岛屿 → K1 道路事故)
s2 = f(K1 → K2 分布式感知)
s3 = f(K2 → K3 多模态融合)
s4 = f(K3 → K4 协同决策)
```

相邻镜头**共享同一张关键帧作为端点**，因此接缝天然帧锁定，4 段只需 4 次生成，
不需要 skill 原本的 N-1 条 connector 夹片。

**接缝实测（SSIM，256x146）** — s1 末帧 vs K1 = **0.978**；s2 末帧 vs K2 = **0.983**。
即模型输出与输入端点近乎同一画面，硬切即可，无需补拍。
s3 末帧 vs s4 首帧 = **0.985**，三处接缝全部帧锁定，不重做、不动剩余额度。

**各段实测** — 统一 1344x768 / 48fps / 7.98s：

- `s1-approach` ✅ 高空全景一路俯冲至事故近景，护栏/河流/车辆/无人机/锥桶俱在，最贴近参考
- `s2-sensing` ✅ 3 架同款四旋翼 + 地面无人车，蓝色感知锥重叠，两车穿过光区
- `s3-fusion` ✅ 道路/车辆/地形/天气证据汇聚成一次融合理解
- `s4-decision` ✅ 4 个智能体协同、信号落向道路、车流恢复

四段统一 1344x768 / 48fps / 383 帧 / 7.98s，已复制到 `prototype/hero/assets/vid/`，资源全部 HTTP 200。

**首页接入** — `prototype/hero/index.html` 用 skill 自带 `scrub-engine.js`，
4 段直接作为 4 个 section 的 `clip`，`connectors` 留空（引擎交叉淡化）。
滚动即 scrub 视频时间，桌面播放、手机走静帧降级（Q7）。
手机降级实现为 `stillOnlyMobile: true` —— 手机完全不拉取视频，只让 `stillMobile`
竖版静帧随滚动交叉淡化。

## 待定（尚未达成共识）

（暂无——第 3 轮访谈 Q1–Q31 已把 news / Courses / Projects / Pretext 接入深度全部定案，
见各条目下方的 2026-09-29 确认记录。后续如新增分歧再登记在此。）
