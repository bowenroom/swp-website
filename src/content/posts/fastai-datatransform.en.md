---
title: "fastai Data Processing and Basic Transforms"
---

This walkthrough follows the shape of the official `data.transforms` docs: list
the files, split them, then define the transforms. Everything runs on *tiny
MNIST*, the two-class (`3` and `7`) subset, so each example stays small enough to
read in full. The focus is on the decisions behind the API — why normalization
belongs in `after_batch`, and why training and validation need two chains.

## Listing files with `get_files`

`get_files` is the general one: a path in, matching filenames out.

```python
def get_files(path, extensions=None, recurse=True, folders=None, followlinks=True):
    ","Get all the files in `path` with optional `extensions`, optionally with `recurse`, only in `folders`, if specified.","
    path = Path(path)
    folders = L(folders)
    extensions = {e.lower() for e in setify(extensions)}
    if recurse:
        res = []
        for i, (p, d, f) in enumerate(os.walk(path, followlinks=followlinks)):
            if len(folders) != 0 and i == 0: d[:] = [o for o in d if o in folders]
            else:                         d[:] = [o for o in d if not o.startswith('.')]
            if len(folders) != 0 and i == 0 and '.' not in folders: continue
            res += _get_files(p, f, extensions)
    else:
        f = [o.name for o in os.scandir(path) if o.is_file()]
        res = _get_files(path, f, extensions)
    return L(res)
```

The pruning at `i == 0` is the part worth understanding. When a dataset
directory also contains `models/`, `test/` and other trees you never want to
scan, deleting them from `d` the moment `os.walk` enters the top level costs
almost nothing. `d[:] = [...]` mutates the list `os.walk` yields, which is the
only pruning mechanism it supports.

The `","text","` wrapper on that docstring is not a typo. It is fastcore's
idiom for attaching a docstring, and it appears throughout fastai and fastcore.

Extension matching is the lowercase comparison inside `_get_files`:

```python
def _get_files(p, fs, extensions=None):
    p = Path(p)
    res = [p/f for f in fs if not f.startswith('.')
           and ((not extensions) or f'.{f.split(".")[-1].lower()}' in extensions)]
    return res
```

The `startswith('.')` check quietly removes `.DS_Store` and friends:

```python
t3 = get_files(path/'train'/'3', extensions='.png', recurse=False)   # 346
t7 = get_files(path/'train'/'7', extensions='.png', recurse=False)
t  = get_files(path/'train', extensions='.png', recurse=True)          # 709
test_eq(len(t), len(t3) + len(t7))
test_eq(len(get_files(path/'train'/'3', extensions='.jpg', recurse=False)), 0)
```

`709 = 346 + 363`. Switching the extension to `.jpg` returns nothing — the
cheapest possible proof that the filter works.

## `FileGetter`: building the getter you actually want

When the same arguments recur, wrap `get_files` in a partial. fastai's naming
convention is a CamelCase verb ending in `er`:

```python
def FileGetter(suf='', extensions=None, recurse=True, folders=None):
    ","Create `get_files` partial function that searches path suffix `suf`, only in `folders`, if specified, and passes along args","
    def _inner(o, extensions=extensions, recurse=recurse, folders=folders):
        return get_files(o/suf, extensions, recurse, folders)
    return _inner

fpng = FileGetter(extensions='.png', recurse=False)
test_eq(len(t7), len(fpng(path/'train'/'7')))
```

`suf` is appended to whatever path you pass in, so one instance works across
datasets with the path as the only varying argument.

`get_image_files` is `get_files` plus the standard image extensions:

```python
image_extensions = set(k for k, v in mimetypes.types_map.items() if v.startswith('image/'))

def get_image_files(path, recurse=True, folders=None):
    ","Get image files in `path` recursively, only in `folders`, if specified.","
    return get_files(path, extensions=image_extensions, recurse=recurse, folders=folders)
```

The extension list comes from the standard library rather than being
hand-maintained. In segmentation work it always needs `.tif` added, since
`mimetypes` need not know about GeoTIFF.

## Pulling fields out of tuples

Once items are `(image, mask)` tuples you often want one of them. `ItemGetter`
turns `itemgetter` into a real `Transform`:

```python
class ItemGetter(ItemTransform):
    ","Creates a proper transform that applies `itemgetter(i)` (even on a tuple)","
    _retain = False
    def __init__(self, i): self.i = i
    def encodes(self, x): return x[self.i]
```

`_retain = False` tells fastai not to reattach the type after `decodes`, because
indexing genuinely changes it. `AttrGetter` does the same for attributes:

```python
class AttrGetter(ItemTransform):
    ","Creates a proper transform that applies `attrgetter(nm)` (even on a tuple)","
    _retain = False
    def __init__(self, nm, default=None): store_attr()
    def encodes(self, x): return getattr(x, self.nm, self.default)

test_eq(AttrGetter('shape')(torch.randn([4, 5])), [4, 5])
test_eq(AttrGetter('shape', [0])([4, 5]), [0])   # a list has no shape, so use the default
```

## Splitting: random versus stratified

`RandomSplitter` returns **indices**, not data:

```python
def RandomSplitter(valid_pct=0.2, seed=None):
    ","Create function that splits `items` between train/val with `valid_pct` randomly.","
    def _inner(o):
        if seed is not None: torch.manual_seed(seed)
        rand_idx = L(list(torch.randperm(len(o)).numpy()))
        cut = int(valid_pct * len(o))
        return rand_idx[cut:], rand_idx[:cut]
    return _inner
```

Note the return order: `rand_idx[cut:]` is **train**, `rand_idx[:cut]` is
validation.

```python
src = list(range(30))
f = RandomSplitter(seed=42)
trn, val = f(src)
test_eq(len(trn), len(src) - len(val))
test_eq(f(src)[0], trn)     # same seed, same split
```

What `RandomSplitter` does not do is look at labels. With 28 road pixels and one
traffic cone, a 20% random split frequently leaves validation with no cone at all.
`TrainTestSplitter` delegates to scikit-learn for **stratified** splitting:

```python
from sklearn.model_selection import train_test_split

def TrainTestSplitter(test_size=0.2, random_state=None, stratify=None,
                      train_size=None, shuffle=True):
    ","Split `items` into random train and test subsets using sklearn train_test_split utility.","
    def _inner(o, **kwargs):
        train, valid = train_test_split(range_of(o), test_size=test_size,
                                        random_state=random_state, stratify=stratify,
                                        train_size=train_size, shuffle=shuffle)
        return L(train), L(valid)
    return _inner
```

Pass `stratify=labels` and every class keeps its proportion in validation. When a
rare class occupies only a few pixels, repeated random splits produce a
validation IoU of exactly zero — which looks like a broken model but is really a
broken split.

## End to end: MNIST in a `Datasets`

```python
path = untar_data(URLs.MNIST_TINY)
items = get_image_files(path)
```

Split on the directory name. `GrandparentSplitter` keys on the **grandparent**
directory, which for `train/3/7634.png` is `train`:

```python
splitter = GrandparentSplitter()
splits = splitter(items)
train, valid = (items[i] for i in splits)
```

Define the transforms. `tfms` is a list of lists: the **outer** index lines up
with each position in the output tuple, and the **inner** list is what runs, in
order, on that element.

```python
from PIL import Image

def open_img(fn: Path): return Image.open(fn).copy()
def img2tensor(im: Image.Image): return TensorImage(array(im)[None])

tfms = [[open_img, img2tensor],
        [parent_label, Categorize()]]
train_ds = Datasets(train, tfms)
```

Element 0 is the input: open as a PIL image, then wrap the array as a
`TensorImage`, `[None]` adding the channel axis. Element 1 is the target: the
parent directory name, turned into an index by `Categorize()`.

![A greyscale handwritten 3 with its decoded category string underneath](/blogs/fastai-datatransform/01.png)

*What `show_at(train_ds, 3)` draws: the image decoded back to PIL on top, and
the decoded label string `'3'` below it.*

```python
x, y = train_ds[3]      # TensorImage, TensorCategory(0)
xd, yd = decode_at(train_ds, 3)
test_eq(parent_label(train[3]), yd)                    # '3'
test_eq(array(Image.open(train[3])), xd[0].numpy())    # pixel-for-pixel identical
```

`decodes` genuinely reconstructs the original image rather than approximately
inverting the normalization, so every picture `show_batch` draws is real data.

## `ToTensor`: declaring a position, not doing work

`ToTensor` has no body beyond an order:

```python
class ToTensor(Transform):
    ","Convert item to appropriate tensor class","
    order = 5
```

It computes nothing. It only declares `order = 5`, and `order` determines where
the transform sits. This is how fastai mixes PIL-only and tensor-only transforms
without each hand-writing a type branch.

## `IntToFloatTensor`: one transform, three inputs

```python
class IntToFloatTensor(DisplayedTransform):
    ","Transform image to float tensor, optionally dividing by 255 (e.g. for images).","
    order = 10  # must run after PIL transforms, before the GPU
    def __init__(self, div=255., div_mask=1): store_attr()
    def encodes(self, o: TensorImage): return o.float().div_(self.div)
    def encodes(self, o: TensorMask):  return o.long() // self.div_mask
    def decodes(self, o: TensorImage):
        return ((o.clamp(0., 1.) * self.div).long()) if self.div else o
```

`encodes` is defined twice and dispatch happens on the **type annotation** — the
mechanism the whole `transform` module is built on. Images are divided by 255 into
`[0, 1]`; masks stay integral.

```python
t = (TensorImage(tensor(1)), tensor(2).long(), TensorMask(tensor(3)))
ft = IntToFloatTensor()(t)
test_eq(ft, [1./255, 2, 3])
test_eq(type(ft[0]), TensorImage)     # types survive
test_eq(type(ft[2]), TensorMask)
```

## `Normalize`: why it must live in `after_batch`

```python
class Normalize(DisplayedTransform):
    ","Normalize/denorm batch of `TensorImage`","
    parameters, order = L('mean', 'std'), 99
    def __init__(self, mean=None, std=None, axes=(0,2,3)): store_attr()

    def setups(self, dl: DataLoader):
        if self.mean is None or self.std is None:
            x, *_ = dl.one_batch()
            self.mean, self.std = x.mean(self.axes, keepdim=True), x.std(self.axes, keepdim=True) + 1e-7

    def encodes(self, x: TensorImage): return (x - self.mean) / self.std
```

Two details carry most of the meaning. First, `axes=(0,2,3)` computes statistics
over **every axis except the batch axis**, so normalization is **per channel**.
`keepdim=True` compresses the result to `(1, 3, 1, 1)` so it broadcasts against an
`(N, 3, H, W)` batch.

Second, `setups` measures a **single batch from the training set** rather than
scanning the dataset. The constants therefore depend on which images `shuffle`
happened to surface. For reproducible runs, compute them once over the training
split and pass them in:

```python
batch_tfms = [IntToFloatTensor(), Normalize.from_stats(mean, std)]
tdl = TfmdDL(train_ds, after_batch=batch_tfms, bs=4, device=default_device())
```

`from_stats` goes through `broadcast_vec`, which turns `(3,)` into `(1, 3, 1, 1)`:

```python
@classmethod
def from_stats(cls, mean, std, dim=1, ndim=4, cuda=True):
    return cls(*broadcast_vec(dim, ndim, mean, std, cuda=cuda))
```

Normalization belongs in `after_batch` rather than `after_item` for two reasons.
The statistics are only meaningful across samples, and `after_item` sees one
image at a time. And on GPU a per-batch normalization costs one kernel launch
while a per-sample one costs `bs` of them.

Here is that normalized batch:

![A normalized handwritten 7 on a deep purple background with bright yellow-green strokes](/blogs/fastai-datatransform/02.png)

![A second 7 from the same batch, with a different stroke shape](/blogs/fastai-datatransform/03.png)

![A third 7 from the same batch, with a wider top bar](/blogs/fastai-datatransform/04.png)

![A fourth 7 from the same batch, tilted slightly](/blogs/fastai-datatransform/05.png)

*This is what `tdl.show_batch((x, y))` renders after normalization. The colormap
range is restored to `[0, 1]` by `decodes`, so these are still ordinary greyscale
images — matplotlib's default colormap simply maps the ramp to purple and
yellow.*

The round trip checks out:

```python
x, y = tdl.one_batch()
xd, yd = tdl.decode((x, y))
assert x.mean() < 0.0          # normalized, mean near zero
assert x.std() > 0.5
assert 0 < xd.float().mean()/255. < 1     # decoded back to uint8 scale
assert 0 < xd.float().std()/255. < 0.5
```

## Types survive the whole pipeline

One more experiment is worth running: degrade `TensorImage` to a plain `Tensor`,
as a prediction looks after inference, and hand it to `show_batch` anyway.

```python
x, y = cast(x, Tensor), cast(y, Tensor)   # types dropped
test_ne(type(x), TensorImage)
tdl.show_batch((x, y), figsize=(1,1))      # the loader puts them back
```

![A 7 still displayed correctly after being downgraded to a plain Tensor](/blogs/fastai-datatransform/06.png)

![The second 7 from the same batch](/blogs/fastai-datatransform/07.png)

![The third 7 from the same batch](/blogs/fastai-datatransform/08.png)

![The fourth 7, identical to the fourth image above](/blogs/fastai-datatransform/09.png)

*Identical to the four above. `TfmdDL` remembered the type of the first sample
and reattached it before decoding. That is the `retain` step in `after_item`
doing its job.*

Saving checkpoints, exporting to ONNX and dropping predictions into a plotting
utility all tend to strip type information; here you can still visualize without
casting anything back.

## Why train and validation need two chains

`split_idx` is the least obvious mechanism in the system. A transform declares
which split it applies to:

```python
class _Tfm(Transform):
    split_idx = 1                    # validation only
    def encodes(self, x): return x * 2
    def decodes(self, x): return TitledStr(x // 2)
```

Given identical data and identical transforms, the training subset and the
validation subset then produce different results:

```python
dsets = Datasets(range(5), [_Tfm()], splits=[[1, 2], [0, 3, 4]])
dsets.train    # [(1,), (2,)]              not doubled
dsets.valid    # [(0,), (6,), (8,)]        doubled
```

Augmentation, Mixup and normalization all ride on this. At inference time you
temporarily flip `split_idx` and the same data takes the validation path:

```python
ds = dsets.train
with ds.set_split_idx(1):
    test_eq(ds, [(2,), (4,)])
test_eq(dsets.train, [(1,), (2,)])         # restored on exit
```

`set_split_idx` restores the old value in its `finally` block, so an exception
mid-loop will not leave every subsequent batch on the wrong branch.

## What this design costs

The transform system is not free. It carries implicit conventions: `order`
decides sequence, `split_idx` decides branch, `_retain` decides whether types are
reattached, annotations decide dispatch, `setups` decides when statistics are
computed. A transform can look correct, pass a smoke test, and silently do
nothing.

What it buys is that once a transform is right, four paths stay consistent for
free: training, validation, inference and visualization. The bug class where
augmentation leaks into evaluation, or where normalization constants differ
between two runs, simply stops happening.
