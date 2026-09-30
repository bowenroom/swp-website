---
title: "图像数据集的探索性分析"
---

拿到一个新的遥感图像数据集，直接开训练然后看指标高低，通常是错的。指标告诉你「模型在**你的测试集**上表现如何」，但它不告诉你标签有没有错、类别是否极度不均衡、有没有哪一类根本不存在。在动手训练之前花半天做一遍探索性分析（EDA），能省下后面几天的困惑。

这篇文章用 DroneDeploy 和 ISPRS Potsdam 两个数据集做示范，代码基于 `fastai` 与 `PILMask`/`TensorImage` 这套工具。

## 从最简单的三件事开始

先确认目录结构符合预期——图像、标签、对应的高程数据各在一个目录，文件名能一一对应：

```python
set_seed(105)
train_a_path = Path('/data/dronedeploy/dataset-medium/image')
label_a_path = Path('/data/dronedeploy/dataset-medium/labels')
elev_path    = Path('/data/dronedeploy/dataset-medium/elevations')

imgNames = get_image_files(train_a_path)
lblNames = get_image_files(label_a_path)
eleNames = get_image_files(elev_path)
```

然后随机抽一张标签图，把它的唯一值打出来：

```python
lblFileNameA = lblNames[random.randint(1, 19)]
lblFile = PILMask.create(lblFileNameA)
np.unique(lblFile)
```

这一步能立刻回答一个关键问题：**你的标签是 ID 编码还是调色板编码？** 如果唯一值是一堆不连续的小整数，那是 ID 编码；如果是 `0`、`76`、`172` 这样有间隔的值，那它其实是 RGB 图像被量化成了灰度，含义要靠调色板反查。搞错这一步，后面所有的统计都是错的。

![数据集的类别分布：地面与建筑占绝大多数，水体与车辆极稀少](/blogs/eda-grid.png)

*先看类别分布。这个数据集里地面和建筑占了绝大多数像素，而车辆只占极小一部分——这直接决定了后面要不要用重采样或损失加权。*

## 灰度还是 RGB：一段必要的转换

遥感数据的标签有两种常见形态：ISPRS Potsdam 用的是**调色板灰度**（每个类别一个灰度值），DroneDeploy 用的是**彩色 RGB**（每个类别一个固定颜色）。这两种都需要转成统一的 ID 编码，才能做统计或训练。

```python
def getGrayScaleValue(palette):
    # 调色板是 {id: (r, g, b)}，反查成 {灰度值: id}
    ...

def converFromGray(lblname, palette):
    label = PILMask.create(lblname)
    labelArray = np.array(label)
    paletteGray = getGrayScaleValue(palette)

    # 新建数组，而不是在 labelArray 上就地改写
    arr_2d = np.zeros(labelArray.shape, dtype=np.uint8)
    for i, o in paletteGray.items():
        arr_2d[labelArray == o] = i
    return arr_2d
```

这里有一个容易踩的坑：**不要就地修改**。像 `labelArray[labelArray == 0] = 1` 这种写法，在处理 `0` 这个类别时会产生歧义——改完之后你无法分辨哪个 `0` 是原本就在那儿的，哪个是刚刚映射出来的。所以先建一个新的全零数组，逐类写入。

RGB 版本则要先反查调色板：

```python
def getInverPalette(palette):
    inverted = {}
    for k, v in palette.items():
        inverted[v] = k
    return inverted
```

两个数据集的调色板定义如下，注意类别编号完全不同，不能混用：

```python
paletteISPRS = {0: (255, 255, 255),  # 不透水面
                1: (0, 0, 255),     # 建筑
                2: (0, 255, 255),   # 低矮植被
                3: (0, 255, 0),     # 树木
                4: (255, 255, 0),   # 车辆
                5: (255, 0, 0)}     # 杂物

paletteDDSG = {0: (230, 25, 75),   # 建筑
               1: (145, 30, 180),  # 杂物
               2: (60, 180, 75),   # 植被
               ...}
```

![同一张航拍图与它的标签掩膜并排对比](/blogs/data-explore/01.png)

*左边是原图，右边是转换后的 ID 编码标签。转换正确的话，两者的几何形状应该严格对齐。*

## 类别分布：一个函数画完所有图

拿到 ID 编码之后，就可以统计每个类别的像素占比了。与其对每张图写一遍，不如写成一个可复用的函数：

```python
def get_all_piestatics(palette, lblNames, title='dataset'):
    n_pixel     = [0] * 7   # 每个类别累积的像素数
    n_all_pixel = [0] * 7
    labels = ['BUILDING', 'CLUTTER', 'VEGETATION',
              'WATER', 'GROUND', 'CAR', 'IGNORE']
    colrDDSG = ['#e6194b', '#911eb4', '#3cb44b',
                '#f58231', 'whitesmoke', '#0082c8', '#ff00ff']

    for lblName in lblNames:
        arr = converFromGray(lblName, palette)
        pixelAllCount = np.bincount(arr.flatten(), minlength=7)
        for i, n in enumerate(pixelAllCount):
            n_pixel[i] += n
            n_all_pixel[i] += arr.size

    ratio = [n_pixel[i] / n_all_pixel[i] for i in range(7)]
    ...
```

`IGNORE` 这一类要单独留意。如果它占了不小比例，那你的 mIoU 是被它拉低还是被虚高，取决于你在 `evaluate` 时有没有把它排除。

![逐类别像素占比的统计结果](/blogs/data-explore/02.png)

*统计完之后，最该问的问题是：最少的那一类有多少像素？如果只有几百个，那它值得单独设计一个采样策略。*

## 尺寸分布与标注质量

遥感图像有一个特别之处：**同一张图里的目标尺度差异极大**。在航拍图里，一辆车可能只有 20×20 像素，而一栋建筑可能占满半张图。这会直接影响你的裁剪策略。

![不同数据集的图像尺寸分布对比](/blogs/data-explore/03.png)

所以除了类别分布，一定要统计图像的**尺寸分布**。如果你的数据集里既有 512×512 也有 5000×5000 的图，那裁剪尺寸和 batch size 的选择就要重新考虑——这是我在做 Potsdam 的时候踩过的坑。

最后是**标注质量**。随机抽 20 张图并排看，经常能发现：一整片区域被标成了同一个类别但明显应该是另一个、边界比真实物体大了一圈、或者有些区域根本没标。这些问题训练指标是看不出来的。

## 这套流程能回答的问题

| 问题 | 方法 |
| --- | --- |
| 标签是 ID 还是调色板编码？ | `np.unique` 打印唯一值 |
| 类别编号对不对得上？ | 打印调色板并目视比对 |
| 类别分布均不均衡？ | 逐类别像素占比统计 |
| 有没有 `IGNORE` 类？ | 看它的像素占比 |
| 目标尺度差多少？ | 图像尺寸分布加目标尺寸统计 |
| 有没有错标、漏标？ | 随机抽样目视检查 |

这六个问题，训练一次是发现不了的，但花半天做一遍，能决定你后面所有的实验设计。
