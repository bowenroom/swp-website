---
title: "PyTorch Basics: map Functions and Lazy Generators"
---

Most of the wall-clock time in a deep learning script is not spent inside
`forward`. It is spent in data preparation: listing files, opening images,
cutting patches, remapping labels, applying augmentation. None of that has
anything to do with depth, yet it decides whether a training run works at
all. This post is a cleaned-up rewrite of a 2021 fastai notebook I have kept
coming back to; nearly every remote-sensing project since has started from
somewhere in it. Three things carry the weight: fastai's `L` and lazy `map`,
converting between `PILImage` and tensors, and the part that took me longest
to get right, keeping RGB, label, and DSM aligned through separate
augmentation pipelines.

## `L`, `map`, and lazy evaluation

fastai wraps "a thing you can index, slice, and print" into `L`. It is
lighter than a list, friendlier than a generator, and its repr reports its
own length:

```python
from fastcore.basics import L

aa = L(1, 2, 3)
aa[2]        # 3
```

The interesting part is how it interacts with Python's built-in `map`. `map`
does no work when you call it. It returns a lazy generator, and the values
only materialise as you iterate:

```python
aa = range(10)
bb = map(lambda o: o**2, aa)   # nothing has been computed yet

L(bb)   # this is where it actually runs
```

The output is `[0, 1, 4, 9, 16, 25, 36, 49, 64, 81]`, ten squares produced
one at a time. So "`map` is free" is a misreading: the cost is deferred to
the point of consumption, which has two consequences. A generator you iterate
once is empty afterwards, and in a dataloader the pipeline gets rebuilt for
every batch anyway, so laziness is a feature there rather than a bug. Nobody
ever wanted that intermediate list.

## Conversions: list, tensor, PIL, device

This section is all plumbing, and every block corresponds to a mistake I
have actually made.

```python
from fastai.vision.all import *

aa2 = tensor(range(10))          # list/range -> tensor
to_device(aa2, 'cpu')            # move to an explicit device
to_device(aa2, 'cuda:1')         # a different GPU
aa2.cuda()                       # shorthand: default GPU
to_cpu(aa2)                      # and back
to_np(aa2)                       # tensor -> numpy array
```

`to_device` is idempotent: if the tensor is already on the requested device
it hands the same object straight back, so you never need an `if` around the
CPU/GPU branch. The version that matters in practice is
`to_device(batch, device)`, moving a whole batch at once rather than tensor
by tensor, or you pay the transfer overhead once per element.

For images, the rule worth memorising is that `PILImage` (fastai's wrapper
around `PIL.Image.Image`) and tensors disagree about axis order:

```python
im = PILImage.create('puppy.jpg')
im.shape           # (803, 1200)                 -> height, width

tensorIm = image2tensor(im)
tensorIm.shape     # torch.Size([3, 803, 1200])  -> channel, height, width

im2 = to_image(tensorIm)   # back to PIL, still a valid image
```

The `(H, W)` to `(C, H, W)` flip is not an arbitrary choice inside
`image2tensor`; it is PyTorch's global convention for what an image is. `NCHW`
is for the network, `HWC` is for display and numpy. Every conversion between
the two is a chance to get a reshape wrong, which is why it is worth letting
`image2tensor` and `to_image` appear as a matched pair rather than hand-rolling
a `permute` somewhere in the middle.

![fastai get_grid arranging several images on one canvas, with a puppy photo as one cell](/blogs/pytorch-basics/01.webp)

*`get_grid(4, 2, 2, ...)` hands back the array of subplots, and `im.show(ctx=ax)`
draws straight into one of them, so there is no manual row and column
bookkeeping while you are debugging a batch.*

## Remote sensing data: three files per sample

The hard case is not a single RGB image. It is reading three files at once:
the orthophoto, the semantic label, and the digital surface model (DSM). They
have to stay pixel-aligned, which means every operation must be applied to
all three in lockstep.

![Three panels of the Potsdam dataset: RGB orthophoto, remapped label, and DSM](/blogs/pytorch-basics/04.webp)

*Top: the RGB orthophoto. Middle: the label after colour remapping. Bottom:
the DSM. Three files describe the same ground, and you need all three.*

The label is where it gets interesting. Potsdam encodes six classes as
colours in an RGB image, but `CrossEntropyLoss` wants a target of contiguous
class indices. So the pipeline needs one colour-to-index remap:

```python
from numpy import array

# palette grey values -> contiguous class indices
r2gValues = {0: 255, 1: 29, 2: 179, 3: 150, 4: 226, 5: 76}

codes    = ['ImpSurf', 'Building', 'LowVeg', 'Tree', 'Car', 'Clutter']
codeNums = [0, 1, 2, 3, 4, 5]

def getMappedMask(dataPath, pixel2Class=r2gValues):
    """Remap an RGB colour label to contiguous class indices 0..5."""
    original = PILMask.create(dataPath)
    arrays = np.array(original)
    for k, v in pixel2Class.items():
        arrays[arrays == v] = k
    return PILMask.create(arrays)
```

`for k, v in pixel2Class.items(): arrays[arrays == v] = k` is the numpy
idiom worth stealing. The left side of the boolean index is "every pixel equal
to v"; the right side is a scalar, so an entire region changes in one pass
with no inner loop. The remap also has to be order-safe, and this dict happens
to be: `255` becomes `0` first, and the remaining values are then written over
without contaminating each other.

The DSM needs different handling. It is 32-bit floating point elevation, and
`PILImage.create` in its default 8-bit mode would squash a range like
`[0, 30]` metres into integers between 0 and 255, so the actual relative
heights would be gone. Ask for float mode explicitly:

```python
dsmImage = PILImage.create(dsmNames[0], mode='F')
dsmImage.show(figsize=(10, 10), cmap='Greys')
```

`mode='F'` keeps a 32-bit float channel. Displaying with the `'Greys'`
colormap is still fine, because the data was never quantised on the way in.
This is the kind of detail that quietly costs you accuracy in remote-sensing
models if you miss it.

## Patching and fastai's augmentation

A 6000x6000 orthophoto will not fit in memory, so the first move is to cut
patches:

```python
_, axs = plt.subplots(1, 3, figsize=(12, 4))
f = Resize(512)
show_image(f(rgbImage), ctx=axs[0])
show_image(f(lblImage), ctx=axs[1], cmap=my_cmap)
show_image(f(dsmImage), ctx=axs[2], cmap='Greys')
```

![Three 512-sized patches: RGB, label, and DSM, after the shared Resize](/blogs/pytorch-basics/06.webp)

*One `Resize(512)` applied to all three files, so geometric alignment is
settled before any augmentation happens.*

From there it is fastai's `aug_transforms` pipeline:

```python
tfms = aug_transforms(pad_mode='zeros', mult=2, min_scale=0.5)
for t in tfms:
    y = t(rgbTensor2, split_idx=0)
```

Watch the `split_idx` argument. It is what decides whether a transform runs
randomly during training or deterministically during validation. `split_idx=0`
marks the training split, so calling it returns a batch of random results;
point it at the validation index instead and the same transform gives you the
deterministic version. That is why every dataloader in a DataBlock has to
carry its own `split_idx`.

![Several augmented results from aug_transforms: scale, crop, rotate, and colour variation](/blogs/pytorch-basics/08.webp)

*Each transform in `aug_transforms` returns a set of candidates, and the
number of rows is `mult`.*

That said, the built-ins fit remote sensing badly. fastai treats a
`TensorMask`, the label, like any other image and interpolates it bilinearly,
whereas labels may only be resampled nearest. The more controllable route is
to build two pipelines with Kornia, one for RGB and one for the label, and
hold the geometric parameters identical:

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

out_rgb  = aug(rgbTensor)                     # carries ColorJitter
out_lbl  = aug(lblTensor)                     # same geometry, no colour op
out_dsm  = aug2(grayscale_to_rgb(dsmTensor))  # own pipeline, no jitter
```

Both pipelines spell `RandomRotation` and `CenterCrop` with identical
parameters, so the geometry lines up. They differ only in that RGB picks up a
`ColorJitter` and the DSM is first expanded to three channels by
`grayscale_to_rgb` so it can accept the same interface.

![Before and after: RGB, DSM, and label, where colour jitter lands only on the RGB](/blogs/pytorch-basics/09.webp)

*Top row is the original RGB, DSM, and label; bottom row is the augmented
result. The label is free of colour jitter while the RGB shifts slightly in
saturation and brightness.*

There is one more trap worth visiting deliberately. `image2tensor` returns a
`uint8` tensor, while the operators inside Kornia and `setup_aug_tfms` expect
`float32`. Feed them the raw uint8 tensor and they fail on a type mismatch:

```python
rgbTensor  = image2tensor(rgbImage)                       # uint8
rgbTensor2 = torch.tensor(rgbTensor, dtype=torch.float32)  # convert once

comp[0](rgbTensor2)   # only this runs
```

## Padding, and why it is reflect

Patch boundaries rarely land on empty ground; a crop often cuts a building in
half. At such an edge a convolution kernel sees a large block of padding
zeros, and the network happily learns the border texture as a shortcut. A
reflect pad mirrors the existing pixels outward instead, which is a cheap way
of pretending the image kept going:

```python
from torch.nn import functional as F

out_rgb_tensors.shape            # torch.Size([1, 3, 256, 256])

testPad = (123, 123, 123, 123)
padOutRGBTensor = F.pad(out_rgb_tensors, testPad, mode='reflect')
padOutRGBTensor.shape            # torch.Size([1, 3, 502, 502])
```

The four numbers are `(left, right, top, bottom)`, hence
`256 + 123 + 123 = 502`.

![After reflect padding, the patch is surrounded by a continuous mirrored extension of its edge pixels](/blogs/pytorch-basics/11.png)

*Compared with `zeros` padding, the reflect mode never introduces an abrupt
black band, so what a convolution sees at the boundary is statistically closer
to what it sees in the interior.*

## One numpy trick to keep

Label-processing code constantly needs "every pixel whose three channels all
equal this RGB value". Reducing along the channel axis with `np.all` is
exactly that query:

```python
aa = np.random.randint(0, 255, (2, 2, 3))     # shape (2, 2, 3)

i  = np.array((253, 160, 45)).reshape(1, 1, 3)
bb = np.all(aa == i, axis=2)                  # reduce over the channel axis
bb.shape                                        # (2, 2), channel axis is gone

aa[bb].shape                                    # (0, 3) matches, or empty
```

`aa == i` produces a `(2, 2, 3)` boolean array, and `np.all(..., axis=2)`
collapses the channel dimension, leaving `True` only where all three channels
hit. `bb` is therefore a 2D mask you can index the original array with, which
is the general form of the `arrays[arrays == v]` trick from `getMappedMask`,
except there `v` was a scalar and here it is a triple.
