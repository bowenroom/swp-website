# 首页片头 4 幕 · Gemini 图生视频提示词

## 用法（每次一段）

1. 打开 Gemini 网页版 → 新建对话
2. 上传对应的 `scene-0X-*.png`（**只上传这一张**）
3. 粘贴下面该幕的提示词
4. 选「生成视频 / Create video」，比例选 **16:9**，时长选 **5 秒**（没有 5 秒就选最短的）
5. 生成后下载，文件名存成 `scene-0X.mp4`

4 幕全部生成后交给我，我用 ffmpeg 拼接 + 转 webm/mp4 双格式 + 压到 3MB 以内。

## 4 幕之间必须保持一致的锚点

这几条**每段提示词里都重复写了**，因为视频模型每一段都是独立生成的，不共享上下文：

- 暖奶油纯色背景 `#F2EBD9`，无渐变、无环境
- 同一座圆角岛屿基座、同一条公路、同一条护栏
- 同一套配色：靛蓝 `#2E4057` / 灰蓝 `#6B87A3` / 奶油 `#F5EDE0` / 苔绿 `#8FB98A` / 赭石 `#C89B5A`
- 镜头**慢、稳、幅度小**。不要快速摇移、不要变焦冲击
- 物体**不形变**。无人机不变形、不分裂、不消失
- 全程**无人物、无文字、无 logo**

## 镜头衔接表

| 幕 | 起幅 | 落幅 | 衔接下一幕 |
|---|---|---|---|
| 1 道路全景 | 高、远、俯瞰全岛 | 降到中等高度、推向事故点 | 2 从同一高度继续 |
| 2 感知编队 | 中等高度、正对事故 | 环绕事故点半圈 | 3 从上方升起 |
| 3 融合理解 | 低、贴近路面 | 升到高处俯视汇聚点 | 4 从高处继续 |
| 4 协同决策 | 高处俯视 agent 节点 | 拉远升高，全岛入画 | 结束 |

---

## 第 1 幕 · 道路全景

上传：`scene-01-road-valley.png`

```
Animate this image with a slow, steady camera move only. The clay objects themselves must not change shape.

CAMERA: Start high and far away, looking down at the entire miniature island at a three-quarter isometric angle. Over the full five seconds the camera descends gently and glides forward toward the middle of the island, lowering to a medium height and ending closer to the road where the small incident is. The movement is one continuous smooth push-in with a slight downward tilt. No cuts, no sudden moves, no speed ramp.

LIFE IN THE SCENE: The small rounded cars travel slowly along the curving highway, moving at a calm steady pace in both directions. The two small quadcopters hover slowly above the road with a barely perceptible gentle bob. The trees, rocks, pond, tunnel and service area remain completely still.

STYLE MUST NOT CHANGE: keep the soft matte clay 3D render, the tilt-shift miniature look, the warm cream plain background #F2EBD9, and the exact palette of indigo, dusty blue, cream, sage green and warm ochre. The lighting stays soft and diffuse with the same long soft shadows.

CONSTRAINTS: no new objects appear, nothing enters or leaves the frame, no morphing or warping of any object, no text, no letters, no numbers, no logos, no people, no human figures. Keep every car and every tree exactly where it is, only moving along its own path.
```

---

## 第 2 幕 · 感知编队

上传：`scene-02-sensing.png`

```
Animate this image with a slow, steady camera move only. The clay objects themselves must not change shape.

CAMERA: Start at a medium height facing the road incident head-on, at the same height and distance the previous shot ended at. Over the full five seconds the camera glides sideways in a smooth half-orbit around the incident, staying at a constant height, and ends looking at the scene from a slightly different angle. One continuous smooth arc. No cuts, no sudden moves, no zoom punch.

LIFE IN THE SCENE: The three identical rounded quadcopters hover slowly in place with a barely perceptible gentle bob, each staying above its own patch of ground. The soft translucent dusty-blue sensing cones below them stay anchored to the same ground patches and do not rotate or sweep. The small ground vehicle remains stationary on the road with its wide low sensing fan projected over the incident. The stopped car and the two traffic cones stay completely still.

STYLE MUST NOT CHANGE: keep the soft matte clay 3D render, the tilt-shift miniature look, the warm cream plain background #F2EBD9, and the exact palette of indigo, dusty blue, cream, sage green and warm ochre. Lighting stays soft and diffuse with the same long soft shadows.

CONSTRAINTS: no new objects appear, nothing enters or leaves the frame, no morphing or warping, the three quadcopters must stay identical to each other and must not change into any other type of aircraft, no text, no letters, no numbers, no logos, no people, no human figures.
```

---

## 第 3 幕 · 融合理解

上传：`scene-03-fusion.png`

### ⚠️ 2026-09-29 第一次生成失败，必须用下面这个重做版

**失败现象**：相机几乎不动（整段同一个俯视角，没有平移），末帧整座岛缩到画面底部
只剩一条绿边、大片空白，融合瓦片变得很小。

**根因**：原 CAMERA 段同时要求「从**低位贴近路面**」到「**高处俯视**」——这是个 180° 的
视角跨越，还附带仰视→俯视的 tilt 翻转。Veo 在 4 秒内做不到这么大的姿态变化，
于是选了「相机完全不动」这个最安全的解。

**修法**：全程锁定同一个等距视角，**只做纯位移**（垂直上升 + 向后拉），
明确禁止 rotate / tilt。另外在 STYLE 段加一句「构图任何时候都必须完整在画面内」，
防止末帧主体被推出画外。

```
Animate this image with a slow, steady camera move only. time:4s. The clay objects themselves must not change shape.

CAMERA: The camera keeps the exact same three-quarter isometric viewing angle for the entire shot. It does NOT rotate, it does NOT tilt, and it does not swing around the island. It only translates through space. Start with the camera low and close to the island, so the road and the stopped car fill the lower half of the frame and the four fragment streams spread out above them. Over the full four seconds the camera smoothly rises straight up while pulling straight back at the same time, ending in a wide view where the whole island and all four fragment streams sit comfortably inside the frame with generous cream margin around the composition. One continuous smooth vertical dolly combined with a backward dolly. No cuts, no angle change, no rotation, no tilt, no speed ramp, no zoom.

LIFE IN THE SCENE: The four streams of small clay fragments drift very slowly inward along their existing curved paths toward the central tile, as if being gently drawn in. The fragments keep their existing colors and stay on their existing curved paths. The single fused tile at the convergence point stays solid and unchanged, gently rotating at an extremely slow, almost imperceptible rate. Below, the road, the stopped car and the two traffic cones remain completely still.

STYLE MUST NOT CHANGE: keep the soft matte clay 3D render, the tilt-shift miniature look, the warm cream plain background #F2EBD9, and the exact palette of indigo, dusty blue, cream, sage green and warm ochre. The lighting stays soft and diffuse with the same long soft shadows. Keep the entire composition fully inside the frame at every moment — nothing important is allowed to drift to the edge or out of view.

CONSTRAINTS: no new objects appear, nothing enters or leaves the frame, no morphing or warping, the fragments must not turn into screens or user interfaces or holographic panels, no text, no letters, no numbers, no logos, no people, no human figures. The camera must not rotate or tilt at any point. Every object keeps its exact original shape, size and position.
```

---

## 第 4 幕 · 协同决策 → 恢复通行

上传：`scene-04-decision.png`

```
Animate this image with a slow, steady camera move only. time:4s. The clay objects themselves must not change shape.

CAMERA: Start high above the four connected clay nodes, looking down at them, at the same height the previous shot ended at. Over the full five seconds the camera pulls back and rises slowly, widening the view until the entire island and its full length of highway are visible in frame. One continuous smooth pull-back and rise. No cuts, no sudden moves, no speed ramp.

LIFE IN THE SCENE: The four rounded agent nodes hover in place with a barely perceptible gentle bob. The thin connecting lines between them stay attached and unchanged. The single warm ochre beam pointing down to the roadway pulses very gently, once, softly. Below, the small cars travel along the restored highway at a calm steady pace in both directions, driving past the spot where the beam lands on the road. The trees, rocks and waterfall remain completely still.

STYLE MUST NOT CHANGE: keep the soft matte clay 3D render, the tilt-shift miniature look, the warm cream plain background #F2EBD9, and the exact palette of indigo, dusty blue, cream, sage green and warm ochre. Lighting stays soft and diffuse with the same long soft shadows.

CONSTRAINTS: no new objects appear, nothing enters or leaves the frame, no morphing or warping, the connecting lines must not turn into neon or circuitry, no text, no letters, no numbers, no logos, no people, no human figures.
```

---

## 生成完交给我

4 个 mp4 放到 `archive/hero-v1-flow/video/`，命名 `scene-01.mp4` … `scene-04.mp4`。

我会做：拼接、转 WebM + MP4 双格式、压缩到 3MB 内、生成 poster 首帧、
写进 Astro 组件、手机端静帧降级用 poster。

## 如果某幕不满意

不要重写提示词，**只改相机那一段**，其他三段原样保留。视频模型对相机描述最敏感，
改主体描述反而会让画面漂移。常见调整：

- 觉得太慢 → 把 `slow, steady` 改成 `gentle, slightly quicker`
- 觉得物体在变形 → 在 CONSTRAINTS 里加 `every object keeps its exact original shape and size`
- 觉得镜头在抖 → 加 `the camera moves smoothly with no handheld shake and no vibration`
