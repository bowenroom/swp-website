---
title: "fastai Data Core：取数据的核心逻辑"
---

fastai 的 data core 不是一个类，而是四层互相咬合的容器。`TfmdLists` 把一组
items 和一条 `Pipeline` 绑在一起；`Datasets` 把多个 `TfmdLists` 按位置拼成
元组，用来表达「输入 / 标签」；`TfmdDL` 是挂在 `DataLoader` 上的那一层，负责
批量取数、解码和可视化；`DataLoaders` 最后把训练和验证两个 loader 收在一起，
让训练循环只写 `dls.train` 和 `dls.valid`。这篇笔记是我逐段读 `fastai.data.load`
源码时记下的结构，讲清楚每一层多加了什么，以及 `split_idx` 这一个整数是怎么
同时管住训练、验证和推理三条路径的。

## 先看数据从哪来

笔记本开头用的是 Potsdam 遥感数据集，`get_image_files` 分别列出 RGB 影像和
标注两个目录：

```python
path_img = data_path / 'Potsdam/2_Ortho_RGB/train_pick'
path_lbl = data_path / 'Potsdam/5_Labels_for_participants'
fnames = get_image_files(path_img)
lbl_names = get_image_files(path_lbl)
```

这里只做了列目录，没有把两边配对成 `(image, mask)`。遥感数据的文件名确实可以
按前缀对上，但目录顺序、缺失文件、以及多期影像的情况都需要额外检查——笔记里
没有做这些，所以我不假设它已经配好。后面的例子全部用合成的小列表，形状更容易
看清。

## `TfmdLists`：items 加一条流水线

最基础的一层把「一堆对象」和「一条变换流水线」组合起来：

```python
tl = TfmdLists(items, tfms=tfms)
```

`items` 交给 `L`（fastai 的 list 子类），`tfms` 交给 `Pipeline`。`tfms` 既可以是
一个现成的 `Pipeline`，也可以是普通的 transform 列表——后者会被自动包起来。
真正的取数发生在 `__getitem__` 里，走的是 `_after_item`：

```python
def __getitem__(self, idx):
    res = super().__getitem__(idx)
    if self._after_item is None: return res
    return self._after_item(res) if is_indexer(idx) else res.map(self._after_item)
```

注意 `is_indexer(idx)` 这个分支：传单个整数时，变换作用在一个元素上；传列表
或切片时，`is_indexer` 为假，走 `res.map(self._after_item)`，每个元素各自变换。
这就是为什么 `tl[0]` 和 `tl[0, 1]` 的返回类型不一样。

### setup：先跑一遍，把统计量记住

`setup` 做两件事。第一件是调用每层的 `setups`，让变换自己统计数据集（比如均值、
词表）。第二件更微妙——它**取一个样本把整条流水线走一遍**，记录每一步之后的
类型：

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

这解释了两件平时只当「约定」在用的事。第一，样本取的是 `splits[0]`，也就是
**训练集**的第一个元素——`setups` 统计出来的量只反映训练集。笔记本里专门验证
了这一点：把 `kid_1.jpg` 放进验证集之后，词表里就只剩 `['dog']`，因为 `kid`
在训练集里没出现过。

第二，`getattr(f, 'input_types', type(x))` 是给类型推断留的接口。默认情况下，
第 `i` 层的输入类型就是第 `i-1` 层的输出类型；但如果某一层显式声明了
`input_types`，这条链就断了。

### `infer_idx` 与 `infer`：只跑后半段

有了 `types`，就能从一个**新的**对象推断该从流水线的第几步开始：

```python
def infer_idx(self, x):
    idx = 0
    for t in self.types:
        if isinstance(x, t): break
        idx += 1
    assert idx < len(self.types), f"Expected an input of type in \n{pretty_types}\n but got {type(x)}"
    return idx
```

这是个朴素的第一匹配扫描，没有按 `order` 排序，也没有缓存。实践上它依赖
`types` 里的类型互不重叠（比如 `str` 和 `float`），一旦有继承关系就可能匹配到
靠前的那一层。`infer` 就是拿 `infer_idx` 的结果去切 `self.tfms.fs` 再 compose
起来：

```python
def infer(self, x):
    return compose_tfms(x, tfms=self.tfms.fs[self.infer_idx(x):], split_idx=self.split_idx)
```

这个能力在推理时非常有用。分割任务里，输入可能是 uint8 的原图，也可能是已经
归一化好的 float tensor——`infer` 让同一条流水线同时接受两者，不用手写分支。

## `Datasets`：把元组拼起来

`Datasets` 是分割任务真正用到的那一层。它内部持有多个 `TfmdLists`，索引 `i`
返回的是**元组** `tuple(tl[it] for tl in self.tls)`：

```python
dsets = Datasets(items, [[neg_tfm, int2f_tfm], [add(1)]])
t = dsets[0]
test_eq(t, (-1, 2))
test_eq(dsets[0, 1, 2], [(-1, 2), (-2, 3), (-3, 4)])
```

外层列表的第 `i` 项对应元组的第 `i` 个位置，内层列表是作用在该位置上的变换。
所以上面这个例子：位置 0 是输入（取负、转 float），位置 1 是标签（加一）。

只有一个内层列表时，返回的是**单元素元组**，不是裸值。这不是多余的括号，
而是让下游代码不需要分支：

```python
dsets = Datasets(inp, tfms=[None])
dsets[2]        # (2,)
```

### `n_inp`：元组前几项算输入

这是整个 `Datasets` 里最重要的一个数字。训练循环需要知道「哪些是输入，哪些
是标签」，才能算出 loss：

```python
self.n_inp = ifnone(n_inp, max(1, len(self.tls) - 1))
```

默认是 `max(1, 层数 - 1)`：两层时是 1（输入 + 标签），三层时是 2。三层的典型
场景是暹罗网络（两路输入一路标签）或表格数据。默认值不够用时手动指定，笔记本
里两种都测了：

```python
dsets = Datasets(inp, tfms=[[None], [None], [None]])         # n_inp == 2
dsets = Datasets(inp, tfms=[[None], [None], [None]], n_inp=1) # n_inp == 1
```

`n_inp` 同时决定了 loader 该怎么把元组切回 `x, y`。这就是为什么它必须
在 `Datasets` 上而不是在 `DataLoader` 上——只有构造元组的那一层知道前几项是
输入。

### 属性的转发

`Datasets` 用 `gather_attrs` 把内部 `TfmdLists` 的属性提到外层，所以可以写得
很自然：

```python
test_eq(dsets.m, nrm.m)         # 直接拿到变换的均值
test_eq(dsets.norm.m, nrm.m)    # 甚至可以按名字取子层
test_eq(dsets.train.norm.m, nrm.m)
```

最后那行挺有意思：它要求 `train` 子集的变换对象和父对象是同一个实例（而不是
副本），否则拿到的是不同的 `m`。

## `split_idx`：一个整数管三条路径

整套机制里最不直观、也最省事的是 `split_idx`。变换可以声明自己只对哪个 split
生效：

```python
class _Tfm(Transform):
    split_idx = 1              # 只在验证集生效
    def encodes(self, x): return x * 2
    def decodes(self, x): return TitledStr(x // 2)
```

同一份数据、同一套变换，训练子集和验证子集给出不同结果：

```python
dsets = Datasets(range(5), [_Tfm()], splits=[[1, 2], [0, 3, 4]])
dsets.train    # [(1,), (2,)]        没变
dsets.valid    # [(0,), (6,), (8,)]  翻倍了
```

`subset(i)` 造新对象时会把 `split_idx=i` 一起带过去：

```python
def subset(self, i):
    return type(self)(tls=L(tl.subset(i) for tl in self.tls), n_inp=self.n_inp)
```

而 `TfmdLists._new` 里 `split_idx = ifnone(split_idx, self.split_idx)` 保证传
`None` 时继承原来的值。所以 `dsets.train.train` 依然是训练语义。

推理时不需要另外建一套数据，把 `split_idx` 临时翻成 1 就行：

```python
ds = dsets.train
with ds.set_split_idx(1):
    test_eq(ds, [(2,), (4,)])
test_eq(dsets.train, [(1,), (2,)])   # 退出时自动恢复
```

`set_split_idx` 是个 context manager，`finally` 里恢复旧值。这一点值得强调：
手工赋值一旦中间抛异常，后续每一个 batch 都会走错分支，而且这种错误不会报错，
只会让指标慢慢变得不合理。

## `TfmdDL`：批量取数的那一层

`TfmdDL` 继承自 PyTorch 的 `DataLoader`，在构造时把三个回调包成 `Pipeline`：

```python
_batch_tfms = ('after_item', 'before_batch', 'after_batch')

for nm in _batch_tfms:
    kwargs[nm] = Pipeline(kwargs.get(nm, None))
super().__init__(dataset, bs=bs, shuffle=shuffle, num_workers=num_workers, **kwargs)
if do_setup:
    for nm in _batch_tfms:
        kwargs[nm].setup(self)
```

三个回调的分工：`after_item` 对每个样本单独跑，`before_batch` 在拼成 batch 前
跑（适合做 padding），`after_batch` 对整个 batch 跑（归一化就属于这里）。三处
都在构造时 `setup`，所以 `after_batch=Normalize()` 能在第一个 batch 上量出统计量。

`n_inp` 和类型信息都是**懒计算**的，跑一次 `_one_pass` 才知道：

```python
def _one_pass(self):
    b = self.do_batch([self.do_item(0)])
    if self.device is not None: b = to_device(b, self.device)
    its = self.after_batch(b)
    self._n_inp = 1 if not isinstance(its, (list, tuple)) or len(its) == 1 else len(its) - 1
    self._types = explode_types(its)
```

只取第 0 个样本，跑完 `after_item` 和 `after_batch`，然后记住结果类型。
`_retain_dl` 在解码前把类型贴回去：

```python
def _retain_dl(self, b):
    if not getattr(self, '_types', None): self._one_pass()
    return retain_types(b, typs=self._types)
```

这就是为什么把预测结果降级成普通 `Tensor` 之后，`show_batch` 依然能正常显示——
类型被重新贴上，`TensorImage` 的 `show` 也就回来了。

### `to`：把变换里的状态也搬上 GPU

`TfmdDL.to(device)` 除了记录 `self.device`，还遍历 `after_batch` 里每个变换的
`parameters` 属性，把它们声明的 tensor 参数搬到同一设备：

```python
class B(Transform):
    parameters = 'a'
    def __init__(self): self.a = torch.tensor(0.)
    def encodes(self, x): x

tdl.to(default_device())
test_eq(tdl.after_batch.fs[0].a.device, default_device())
```

`parameters = 'a'` 是变换自己声明的契约。`Pipeline.fs[0]` 之所以能直接取到，
是因为 `fs` 就是变换列表。没有这个声明，变换里缓存的 tensor 就会留在 CPU，
然后在 `encodes` 里报 device mismatch——这类错误通常要到第一个 batch 才暴露。

## `DataLoaders`：把两个 loader 收在一起

最后一层解决的是「训练循环里到处写 `dls[0]` / `dls[1]`」的问题：

```python
train   , valid    = add_props(lambda i, x: x[i], _set)
train_ds, valid_ds = add_props(lambda i, x: x[i].dataset)
```

`add_props` 同时生成 getter 和 setter，所以 `dls.train = dls.train.new(bs=4)` 能
直接生效。`device` 是个带 setter 的 property，往下广播到每个 loader：

```python
@device.setter
def device(self, d):
    for dl in self.loaders: dl.to(d)
    self._device = d
```

`cuda()` 和 `cpu()` 只是它的两个快捷方式。`from_dsets` 则负责在构造时把
`shuffle`、`drop_last` 按训练/验证拆开——训练要 shuffle 且 `drop_last=True`，
验证两个都是 `False`：

```python
default = (True,) + (False,) * (len(ds) - 1)
defaults = {'shuffle': default, 'drop_last': default}
```

`new_empty()` 保留变换但丢掉所有数据，用来在 `Dataset` 还没建好的时候先占位。

## 推理：借验证集的变换

最后一段是笔记里我自己加的辅助函数，思路很直接：测试时应该走验证集的变换
链，但数据要换成新的。做法是复制一份 `TfmdLists` 并把 `split_idx` 设成 1，然后
按类型把前面几层变换切掉：

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

`rm_tfms` 用的是前面 `infer_idx` 那套类型推断：输入是文件名（`str`）还是已经
读进来的 tensor，决定该从第几层开始。这个函数不是 fastai 官方 API，是我为了
省事自己写的，但它把三件事串起来了——`split_idx` 选分支、`infer_idx` 选起点、
`Datasets` 负责重新拼元组。

配套的 `test_dl` 把 `test_set` 的结果包进一个新的 `TfmdDL`：

```python
@patch
@delegates(TfmdDL.__init__)
def test_dl(self: DataLoaders, test_items, rm_type_tfms=None,
            with_labels=False, **kwargs):
    test_ds = test_set(self.valid_ds, test_items, rm_tfms=rm_type_tfms,
                       with_labels=with_labels)
    return self.valid.new(test_ds, **kwargs)
```

`@patch` 把它挂成 `DataLoaders` 的方法，调用形式就和 `dls.train` / `dls.valid`
一致：

```python
tst_dl = dls.test_dl([2, 3, 4, 5])
list(tst_dl)          # [(tensor([4, 6, 8, 10]),)]
```

用 `new` 而不是重新 `__init__`，是为了把 `after_item`、`before_batch` 这些
batch 级的变换一起继承过来，否则测试时少了归一化，数值对不上。

## 读下来的感觉

这四层里没有一行是为了「取数快」。`TfmdLists` 慢在每层都要判断类型，
`Datasets` 慢在 `gather_attrs` 的属性转发，`TfmdDL` 慢在每个 batch 都要贴回类型。
换来的是三件事：训练、验证、推理共用同一条变换链，差别只由 `split_idx` 一个
整数决定；任何一层的统计量只在训练集上算；以及 `decodes` 能把训练时的张量
还原成可显示的原始数据。

代价是显式约定多。要用好它，得先记住 `n_inp`、`split_idx`、`parameters`、
`input_types` 这几个名字各自的含义。`test_set` 那种辅助函数能写出来，多半也
是因为这套约定足够明确——每一层加了什么、为什么加，都能对上名字。
