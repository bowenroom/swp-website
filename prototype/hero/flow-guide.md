# Google Flow 操作指南（针对本项目）

入口：https://labs.google/fx/tools/flow

## 我们在 Flow 里用哪个模式

Flow 有好几种视频生成模式，本项目**只用一个**：

| 模式 | 用不用 | 为什么 |
|---|---|---|
| **Frames to Video（首帧模式）** | ✅ 用这个 | 只上传一张首帧，模型在这个固定构图内生成相机运动 |
| Frames to Video（首+尾帧） | ❌ 不用 | 我们的四张图是四个不同构图，插值会导致整座岛 morph 变形 |
| Ingredients to Video | ❌ 不用 | 用于跨镜头保持角色/地点一致性，我们四幕各自独立 |
| Scenebuilder | ❌ 不用 | 用于把多个片段拼成故事板并延长，我们后期用 ffmpeg 拼更可控 |
| Text to Video | ❌ 不用 | 我们已经有精心画好的构图图了 |

**关键**：Frames to Video 模式里，尾帧是**可选的**。只放首帧、不放尾帧，就是「让这一帧动起来」，正是我们要的。

## 第一次进入

1. 浏览器打开 https://labs.google/fx/tools/flow
2. 用你的 Google 账号登录（Gemini Pro 订阅的账号）
3. 首次进入会要求同意条款，勾选继续
4. 界面左上角点 **New project**，项目名填 `swp-hero`
5. 顶部工具栏会让你选当前要创建的东西 —— 选 **Video**

## 生成第 1 幕（完整走一遍，后 3 幕同理）

### 步骤 1 — 选模型

在提示词输入框附近找到模型选择器（显示当前模型名的地方），点开：

- 优先选 **Veo 3.1**（质量最好）
- 如果 Veo 3.1 不可用或额度不够，选列表里的其他 Veo 版本
- **不要**选 Imagen 或 Imagen Video 那些图像模型，它们不做视频

### 步骤 2 — 选模式

在模型选择器里选 **Frames** 或 **Frames to Video**。

选错的话，界面里不会出现 `+ Add start frame` 的上传框 —— **看到 start frame 框就说明选对了**。

### 步骤 3 — 上传首帧

- 点 `+ Add start frame`
- 弹出文件选择框，选 `archive/hero-v1-flow/scenes/scene-01-road-valley.png`
  （已归档的第一版素材；当前线上用的是 `prototype/hero/assets/vid/` 里由
  rb.coolhs.com `tail_frame` 重做的 4 段）
- **只放这一张。尾帧 `+ Add end frame` 留空。**

### 步骤 4 — 填参数

| 参数 | 选什么 |
|---|---|
| Aspect ratio | **16:9** |
| Duration | **5s**（没有 5s 就选最短的，通常 4s 或 8s） |
| Number of videos | **2 或 4**（多生成几条备选，事后挑） |
| Resolution | 最高档（1080p） |

### 步骤 5 — 填提示词

把 [video-prompts.md](video-prompts.md) 里第 1 幕的那段代码块**完整复制**粘贴进提示词框。

### 步骤 6 — 生成

点 **Generate**。等 1–3 分钟。

### 步骤 7 — 下载

生成完成后：

- 点视频预览 → 右上角 **⋮** 或 **Download**
- 如果生成了多条，先在预览里看一遍，挑最稳的那条再下载
- 下载后改名 `scene-01.mp4`

## 后 3 幕

重复步骤 1–7，每次只换两样东西：

| 幕 | 上传的首帧 | 提示词 |
|---|---|---|
| 2 | `scene-02-sensing.png` | video-prompts.md 第 2 幕代码块 |
| 3 | `scene-03-fusion.png` | video-prompts.md 第 3 幕代码块 |
| 4 | `scene-04-decision.png` | video-prompts.md 第 4 幕代码块 |

**每幕都用新对话 / 新生成，不要在同一轮里接着改。** 视频模型在同一个上下文里连续生成会逐渐漂移，构图会脱离你画好的图。

## 文件放哪

4 个 mp4 放到：

```
archive/hero-v1-flow/video/
├── scene-01.mp4
├── scene-02.mp4
├── scene-03.mp4
└── scene-04.mp4
```

目录不存在的话自己建一个。

## 常见问题

**看不到 `+ Add start frame` 框**
模式选错了。回步骤 2 确认选的是 Frames / Frames to Video。

**生成时报额度/权限错误**
Flow 的额度跟 Gemini Pro 订阅是分开的，可能需要单独开通或等重置。截个图给我，我帮你判断。

**没有 5 秒选项**
选最短的那个，我后期用 ffmpeg 变速补到 5 秒。4 幕总长不对的话我在拼接时统一调整。

**物体在动画中变形了**
不要重写整段提示词。**只在 CONSTRAINTS 那段末尾追加一句**：
`every object keeps its exact original shape, size and position, nothing morphs or warps`
其余原样不动，重新生成。

**画面在抖**
在 CAMERA 那段里追加：`the camera moves smoothly with no handheld shake and no vibration`

**两幕之间切换生硬**
这说明需要首尾帧模式。告诉我第几幕到第几幕，我专门画一张衔接构图给你当尾帧，重做那一段。

## 提示词原文在哪

全部 4 段提示词在 [video-prompts.md](video-prompts.md)，直接复制粘贴。
