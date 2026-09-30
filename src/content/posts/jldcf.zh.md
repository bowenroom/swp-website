---
title: "JLDCF 数据集导读"
---

显著目标检测（Salient Object Detection）常用「RGB + 深度」的双模态数据，因为单靠彩色图像无法稳定判断「哪一块更值得看」。`JLDCF` 提供了一组 RGB-D 显著目标数据，本文记录我整理这套数据时遇到的一些实际坑：通道顺序、单通道深度图的读法、维度切片的语义，以及如何合成雾效做鲁棒性实验。

代码基于 `fastai` 与 `kornia`，深度图部分用 `opencv` 读取。

## 数据组织

数据以平行的目录结构存放，RGB、深度与真值各自一个文件夹：

```python
rootPath = Path('.../RGBDcollection/')
rgbPath = rootPath / 'LR/'
depPath = rootPath / 'depth/'
gtPath  = rootPath / 'GT/'

rgbFiles = get_image_files(rgbPath)
depFiles = get_image_files(depPath)
lblFiles = get_image_files(gtPath)
```

三组文件需要按文件名一一对应。正式读数据前，先随机抽一组，打印它的形状与内容，确认 RGB 图、深度图与标签图真的对齐——这三者只要错位一位，后面的所有结果都不可信。

![RGB 图像与对应深度图的可视化](/blogs/jldcf/01.webp)

*左边是 RGB，右边是对应的深度图。深度图的每一个像素都对应 RGB 里的同一位置，二者必须严格对齐。*

![深度图与显著目标真值的对照](/blogs/jldcf/02.png)

*深度图与显著目标真值（GT）并排显示。真值中越亮的区域表示越显著的目标。*

## 第一个坑：PIL 读不出深度图的三通道

这是我在处理这套数据时最先撞到的问题。**同一张深度图，用 `PIL` 读只能拿到 1 个通道，用 `opencv` 读则能拿到 3 个维度。**

```python
from PIL import Image
import cv2

# PIL：只得到单通道
depImage = Image.open(depFiles[0])
depImage.shape      # (H, W)

# OpenCV：保留了三维结构
im = cv2.imread('.../10_01-16-36_0_Depth.png', -1)
in_ = np.array(im, dtype=np.float32)
in_.shape           # (H, W, 3)
```

原因在于这张深度图是 24 位 PNG：三通道存储，但三个通道里的数值实际上相同。`PIL` 读到单通道时把这种「内容相同的多通道」压成了一个通道；`cv2.imread` 默认不做这个压缩，于是原样保留三维结构。

这不是 bug，而是两种库对同一份数据的不同解释。**处理这类数据时，如果你发现维度对不上，先用 `cv2.imread(..., -1)` 强制按原始位深读。**

## 第二个坑：通道顺序与归一化

注意 `cv2` 默认读进来是 **BGR**，不是 RGB。归一化常数必须对应正确的通道顺序，否则归一化会静默地作用在错误的通道上：

```python
def Normalization(image):
    # 最后一维倒着取，把 BGR 转成 RGB
    in_ = image[:, :, ::-1]
    in_ = in_ / 255.0
    in_ -= np.array((0.485, 0.456, 0.406))   # ImageNet 均值，按 RGB 顺序
    in_ /= np.array((0.229, 0.224, 0.225))   # ImageNet 标准差，按 RGB 顺序
    return in_
```

这里的 `::-1` 切片把 BGR 转成 RGB，与上面的均值/标准差保持一致。**顺序一旦不一致，训练不会报错，只会让指标莫名其妙地差一截**——这类 bug 排查起来非常费时间。

标签图则是单通道灰度，归一化方式不同：

```python
def load_sal_label(path, image_size):
    im = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    label = np.array(im, dtype=np.float32)
    label = cv2.resize(label, (image_size, image_size))
    label = label / 255.0
    label = label[..., np.newaxis]   # 补上通道维，保持 (H, W, 1)
    return label
```

## 第三个坑：三维切片的语义

读深度图时用到了 `image[:, :, ::-1]` 这种三维切片。为了确认它的行为，我拿一个小数组直接跑：

```python
b = np.array([[[ 1,  2,  3,  4], [ 5,  6,  7,  8], [ 9, 10, 11, 12]],
              [[13, 14, 15, 16], [17, 18, 19, 20], [21, 22, 23, 24]],
              [[25, 26, 27, 28], [29, 30, 31, 32], [33, 34, 35, 36]]])

print(b.shape)                    # (3, 3, 4)
print(b[:, :, ::-1].shape)        # (3, 3, 4)  只是把最后一维倒过来
print(b[0, ::].shape)             # (3, 4)    取第 0 张「图」
print(b[0:2, ::].shape)           # (2, 3, 4)  取前 2 张「图」
print(b[:, 0:].shape)             # (3, 1, 4)  取第 0 行
print(b[:, -1:].shape)            # (3, 1, 4)  取最后一行
```

**结论**：在 `(H, W, C)` 这种布局里，`[:, a, b]` 是「所有行、第 a 行、所有列」；`[a, :, :]` 是「第 a 张图、全部行、全部列」。这两个很容易混，因为它们的下标顺序看起来是「行、列、图」，但实际是「图、行、列」。理解这一点，`-1:` 这种「取最后一个」的写法才不会用错位置。

## 附加实验：给图像加雾

为了做鲁棒性实验，需要在训练时给图像加雾。我用了一个基于「菱形-方形算法」（diamond-square）生成的分形噪声：

```python
def plasma_fractal(mapsize=256, wibbledecay=3):
    """
    Generate a heightmap using diamond-square algorithm.
    Return square 2d array, side length 'mapsize', of floats in range 0-255.
    'mapsize' must be a power of two.
    """
    assert (mapsize & (mapsize - 1) == 0)
    maparray = np.empty((mapsize, mapsize), dtype=np.float_)
    maparray[0, 0] = 0
    stepsize = mapsize
    wibble = 100
    ...
```

这个算法从一个点开始，反复做「四边形取中点」和「菱形取中点」，每次把分辨率翻倍，同时加入随机扰动，最终得到一张有自然纹理的分形图。作为雾的纹理非常合适，因为真实的雾也带有这种不规则的斑驳感。

然后把它叠加到图像上：

```python
def fog(x, severity=1):
    c = [(1.5, 2), (2, 2), (2.5, 1.7), (2.5, 1.5), (3, 1.4)][severity - 1]

    x = np.array(x) / 255.
    max_val = x.max()
    x += c[0] * plasma_fractal(wibbledecay=c[1])[:224, :224][..., np.newaxis]
    return np.clip(x * max_val / (max_val + c[0]), 0, 1) * 255
```

`severity` 越大，雾越浓。末尾的 `x * max_val / (max_val + c[0])` 是一步反向缩放：加完雾之后像素值会超过原来的最大值，这个式子把它压回原范围，避免直接 `clip` 造成大面积纯白。

## 整理数据时值得记住的几件事

1. **维度对不上时，先用 `cv2.imread(path, -1)` 按原始位深读**，很多「少了一个通道」的问题都出在这里。
2. **`cv2` 读进来是 BGR**，归一化常数要跟着调整，顺序错了不会报错但效果会差。
3. **`(H, W, C)` 的切片顺序是「图、行、列」**，用 `-1:` 取最后一个维度时尤其容易搞混。
4. **标签图补上通道维**（`[..., np.newaxis]`）可以和 RGB 保持同样的形状约定，后续广播运算会方便很多。

这些都不是模型问题，而是数据读取的细节。踩过一次之后，整理新数据集的效率会高很多。
