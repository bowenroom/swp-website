---
title: "A Tour of the JLDCF Dataset"
---

Salient object detection leans on RGB-D data, because a colour image alone cannot reliably answer "which region deserves attention". JLDCF provides an RGB-D salient object collection, and this post records the practical problems I hit while preparing it: channel order, how to read a single-value depth image, what a three-dimensional slice actually means, and how to synthesise fog for robustness experiments.

The code is built on `fastai` and `kornia`, with the depth images read through `opencv`.

## How the data is organised

The collection is stored as parallel directories, with RGB, depth and ground truth in one folder each:

```python
rootPath = Path('.../RGBDcollection/')
rgbPath = rootPath / 'LR/'
depPath = rootPath / 'depth/'
gtPath  = rootPath / 'GT/'

rgbFiles = get_image_files(rgbPath)
depFiles = get_image_files(depPath)
lblFiles = get_image_files(gtPath)
```

The three sets have to correspond by filename. Before reading anything at scale, pull one triple, print its shape and contents, and confirm the RGB image, the depth image and the mask are genuinely aligned — if those three are off by even one file, nothing downstream can be trusted.

![An RGB image next to its corresponding depth map](/blogs/jldcf/01.webp)

*RGB on the left, depth on the right. Every pixel of the depth map refers to the same location in the RGB image, so the two must align exactly.*

![The depth map beside the saliency ground truth](/blogs/jldcf/02.png)

*Depth map and saliency ground truth side by side. Brighter regions in the ground truth mark the salient object.*

## First trap: PIL reads one channel, OpenCV reads three

This is what I hit first on this dataset. **For the same depth image, PIL returns a single channel while OpenCV gives you three dimensions.**

```python
from PIL import Image
import cv2

# PIL: one channel only
depImage = Image.open(depFiles[0])
depImage.shape      # (H, W)

# OpenCV: keeps the three-dimensional structure
im = cv2.imread('.../10_01-16-36_0_Depth.png', -1)
in_ = np.array(im, dtype=np.float32)
in_.shape           # (H, W, 3)
```

The reason is that these depth images are 24-bit PNGs. They are stored with three channels whose values happen to be identical. `PIL` collapses that "multi-channel with identical content" into one channel; `cv2.imread` does no such collapsing and hands you the raw three-dimensional array.

This is not a bug, it is two libraries interpreting the same file differently. **When dimensions refuse to line up on data like this, reach for `cv2.imread(..., -1)` to force a read at the original bit depth.**

## Second trap: channel order and normalisation

Note that `cv2` reads BGR by default, not RGB. The normalisation constants have to match that order, or normalisation silently lands on the wrong channels:

```python
def Normalization(image):
    # reverse the last axis, turning BGR into RGB
    in_ = image[:, :, ::-1]
    in_ = in_ / 255.0
    in_ -= np.array((0.485, 0.456, 0.406))   # ImageNet mean, in RGB order
    in_ /= np.array((0.229, 0.224, 0.225))   # ImageNet std, in RGB order
    return in_
```

That `::-1` slice converts BGR to RGB so it agrees with the mean and standard deviation. **If the order is inconsistent, nothing raises an error — the metric just comes out inexplicably worse**, and that class of bug is expensive to track down.

The mask is a single-channel greyscale image and normalises differently:

```python
def load_sal_label(path, image_size):
    im = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    label = np.array(im, dtype=np.float32)
    label = cv2.resize(label, (image_size, image_size))
    label = label / 255.0
    label = label[..., np.newaxis]   # add the channel axis, giving (H, W, 1)
    return label
```

## Third trap: what a three-dimensional slice means

Reading the depth images involves slices like `image[:, :, ::-1]`. To pin down the semantics I ran them on a small array:

```python
b = np.array([[[ 1,  2,  3,  4], [ 5,  6,  7,  8], [ 9, 10, 11, 12]],
              [[13, 14, 15, 16], [17, 18, 19, 20], [21, 22, 23, 24]],
              [[25, 26, 27, 28], [29, 30, 31, 32], [33, 34, 35, 36]]])

print(b.shape)                    # (3, 3, 4)
print(b[:, :, ::-1].shape)        # (3, 3, 4)  reversed on the last axis
print(b[0, ::].shape)             # (3, 4)    image 0
print(b[0:2, ::].shape)           # (2, 3, 4)  the first 2 images
print(b[:, 0:].shape)             # (3, 1, 4)  row 0
print(b[:, -1:].shape)            # (3, 1, 4)  the last row
```

**The conclusion**: in an `(H, W, C)` layout, `[:, a, b]` means "all images, row a, all columns", while `[a, :, :]` means "image a, all rows, all columns". The two are easy to confuse because the index order reads like "row, column, image" when it is actually "image, row, column". Getting this straight is what keeps `-1:` from pointing at the wrong axis.

## Side experiment: synthesising fog

For robustness work I need fog applied during training. I generate it from fractal noise built with the diamond-square algorithm:

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

The algorithm starts from a single point and repeatedly takes the midpoint of each square and each diamond, doubling the resolution each round while adding random perturbation. The result is a heightmap with natural-looking texture, which makes it a good stand-in for fog because real fog has exactly that irregular mottling.

Overlay it on the image:

```python
def fog(x, severity=1):
    c = [(1.5, 2), (2, 2), (2.5, 1.7), (2.5, 1.5), (3, 1.4)][severity - 1]

    x = np.array(x) / 255.
    max_val = x.max()
    x += c[0] * plasma_fractal(wibbledecay=c[1])[:224, :224][..., np.newaxis]
    return np.clip(x * max_val / (max_val + c[0]), 0, 1) * 255
```

Higher `severity` means thicker fog. The closing `x * max_val / (max_val + c[0])` is a rescale in reverse: adding fog pushes pixel values past the original maximum, and this pulls them back into range so that clipping does not blow out large areas to pure white.

## Worth remembering when preparing this kind of data

1. **When dimensions disagree, reach for `cv2.imread(path, -1)`** to read at the original bit depth. Most "a channel is missing" problems live here.
2. **`cv2` hands you BGR.** Adjust the normalisation constants to match, because a wrong order fails silently.
3. **In `(H, W, C)`, slicing runs image, row, column** — especially easy to get wrong when using `-1:`.
4. **Give the mask a channel axis** (`[..., np.newaxis]`) so it shares a shape convention with the RGB image and broadcasting behaves.

None of these are model problems; they are all data-reading details. After the first pass through them, preparing the next dataset is considerably faster.
