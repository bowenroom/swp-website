# 品牌素材 / Brand assets

首页 masthead（片头 topbar）用到的三个素材，以及它们的来源与处理方式。
引擎侧的通用字段是 `brand.mark` / `brand.suffix` / `brand.affiliations`，
数据在 `src/content/hero.js` 的 `HERO[lang].brand`，文件在 `public/brand/`。

## 东南大学 / Southeast University

- 落地文件：`public/brand/seu-logo.svg`（51 KB）
- 原始来源：
  `~/01.document/01.basicInfo/09.SEU-Logo-master/东南大学校徽/原配色.svg`
  （Adobe Illustrator 17 导出的官方 VI 源文件，`viewBox="0 0 1000 1000"`）
- 处理：**未修改**，按原样复制。
- 选 SVG 而非 PNG：同目录下另有 3372×3372 的 `原配色.png`（1.1 MB），
  而 masthead 里实际只渲染到约 26 px。矢量在任意 DPR 下都不糊，且省掉一个
  数量级���的请求。

## 江苏师范大学 / Jiangsu Normal University

- 落地文件：`public/brand/jsnu-logo.png`（74 KB，256×256 RGBA）
- 原始来源：
  `~/01.document/01.basicInfo/08.JSNU_logo/校标、校名/江苏师范大学标志.png`
  （1506×1500，自带 alpha 通道，四角 alpha=0）
- 处理：**按 alpha 通道裁掉 44px 空白边**（bbox `(44,41,1462,1458)`）后缩放到
  256×256。原始图 464 KB，而显示尺寸约 26 px，缩小 25 倍后反而更清晰。
- 注意：这个校徽的**白色圆盘和四个白色角是图形本身的一部分**，不是背景。
  在非白色的底色上会看到白色块，但把它抠成透明会破坏校徽的正式构成，
  所以保留原样。若以后要放在深色底上，请改用官方白色版
  （源目录另有 `校标-白色校名.png` / `白色.png`）。

## 小狮子头像 / Lion pilot avatar

- 落地文件：`public/brand/lion-avatar.png`（35 KB，160×160 RGBA）
- 生成方式：LionPilot 私有端点 `gpt-image-2.5-sunburst`（高质量档），
  经 `lionpilot-skills/skills/visuals/gptimage` 生成。密钥不写入仓库。
- 处理：原图 1254×1254 居中裁方 → 缩放到 160×160 → 加圆形 alpha 遮罩。
- 风格说明：**黏土 3D**，不是全站的水彩象牙纸。这是与片头视频同一视觉层级的
  元素（`CONTEXT.md` 规定黏土只属于片头），放在内容区的水彩插画里会突兀。
- 底色是深墨蓝，恰好落在 Kami 的 `--brand: #1B365D` 附近，
  因此头像在暖奶油底上有一个同色系的圆形，不需要额外的描边或阴影。

## 校验

```bash
ASTRO_TELEMETRY_DISABLED=1 npx astro build
node test/hero-engine.test.mjs
```

构建产物里 `dist/brand/` 应有三个文件，且 `dist/index.html` 与
`dist/en/index.html` 都要引用 `/brand/` 下的三个路径（数据在两棵语言树里各存一份，
漏改一边就会只在一半页面上出现校徽）。

## 响应式

引擎里有两条断点，都是「先丢文字、保留 logo」：

- `max-width:1120px and min-width:861px` — 桌面窄窗，nav 还在，行内放不下两所学校的全名
- `max-width:860px` — 与引擎既有的移动端断点一致

logo 本身始终保留：访客靠图形认学校，文字只是补充。
