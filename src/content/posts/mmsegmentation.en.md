---
title: "A Practical MMSegmentation Tutorial"
---

MMSegmentation is the semantic segmentation framework from OpenMMLab. Its central idea is not "write a model" but **describe the whole training run in a config file** — how the dataset is read, how the model is assembled, which optimizer is used, how many epochs to run. That is a pleasant way to work, but the first time through there is a hurdle: your data has to be reshaped into the conventions the framework expects.

This post uses ISPRS Potsdam land-cover classification and walks the full path: install, inference, dataset registration, training, then inference again on your own model.

## Get inference working with an official checkpoint first

Before touching your own data, run inference with an official checkpoint. This separates "environment problem" from "data problem".

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

`init_segmentor` builds the model from the config and loads the weights. `inference_segmentor` returns a segmentation map the same size as the input. `show_result_pyplot` colours it for display. Three functions, three clear jobs.

## Step one: convert the labels to greyscale index maps

MMSegmentation expects images and segmentation masks to sit in directories sharing a filename prefix. It also reads masks **by greyscale value**. The original Potsdam annotations are colour, so they have to become single-channel index maps first.

```python
classes = ['Impervious surface', 'Buildings', 'Low vegetation',
           'Trees', 'Cars', 'Clutter', 'Background']

def turnDataset2Gray():
    for index in range(len(lblNames)):
        temp = np.asarray(convert_from_color(io.imread(lblNames[index])), dtype='uint8')
        io.imsave(lblNames[index], temp)
```

Then verify the result:

```python
img = np.array(Image.open(lblNames[0]))
print(f'label image has {np.unique(img)} unique values')
test = convert_to_color(img)
plt.imshow(test)
```

A correct mask has exactly seven unique values, one per class, and `convert_to_color` should reproduce the original colour scheme.

![The converted mask, with one greyscale value per class](/blogs/mmsegmentation/01.webp)

*The mask is now a single-channel index image. Greyscale means nothing to the eye, so colour it with `convert_to_color` before trusting that the classes line up.*

## Step two: register a dataset class

Write a `CustomDataset` subclass and register it:

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

`img_suffix` and `seg_map_suffix` are the two arguments that matter. They tell the framework what the image files are called and what the mask files are called, and they have to match your actual filenames or the pairing silently fails to resolve.

![Class distribution and sample counts for the dataset](/blogs/mmsegmentation/02.png)

*Settle the class list before you register. If the class order is wrong the model learns a completely wrong mapping, and nothing raises an error during training.*

## Step three: edit the config

Starting from an existing config is much faster than writing one from scratch:

```python
from mmcv import Config
cfg = Config.fromfile('configs/pspnet/pspnet_r50-d8_512x1024_40k_cityscapes.py')
```

Then override field by field. **On a single GPU you have to turn SyncBN off**, which is the easiest thing to get wrong here:

```python
from mmseg.apis import set_random_seed

# one GPU, so use BN rather than SyncBN
cfg.norm_cfg = dict(type='BN', requires_grad=True)
cfg.model.backbone.norm_cfg = cfg.norm_cfg
cfg.model.decode_head.norm_cfg = cfg.norm_cfg
cfg.model.auxiliary_head.norm_cfg = cfg.norm_cfg

# Cityscapes has 19 classes; Potsdam has 7
cfg.model.decode_head.num_classes = 7
cfg.model.auxiliary_head.num_classes = 7
```

Then point the data paths at your own dataset:

```python
cfg.data.train.img_dir = 'Potsdam/2_Ortho_RGB'
cfg.data.train.ann_dir = 'Potsdam/5_labels_for_participants'
cfg.data.train.pipeline = [...]  # your own pipeline
```

![Training schedule settings inside the config file](/blogs/mmsegmentation/03.png)

*Every field in the config can be changed directly in Python. A config is ordinary Python, so you can set a breakpoint in it, and `print(cfg)` afterwards to check the result.*

## Step four: train

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

Three things worth noting. `build_dataset` and `build_segmentor` read exactly the `cfg` you just edited. `distributed=False` matches the single-GPU case. `validate=True` computes metrics at the end of each validation interval.

Because this is a fine-tune from Cityscaped-pretrained weights rather than from scratch, convergence is fast. The dataset here is small, so a full run is quick — which makes it a good way to confirm the whole chain works end to end.

## Inference with the trained model

```python
img = mmcv.imread('iccv09Data/images/6000124.jpg')
model.cfg = cfg
result = inference_segmentor(model, img)
show_result_pyplot(model, img, result, palette)
```

![Visualised segmentation result, with regions assigned to classes](/blogs/mmsegmentation/04.webp)

Note the `model.cfg = cfg` line. `inference_segmentor` reads the config back off the model to know the classes and the palette, so after training your own model you must attach `cfg` again — otherwise the visualisation silently uses the default Cityscapes palette.

## The shape of the whole workflow

1. **Run official-weight inference first** to confirm the environment and the API.
2. **Convert colour masks to greyscale index maps** and check the class count.
3. **Register a `CustomDataset`**, getting the two suffix arguments right.
4. **Edit the config**: BN on a single GPU, correct the class count, point at the data.
5. **Train** with `validate=True` and watch it converge.
6. **Re-attach `cfg` to the model** before inference, or the palette is wrong.

Once these six steps work, moving to a different remote-sensing dataset means changing `classes`, `palette` and three paths. That is the real payoff of a config-driven framework: **the cost of changing tasks is a config diff, not a rewrite.**
