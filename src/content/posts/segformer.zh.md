---
title: "SegFormer 模型笔记"
---

这篇笔记很短，因为原始 notebook 也短——总共 5 个 cell，一段 import、一个链接、一张图、三行建模代码。所以这里写的是我能从这些内容里确认的东西，加上一点我自己的判断；不属于这几行代码的部分，我会明确标出来。

## 这份笔记在解决什么问题

notebook 里唯一的文字说明是一条链接，指向 NVlabs/SegFormer 仓库的第 20 号 issue，讨论如何把 **mmsegmentation 里的 SegFormer 代码迁移到 Hugging Face**。

这件事本身就值得停下来想一想。我的遥感分割工作长期挂在 mmsegmentation 上——配置系统、数据集注册、`Config` 文件驱动，非常顺手。但它的问题是封闭的：模型定义、权重格式、预处理逻辑都锁在那一个框架里。Hugging Face 那边是另一套生态，权重在 Hub 上、`AutoModel` 能加载、推理端部署方便。两者之间需要一座桥。

于是这段代码做的事情就很清楚了：**不下载任何权重，只是用 HF 的 API 把模型结构实例化出来**。

```python
from transformers import SegformerModel, SegformerConfig

# Initializing a SegFormer nvidia/segformer-b0-finetuned-ade-512-512 style configuration
configuration = SegformerConfig()

# Initializing a model from the nvidia/segformer-b0-finetuned-ade-512-512 style configuration
model = SegformerModel(configuration)

# Accessing the model configuration
configuration = model.config
```

## 三行代码，三个值得注意的点

### `SegformerConfig()` 不带参数实例化

`SegformerConfig()` 直接用默认值建了一个配置对象。注意代码里的注释——`nvidia/segformer-b0-finetuned-ade-512-512 style configuration`。它暗示的是：**HF 的 SegFormer 实现是按那个 ADE20K 上的 b0 预训练模型来设计默认配置的**。

但这份 notebook 没有把默认配置打印出来，所以我不会去断言具体的层数、宽度或者 `num_labels` 是多少。想知道确切数值，`print(configuration)` 一行就够了，没必要凭记忆写进笔记里——这类默认值会随版本变，记忆靠不住。

### 配置与模型是可分离的

`SegformerConfig()` 和 `SegformerModel(configuration)` 是分开的两步，这正是 HF 那套设计想传达的东西：**结构是数据，不是代码**。想换一个规模、加一种任务、调整输入通道，改配置就行；模型类不需要动。

```python
# 同一个模型类，不同结构——这才是这段代码示范的重点
configuration = SegformerConfig(num_labels=<你的类别数>)
model = SegformerModel(configuration)
```

对遥感分割来说这一点尤其重要。Potsdam 是 6 类、我的雾天数据集是 5 类、NJLCC2022 是 5 类，而从 Hub 上拉下来的预训练权重基本都带的是 ADE20K 的 150 类。**改 `num_labels` 丢掉分类头、保留编码器权重**，是站在小规模标注数据上最现实的起点。

### `model.config` 反向取出配置

最后一行 `configuration = model.config` 是把配置从模型上读回来。看起来多余，但当你从 Hub 加载一个预训练模型时，这是你拿到「这个 checkpoint 到底是什么结构」的唯一途径——比去翻模型卡可靠。写训练脚本时我一般会把它 dump 成 JSON 存进实验目录，这样几周后回看记录还能复原当时的结构。

## 我在意的落差

这份笔记没有做的事，恰好是从「能跑」到「能用」之间最远的一段距离：

- **没有下载任何权重**。`SegformerModel(configuration)` 是随机初始化，结构对了，参数是噪声。
- **没有前向传播**。甚至没有 `model(input)` 这一行，所以连输入张量的形状约定都没有被验证。
- **没有预处理**。mmsegmentation 里那套归一化、裁剪、label 编码的细节，这边一个都没有。
- **没有精度数字**。任何「SegFormer 在我的数据上更好」的说法，这篇笔记都支撑不了。

而且我怀疑这几点是最容易踩坑的地方。**标签编码方式**尤其危险：如果延续 mmsegmentation 的习惯把类别编码成调色板 RGB，而 HF 的 `SegformerForSemanticSegmentation` 按 `num_labels` 解读通道编号，那 loss 会静默地算错——不报错，只是精度低得莫名其妙。这种 bug 能耗掉一整天。

## 为什么还是值得留下

因为它标记了一个**起点**。当初做这个笔记的动机很可能是：想在不离开熟悉的 mmsegmentation 习惯的前提下，验证 HF 这条路走不走得通。三行代码能跑通，说明接口层是通的，剩下的就是往里填真实工作。

如果现在让我接着往下做，顺序会是：

1. `print(configuration)`，把默认配置记下来，作为后续对照的基线。
2. 拉一个 b0 的 ADE20K 预训练权重，`output = model(pixel_values)`，确认输出 shape 和 `logits` 的语义。
3. 用 Potsdam 的 6 类跑一次，**逐项核对标签编码**，把 loss 和 mIoU 跟 mmsegmentation 里的同一配置对齐。
4. 对齐之后再谈换框架的好处。

第 3 步没做完之前，我不会相信任何跨框架的精度数字。这也是我做遥感分割这几年的经验：框架之间最贵的从来不是 API 差异，而是那些**默默错掉、不报错的约定**。
