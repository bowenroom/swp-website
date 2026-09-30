---
title: "Helper Functions in the fastai DataLoader"
---

fastai's `DataLoader` looks almost identical to PyTorch's from the outside, but
underneath it does not reimplement the multiprocess machinery. Instead it builds
a *fake* PyTorch loader (`_FakeLoader`), shapes it into whatever the PyTorch
iterators expect, and hangs its real sampling logic off hooks like `wif`,
`after_item` and `before_batch`. This post takes that structure apart, focusing
on the three small helpers that make it work — `_wif`, `fa_collate` and
`fa_convert` — and on when the extra layer actually pays for itself.

## Why a fake loader at all

PyTorch's multiprocess `DataLoader` carries a lot of internal state: samplers,
collate functions, `prefetch_factor`, `dataset_kind`, all of which have to
survive the trip between the main process and each worker. fastai does not try
to replicate any of it. It imports the three iterator classes straight out of
`torch.utils.data.dataloader` and wraps them:

```python
from fastai.torch_basics import *
from torch.utils.data.dataloader import (
    _MultiProcessingDataLoaderIter, _SingleProcessDataLoaderIter, _DatasetKind)

_loaders = (_MultiProcessingDataLoaderIter, _SingleProcessDataLoaderIter)
```

`_loaders` is indexed by `num_workers == 0`, matching PyTorch's own two-way
dispatch. `_FakeLoader` only has to supply the attributes the PyTorch iterators
read while they run:

```python
class _FakeLoader:
    _IterableDataset_len_called, _auto_collation, collate_fn, drop_last = (
        None, False, noops, False)
    _index_sampler, generator, prefetch_factor = Inf.count, None, 2
    dataset_kind = _dataset_kind = _DatasetKind.Iterable

    def __init__(self, d, pin_memory, num_workers, timeout, persistent_workers):
        self.dataset, self.default, self.worker_init_fn = self, d, _wif
        store_attr('d,pin_memory,num_workers,timeout,persistent_workers')

    def __iter__(self):
        return iter(self.d.create_batches(self.d.sample()))
```

The last line is the important one: the actual iteration happens on
`self.d.create_batches(...)`, which lives on the outer `DataLoader`.
`_FakeLoader` is an envelope. It exists to satisfy the PyTorch iterator, which
believes `self.d` is the dataset and that the collate function is a no-op. The
payoff is that fastai only has to fix one class when PyTorch renames something
private.

`no_multiproc()` is the escape hatch for when a batch has to be produced in a
single process — computing statistics, for instance:

```python
@contextmanager
def no_multiproc(self):
    old_num_workers = self.num_workers
    try:
        self.num_workers = 0
        yield self.d
    finally: self.num_workers = old_num_workers
```

## `_wif`: what each worker does on startup

PyTorch calls `worker_init_fn` when a worker process starts. fastai passes it
`_wif`, which does four things:

```python
def _wif(worker_id):
    set_num_threads(1)
    info = get_worker_info()
    ds = info.dataset.d
    ds.num_workers, ds.offs = info.num_workers, info.id
    set_seed(info.seed)
    ds.wif()
```

The first line is the one people miss, and it is the one that matters most: pin
every worker to a single thread. Skip it and `num_workers=8` multiplies against
torch's default intra-op thread count, spawning dozens of threads that fight
over the same cores. The result is often slower than staying single-process.

The remaining lines write the worker's identity back onto the outer object —
`num_workers` so the sharding logic knows how many processes exist, `offs` for
its own id, and `seed` so the workers' random streams do not overlap. The final
`ds.wif()` is a hook subclasses can override; by default it is one of the empty
methods in `_noop_methods`.

## `fa_collate`: collation that keeps types

`fa_collate` replaces PyTorch's `default_collate`. The original flattens nested
structures straight into a `Tensor`; fastai wants a stack of `TensorImage` to
still be a `TensorImage` after stacking, and likewise for every other typed
container:

```python
_collate_types = (ndarray, Tensor, typing.Mapping, str)

def fa_collate(t):
    "A replacement for PyTorch `default_collate` which maintains types and handles `Sequence`s"
    b = t[0]
    return (default_collate(t) if isinstance(b, _collate_types)
            else type(t[0])([fa_collate(s) for s in zip(*t)])
                 if isinstance(b, Sequence)
            else default_collate(t))
```

Three branches, and the order is what makes it work. If the first element is a
tensor, ndarray, mapping or string, this level is already a leaf, so hand it to
`default_collate`. Otherwise, if it is a `Sequence`, recurse across `zip(*t)`
and rebuild the outer container with `type(t[0])(...)` — that reconstruction is
exactly why the type survives.

Nesting works too:

```python
t = [(1, (2, (3, 4))), (1, (2, (3, 4)))]
fa_collate(t)
# (tensor([1, 1]), (tensor([2, 2]), (tensor([3, 3]), tensor([4, 4]))))
```

The three-level structure comes out intact, with only the leaves turned into
tensors. `default_collate` on the same input gives
`(tensor([1, 1]), tensor([2, 2]), tensor([3, 3]), tensor([4, 4]))` — the
position information is gone. For segmentation, where the input is
`(image, mask)`, that flattening is the difference between a usable batch and
an unusable one.

## `fa_convert`: the same idea for a single item

`fa_convert` handles the case where you have one item rather than a batch — the
role PyTorch's `default_convert` plays. The structure is symmetric:

```python
def fa_convert(t):
    "A replacement for PyTorch `default_convert` which maintains types and handles `Sequence`s"
    return (default_convert(t) if isinstance(t, _collate_types)
            else type(t)([fa_convert(s) for s in t]) if isinstance(t, Sequence)
            else default_convert(t))
```

The only difference is the axis of recursion. `fa_collate` walks across
`zip(*t)`; `fa_convert` walks down `t`. Which one runs is decided by `bs`:

```python
def create_batch(self, b):
    return (fa_collate, fa_convert)[self.prebatched](b)
```

`prebatched` is `bs is None`. Leaving `bs` unset means the dataset already
returns whole batches, so fastai only converts types and never concatenates.

## The `DataLoader` itself: hooks and indexing

The class is decorated with `@funcs_kwargs`, and six of its callbacks default
to no-ops:

```python
_noop_methods = 'wif before_iter after_item before_batch after_batch after_iter'.split()
```

`@funcs_kwargs` is what lets `create_item`, `after_item` and `create_batch` be
passed as plain keyword arguments instead of forcing a subclass. The
constructor also accepts PyTorch's `batch_size` as a compatibility alias and
folds it back into `bs`:

```python
def __init__(self, dataset=None, bs=None, num_workers=0, pin_memory=False,
             timeout=0, batch_size=None, shuffle=False, drop_last=False,
             indexed=None, n=None, device=None, persistent_workers=False, **kwargs):
    if batch_size is not None: bs = batch_size  # PyTorch compatibility
```

Index generation is short. `Inf.count` when `indexed` is true, `Inf.nones` when
it is false — that is, `0,1,2,...` versus an endless run of `None` meaning
"don't index me, iterate yourself":

```python
def get_idxs(self):
    idxs = Inf.count if self.indexed else Inf.nones
    if self.n is not None: idxs = list(itertools.islice(idxs, self.n))
    if self.shuffle: idxs = self.shuffle_fn(idxs)
    return idxs
```

Sharding across workers is a single modulo:

```python
def sample(self):
    return (b for i, b in enumerate(self.__idxs)
            if i // (self.bs or 1) % self.num_workers == self.offs)
```

Integer-dividing the sample index by `bs` yields the batch number; taking that
modulo `num_workers` decides the owner. This guarantees **a batch is never
split across two workers**. Shard per-sample instead and reassembling a batch
would require extra communication between processes.

## Endless streams with `create_item` and `stop()`

Set `indexed=False` and supply your own `create_item`, and you get a stream of
unknown length that stops when you say so:

```python
class RandDL(DataLoader):
    # create_item decides how many batches you want to produce
    def create_item(self, s):
        r = random.random()
        return r if r < 0.95 else stop()

L(RandDL())                    # two this time
L(RandDL(bs=4, drop_last=True))  # five this time, four rows each
```

A `None` from `create_item` is filtered out; a `stop()` ends the stream.
Together with `bs` this is an online sampler that asks for *n* rows at a time,
*m* batches at a time — useful for reinforcement learning or any setting where
sampling and training interleave.

## How much do workers actually buy

The notebook times a list whose `__getitem__` sleeps for a random fraction of a
second:

| `num_workers` | One pass over 26 letters |
| --- | --- |
| 0 | 302 ms |
| 2 | 177 ms |
| 4 | 142 ms |

The higher the latency and the lighter the per-item work, the more workers
help. A second version in the same notebook simulates a queue that sleeps before
every `get_nowait()`; 30 items through 4 workers take 118 ms.

The converse also holds. If your `__getitem__` is itself heavy CPU work —
decoding a large orthophoto, running CPU augmentation — multiple workers do not
save you. Remembering `set_num_threads(1)` from `_wif`, a single process with
full threading can beat four single-threaded workers. In that case use
`num_workers=0` and move augmentation to the GPU.

## Types survive the worker boundary

One last property that is easy to miss and hard to do without: types come back
intact after crossing into worker processes.

```python
class A(TensorBase): pass

for nw in (0, 2):
    t = A(tensor([1, 2]))
    dl = DataLoader([t] * 8, bs=4, num_workers=nw)
    b = first(dl)
    test_eq(type(b), A)      # True
    test_eq(type(b[0]), A)   # True
```

`retain` records the type of the first element in each batch and reattaches it
after collation. This is what makes `show_batch` possible downstream: it has to
know whether it is holding a `TensorImage` or a `TensorMask` before it can draw
the right thing.

## When to fall back to the plain DataLoader

The wrapper is not free. It leans on PyTorch's private
`_MultiProcessingDataLoaderIter` and `_SingleProcessDataLoaderIter`, which can
change between releases. And sampling is hardcoded into `get_idxs` — a custom
sampler means overriding the method, not passing an object.

If you need `WeightedRandomSampler`, `DistributedSampler` or a bespoke collate
function, the stock `DataLoader` plus a `collate_fn` argument is less work.
What this layer buys is that types, hooks and sharding are already handled: you
write `after_item`, and everything else is done for you.
