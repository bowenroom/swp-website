---
title: "D3Net：去噪网络怎么搭"
---

这篇笔记是我读 D3Net 相关实现时留下的第一份代码记录。原始目标是弄明白
「密集连接 + 多尺度空洞卷积」这组结构在 PyTorch 里到底怎么搭、通道是怎么
记账的。但这份 notebook 里真正跑通的只有从源分离仓库借来的 D2Net 密集多
膨胀卷积块：两个构造函数、一个卷积基元，以及一次形状检查。去噪分支、损失
函数、图像与标签的配对逻辑在这份笔记里都不存在。下面写的全部是可以在这段
代码里逐行核实的部分。

## 一个只允许 stride=1 的卷积基元

整个块的地基是 `ConvBlock2d`，也就是「归一化 → 非线性 → 空洞卷积」这三步
的封装。它第一件事就是拒绝降采样：

```python
class ConvBlock2d(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size, stride=1,
                 dilation=1, norm=True, nonlinear='relu', eps=EPS):
        super().__init__()

        assert stride == 1, "`stride` is expected 1"

        self.kernel_size = _pair(kernel_size)
        self.dilation = _pair(dilation)
```

`assert` 而不是 warning，说明这不是「默认不降采样、但你最好别用」，而是
这块结构在设计上就不允许改变空间尺寸。理由很直接：密集连接靠通道拼接来复用
特征，一旦某一层把 H、W 改了，后面所有的 `torch.split` 就再也对不上。因此
尺寸不变是被硬性约束，而不是副作用。

`kernel_size` 和 `dilation` 都过一遍 `_pair`，把标量 `(1)` 变成 `(1, 1)`，
这样后面按 H、W 分开算 padding 时不用再判断类型：

```python
>>> _pair(1)
(1, 1)
```

## 手工算 same padding

真正值得看的是 `forward` 里那段手写的 padding。卷积本身用 `dilation=` 而不是
`padding=`，所以保持尺寸这件事是显式算出来的：

```python
Kh, Kw = self.kernel_size
Dh, Dw = self.dilation

padding_height = (Kh - 1) * Dh
padding_width  = (Kw - 1) * Dw
padding_up     = padding_height // 2
padding_bottom = padding_height - padding_up
padding_left   = padding_width // 2
padding_right  = padding_width - padding_left
```

输出尺寸是 `H + (上 + 下) - d * (k - 1)`。代入 `(上 + 下) = (Kh - 1) * Dh`，
两个 `Dh` 正好抵消，尺寸恒等于 `H`。这个推导对任意 `k`、`d` 都成立，包括
`d` 为奇数的情况。

但 `// 2` 那一步会引入不对称：当 `(k - 1) * d` 是奇数时（比如 `k=4, d=1`，
总 padding 为 3），`padding_up = 1` 而 `padding_bottom = 2`，`F.pad` 收到的
四个数不相等。这不是 bug，只是提醒你：这里的 padding 是按索引推出来的，
不是按「对称」假设来的。默认的 `k=3` 下总 padding 为偶数，所以看不出差别。

还有一个容易被忽略的顺序问题——归一化和 ReLU 发生在 `F.pad` **之前**：

```python
x = input
if self.norm:
    x = self.norm2d(x)
if self.nonlinear:
    x = self.nonlinear2d(x)

x = F.pad(x, (padding_left, padding_right, padding_up, padding_bottom))
output = self.conv2d(x)
```

先算激活再补零，意味着卷积看到的 padding 区域是**常数 0**，而不是经过 ReLU
之后的 0。在边界上这会引入一点偏差，但省掉了一次 padding 之后的重新归一化，
也避免了 BatchNorm 在零填充上统计。这是典型的工程取舍，不是等价变换。

两个开关可以单独关掉，`norm=False, nonlinear=None` 时这个类退化成一个纯粹
的空洞卷积：

```python
temp = ConvBlock2d(3, 128, 3, 1, 1, norm=False, nonlinear=None)
temp(torch.randn(1, 3, 32, 32)).shape
# torch.Size([1, 128, 32, 32])
```

注意这里 `dilation=1`，属于 `ConvBlock2d` 自己的单元测试，还没进到多尺度
的逻辑里。

## 密集连接里的通道账

`D2Block` 在这个基元之上做了一件不常见的事：它不是把上一层完整地接到下一层，
而是在每一步**把残差切开**——最新的那几组通道送去卷积，剩下的继续往后传。

构造函数先做参数规整。`growth_rate` 可以是一个整数（配合 `depth` 展开成等长
列表），也可以直接给列表；`dilated`、`norm`、`nonlinear` 三者都遵循同样的
「标量广播 / 列表原样用」的模式。规整之后，循环里按下标决定每一层的输入和
输出通道数：

```python
for idx in range(depth):
    if idx == 0:
        _in_channels = in_channels
    else:
        _in_channels = growth_rate[idx - 1]
    _out_channels = sum(growth_rate[idx:])

    if dilated[idx]:
        dilation = 2 ** idx
    else:
        dilation = 1
```

两处细节值得记一下。第一，`_out_channels` 是**剩余所有 growth rate 之和**，
不是当前层的 growth rate——因为输出要留给后面几层继续切。第二，膨胀率按
`2 ** idx` 递增，第 0 层固定为 1，视觉上不会出现在 `repr` 里，容易被忽略。

`forward` 是这套记账逻辑的核心，四行做完一次「切分 → 卷积 → 累加」：

```python
for idx in range(depth):
    if idx == 0:
        x = input
        x_residual = 0
    else:
        _in_channels = growth_rate[idx - 1]
        sections = [_in_channels, sum(growth_rate[idx:])]
        x, x_residual = torch.split(x_residual, sections, dim=1)

    x = self.net[idx](x)
    x_residual = x_residual + x

output = x_residual
```

`sections` 的第一个元素 `growth_rate[idx - 1]` 正好等于上一层卷积刚刚产出的
通道数，所以 `x` 取到的永远是「最新鲜」的那部分；`x_residual` 拿到的是更早
特征的累积。两块相加之后总通道数又变回 `sum(growth_rate[idx:])`，刚好够下一轮
再切一次。这个不变式是整个块能跑通的前提。

## 按 depth=4 展开

notebook 里的单元测试用的是最小配置：`in_channels=3`、`growth_rate=2`、
`depth=4`、`kernel_size=(3,3)`、`dilated=True`，输入 `torch.randn(4, 3, 64, 64)`。
把上面的循环展开，就是打印出来的那个结构：

| 层 | dilation | 输入通道 | 输出通道 | 感受野 |
| --- | --- | --- | --- | --- |
| 0 | 1 | 3 | 8 | 3 |
| 1 | 2 | 2 | 6 | 7 |
| 2 | 4 | 2 | 4 | 15 |
| 3 | 8 | 2 | 2 | 31 |

输出通道那一列是 `sum(growth_rate[idx:])`，8 → 6 → 4 → 2 递减；感受野按
`R ← R + 2 * d * (k - 1)` 累加，3 → 7 → 15 → 31，正好是 `2^(depth+1) - 1`。
四层就换来接近 32 像素的感受野，而每层只多了两三个通道——这正是「密集连接
+多膨胀」这个名字想达到的性价比：小幅增加通道，换取跨尺度的感受野覆盖。

## 一处对不上的地方

notebook 记录的最后一行输出是：

```text
torch.Size([4, 3, 64, 64]) torch.Size([4, 2, 64, 64])
```

输入的 3 通道对得上，`repr` 打印出的四个 `Conv2d` 也和上表完全一致。但按上面
的 `torch.split` 逐步手推，残差通道数是 0 → 8 → 12 → 14 → 14，最后 `output`
应该是 14 通道，而不是 2。docstring 里写的 `out_channels = growth_rate[-1]`
在这个记账方式下也推不出来。

我倾向于认为记录下来的这行输出和贴出来的代码不是同一份状态——可能原仓库后来
改过 `forward` 的返回值，notebook 没跟着更新。但我没法从这份文件里确认，所以
这里把两者都摆出来：**形状记录不可信，`repr` 和通道账是可信的**。要真正确认，
得拿到 `tky823/DNN-based_source_separation` 当前版本的 `d2net.py` 再跑一次。

## 参数规整的那段样板

`D2Block` 的构造函数里有一大段看起来重复的代码，其实是在解决同一个问题：让
`growth_rate`、`dilated`、`norm`、`nonlinear` 四个参数既可以是标量也可以是列表。
以 `growth_rate` 为例：

```python
if type(growth_rate) is int:
    assert depth is not None, "Specify `depth`"
    growth_rate = [growth_rate] * depth
elif type(growth_rate) is list:
    if depth is not None:
        assert depth == len(growth_rate), "`depth` is different from `len(growth_rate)`"
    depth = len(growth_rate)
else:
    raise ValueError("Not support growth_rate={}".format(growth_rate))
```

三条分支的语义是：给整数就必须同时给 `depth`（否则不知道要复制几份）；给列表
就以列表长度为准，如果 `depth` 也给了就检查两者一致；其他类型直接报错。
规整完之后，`self.growth_rate` 一定是个列表，`self.depth` 一定是个整数，后面
的循环可以放心索引。

`norm` 和 `nonlinear` 的写法几乎一样，只有 `nonlinear` 多接受一个字符串：

```python
if type(nonlinear) is bool or type(nonlinear) is str:
    assert depth is not None, "Specify `depth`"
    nonlinear = [nonlinear] * depth
```

用 `type(x) is int` 而不是 `isinstance` 是为了排除 numpy 整数之类。不过这种
严格也带来一个代价：传入 `np.int64` 类型的 `growth_rate` 会直接落到 `else`
分支报错。实践中我一般会先 `int()` 转一道，或者直接传列表。

## 参数量怎么估

用上面那张表可以直接算。这个配置下 `ConvBlock2d` 的可训练参数只有归一化的
`weight` 和 `bias`（每个通道各一个），卷积核是主体：

```text
layer 0: 3 -> 8,  k=3, d=1   =>  3*8*9   = 216
layer 1: 2 -> 6,  k=3, d=2   =>  2*6*9   = 108
layer 2: 2 -> 4,  k=3, d=4   =>  2*4*9   =  72
layer 3: 2 -> 2,  k=3, d=8   =>  2*2*9   =  36
                                          ----
                                     total  432
```

膨胀率不影响参数量——`dilation` 只改变卷积核覆盖的间距，不改变核的点数。
换句话说，膨胀率是**免费的感受野**。这是空洞卷积在分割任务里最直接的吸引力：
不增加参数、不降低分辨率，就能看到更大的上下文。

代价是棋盘效应。`d=4, k=3` 时相邻采样点隔了 4 个像素，中间的像素完全没有
参与计算，输出会呈现网格状伪影。常见做法是在同一层里并联一个 `d=1` 的分支
再相加，但这段代码没有这么做，它只靠 `depth=4` 的层次递进来缓解。

## 这套结构适合放在哪

如果要用它，我的判断是这样：`D2Block` 更适合当**骨干网络里的中段模块**，而不是
整个网络的全部。理由有三个。

第一，它只做通道变换，不做分辨率变换，所以外面必须有一层下采样和一层上采样
把它包起来。语义分割的网络基本都是这个形状。

第二，它的输出通道等于 `sum(growth_rate)`，也就是构造时就要定死的常数值，不像
U-Net 那样带一个 skip connection 把编码器的特征直接送到解码器。要和 U-Net
对接，中间得自己加过渡层。

第三，`depth=4` 换来的感受野是 31，量级上和 U-Net 浅层的中等膨胀模块差不多。
遥感影像的地面目标尺度变化大，如果要覆盖几百像素的上下文，光靠这一个块不够，
通常还要在外面套带状空洞卷积（`Strip Pooling`）或者换成空洞率更大的堆叠方式。

这也是为什么值得先把 `ConvBlock2d` 和 `D2Block` 单独读明白：它们的接口很小，
基本就是「输入通道数、growth rate、kernel size、要不要膨胀」，四个参数。剩下的
工作是把它们堆到多少层、在哪一层换通道、上下采样放在哪里。

## 这份笔记里没有的东西

需要说清楚边界：这份 notebook 没有去噪分支、没有去噪损失、没有数据集构造，
也没有 `U-Net` 或任何分割骨干。它是一份**结构基元**的代码记录，来源是源分离
仓库而不是 D3Net 论文的官方实现。

还有一个直接可见的问题：`D2BlockFixedDilation` 的 `forward` 在 `else` 分支里
多缩进了一个空格，

```python
        sections = [_in_channels, sum(growth_rate[idx:])]
         x, x_residual = torch.split(x_residual, sections, dim=1)
```

这行是 `IndentationError`，类定义阶段就会报错。它的构造函数里还有一处：
`dilation` 类型不对时抛出的消息引用了未定义的变量 `dilated` 而不是 `dilation`，
所以那条错误分支自己也会再炸一次。真正可用的只有 `D2Block`。

要接着往下走（D3Net 的去噪监督怎么设计、怎么嵌进分割网络），需要另找来源：
论文正文、官方仓库，或者一个真的跑过训练的去噪实现。这份笔记能提供的只有
最底层的那块砖——而这块砖本身已经说明了为什么密集连接需要手工记通道账。
