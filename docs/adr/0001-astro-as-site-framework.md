# ADR 0001 — 用 Astro 作为新站框架

状态：已接受（Q14）

## 背景

旧站是 Quarto 博客（`weipengshi.quarto.pub`），源目录
`/Volumes/01.MyFiles/01.InProgress/08-agent-working/quartoBlog/publishing`。
新站要保留旧站全部素材（10 篇论文、16 篇 notebook 博客、课程、身份图片），
同时新增一个滚动驱动的首页片头，并对齐 `blog.openviking.ai` 的排版语言。

## 决策

采用 **Astro + MDX**，静态输出，部署到 GitHub Pages，域名 `swp.lionpilot.tech`。

- 中英文路由在构建期生成两棵静态树：`/`（中文）与 `/en/`（英文）。
- Papers / Blogs / Courses 通过 Content Collections 管理 Markdown。
- Kami 排版令牌直接实现在 Astro 组件的 CSS 中，不走 Kami 的 PDF/文档流水线。
- 首页滚动序列由自写的 vanilla JS 引擎驱动，作为唯一的主要客户端脚本。
- 首版只做桌面版；手机端使用静帧降级。

## 理由

1. **交互与内容分层**。滚动片头是重交互、一次性内容；Papers / Blogs / Courses
   是以文字为主的静态内容。Astro 默认零 hydration，正好让绝大多数页面不加载 JS，
   只有首页挂载滚动引擎。
2. **双语 SEO**。构建期生成两套 URL，英文页能被独立索引。若改用客户端换文案，
   英文内容对搜索引擎不可见。
3. **1:1 复刻 OpenViking 是自洽的**。该站 CSS 使用 `--th-bg: #f5f4ed`、
   `--th-accent: #1B365D`、含 `TsangerJinKai02` 的 CJK serif 栈，正是 Kami 的令牌。
   在 Astro 里实现 Kami 排版体系，就是复刻该站本身。
4. **零运维**。纯静态产物丢进 GitHub Pages，无服务器、无运行时依赖。

## 代价

- 需要从 Quarto 迁到 Astro：16 篇 `.ipynb` 博客需转成 Astro 可渲染的 Markdown/MDX，
  代码高亮与图表输出要重新接线。
- Kami 技能的 PDF/排版流水线在网页上用不上，只取其设计令牌。

## 备选

- **继续用 Quarto**：内容迁移成本最低，但首页滚动片头需要在 Quarto 模板里塞
  大段自定义 JS 与 CSS，且 Quarto 本身不提供组件化与 MDX 混合，容易失控。
- **Next.js / SvelteKit**：生态更大，但对一个以静态内容为主的站点过度工程化，
  且默认输出需要服务端参与，与 GitHub Pages 纯静态托管不匹配。
