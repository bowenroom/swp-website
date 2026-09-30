---
title: "fastai 数据处理与基础变换"
---

这一篇按 fastai 官方文档 `data.transforms` 的顺序走一遍：先把文件列出来，
再切成训练集和验证集，然后定义变换本身。所有例子都跑在 *tiny MNIST*
（只含 `3` 和 `7` 两类的 MNIST 子集）上，代码是从文档里抄下来加注释跑
通的，重点不是复述 API，而是说清楚每个函数背后的取舍——尤其是「为什么
归一化要放在 `after_batch`」和「训练和验证为什么必须用两条不同的变换链」。

## 取文件：get_files

`get_files` 是最通用的一个：给一个路径，把符合条件的文件名全列出来。

```python
def get_files(path, extensions=None, recurse=True, folders=None, followlinks=True):
    "Get all the files in `path` with optional `extensions`, optionally with `recurse`, only in `folders`, if specified."
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

`recurse=True` 时用 `os.walk`，并且在**第一层**就用 `folders` 剪枝。剪枝这一步
很关键：如果数据集目录里有 `models/`、`test/` 这些你不想扫的文件夹，在
`os.walk` 刚进入时就把它们从 `d` 里删掉，比扫完再过滤快一个数量级。
`d[:] = [...]` 是原地修改 `os.walk` -yield 出来的列表，这是 `os.walk` 唯一
支持的剪枝方式。

扩展名匹配是 `_get_files` 里的小写比较：

```python
def _get_files(p, fs, extensions=None):
    p = Path(p)
    res = [p/f for f in fs if not f.startswith('.')
           and ((not extensions) or f'.{f.split(".")[-1].lower()}' in extensions)]
    return res
```

`startswith('.')` 顺手把 `.DS_Store` 之类的隐藏文件过滤掉了——在 macOS 上
这个过滤不是可有可无的。

几个数量对得上：

```python
t3 = get_files(path/'train'/'3', extensions='.png', recurse=False)   # 346
t7 = get_files(path/'train'/'7', extensions='.png', recurse=False)
t  = get_files(path/'train', extensions='.png', recurse=True)          # 709
test_eq(len(t), len(t3) + len(t7))
test_eq(len(get_files(path/'train'/'3', extensions='.jpg', recurse=False)), 0)
```

`709 = 346 + 363`。扩展名换成 `.jpg` 结果是 0，说明过滤器真的在起作用。

## 函数生成器：FileGetter

如果每次都要重复传同一组参数，可以把 `get_files` 包成一个偏函数。fastai 的
惯例是**动词的大驼峰加 `er` 结尾**：

```python
def FileGetter(suf='', extensions=None, recurse=True, folders=None):
    "Create `get_files` partial function that searches path suffix `suf`, only in `folders`, if specified, and passes along args"
    def _inner(o, extensions=extensions, recurse=recurse, folders=folders):
        return get_files(o/suf, extensions, recurse, folders)
    return _inner

fpng = FileGetter(extensions='.png', recurse=False)
test_eq(len(t7), len(fpng(path/'train'/'7')))
```

`suf` 是拼接在路径后面的字符串。`fpng(path/'train'/'7')` 实际查的是
`path/'train'/'7'/''`。这样写的好处是同一个 `FileGetter` 实例可以在不同
数据集上复用，路径作为参数传进去就行。

`get_image_files` 就是 `get_files` 加上标准图片扩展名：

```python
image_extensions = set(k for k, v in mimetypes.types_map.items() if v.startswith('image/'))

def get_image_files(path, recurse=True, folders=None):
    "Get image files in `path` recursively, only in `folders`, if specified."
    return get_files(path, extensions=image_extensions, recurse=recurse, folders=folders)
```

扩展名列表从标准库的 `mimetypes` 里筛出来，而不是手写一份。分割项目里我会
再补上 `.tif`——遥感影像基本都是 GeoTIFF，`mimetypes` 未必收录。

## 从元组里取字段：ItemGetter 和 AttrGetter

拿到 `(image, mask)` 这样的元组之后，经常只需要其中一项。`ItemGetter` 把
`itemgetter` 包成了一个正规的 `Transform`：

```python
class ItemGetter(ItemTransform):
    "Creates a proper transform that applies `itemgetter(i)` (even on a tuple)"
    _retain = False
    def __init__(self, i): self.i = i
    def encodes(self, x): return x[self.i]
```

`_retain = False` 是关键：告诉 fastai 不要在 `decodes` 里把类型贴回去，
因为取索引之后类型本来就变了。`AttrGetter` 同理，只不过取的是属性，并且
允许给默认值：

```python
class AttrGetter(ItemTransform):
    "Creates a proper transform that applies `attrgetter(nm)` (even on a tuple)"
    _retain = False
    def __init__(self, nm, default=None): store_attr()
    def encodes(self, x): return getattr(x, self.nm, self.default)

test_eq(AttrGetter('shape')(torch.randn([4, 5])), [4, 5])
test_eq(AttrGetter('shape', [0])([4, 5]), [0])   # list 没有 shape，用默认值
```

## 切分：RandomSplitter 与 TrainTestSplitter

`RandomSplitter` 随机切，返回的是**索引**而不是数据本身：

```python
def RandomSplitter(valid_pct=0.2, seed=None):
    "Create function that splits `items` between train/val with `valid_pct` randomly."
    def _inner(o):
        if seed is not None: torch.manual_seed(seed)
        rand_idx = L(list(torch.randperm(len(o)).numpy()))
        cut = int(valid_pct * len(o))
        return rand_idx[cut:], rand_idx[:cut]
    return _inner
```

注意 `rand_idx[cut:]` 是**训练集**，`rand_idx[:cut]` 是验证集——切成两段
之后返回顺序是 (train, valid)。给定 `seed` 时每次结果完全一致：

```python
src = list(range(30))
f = RandomSplitter(seed=42)
trn, val = f(src)
test_eq(len(trn), len(src) - len(val))
test_eq(f(src)[0], trn)     # 同样的 seed，同样的切法
```

`RandomSplitter` 的问题是它不看标签。30 个样本里如果有 28 个是「路面」
1 个是「锥桶」，按 20% 随机切，验证集里很可能一个锥桶都没有。
`TrainTestSplitter` 借 scikit-learn 的 `train_test_split` 做**分层切分**：

```python
from sklearn.model_selection import train_test_split

def TrainTestSplitter(test_size=0.2, random_state=None, stratify=None,
                      train_size=None, shuffle=True):
    "Split `items` into random train and test subsets using sklearn train_test_split utility."
    def _inner(o, **kwargs):
        train, valid = train_test_split(range_of(o), test_size=test_size,
                                        random_state=random_state, stratify=stratify,
                                        train_size=train_size, shuffle=shuffle)
        return L(train), L(valid)
    return _inner
```

传 `stratify=labels` 之后，验证集里每一类的比例和整体保持一致。语义分割
里按 patch 切分时这一点尤其重要：小目标类别本来就少，随机切几次指标就
全是 0，看起来像模型不行，其实是划分有问题。

## 端到端：把 MNIST 装进 Datasets

前面几个函数拼起来就是完整的一条流水线。取文件：

```python
path = untar_data(URLs.MNIST_TINY)
items = get_image_files(path)
```

按目录名切分。`GrandparentSplitter` 取路径的**祖父目录**作为分组依据，
`train/3/7634.png` 的祖父是 `train`：

```python
splitter = GrandparentSplitter()
splits = splitter(items)
train, valid = (items[i] for i in splits)
```

定义变换。`tfms` 是一个二维列表，**外层按位置对应元组的每一项，内层是该
项内部依次执行的变换**：

```python
from PIL import Image

def open_img(fn: Path): return Image.open(fn).copy()
def img2tensor(im: Image.Image): return TensorImage(array(im)[None])

tfms = [[open_img, img2tensor],
        [parent_label, Categorize()]]
train_ds = Datasets(train, tfms)
```

第 0 项是输入：打开成 PIL 对象，再转成 `TensorImage`，`[None]` 补上通道维。
第 1 项是标签：从父目录名（`3` 或 `7`）取出字符串，交给 `Categorize()`
变成类别索引。

![一个灰度的手写数字 3，下方是解码后的类别字符串](/blogs/fastai-datatransform/01.png)

*`show_at(train_ds, 3)` 画出的就是这一项：上面是解码回 PIL 的图像，下面
是 `decode` 之后的标签字符串 `'3'`。*

```python
x, y = train_ds[3]      # TensorImage, TensorCategory(0)
xd, yd = decode_at(train_ds, 3)
test_eq(parent_label(train[3]), yd)                    # '3'
test_eq(array(Image.open(train[3])), xd[0].numpy())    # 像素完全一致
```

最后两行是这个设计最值得称赞的地方：`decodes` 是真的把 tensor 还原回原始
图像，而不是近似地反归一化。你在 `show_batch` 里看到的每一张图都是原始
数据。

## ToTensor：批次级的变换该放哪

`ToTensor` 的实现只有一个 `order`：

```python
class ToTensor(Transform):
    "Convert item to appropriate tensor class"
    order = 5
```

它不做任何计算，只声明「我的 `order` 是 5」。`order` 决定变换在 pipeline
里的排序位置，数字小的先跑。这是 fastai 处理 `PIL` 对象的一个小技巧：有些
变换只能吃 PIL，有些只能吃 tensor，靠 `order` 排序就不需要在每个变换里
手写类型分派。

## IntToFloatTensor：一个变换三种输入

`IntToFloatTensor` 处理 `uint8` 到 float 的转换，掩码单独处理：

```python
class IntToFloatTensor(DisplayedTransform):
    "Transform image to float tensor, optionally dividing by 255 (e.g. for images)."
    order = 10  # 需要在 PIL 变换之后、GPU 之前运行
    def __init__(self, div=255., div_mask=1): store_attr()
    def encodes(self, o: TensorImage): return o.float().div_(self.div)
    def encodes(self, o: TensorMask):  return o.long() // self.div_mask
    def decodes(self, o: TensorImage):
        return ((o.clamp(0., 1.) * self.div).long()) if self.div else o
```

两次定义 `encodes`，靠**类型注解**分派，这就是 `transform` 模块的 dispatch
机制。图像除以 255 变成 `[0,1]`，掩码除以 1 保持整数。验证：

```python
t = (TensorImage(tensor(1)), tensor(2).long(), TensorMask(tensor(3)))
ft = IntToFloatTensor()(t)
test_eq(ft, [1./255, 2, 3])
test_eq(type(ft[0]), TensorImage)     # 类型没丢
test_eq(type(ft[2]), TensorMask)
```

## Normalize：为什么必须放在 after_batch

归一化的实现比看上去微妙：

```python
class Normalize(DisplayedTransform):
    "Normalize/denorm batch of `TensorImage`"
    parameters, order = L('mean', 'std'), 99
    def __init__(self, mean=None, std=None, axes=(0,2,3)): store_attr()

    def setups(self, dl: DataLoader):
        if self.mean is None or self.std is None:
            x, *_ = dl.one_batch()
            self.mean, self.std = x.mean(self.axes, keepdim=True), x.std(self.axes, keepdim=True) + 1e-7

    def encodes(self, x: TensorImage): return (x - self.mean) / self.std
```

两个细节值得说。

第一，`axes=(0,2,3)` 意味着**只对 batch 维以外的所有维度求均值**。也就是
说图像归一化是**逐通道**的：R 通道一个 mean/std，G 通道一个，B 通道一个。
`keepdim=True` 把结果压成 `(1, 3, 1, 1)`，这样和 `(N, 3, H, W)` 的 batch
广播时不会错位。

第二，`setups` 从**训练集的一个 batch** 上统计，而不是扫描整个数据集。
快，但要注意这意味着 mean/std 依赖于 `shuffle` 抽到了哪几张图——不同随机
状态下算出来的常数会有微小差别。追求可复现的话，更稳的做法是自己用训练集
统计一次然后显式传进去：

```python
batch_tfms = [IntToFloatTensor(), Normalize.from_stats(mean, std)]
tdl = TfmdDL(train_ds, after_batch=batch_tfms, bs=4, device=default_device())
```

`from_stats` 走的是 `broadcast_vec`，把 `(3,)` 变成 `(1, 3, 1, 1)`：

```python
@classmethod
def from_stats(cls, mean, std, dim=1, ndim=4, cuda=True):
    return cls(*broadcast_vec(dim, ndim, mean, std, cuda=cuda))
```

归一化必须放在 `after_batch` 而不是 `after_item`，原因有两个：一是统计量要
跨样本才有意义，`after_item` 每次只看到一张图；二是 GPU 上按 batch 归一化
只花一次 kernel launch，按样本做要 launch `bs` 次。我自己的分割项目里这条
经验同样成立——mean/std 用训练集统计一次固化下来，验证和测试复用同一组
常数，绝不重新统计。

下面是归一化之后的 batch：

![归一化后的一批数字 7，背景是深紫，笔画是亮黄绿色](/blogs/fastai-datatransform/02.png)

![同一批里的第二张 7，笔画略有不同](/blogs/fastai-datatransform/03.png)

![同一批里的第三张 7，上横较宽](/blogs/fastai-datatransform/04.png)

![同一批里的第四张 7，笔画倾斜](/blogs/fastai-datatransform/05.png)

*`tdl.show_batch((x, y))` 画出来的就是归一化之后的样子。色标范围被
`decodes` 还原成了 `[0, 1]`，所以显示出来的仍然是正常的灰度图，只是
matplotlib 的默认色图把灰阶映射成了紫黄渐变。*

验证一下往返：

```python
x, y = tdl.one_batch()
xd, yd = tdl.decode((x, y))
assert x.mean() < 0.0          # 归一化后均值接近 0
assert x.std() > 0.5
assert 0 < xd.float().mean()/255. < 1     # 解码回来又变回 uint8 量级
assert 0 < xd.float().std()/255. < 0.5
```

## 类型在整条流水线上的往返

还有一个实验值得做：把 `TensorImage` 强行降级成普通 `Tensor`，模拟推理阶段
拿到预测的样子，再交给 `show_batch`：

```python
x, y = cast(x, Tensor), cast(y, Tensor)   # 丢掉类型
test_ne(type(x), TensorImage)
tdl.show_batch((x, y), figsize=(1,1))      # 类型会被 dl 贴回来
```

![降级成普通 Tensor 之后仍然正确显示的 7](/blogs/fastai-datatransform/06.png)

![同一批的第二张 7](/blogs/fastai-datatransform/07.png)

![同一批的第三张 7](/blogs/fastai-datatransform/08.png)

![同一批的第四张 7，与上面第四张完全相同](/blogs/fastai-datatransform/09.png)

*结果和上面四张一模一样。`TfmdDL` 记住了第一条样本的类型，在解码之前
把它重新贴回去。这正是 `after_item` 那一层的 `retain` 在起作用。*

这一点在训练代码里很实用：保存 checkpoint、导出 ONNX、或者把预测张量丢进
可视化工具时，类型信息经常被抹掉。有了这层机制，不需要手动 `cast` 回去
就能画图。

## 训练与验证为什么要两条链

文档里反复出现 `split_idx`，它是这套设计里最容易被忽略的机制。一个变换可以
声明自己只对某个 split 生效：

```python
class _Tfm(Transform):
    split_idx = 1                    # 只在验证集上生效
    def encodes(self, x): return x * 2
    def decodes(self, x): return TitledStr(x // 2)
```

于是同一份数据、同一套变换，取训练子集和验证子集会得到不同的结果：

```python
dsets = Datasets(range(5), [_Tfm()], splits=[[1, 2], [0, 3, 4]])
dsets.train    # [(1,), (2,)]              没有翻倍
dsets.valid    # [(0,), (6,), (8,)]        翻倍了
```

数据增强、Mixup、归一化这些都靠它。推理的时候临时把 `split_idx` 改掉，
同一条数据就能走验证那条链：

```python
ds = dsets.train
with ds.set_split_idx(1):
    test_eq(ds, [(2,), (4,)])
test_eq(dsets.train, [(1,), (2,)])         # 退出后自动恢复
```

`set_split_idx` 是个上下文管理器，`finally` 里恢复原值。这比手动改属性安全
得多——训练循环中途抛异常也不会让后面的 batch 全部走错分支。

## 这套设计的代价

_transform_ 体系不是没有学习成本的。隐式约定不少：`order` 决定顺序、
`split_idx` 决定分支、`_retain` 决定类型是否回贴、注解决定 dispatch、
`setups` 决定何时统计。全部读完 fastai 的 transform 文档之前，很容易写出
一个「看起来对但静默不生效」的变换。

但对于要快速搭出可复现实验的研究代码，这套约定的收益是实在的：一旦变换写
对了，训练、验证、推理、可视化四条路径会自动保持一致，不会出现「训练用
了增强、评估忘了去掉」这类难查的 bug。
