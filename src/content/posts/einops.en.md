---
title: "einops: Reshaping a Tensor in One Line"
---

`reshape`, `permute`, `squeeze` and `transpose` show up in nearly every vision model, but their arguments are bare numbers. To read the line you have to hold a mental table of which axis is which. `einops` makes one change: it lets you write that table into the code.

![Swapping the height, width and channel axes in a single readable line](/blogs/einops/01.webp)

*The same operation expressed as "re-interpret `h w c` as `w h c`". Run it and show the result, and you never have to go back and check an index.*

## Starting from a real tensor

Everything here runs on one RGB orthoimage from the Potsdam dataset:

```python
from fastai.vision.all import *
from einops import rearrange, reduce, repeat

imgNames = get_image_files("Potsdam/2_Ortho_RGB")
temp = TensorImage(Image.open(imgNames[0]))
temp.shape
# torch.Size([512, 520, 3])
```

Note the shape: `[512, 520, 3]`, not `[3, 512, 520]`. fastai's `TensorImage` keeps PIL's `HWC` order rather than the `CHW` that PyTorch image operators assume. That gap is exactly where `einops` earns its place, because `HWC` and `CHW` written as raw indices are close to unreadable.

## Swapping axes: the order is the code

Transposing the image takes one line:

```python
rearrange(temp, 'h w c -> w h c').shape
# torch.Size([520, 512, 3])
```

The left side names the input axes, the right side names the output axes, and the arrow points between them. No numbers, no `dim=` argument, no wondering whether you owe a `contiguous()`. To change the order you change the letters on the right; to go back, reverse the arrow.

## Merging and splitting are the same operation, in two directions

The part that makes this stick is that merging and splitting are not two different tools. You can chain them in a single call, with no intermediate in between:

```python
rearrange(temp, 'g b (c1 c2) -> (c1 b) (c2 g)', c1=3).shape
```

This splits `c` into `c1 c2` (with `c1=3`), then merges `g` and `b` into one axis as `(c1 b)` and merges `c2` and `g` into another as `(c2 g)`. The point is that **one expression can both split and merge**, and nothing lands in between. You see this constantly with attention heads, where `heads` and `embed_dim` are entangled dimensions that have to be pulled apart and recomposed.

![Splitting and merging axes in the same expression](/blogs/einops/02.webp)

## Why it is worth the dependency

Compare two ways of splitting a `CHW` channel axis in half and normalizing each half:

```python
# the usual version
x = x.permute(0, 2, 3, 1)          # NCHW -> NHWC
x = x.reshape(x.shape[0], x.shape[1], x.shape[2], 2, -1)
mean, std = x.mean(dim=-1), x.std(dim=-1)
x = torch.stack([(x[..., 0, :] - mean) / std, (x[..., 1, :] - mean) / std], dim=-2)
x = x.reshape(*x.shape[:-2], -1)
x = x.permute(0, 3, 1, 2)          # NHWC -> NCHW
```

```python
# the einops version
mean, std = rearrange(x, 'b c h w -> b h w c mean std', mean=1, std=1).unbind(-1)
normalized = rearrange([mean, std], 'b h w c two -> b two c h w', two=2)
```

The second version says which axes it is working on. `rearrange` returns an ordinary `torch.Tensor`, not a wrapper type, so it can be handed to anything that accepts a tensor. Migration cost is essentially zero.

## Three practical notes

1. **`einops` only rearranges; it does not compute.** There is no `mean` or `softmax` here — those stay in `torch`. `reduce` looks like an aggregation, but what it actually does is rearrange plus a `reduction` argument such as `max` or `sum`; anything more involved still belongs in PyTorch.
2. **The result may not be contiguous.** `einops` inserts a `reshape` or `contiguous` when it needs to, but if you are feeding a custom CUDA kernel with a layout assumption, check explicitly.
3. **Axis names are arbitrary strings.** Still, in shared code, consistent names (`b` batch, `c` channel, `h w` spatial, `t` time, `e` embed, `g` group) save everyone else a lot of time.

The forward pass is unchanged and not a single number moves, but the code returns to the level where one reading is enough. For segmentation work, where checking tensor shapes is a daily activity, that is worth one dependency.
