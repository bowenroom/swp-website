---
title: "fastai Data Core: The Logic of Getting Data"
---

fastai's data core is not one class but four interlocking layers. `TfmdLists`
binds items to a `Pipeline`. `Datasets` joins several `TfmdLists` positionally
into tuples, which is how "input, target" gets expressed. `TfmdDL` bolts onto
PyTorch's `DataLoader` for batching, decoding and display. `DataLoaders` bundles
the training and validation loaders together. These are my notes from reading
`fastai.data.load` top to bottom.

## Where the data comes from

The notebook opens on the Potsdam remote-sensing dataset, listing the RGB image
and label directories separately:

```python
path_img = data_path / 'Potsdam/2_Ortho_RGB/train_pick'
path_lbl = data_path / 'Potsdam/5_Labels_for_participants'
fnames = get_image_files(path_img)
lbl_names = get_image_files(path_lbl)
```

That is all it does — list two directories, with no pairing into
`(image, mask)`. Filenames could be matched by prefix, but missing files and
multi-date imagery need separate checks, and the notebook runs none of them.
Examples below use small synthetic lists instead.

## `TfmdLists`: items plus a pipeline

The base layer binds a pile of objects to a transform pipeline:

```python
tl = TfmdLists(items, tfms=tfms)
```

`items` goes to `L` (fastai's list subclass) and `tfms` goes to a `Pipeline`,
wrapping a plain list of transforms if needed. Retrieval happens in `__getitem__`
through `_after_item`:

```python
def __getitem__(self, idx):
    res = super().__getitem__(idx)
    if self._after_item is None: return res
    return self._after_item(res) if is_indexer(idx) else res.map(self._after_item)
```

The `is_indexer(idx)` branch is the part to notice. A single integer transforms
one element; a list or slice takes the `res.map(self._after_item)` path, so
`tl[0]` and `tl[0, 1]` return different types.

### setup: run one pass and remember the types

`setup` calls each transform's `setups`, then does something subtler — **it takes
one sample, runs the whole pipeline over it, and records the type after every
step**:

```python
def setup(self, train_setup=True):
    self.tfms.setup(self, train_setup)
    if len(self) != 0:
        x = super().__getitem__(0) if self.splits is None else super().__getitem__(self.splits[0])[0]
        self.types = []
        for f in self.tfms.fs:
            self.types.append(getattr(f, 'input_types', type(x)))
            x = f(x)
        self.types.append(type(x))
```

This explains two things that otherwise read as bare convention. First, the
sample comes from `splits[0]` — the **training** split — so anything `setups`
computes reflects training only. The notebook checks this explicitly: after
moving `kid_1.jpg` into validation, the vocabulary holds only `['dog']`, because
`kid` never appears in training.

Second, `getattr(f, 'input_types', type(x))` is the hook for type inference. By
default layer `i`'s input type is layer `i-1`'s output type; a transform that
declares `input_types` breaks that chain deliberately.

### `infer_idx` and `infer`: running only the tail

With `types` in hand, a **new** object can be matched to where it belongs in the
pipeline:

```python
def infer_idx(self, x):
    idx = 0
    for t in self.types:
        if isinstance(x, t): break
        idx += 1
    assert idx < len(self.types), f"Expected an input of type in \n{pretty_types}\n but got {type(x)}"
    return idx
```

This is a naive first-match scan with no `order` sorting and no caching. In
practice it relies on the types not overlapping; with any inheritance
relationship it can match an earlier layer than intended. `infer` then slices
`self.tfms.fs` and composes the remainder:

```python
def infer(self, x):
    return compose_tfms(x, tfms=self.tfms.fs[self.infer_idx(x):], split_idx=self.split_idx)
```

This matters at inference time: the input might be a uint8 image off disk or an
already-normalized float tensor, and `infer` lets one pipeline accept both
without a hand-written branch.

## `Datasets`: assembling the tuple

`Datasets` is the layer segmentation work actually uses. It holds several
`TfmdLists` internally, and indexing returns a **tuple**:

```python
dsets = Datasets(items, [[neg_tfm, int2f_tfm], [add(1)]])
t = dsets[0]
test_eq(t, (-1, 2))
test_eq(dsets[0, 1, 2], [(-1, 2), (-2, 3), (-3, 4)])
```

Entry `i` of the outer list corresponds to position `i` in the output tuple; the
inner list is what runs there. Here position 0 is the input and position 1 the
target.

With a single inner list the result is a **one-element tuple**, not a bare value,
which lets downstream code skip a branch:

```python
dsets = Datasets(inp, tfms=[None])
dsets[2]        # (2,)
```

### `n_inp`: how many leading entries are inputs

This is the most important number on `Datasets`. A training loop needs to know
which entries are inputs before it can compute a loss:

```python
self.n_inp = ifnone(n_inp, max(1, len(self.tls) - 1))
```

The default is `max(1, n_layers - 1)`: two layers gives 1 (input plus target),
three gives 2 — the Siamese-network case, or tabular data.

```python
dsets = Datasets(inp, tfms=[[None], [None], [None]])         # n_inp == 2
dsets = Datasets(inp, tfms=[[None], [None], [None]], n_inp=1) # n_inp == 1
```

`n_inp` is also what tells the loader how to split the tuple back into `x, y`.
That is why it lives on `Datasets` rather than the `DataLoader`.

### Attribute forwarding

`Datasets` uses `gather_attrs` to hoist attributes out of the inner `TfmdLists`:

```python
test_eq(dsets.m, nrm.m)         # reach the transform's mean directly
test_eq(dsets.norm.m, nrm.m)    # even select a sub-transform by name
test_eq(dsets.train.norm.m, nrm.m)
```

That last line requires the train subset's transform to be the *same instance* as
the parent's, not a copy.

## `split_idx`: one integer, three paths

The least obvious mechanism is also the one that saves the most work. A
transform declares which split it applies to:

```python
class _Tfm(Transform):
    split_idx = 1              # validation only
    def encodes(self, x): return x * 2
    def decodes(self, x): return TitledStr(x // 2)
```

Same data, same transforms, different results per subset:

```python
dsets = Datasets(range(5), [_Tfm()], splits=[[1, 2], [0, 3, 4]])
dsets.train    # [(1,), (2,)]        unchanged
dsets.valid    # [(0,), (6,), (8,)]  doubled
```

`subset(i)` carries `split_idx=i` onto the new object:

```python
def subset(self, i):
    return type(self)(tls=L(tl.subset(i) for tl in self.tls), n_inp=self.n_inp)
```

And `split_idx = ifnone(split_idx, self.split_idx)` in `TfmdLists._new` means a
`None` argument inherits the existing value, so `dsets.train.train` keeps training
semantics.

At inference time there is no need for a second dataset. Flip `split_idx`
temporarily:

```python
ds = dsets.train
with ds.set_split_idx(1):
    test_eq(ds, [(2,), (4,)])
test_eq(dsets.train, [(1,), (2,)])   # restored on exit
```

`set_split_idx` restores the old value in `finally`. A manual assignment that
throws partway through leaves every subsequent batch on the wrong branch, and
that failure does not raise — it just makes the metrics quietly implausible.

## `TfmdDL`: the batching layer

`TfmdDL` subclasses PyTorch's `DataLoader` and wraps three callbacks as
`Pipeline`s at construction time:

```python
_batch_tfms = ('after_item', 'before_batch', 'after_batch')

for nm in _batch_tfms:
    kwargs[nm] = Pipeline(kwargs.get(nm, None))
super().__init__(dataset, bs=bs, shuffle=shuffle, num_workers=num_workers, **kwargs)
if do_setup:
    for nm in _batch_tfms:
        kwargs[nm].setup(self)
```

The division of labour: `after_item` runs per sample, `before_batch` runs before
collating (a good place for padding), `after_batch` runs over the assembled batch.
All three are set up at construction, which is why `after_batch=Normalize()` can
measure statistics on the first batch.

`n_inp` and the type information are **computed lazily**, from one pass:

```python
def _one_pass(self):
    b = self.do_batch([self.do_item(0)])
    if self.device is not None: b = to_device(b, self.device)
    its = self.after_batch(b)
    self._n_inp = 1 if not isinstance(its, (list, tuple)) or len(its) == 1 else len(its) - 1
    self._types = explode_types(its)
```

One sample, both transform stages applied, result types remembered.
`_retain_dl` then reattaches them before decoding:

```python
def _retain_dl(self, b):
    if not getattr(self, '_types', None): self._one_pass()
    return retain_types(b, typs=self._types)
```

That is why `show_batch` still works after a prediction is downgraded to a plain
`Tensor` — the type comes back, and `TensorImage.show` with it.

### `to`: moving transform state to the GPU too

`TfmdDL.to(device)` walks the `parameters` attribute of every transform in
`after_batch` and moves the tensors each declares to the same device:

```python
class B(Transform):
    parameters = 'a'
    def __init__(self): self.a = torch.tensor(0.)
    def encodes(self, x): x

tdl.to(default_device())
test_eq(tdl.after_batch.fs[0].a.device, default_device())
```

`parameters = 'a'` is a contract the transform declares for itself, and
`Pipeline.fs[0]` is reachable because `fs` is simply the transform list. Without
it a cached tensor stays on the CPU and `encodes` raises a device mismatch.

## `DataLoaders`: collecting the two loaders

The last layer removes `dls[0]` and `dls[1]` from training loops:

```python
train   , valid    = add_props(lambda i, x: x[i], _set)
train_ds, valid_ds = add_props(lambda i, x: x[i].dataset)
```

`add_props` generates getters and setters together, so `dls.train = dls.train.new(bs=4)`
takes effect immediately. `device` is a property whose setter broadcasts down:

```python
@device.setter
def device(self, d):
    for dl in self.loaders: dl.to(d)
    self._device = d
```

`cuda()` and `cpu()` are shortcuts. `from_dsets` handles the train/validation
asymmetry at construction — shuffle and drop_last on, then both off:

```python
default = (True,) + (False,) * (len(ds) - 1)
defaults = {'shuffle': default, 'drop_last': default}
```

`new_empty()` keeps the transforms but discards the data, a convenient placeholder
while the dataset is still being assembled.

## Inference: borrowing the validation transforms

The last section is a helper I added myself. A test set should take the
validation transform chain but run it over different data, so copy the
`TfmdLists`, set `split_idx` to 1, and trim the leading transforms by type:

```python
def test_set(dsets, test_items, rm_tfms=None, with_labels=False):
    if isinstance(dsets, Datasets):
        tls = dsets.tls if with_labels else dsets.tls[:dsets.n_inp]
        test_tls = [tl._new(test_items, split_idx=1) for tl in tls]
        if rm_tfms is None:
            rm_tfms = [tl.infer_idx(get_first(test_items)) for tl in test_tls]
        for i, j in enumerate(rm_tfms):
            test_tls[i].tfms.fs = test_tls[i].tfms.fs[j:]
        return Datasets(tls=test_tls)
```

`rm_tfms` reuses the `infer_idx` machinery: whether the input is a filename
(`str`) or an already-loaded tensor decides where the chain starts. This is not
official fastai API, but it ties three things together — `split_idx` choosing the
branch, `infer_idx` the entry point, `Datasets` reassembling the tuple.

The companion `test_dl` wraps the result in a fresh `TfmdDL`:

```python
@patch
@delegates(TfmdDL.__init__)
def test_dl(self: DataLoaders, test_items, rm_type_tfms=None,
            with_labels=False, **kwargs):
    test_ds = test_set(self.valid_ds, test_items, rm_tfms=rm_type_tfms,
                       with_labels=with_labels)
    return self.valid.new(test_ds, **kwargs)
```

`@patch` attaches it as a `DataLoaders` method, so it reads like `dls.train` and
`dls.valid`:

```python
tst_dl = dls.test_dl([2, 3, 4, 5])
list(tst_dl)          # [(tensor([4, 6, 8, 10]),)]
```

Using `new` rather than a fresh `__init__` carries over the batch-level transforms
like `after_item` and `before_batch`; without them the test run skips
normalization and the numbers will not match.

## What reading it left me with

Not one line across these four layers exists to make fetching data faster.
`TfmdLists` pays for a type check per layer, `Datasets` for `gather_attrs`
forwarding, `TfmdDL` for reattaching types on every batch. What it buys is that
training, validation and inference share one transform chain with the difference
decided by a single integer; every layer's statistics come from the training
split only; and `decodes` turns training-time tensors back into displayable
originals.

The cost is explicit convention: you have to know what `n_inp`, `split_idx`,
`parameters` and `input_types` each mean. That a helper like `test_set` is
writable at all is itself evidence the conventions are clear enough.
