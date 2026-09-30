---
title: "MMSegmentation 实战教程"
---

`MMSegmentation` 是 OpenMMLab 下的语义分割框架。它的核心设计不是「写一个模型」，而是**用配置文件描述整个训练流程**——数据集怎么读、模型怎么搭、优化器怎么设、训练跑多少轮，全都在一个 Python 文件里。这个思路很省心，但第一次上手会有一道门槛：你的数据必须先按它的约定整理好。

这篇文章以 ISPRS Potsdam 地表覆盖分类为例，走完「安装 → 推理 → 注册数据集 → 训练 → 推理」这条完整链路。

## 跑通一次官方权重推理

在碰自己的数据之前，先用官方权重把推理链路走通。这一步的价值在于：它能把「环境问题」和「数据问题」分开。

```python
import torch, torchvision
import mmseg
print(torch.__version__, torch.cuda.is_available())
print(mmseg.__version__)

from mmseg.apis import inference_segmentor, init_segmentor, show_result_pyplot
from mmseg.core.evaluation import get_palette

config_file = 'configs/pspnet/pspnet_r50-d8_512x1024_40k_cityscapes.py'
checkpoint_file = 'checkpoints/pspnet_r50-d8_512x1024_40k_cityscapes_20200605_003338-2966598c.pth'

model = init_segmentor(config_file, checkpoint_file, device='cuda:0')
img = 'demo/demo.png'
result = inference_segmentor(model, img)
show_result_pyplot(model, img, result, get_palette('cityscapes'))
```

`init_segmentor` 用配置文件把模型搭出来，再把权重加载进去；`inference_segmentor` 返回一张与输入同尺寸的分割图；`show_result_pyplot` 负责上色显示。三个函数，职责非常清晰。

## 第一步：把标签转成灰度 ID 图

MMSegmentation 要求图像和分割标签成对放在同一前缀的目录下。而且，它读标签的方式是**按灰度值**读的。Potsdam 原始标注是彩色的，所以必须先转成单通道的 ID 图。

```python
classes = ['Impervious surface', 'Buildings', 'Low vegetation',
           'Trees', 'Cars', 'Clutter', 'Background']

def turnDataset2Gray():
    for index in range(len(lblNames)):
        temp = np.asarray(convert_from_color(io.imread(lblNames[index])), dtype='uint8')
        io.imsave(lblNames[index], temp)
```

转完之后可以验证一下：

```python
img = np.array(Image.open(lblNames[0]))
print(f'label image has {np.unique(img)} unique values')
test = convert_to_color(img)
plt.imshow(test)
```

正确的标签图应该只有 7 个唯一值（对应 7 个类别），并且 `convert_to_color` 之后能还原出原本的配色。

![转换后的分割标签：每个类别对应一个灰度值](/blogs/mmsegmentation/01.webp)

*标签已经是单通道 ID 图了。肉眼看灰度没什么意义，用 `convert_to_color` 上色之后才能确认类别有没有对上。*

## 第二步：注册数据集类

然后写一个 `CustomDataset` 的子类，并用装饰器注册：

```python
from mmseg.datasets.builder import DATASETS
from mmseg.datasets.custom import CustomDataset

@DATASETS.register_module()
class IsprsDataset(CustomDataset):
    CLASSES = classes
    PALETTE = palette

    def __init__(self, **kwargs):
        super().__init__(img_suffix='RGB.tif', seg_map_suffix='label.tif', **kwargs)
```

`img_suffix` 和 `seg_map_suffix` 是两个关键参数，它们告诉框架「图像文件叫什么」「标签文件叫什么」。这两个后缀要和你实际的数据文件对得上，否则框架会找不到配对的文件。

![数据集的类别分布与样本数量](/blogs/mmsegmentation/02.png)

*注册之前先确认类别定义和你的数据一致。类别顺序错了，模型会学到一份完全错误的映射，而且训练时不会报错。*

## 第三步：改配置文件

直接拿一份现成的配置改，比从零写要快得多：

```python
from mmcv import Config
cfg = Config.fromfile('configs/pspnet/pspnet_r50-d8_512x1024_40k_cityscapes.py')
```

然后逐项覆盖。**单卡训练时，BN 要换成 SyncBN 的关闭状态**，这一条很容易踩：

```python
from mmseg.apis import set_random_seed

# 只用一张 GPU，所以用 BN 而不是 SyncBN
cfg.norm_cfg = dict(type='BN', requires_grad=True)
cfg.model.backbone.norm_cfg = cfg.norm_cfg
cfg.model.decode_head.norm_cfg = cfg.norm_cfg
cfg.model.auxiliary_head.norm_cfg = cfg.norm_cfg

# 改类别数：从 Cityscapes 的 19 类改成 Potsdam 的 7 类
cfg.model.decode_head.num_classes = 7
cfg.model.auxiliary_head.num_classes = 7
```

最后把数据集路径指过来：

```python
cfg.data.train.img_dir = 'Potsdam/2_Ortho_RGB'
cfg.data.train.ann_dir = 'Potsdam/5_labels_for_participants'
cfg.data.train.pipeline = [...]  # 自己的变换流水线
```

![配置文件里的训练流程设置](/blogs/mmsegmentation/03.png)

*配置文件的每一项都可以在 Python 里直接改，改完 `print(cfg)` 检查一遍。配置文件是普通 Python，可以打断点。*

## 第四步：训练

```python
from mmseg.datasets import build_dataset
from mmseg.models import build_segmentor
from mmseg.apis import train_segmentor

datasets = [build_dataset(cfg.data.train)]
model = build_segmentor(
    cfg.model, train_cfg=cfg.get('train_cfg'), test_cfg=cfg.get('test_cfg'))

mmcv.mkdir_or_exist(osp.abspath(cfg.work_dir))
train_segmentor(model, datasets, cfg, distributed=False, validate=True, meta=dict())
```

几个值得注意的地方：`build_dataset` 和 `build_segmentor` 读的就是上面改过的 `cfg`；`distributed=False` 对应单卡；`validate=True` 会在每个验证周期结束时算一次指标。

因为是拿 Cityscapes 预训练权重做微调，收敛会快很多。这篇教程的数据集很小，训练时间不长，很适合用来验证整条链路是否通。

## 训练完的推理

```python
img = mmcv.imread('iccv09Data/images/6000124.jpg')
model.cfg = cfg
result = inference_segmentor(model, img)
show_result_pyplot(model, img, result, palette)
```

![分割结果可视化：不同区域被分成不同类别](/blogs/mmsegmentation/04.webp)

注意 `model.cfg = cfg` 这一行——`inference_segmentor` 需要从模型上读回配置来知道类别和调色板，所以自己训练完之后必须把 `cfg` 挂回去，否则可视化会拿到默认的 Cityscapes 调色板。

## 小结一下这套流程

1. **先跑官方权重推理**，确认环境和 API 没问题。
2. **把彩色标签转成灰度 ID 图**，并验证类别数量。
3. **注册 `CustomDataset`**，注意两个后缀参数。
4. **改配置文件**：单卡换 BN、改类别数、指数据路径。
5. **训练**，`validate=True` 观察收敛。
6. **推理前把 `cfg` 挂回模型**，否则调色板不对。

这六步跑通之后，换任何遥感数据集都只是改 `classes`、`palette` 和三个路径而已。配置驱动的好处就在这里：**换任务的成本，改配置远小于改代码。**
