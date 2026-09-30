---
title: PyTorch 基础：map function 与 lazy generator
---

深度学习代码里真正耗时的部分，往往不是 `forward` 里那几行矩阵乘法，而是
数据准备：取文件、读图、切片、归一化、增强。这些动作本身没什么深度，却决定
了训练能不能跑通。这一篇把 2021 年那份 fastai 笔记本重新整理一遍——里面的
代码我一直在用，后来几乎每个遥感项目都从这里出发。真正吃重的有三件事：
fastai 的 `L` 和惰性 `map`、`PILImage` 与 tensor 之间的来回转换，以及多模态
数据（RGB、标签、DSM）如何用两套不同的管线做同步增强。

## `L`、`map` 与惰性求值

fastai 把「一组可以索引、切片、打印的东西」抽象成 `L`。它比 list 轻，
比 generator 好用，repr 还会自动标出长度：

```python
from fastcore.basics import L

aa = L(1, 2, 3)
aa[2]        # 3
```

真正有意思的是它和 Python 内置 `map` 的关系。`map` 在调用时什么都不算，
返回的是一个惰性生成器，只有你迭代它的时候才逐个计算：

```python
aa = range(10)
bb = map(lambda o: o**2, aa)   # 此刻还没有任何计算发生

L(bb)   # 到这里才真正执行
```

输出是 `[0, 1, 4, 9, 16, 25, 36, 49, 64, 81]`，十个平方一个一个算出来。
所以「`map` 是免费的」是个误解：代价被推迟到了消费端。这带来两个后果——
只迭代一次的生成器之后就空了；而在 dataloader 里，每次读 batch 都会重建
一次管线，所以惰性在那边反而是优点，因为从来没人需要那份中间列表。

## 类型转换：list、tensor、PIL、device

这一节全是「搬砖」，但每一块都对应一个真实会踩的坑。

```python
from fastai.vision.all import *

aa2 = tensor(range(10))          # list/range -> tensor
to_device(aa2, 'cpu')            # 明确搬到某个 device
to_device(aa2, 'cuda:1')         # 换一张卡
aa2.cuda()                       # 简写：搬到默认 GPU
to_cpu(aa2)                      # 搬回来
to_np(aa2)                       # tensor -> numpy array
```

`to_device` 是**幂等**的：目标已经是那个 device 时它直接把原对象还给你，
所以你永远不需要在 CPU/GPU 之间写 if。真正实用的是
`to_device(batch, device)`，一次搬一整个 batch，而不是逐个 tensor 搬，
否则传输开销要按元素付一遍。

图像这边要记住一条规则：`PILImage`（fastai 对 `PIL.Image.Image` 的包装）
和 tensor 对轴顺序的约定是**相反**的。

```python
im = PILImage.create('puppy.jpg')
im.shape           # (803, 1200)                 -> 高, 宽

tensorIm = image2tensor(im)
tensorIm.shape     # torch.Size([3, 803, 1200])  -> 通道, 高, 宽

im2 = to_image(tensorIm)   # 转回 PIL，仍然是一张合法的图
```

`(H, W)` 变成 `(C, H, W)` 不是 `image2tensor` 临时加的维度，而是 PyTorch
对「图像是什么」的全局约定：`NCHW` 是给网络吃的，`HWC` 是给显示和 numpy
吃的。每一次在两种布局之间来回跳，都是一次把 reshape 写错的机会，所以最好
让 `image2tensor` 和 `to_image` 成对出现，而不是在中间某处手写一个
`permute`。

![fastai 的 get_grid 把几张图排到同一张画布上，犬只照片是其中一格](/blogs/pytorch-basics/01.webp)

*`get_grid(4, 2, 2, ...)` 返回的是子图数组，`im.show(ctx=ax)` 直接把图画进
其中一格——调试 batch 时不用自己管行列索引。*

## 遥感数据：一个样本要读三个文件

真正麻烦的不是单张 RGB，而是一次要读三个文件：正射影像、语义标签、数字
表面模型（DSM）。它们必须**像素对齐**，所以任何一步操作都得三者同时做。

![Potsdam 数据集的三个面板：RGB 正射影像、重新映射后的标签、DSM 高程图](/blogs/pytorch-basics/04.webp)

*上：RGB 正射影像；中：颜色标签重新映射成类别编号之后的标签；下：DSM。
三个文件描述同一片地面，缺一不可。*

难点在标签。Potsdam 的 label 是用 6 种颜色编码的 RGB 图，而分割任务里
`CrossEntropyLoss` 期望的 target 是连续的类别编号。所以管线里必须有一步
「颜色 → 类别编号」的映射：

```python
from numpy import array

# 原始调色板灰度值 -> 连续类别编号
r2gValues = {0: 255, 1: 29, 2: 179, 3: 150, 4: 226, 5: 76}

codes    = ['ImpSurf', 'Building', 'LowVeg', 'Tree', 'Car', 'Clutter']
codeNums = [0, 1, 2, 3, 4, 5]

def getMappedMask(dataPath, pixel2Class=r2gValues):
    """把 RGB 颜色标签重映射为 0..5 的连续类别编号。"""
    original = PILMask.create(dataPath)
    arrays = np.array(original)
    for k, v in pixel2Class.items():
        arrays[arrays == v] = k
    return PILMask.create(arrays)
```

`for k, v in pixel2Class.items(): arrays[arrays == v] = k` 是值得直接抄走的
NumPy 写法：布尔索引的左边是「所有等于 v 的像素」，右边是一个标量，于是一整片
区域一次改完，内层不需要循环。这个映射还必须是**顺序安全**的，而这份 dict
恰好满足：`255` 先被换成 0，剩下的值随后再写，不会互相污染。

DSM 的读法不一样。它是 32 位浮点高程，而 `PILImage.create` 默认按 8 位读，
会把 `[0, 30]` 米这样的量程压成 0 到 255 之间的整数，相对高差就整个丢失了。
所以必须显式指定浮点模式：

```python
dsmImage = PILImage.create(dsmNames[0], mode='F')
dsmImage.show(figsize=(10, 10), cmap='Greys')
```

`mode='F'` 让 PIL 保留 32 位浮点通道。显示时用 `'Greys'` 色表完全没问题，
因为数据在读进来的时候就没有被量化过。这类细节一旦忽略，遥感模型的精度会
悄悄掉一截。

## 切 patch 与 fastai 的数据增强

6000×6000 的整幅影像塞不进内存，所以第一步是切块：

```python
_, axs = plt.subplots(1, 3, figsize=(12, 4))
f = Resize(512)
show_image(f(rgbImage), ctx=axs[0])
show_image(f(lblImage), ctx=axs[1], cmap=my_cmap)
show_image(f(dsmImage), ctx=axs[2], cmap='Greys')
```

![共用一个 Resize 之后的三块 512 尺寸 patch：RGB、标签与 DSM](/blogs/pytorch-basics/06.webp)

*同一个 `Resize(512)` 作用在三个文件上，几何对齐在任何增强发生之前就
已经保证了。*

之后就是 fastai 的 `aug_transforms` 管线：

```python
tfms = aug_transforms(pad_mode='zeros', mult=2, min_scale=0.5)
for t in tfms:
    y = t(rgbTensor2, split_idx=0)
```

注意 `split_idx` 这个参数——它决定这条增强是训练时随机（训练集）还是
确定性的（验证集）。`split_idx=0` 表示训练集，所以调用后返回一组随机结果；
把索引换成验证集那条，同一个 transform 就给出确定性的那一份。这也是为什么
DataBlock 里每个 dataloader 都得带上自己的 `split_idx`。

![aug_transforms 产生的多组增强结果，包含缩放、裁剪、旋转与颜色变化](/blogs/pytorch-basics/08.webp)

*`aug_transforms` 里每个 transform 都会返回一组候选结果，组数就是 `mult`。*

不过 fastai 的内置增强对遥感并不合适。它把标签 `TensorMask` 也当成普通图像
做 bilinear 插值，而标签只能 nearest 采样。更可控的做法是用 Kornia 给 RGB
和标签各建一条管线，把几何参数钉死成一样的：

```python
import kornia.augmentation as K
from kornia.color import grayscale_to_rgb

aug = K.AugmentationSequential(
    K.RandomRotation(degrees=[80, 80], return_transform=True, p=1.),
    K.CenterCrop(256, p=1., cropping_mode="resample"),
    K.ColorJitter(0.06, 0.06, 0.06, 0, p=1.),
    data_keys=["input"], return_transform=False, same_on_batch=False,
)

aug2 = K.AugmentationSequential(
    K.RandomRotation(degrees=[80, 80], return_transform=True, p=1.),
    K.CenterCrop(256, p=1., cropping_mode="resample"),
    data_keys=["input"], return_transform=False, same_on_batch=False,
)

out_rgb  = aug(rgbTensor)                     # 带 ColorJitter
out_lbl  = aug(lblTensor)                     # 几何相同，但没有颜色操作
out_dsm  = aug2(grayscale_to_rgb(dsmTensor))  # 独立管线，同样不做颜色抖动
```

两条管线把 `RandomRotation` 和 `CenterCrop` 写成同样的参数，几何因此天然对齐。
差别只有两处：RGB 多一个 `ColorJitter`；DSM 先用 `grayscale_to_rgb` 补成
3 通道，才好套用同一套接口。

![增强前后的 RGB、DSM 与标签对照，颜色扰动只落在 RGB 上](/blogs/pytorch-basics/09.webp)

*上排是原始的 RGB / DSM / 标签，下排是增强后的对应结果。标签没有出现颜色
抖动，而 RGB 的饱和度与亮度发生了轻微变化。*

还有一个坑值得主动踩一次：`image2tensor` 默认返回 `uint8` tensor，
而 Kornia 和 `setup_aug_tfms` 里的算子期望 `float32`。不转换直接送进去，
会在算子内部报类型错误：

```python
rgbTensor  = image2tensor(rgbImage)                       # uint8
rgbTensor2 = torch.tensor(rgbTensor, dtype=torch.float32)  # 必须转一次

comp[0](rgbTensor2)   # 到这一步才跑得通
```

## Padding：为什么用 reflect

切出来的 patch 边缘很少落在空地上，一刀下去常常把一栋楼切成两半。在这种边缘
上，卷积核看到的是一大块 padding 填零，网络很乐意把「边框纹理」学成捷径。
reflect pad 的做法是把边缘像素镜像复制到外面，等价于假装图像还在继续：

```python
from torch.nn import functional as F

out_rgb_tensors.shape            # torch.Size([1, 3, 256, 256])

testPad = (123, 123, 123, 123)
padOutRGBTensor = F.pad(out_rgb_tensors, testPad, mode='reflect')
padOutRGBTensor.shape            # torch.Size([1, 3, 502, 502])
```

四个数依次是 `(left, right, top, bottom)`，所以 `256 + 123 + 123 = 502`。

![reflect padding 之后，patch 四周被边缘像素的镜像延伸填满](/blogs/pytorch-basics/11.png)

*和 `zeros` padding 对比，reflect 不会引入一条突兀的黑边，卷积层在边界处
看到的统计分布因此更接近内部区域。*

## 顺手记一个 NumPy 技巧

写标签处理代码时，经常需要「三个通道都等于某个 RGB 值」的所有像素。
沿通道轴归约一次刚好就是这个查询：

```python
aa = np.random.randint(0, 255, (2, 2, 3))     # shape (2, 2, 3)

i  = np.array((253, 160, 45)).reshape(1, 1, 3)
bb = np.all(aa == i, axis=2)                  # 沿 axis=2 归约
bb.shape                                        # (2, 2)，通道维已经压掉

aa[bb].shape                                    # (0, 3) 匹配到的像素，没有则为空
```

`aa == i` 先得到一个 `(2, 2, 3)` 的布尔数组，`np.all(..., axis=2)` 把通道维
压掉，只在三个通道全部命中时为 `True`。于是 `bb` 是一个二维掩码，可以直接
拿去索引原数组——这就是前面 `getMappedMask` 里 `arrays[arrays == v]` 的通用
形式，只是那里 `v` 是标量，这里是三元组。
