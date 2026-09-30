---
title: Building a Sliding Window with unfold and fold
---

Slicing a large image into patches and stitching those patches back together
turns up in almost every remote-sensing and segmentation pipeline. The
awkward part is that `unfold` sounds far too clever to use. This post starts
from a 3x4x4 tensor built out of `torch.arange` and works out every shape
change by hand, then performs a real cut-and-restore with `torch.nn.Unfold`
and `torch.nn.Fold`.

## The shape rule behind tensor.unfold

The signature is `x.unfold(dim, size, step)`: on dimension `dim`, take runs of
`size` elements advancing by `step`. The whole rule fits in one line. If
`x.shape` is `(a, b, ...)` then after `x.unfold(c, d, e)` the length of
dimension `c` becomes

```text
floor((a - d) / e) + 1
```

and one extra dimension of length `size` (that is, `d`) is appended at the
very end. A minimal example:

```python
x = torch.arange(48).view(3, 4, 4)
x.shape                      # torch.Size([3, 4, 4])

x.unfold(0, 2, 1).shape      # torch.Size([2, 4, 4, 2])
```

Dimension 0 has length 3; taking 2 with step 1 gives `floor((3-2)/1)+1 = 2`.
Notice the `+1`: a window that starts on the final element is kept, even
though it runs past the end of the axis.

One thing is worth knowing before doing any of this arithmetic: `unfold`
returns a **view**, not a copy. `x.unfold(...)` only records a set of offsets,
and the data itself stays where it was, so the call is nearly free and costs no
extra device memory. What actually materialises the window data is whatever
comes after — `ToPILImage()` or `.contiguous()` — which is the point the memory
section comes back to.

Change the step and the overlap becomes obvious:

```python
x.unfold(0, 3, 3).shape      # torch.Size([1, 4, 4, 3])
```

`floor((3-3)/3)+1 = 1`, so a single window is produced, and this time it
consumes the whole of dimension 0. `unfold` can be chained to cut several
axes at once, which is where the sliding window comes from:

```python
x.unfold(0, 3, 3).unfold(1, 2, 2).shape
# torch.Size([1, 2, 4, 3, 2])

x.unfold(0, 3, 3).unfold(1, 2, 2).unfold(2, 2, 2).shape
# torch.Size([1, 2, 2, 3, 2, 2])
```

After three chained calls the result is `(1, 2, 2, 3, 2, 2)`: the first three
dimensions are the window's position in space, dimension 3 is the channel
count, and the trailing `2 x 2` is the window itself. Read it as "batch of 1,
3 channels, a 4x4 image cut into four non-overlapping 2x2 patches", and the
six numbers stop looking arbitrary.

## Checking the formula on realistic dimensions

Small examples make `unfold` look tidy. Real imagery is not so cooperative.
For a 5176 x 3793 image with 128-pixel windows and stride 128:

```python
temp = torch.randint(0, 10, (3, 5176, 3793))

temp.unfold(0, 3, 3).shape             # torch.Size([1, 5176, 3793, 3])
temp.unfold(0, 3, 3)
     .unfold(1, 128, 128).shape         # torch.Size([1, 40, 3793, 3, 128])
temp.unfold(0, 3, 3)
     .unfold(1, 128, 128)
     .unfold(2, 128, 128).shape         # torch.Size([1, 40, 29, 3, 128, 128])
```

The two counts come straight from the formula:

```python
math.floor((5176 - 128) / 128) + 1     # 40
math.floor((3793 - 128) / 128) + 1     # 29
```

Both match the shapes exactly. Note that 3793 is not a multiple of 128, and
the leftover 81 rows are simply dropped. `unfold` does not pad; it stops at
the last legal starting position. Any real tiling pipeline has to deal with
this: either crop to a multiple first, or use `torch.nn.Unfold` together with
a mask so the remainder is not thrown away.

There is one counter-intuitive detail here: the *value* returned by `unfold`
does not depend on the step. The `test_eq` line in the notebook exists to prove
exactly that.

```python
test_eq(temp.unfold(0, 3, 3), temp.unfold(0, 3, 4))
```

Both calls pass, because on that axis `size=3` happens to equal the axis
length of 3, so only one window arrangement is possible. Put differently, the
step governs the *arrangement* of the windows — how many there are and whether
they overlap — and not the *contents* of any individual window. That is also
why step never appears in the resulting shape.

## Splitting the patches into a list

`tensor.unfold` returns one large tensor. Turning that into a batch takes a
little bookkeeping. Below, a 1500x1500 image is cut into four 512-pixel
patches with no overlap:

```python
patch_size = 512
stride = patch_size

im1 = Image.open('niobrara_photo_lrg.jpg').resize((1500, 1500), Image.BILINEAR)
rgb_image = transforms.ToTensor()(im1)
rgb_image.shape                       # torch.Size([3, 1500, 1500])

patches = rgb_image.data.unfold(0, 3, 3) \
                    .unfold(1, patch_size, stride) \
                    .unfold(2, patch_size, stride)
patches.shape                         # torch.Size([1, 2, 2, 3, 512, 512])
```

Two `split` calls flatten the window-index dimensions:

```python
rows = patches.split(1, dim=1)
len(rows)                             # 2
rows[0].shape                         # torch.Size([1, 1, 2, 3, 512, 512])

for i in range(patches.shape[1]):
    cols = rows[i].split(1, dim=2)
    for j in range(patches.shape[2]):
        img = ToPILImage()(cols[j].squeeze(0).squeeze(0).squeeze(0))
```

The three `squeeze` calls remove the batch, column and patch index in turn,
leaving a well-behaved `[3, 512, 512]` image tensor.

![The Niobrara river image cut into a 2x2 grid of 512-pixel squares](/blogs/torch-unfold/01.webp)

*A 1500x1500 source; `unfold` yields four 512x512 patches, with a margin on
each side that no window covers.*

## A real cut-and-restore with nn.Unfold and nn.Fold

`torch.nn.Unfold` is the parameterised version. Kernel and stride live in the
constructor, and the appended dimension is by default the flattened size of
the whole kernel — every overlapping pixel concatenated into one vector.

```python
inp = torch.randn(1, 3, 10, 12)
inp_unf = torch.nn.functional.unfold(inp, (4, 5))
inp_unf.shape                        # torch.Size([1, 60, 56])
```

`3 x 4 x 5 = 60` is the flattened patch length, and the trailing 56 is the
number of windows: `floor((10-4)/1)+1 = 7` rows by `floor((12-5)/1)+1 = 8`
columns, so `7 x 8 = 56`.

`torch.nn.Fold` is the inverse, with one caveat: overlapping regions are
accumulated, so the result has to be normalised by a mask built the same way.

```python
def split_tensor(tensor, tile_size=256):
    mask = torch.ones_like(tensor)
    stride = tile_size // 2
    unfold = nn.Unfold(kernel_size=(tile_size, tile_size), stride=stride)
    mask_p = unfold(mask)
    patches = unfold(tensor)
    patches = patches.reshape(3, tile_size, tile_size, -1).permute(3, 0, 1, 2)
    return patches, mask_p, (tensor.size(2), tensor.size(3))

def rebuild_tensor(patches, mask_p, t_size, tile_size=256):
    stride = tile_size // 2
    base = patches.permute(1, 2, 3, 0).reshape(3 * tile_size * tile_size, -1)
    base = base.unsqueeze(0)
    fold = nn.Fold(output_size=(t_size[0], t_size[1]),
                   kernel_size=(tile_size, tile_size), stride=stride)
    return fold(base) / fold(mask_p)
```

The division by `fold(mask_p)` is not optional. That mask counts how many
windows cover each pixel; dividing by it once undoes the repeated
accumulation, and only then does the restored tensor match the input. On a
1024-wide test image with 660-pixel tiles and a stride of `tile_size // 2`,
this produces 6 tiles of `[1, 3, 660, 660]`, and they reassemble into a
1365x1024 image.

![Six overlapping 660-pixel tiles](/blogs/torch-unfold/06.webp)

*With a stride of half a tile, adjacent tiles overlap by 330 pixels; the
overlap is added twice by `fold`.*

![Overlapping regions restored after normalisation](/blogs/torch-unfold/12.webp)

*Left: a single tile. Right: six tiles folded back into the original, with no
visible seam where they meet — the normalisation is doing its job.*

## Two things that reliably bite

First, `unfold` drops the boundary. `5176 -> 40` tiles, `3793 -> 29` tiles,
and those 81 rows vanish. If they carried usable high-resolution detail, that
is real signal thrown away.

Second, `nn.Unfold` and `tensor.unfold` are not the same function. The former
appends a dimension of `C x kH x kW`; the latter appends `size` itself. Handing
the output of `tensor.unfold` straight to `nn.Fold` fails on shape mismatch.
For an actual restore, the working route is `nn.Unfold -> reshape -> permute
-> nn.Fold`.
