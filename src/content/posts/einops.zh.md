---
title: "einops：把张量变形写成一句话"
---

`reshape`、`permute`、`squeeze`、`transpose` 这几个函数几乎出现在每一个视觉模型的代码里，但它们的参数是一串纯数字，读代码的时候你必须在脑子里维护一张「哪个维度是哪个」的对照表。`einops` 想做的事情很简单：把这张对照表写进代码里。

![把高、宽、通道三个维度交换顺序，结果一行就写完了](/blogs/einops/01.webp)

*同一个操作，用 `einops` 表达就是「把 `h w c` 重新排成 `w h c`」，运行之后把结果 `show` 出来，你不用回去核对每个下标。*

## 从一个真实的张量开始

这篇文章的实验都跑在 Potsdam 数据集的一张 RGB 正射影像上：

```python
from fastai.vision.all import *
from einops import rearrange, reduce, repeat

imgNames = get_image_files("Potsdam/2_Ortho_RGB")
temp = TensorImage(Image.open(imgNames[0]))
temp.shape
# torch.Size([512, 520, 3])
```

注意形状是 `[512, 520, 3]` 而不是 `[3, 512, 520]`：`fastai` 的 `TensorImage` 保持 PIL 的 `HWC` 顺序，而不是 PyTorch 图像算子常用的 `CHW`。这个差异正是 `einops` 最容易体现价值的地方，因为 `HWC` 和 `CHW` 用纯下标写出来几乎无法自解释。

## 交换轴：一次写清顺序

把图像转置一下，`einops` 的写法是这样的：

```python
rearrange(temp, 'h w c -> w h c').shape
# torch.Size([520, 512, 3])
```

左边是输入的维度名，右边是输出的维度名，中间是箭头。没有数字，没有 `dim=` 参数，也没有 `contiguous()` 的担心。改顺序就改右边那串字母，想回到原样就把箭头反过来写。

## 合并与拆分：同一件事的两个方向

真正让人上瘾的是合并和拆分。你可以在一次调用里把两个操作串起来，而不用写两行：

```python
rearrange(temp, 'g b (c1 c2) -> (c1 b) (c2 g)', c1=3).shape
```

这条语句把 `c` 拆成 `c1 c2`（`c1=3`），再把 `g` 和 `b` 按 `(c1 b)` 合成一个维度、把 `c2` 和 `g` 按 `(c2 g)` 合成另一个。它的意义在于：**你可以在一条语句里同时拆和合**，中间结果不落地。这类写法在处理注意力头的时候尤其常见，因为多头注意力的 `heads` 和 `embed_dim` 本来就是纠缠在一起的两个维度。

![拆分与合并维度，可以写在同一行里](/blogs/einops/02.webp)

## 为什么值得引入它

对比一下同样一个「把 `CHW` 的通道拆成两半并各自归一化」的操作：

```python
# 传统写法
x = x.permute(0, 2, 3, 1)          # NCHW -> NHWC
x = x.reshape(x.shape[0], x.shape[1], x.shape[2], 2, -1)
mean, std = x.mean(dim=-1), x.std(dim=-1)
x = torch.stack([(x[..., 0, :] - mean) / std, (x[..., 1, :] - mean) / std], dim=-2)
x = x.reshape(*x.shape[:-2], -1)
x = x.permute(0, 3, 1, 2)          # NHWC -> NCHW
```

```python
# einops 写法
mean, std = rearrange(x, 'b c h w -> b h w c mean std', mean=1, std=1).unbind(-1)
normalized = rearrange([mean, std], 'b h w c two -> b two c h w', two=2)
```

第二种写法把「我在处理哪几个维度」直接写了出来。`rearrange` 返回的是普通 `torch.Tensor`，不是包装类型，所以它可以直接喂给任何接受张量的函数——这一点很重要，意味着迁移成本几乎为零。

## 几个实用提醒

1. **`einops` 只做变形，不做计算。** 它没有 `mean`、`softmax` 这类聚合操作，这类事情仍然要交给 `torch`。`reduce` 看起来像聚合，但它做的事本质还是重排加一个 `reduction` 参数（例如 `max`/`sum`），复杂聚合还是要写 PyTorch。
2. **重排之后内存可能不连续。** `einops` 在必要时会自动插入 `reshape` 或 `contiguous`，但如果你要接一个对内存布局敏感的自定义 CUDA 算子，还是显式确认一下。
3. **维度名是任意字符串。** 但在团队代码里用一致的名字（`b` batch、`c` channel、`h w` spatial、`t` time、`e` embed、`g` group）会让后来的人省下很多时间。

改完这些代码之后，模型前向没有变，结果一个数都没有差，但可读性回到了「读一遍就懂」的水平。对于经常需要核对张量形状的分割任务，这一点值一次依赖。
