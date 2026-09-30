---
title: "fastai DataLoader 里的辅助函数"
---

fastai 的 `DataLoader` 用起来和 PyTorch 的几乎一样，但它几乎没有重写多进程
加载那套逻辑。它做的是另一件事：构造一个「假的」PyTorch loader
（`_FakeLoader`），把它伪装成 PyTorch 期望看到的形状，然后把自己真正的
取数逻辑挂在 `wif`、`after_item`、`before_batch` 这些钩子上。这篇笔记把
这个结构拆开，重点是三个不起眼的辅助函数——`_wif`、`fa_collate` 和
`fa_convert`——以及这层封装在什么场景下真的省事、在什么场景下反而是
负担。

## 为什么需要一个假的 loader

PyTorch 的多进程 `DataLoader` 有大量内部状态：sampler、collate 函数、
`prefetch_factor`、`dataset_kind`，全部通过 `__reduce_ex__` 之类的协议在
主进程和 worker 之间传递。fastai 不打算复刻这一套。它从 `torch.utils.data.dataloader`
里把三个迭代器类直接借出来，然后在它们上面包一层：

```python
from fastai.torch_basics import *
from torch.utils.data.dataloader import (
    _MultiProcessingDataLoaderIter, _SingleProcessDataLoaderIter, _DatasetKind)

_loaders = (_MultiProcessingDataLoaderIter, _SingleProcessDataLoaderIter)
```

`_loaders` 用 `num_workers == 0` 当下标，正好对应 PyTorch 那个二选一的
分派。`_FakeLoader` 只需要满足 PyTorch 迭代器在运行过程中会读的那些属性：

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

注意最后一行：真正的迭代发生在 `self.d.create_batches(...)` 上，也就是
外层的 `DataLoader` 自己。`_FakeLoader` 只是一个信封，用来骗过 PyTorch
的迭代器，让它把 `self.d` 当成 dataset、把一个空函数当成 `collate_fn`。
这样做的好处是 fastai 不用跟着 PyTorch 的私有属性走——PyTorch 改了，它
只需要改这一个类。

`no_multiproc()` 是个上下文管理器，在需要单进程跑一遍（比如取一个 batch
算统计量）时把 `num_workers` 临时改成 0，退出时恢复：

```python
@contextmanager
def no_multiproc(self):
    old_num_workers = self.num_workers
    try:
        self.num_workers = 0
        yield self.d
    finally: self.num_workers = old_num_workers
```

## `_wif`：worker 启动时做的事

每个 worker 进程启动时，PyTorch 会调用 `worker_init_fn`。fastai 传进去的
是 `_wif`，它做四件事：

```python
def _wif(worker_id):
    set_num_threads(1)
    info = get_worker_info()
    ds = info.dataset.d
    ds.num_workers, ds.offs = info.num_workers, info.id
    set_seed(info.seed)
    ds.wif()
```

第一行是最容易被忽略但最重要的一条：每个 worker 强制单线程。不这么做
的话，`num_workers=8` 配上 torch 默认的 intra-op 线程数，会在机器上派生
出几十个线程互相抢 CPU，通常比单进程还慢。

后三行把 worker 的身份写回外层对象：`num_workers` 让分片逻辑知道一共有
几个进程，`offs` 是自己的编号，`seed` 保证每个 worker 的随机数流不重叠。
最后 `ds.wif()` 是留给子类覆盖的钩子，默认是 `_noop_methods` 里的空函数。

## `fa_collate`：保持类型的拼接

`fa_collate` 是 PyTorch `default_collate` 的替代品。默认实现在遇到嵌套结构
时会直接把它拍平成 `Tensor`，而 fastai 希望 `TensorImage` 拼完之后还是
`TensorImage`，`TensorCategory` 还是 `TensorCategory`：

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

逻辑只有三行，但顺序很重要。如果第一个元素的类型是 tensor、ndarray、映射
或者字符串，说明这一层本身就是一个叶子，交给 `default_collate`。否则如果
它是 `Sequence`，就沿 `zip(*t)` 递归下去，同时用 `type(t[0])(...)` 把外层
容器重新构造出来——这就是类型能活下来的原因。

嵌套的情况也能正确处理：

```python
t = [(1, (2, (3, 4))), (1, (2, (3, 4)))]
fa_collate(t)
# (tensor([1, 1]), (tensor([2, 2]), (tensor([3, 3]), tensor([4, 4]))))
```

三元组的结构和输入完全一致，只是每一片叶子都变成了 tensor。对照
`default_collate` 的输出，它会给出 `(tensor([1, 1]), tensor([2, 2]),
tensor([3, 3]), tensor([4, 4]))`——维度顺序被压平了。分割任务里如果输入是
`(image, mask)`，压平之后你就再也分不清哪个是哪个。

## `fa_convert`：单样本版本的同一套逻辑

`fa_convert` 处理的是「一个 item 而不是一批」的情况，也就是 PyTorch 的
`default_convert`。结构完全对称：

```python
def fa_convert(t):
    "A replacement for PyTorch `default_convert` which maintains types and handles `Sequence`s"
    return (default_convert(t) if isinstance(t, _collate_types)
            else type(t)([fa_convert(s) for s in t]) if isinstance(t, Sequence)
            else default_convert(t))
```

区别只在递归的那一步：`fa_collate` 沿 `zip(*t)` 横向拼接，`fa_convert`
沿 `t` 纵向深入。哪个被调用取决于 `bs` 是否为 `None`：

```python
def create_batch(self, b):
    return (fa_collate, fa_convert)[self.prebatched](b)
```

`prebatched` 是 `bs is None`。不设 `bs` 意味着 dataset 自己每次返回的已经
是一个 batch，这时只做类型转换，不再拼接。

## DataLoader 本体：钩子与索引

`DataLoader` 用 `@funcs_kwargs` 装饰，六个默认空钩子是：

```python
_noop_methods = 'wif before_iter after_item before_batch after_batch after_iter'.split()
```

`@funcs_kwargs` 让 `create_item`、`after_item`、`create_batch` 这些可以直接
作为关键字参数传进构造函数，不必自己写子类。构造函数接受 PyTorch 的
`batch_size` 作为兼容别名，并把它折叠回 `bs`：

```python
def __init__(self, dataset=None, bs=None, num_workers=0, pin_memory=False,
             timeout=0, batch_size=None, shuffle=False, drop_last=False,
             indexed=None, n=None, device=None, persistent_workers=False, **kwargs):
    if batch_size is not None: bs = batch_size  # PyTorch compatibility
```

真正取索引的逻辑很短。`indexed` 为真时用 `Inf.count`，为假时用 `Inf.nones`
——前者是 `0,1,2,...`，后者是无限个 `None`，也就是「不要索引，请自己迭代」：

```python
def get_idxs(self):
    idxs = Inf.count if self.indexed else Inf.nones
    if self.n is not None: idxs = list(itertools.islice(idxs, self.n))
    if self.shuffle: idxs = self.shuffle_fn(idxs)
    return idxs
```

分片靠一个取模：

```python
def sample(self):
    return (b for i, b in enumerate(self.__idxs)
            if i // (self.bs or 1) % self.num_workers == self.offs)
```

先按 batch 序号整除 `bs` 得到 batch 编号，再对 `num_workers` 取模，命中
自己 `offs` 的才留下。这保证了**一个 batch 永远不会被拆到两个 worker 里**
——如果按单个样本取模，跨进程拼回一个 batch 就需要额外的通信。

## 无尽的流：`create_item` 和 `stop()`

`indexed=False` 加上自己实现 `create_item`，就能得到一个长度未知、
说停就停的数据流：

```python
class RandDL(DataLoader):
    # create_item 定义了你想产生多少个 batch
    def create_item(self, s):
        r = random.random()
        return r if r < 0.95 else stop()

L(RandDL())                    # 这次是 2 个
L(RandDL(bs=4, drop_last=True))  # 这次是 5 个，每个 4 条
```

`create_item` 返回 `None` 时被 `filter` 掉，返回 `stop()` 时整个流结束。
配合 `bs` 它就是一个「每次要多少条、要多少批」的在线采样器，用在强化学习
或者需要边训边采的场景里。

## 多进程到底快多少

笔记里用一个每次 `__getitem__` 都要 `sleep(random()/50)` 的列表做了对照：

| `num_workers` | 26 个字母走完一遍 |
| --- | --- |
| 0 | 302 ms |
| 2 | 177 ms |
| 4 | 142 ms |

延迟越高、单个 item 计算越轻，多进程收益越明显。同一个笔记本里还有一个
模拟队列的版本，每次取一条要 `sleep(random()/100)`，30 条数据用 4 个 worker
只用了 118 ms。

反过来，如果你的 `__getitem__` 本身是重 CPU 计算（比如在 worker 里做数据增强
或者解码大图），多进程不会帮你——`_wif` 里那句 `set_num_threads(1)` 甚至会
让单进程的加速比 worker 更好。这种情况下应该用 `num_workers=0` 加 GPU 端的
增强。

## 类型能穿过 worker 边界

最后一个容易被忽略但很重要的性质：类型在多进程往返之后还在。

```python
class A(TensorBase): pass

for nw in (0, 2):
    t = A(tensor([1, 2]))
    dl = DataLoader([t] * 8, bs=4, num_workers=nw)
    b = first(dl)
    test_eq(type(b), A)      # True
    test_eq(type(b[0]), A)   # True
```

`retain` 会在每个 batch 上记下第一条的类型，然后在拼接后把类型贴回去。
这正是 `TfmdDL` 后面能调用 `show_batch` 的前提——它需要知道拿到的是
`TensorImage` 还是 `TensorMask` 才能画出对应的图。

## 什么时候退回原生 DataLoader

这层封装不是没有代价的：它依赖 PyTorch 的私有类 `_MultiProcessingDataLoaderIter`
和 `_SingleProcessDataLoaderIter`，PyTorch 升级时可能改；它把采样策略写死在
`get_idxs` 里，想做自定义 sampler 得重写整个方法而不是传一个 sampler 对象。

如果你的任务需要 `WeightedRandomSampler`、`DistributedSampler` 或者自定义
collate 函数，原生 `DataLoader` 加一行 `collate_fn` 会更省事。fastai 这层的
价值在于它默认把类型、钩子和分片都处理好了——你只要会写 `after_item`，
剩下的事情它替你做完。

## 换成 torchvision 之后要重写的东西

如果数据集能直接套 `torchvision.datasets`，可以直接交给 `TfmdDL`，变换挂在
`after_item` 上：

```python
tdl = TfmdDL(MNIST('.', train=True, download=True),
             after_item=[ToTensor(), custom_norm],
             bs=64, device=default_device())
```

结构完全一样——`TfmdDL` 不关心 dataset 是不是 fastai 的 `Dataset`，它只要求
`__getitem__` 能返回东西。所以迁移的时候要改的只有三处：

| fastai 写法 | torchvision 写法 | 说明 |
| --- | --- | --- |
| `get_image_files(p)` | `ImageFolder` 或 `Dataset` 子类 | 文件枚举交给框架 |
| `PILToTensor()` | `transforms.ToTensor()` | 都返回 `TensorImage` |
| `Categorize()` | `transforms.Lambda` | 前者要 `setups` 建词表 |

最后一行的差别值得注意。`Categorize` 会在 `setup` 时扫描一遍 labels 目录，
建立索引到字符串的映射；`transforms.Lambda` 不会——它拿到的就只有整数。
类型标注也丢了，`show_batch` 画出来的 target 会是一串数字而不是 `'7'`。所以
换成 torchvision 之后，我一般会补一个自己的 `Transform` 把索引换回字符串：

```python
class IntToStr(Transform):
    def __init__(self, vocab): self.vocab = vocab
    def encodes(self, o: int): return TitledStr(self.vocab[o])
    def decodes(self, o): return o
```

反过来的迁移更常见——从 torchvision 迁到 fastai。做法是把 dataset 包一层，
返回 `(x, y)`，然后照常 `Datasets(items, tfms)`。绝大多数 torchvision dataset
都能这样接，因为 fastai 的 `Datasets` 只要求 items 可以索引，元素可以是任意
东西。

## 三个容易踩的坑

**`shuffle` 和 `get_idxs` 一起用要小心。** `get_idxs` 的返回值同时决定了
sampler 的范围和 batch 的划分。如果它返回一个 tensor 而不是 range 对象，
`DataLoader` 内部做 `len()` 时可能拿不到长度。笔记里所有例子都用
`range(len(ds))`，没踩过这个坑，但自己实现 sampler 时值得先测一下。

**多进程下 `num_workers` 不是越大越好。** fastai 默认取
`min(16, defaults.cpus)`。遥感影像如果每张图 10000×10000 像素，一个 worker
的内存占用就上 GB，16 个 worker 很容易 OOM。我的经验是先按
`可用内存 / 单样本大小` 反推 worker 数，再看吞吐。

**`no_multiproc()` 会真的重建迭代器。** 上下文管理器里把 `num_workers` 改成 0，
退出时再改回去。PyTorch 的 `DataLoader` 在 `num_workers` 变化时会重建
`_iterator`，所以 `with dls.no_multiproc():` 之后拿到的已经是新对象了。在里面
写的临时 sampler 不会泄漏到外面的训练循环，这点是安全的。
