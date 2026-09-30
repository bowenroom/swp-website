---
title: Self-Attention 方法
---

Transformer 的图解太完美了，完美到看完图很容易觉得自己已经懂了：每个词
去看所有词，把注意力权重归一化，再加权求和。真正写出来之后才会发现，
图里的方框在代码里对应好几个容易写错的张量变形。这一篇从最小的
`torch.bmm` 出发，把 self-attention 的定义、QKV 投影、多头切分、位置编码
和因果 mask 逐个落到 PyTorch 上，每一步都用真实输出检查 shape。

## 从最朴素的形式开始

先不看多头、不看投影，就是两句话：每个位置问一个问题，每个位置给一个
回答，用问题-回答的匹配度加权汇总。

```python
x = torch.randn(2, 3, 4)              # batch=2, 3 个 token, 4 维
raw_weights = torch.bmm(x, x.transpose(1, 2))
weights = F.softmax(raw_weights, dim=2)
weights.shape                          # torch.Size([2, 3, 3])
```

`torch.bmm` 对 `x` 和转置后的 `x` 做批量矩阵乘，得到的是**token 之间**
的相似度矩阵：`(2, 3, 4) x (2, 4, 3) -> (2, 3, 3)`。第 `(i, j)` 项是第
`i` 个 token 和第 `j` 个 token 的内积。此时它还是一堆没有意义的实数，
所以要沿 `dim=2` 做 softmax，让每一行加起来等于 1，行内就是"第 i 个 token
把注意力分给了谁"。

`dim` 选错是最常见的错误。如果沿 `dim=1` 做 softmax，得到的是**列和**
为 1，语义完全变了。规则是：沿 query 维之外的那一维归一化，也就是
`dim=-1`。

## Wide 与 Narrow：两种多头写法

原论文里，多头是把 embedding 切开，每个头拿到 `emb / heads` 维。但很多
实现（包括这个 notebook 里的第一版）是**先算大矩阵再切**，两种写法都能
用，但参数的排布完全不同。

### Wide

```python
class SelfAttentionWide(nn.Module):
    def __init__(self, emb, heads=8, mask=False):
        super().__init__()
        self.emb, self.heads, self.mask = emb, heads, mask
        self.tokeys    = nn.Linear(emb, emb * heads, bias=False)
        self.toqueries = nn.Linear(emb, emb * heads, bias=False)
        self.tovalues  = nn.Linear(emb, emb * heads, bias=False)
        self.unifyheads = nn.Linear(heads * emb, emb)
```

每个头的维度仍然是完整的 `emb`，所以一共有 `heads * emb` 维。代价是投影
矩阵大了 `heads` 倍。

### Narrow

```python
class SelfAttentionNarrow(nn.Module):
    def __init__(self, emb, heads=8, mask=False):
        super().__init__()
        assert emb % heads == 0, \
            f'Embedding dimension ({emb}) should be divisible by nr. of heads ({heads})'
        s = emb // heads
        self.tokeys    = nn.Linear(s, s, bias=False)
        self.toqueries = nn.Linear(s, s, bias=False)
        self.tovalues  = nn.Linear(s, s, bias=False)
        self.unifyheads = nn.Linear(heads * s, emb)
```

Narrow 版先 `x.view(b, t, h, s)` 把最后一维拆成 `h x s`，每个头独立做
`s -> s` 的投影，参数量小得多。`TransformerBlock` 里用一个 `wide` 布尔量
在两者之间切换，接口完全一致。

## 折叠头维度：把头塞进 batch

两种写法接下来做的是同一件事。PyTorch 的 `bmm` 是两维批量矩阵乘，头数
没有位置放，所以要把它折进 batch 维：

```python
b, t, e = x.size()
h = self.heads
assert e == self.emb

keys    = self.tokeys(x).view(b, t, h, e)
queries = self.toqueries(x).view(b, t, h, e)
values  = self.tovalues(x).view(b, t, h, e)

# fold heads into the batch dimension
keys    = keys.transpose(1, 2).contiguous().view(b * h, t, e)
queries = queries.transpose(1, 2).contiguous().view(b * h, t, e)
values  = values.transpose(1, 2).contiguous().view(b * h, t, e)
```

`transpose(1, 2)` 把 `(b, t, h, e)` 换成 `(b, h, t, e)`，`view` 再把 `b` 和
`h` 合成 `b * h`。这一步之后，`torch.bmm` 一次就能算出所有 batch 所有头
的注意力矩阵，`(b*h, t, t)`。`.contiguous()` 不能省——`transpose` 之后
内存布局不连续，`view` 会直接报错。

## 缩放因子放在哪里

论文写的是 `softmax(QK^T / sqrt(d_k))`。代码里常常换一种写法：

```python
queries = queries / (e ** (1 / 4))
keys    = keys / (e ** (1 / 4))

dot = torch.bmm(queries, keys.transpose(1, 2))
```

`q / e^(1/4)` 乘 `k / e^(1/4)` 等于 `q * k / e^(1/2)`，也就是
`q * k / sqrt(e)`，正是论文的缩放因子。之所以拆成两次除法，是因为对
`b*h*t*t` 的矩阵做一次除法比先缩放 `b*h*t*e` 更省——`t` 通常远大于 `e`。

缩放本身不是为了数值稳定而加的技巧。`e` 大时内积的方差随维度线性增长，
不缩放的话 softmax 会进入饱和区，梯度趋近于 0。

## 注意力权重与输出

```python
dot = torch.bmm(queries, keys.transpose(1, 2))
assert dot.size() == (b * h, t, t)

if self.mask:
    mask_(dot, maskval=float('-inf'), mask_diagonal=False)

dot = F.softmax(dot, dim=2)
out = torch.bmm(dot, values).view(b, h, t, e)

# swap h, t back, unify heads
out = out.transpose(1, 2).contiguous().view(b, t, h * e)
return self.unifyheads(out)
```

注意 softmax 沿 `dim=2`，也就是每个 query 位置对全部 key 求归一化。
`bmm(dot, values)` 把权重作用到 value 上，得到每个位置的加权平均。
最后一步 `unifyheads` 把 `h * e` 压回 `e`，这是多头与单头唯一的结构差异。

## 用 einsum 消掉 transpose

Wide 版的 reshape 步骤可以压缩成两行 einsum，可读性明显更好：

```python
def forward_einsum(self, x):
    b, t, e = x.size()
    h = self.heads

    keys    = self.tokeys(x).view(b, t, h, e)
    queries = self.toqueries(x).view(b, t, h, e)
    values  = self.tovalues(x).view(b, t, h, e)

    dot = torch.einsum('bthe,bihe->bhti', queries, keys) / math.sqrt(e)
    dot = F.softmax(dot, dim=-1)

    out = torch.einsum('bhtd,bdhe->bthe', dot, values)
    out = torch.einsum('bthe,khe->btk', out, self.unifyheads.weight.view(e, h, e))
    return out + self.unifyheads.bias
```

下标里的 `b t h e` 就是 batch、token、head、embedding，输出下标写什么
结果就是什么。`bhtd,bdhe->bthe` 这一行把 `d` 收掉换成 `e`，读起来就是
"按注意力加权求和"。最后一行连 `unifyheads` 的线性变换也一起做了，
权重 view 成 `(e, h, e)` 之后和输出做一次 einsum，正好等价于
`out @ W.T + b`。

## 位置编码

self-attention 本身是**置换等变**的：把输入 token 顺序打乱，输出只是跟着
同样打乱，模型分不出"谁在前谁在后"。所以要显式注入位置。

可学习的版本最简单：

```python
b, t, e = 3, 5, 6
position = nn.Embedding(10, 6)(torch.arange(t))[None, :, :].expand(b, t, e)
```

`[None, :, :]` 加一个 batch 维，`expand` 广播到所有样本。

正弦版本不引入参数，位置编码是确定的函数：

```python
def get_angles(pos, i, d_model):
    angle_rates = 1 / np.power(10000, (2 * (i // 2)) / np.float32(d_model))
    return pos * angle_rates

def positional_encoding(position, d_model):
    angle_rads = get_angles(np.arange(position)[:, np.newaxis],
                            np.arange(d_model)[np.newaxis, :],
                            d_model)
    angle_rads[:, 0::2] = np.sin(angle_rads[:, 0::2])
    angle_rads[:, 1::2] = np.cos(angle_rads[:, 1::2])
    return angle_rads[np.newaxis, ...]
```

偶数维走 sin、奇数维走 cos，频率随维度指数衰减——低维编码精细的位置差，
高维编码粗略的位置差。把 10 个 token、64 维的编码画出来：

![位置编码热力图，横轴为 embedding 维度，纵轴为 token 位置](/blogs/transformer/01.png)

*横轴是 embedding 维度，纵轴是 token 位置。左侧低维部分条纹密集、随位置
变化快；20 维之后几乎变成纯竖条，说明高维只携带很粗的位置信息。*

编码加在 token embedding 上，而不是拼接：

```python
tokens = self.token_emb(x)
b, t, k = tokens.size()

positions = torch.arange(t)
positions = self.pos_emb(positions)[None, :, :].expand(b, t, k)

x = tokens + positions
```

## 因果 mask

做语言模型时，第 `i` 个位置不能看到 `i` 之后的内容。做法是在 softmax
之前把上三角填成负无穷：

```python
def mask_(matrices, maskval=0.0, mask_diagonal=True):
    b, h, w = matrices.size()
    indices = torch.triu_indices(h, w, offset=0 if mask_diagonal else 1)
    matrices[:, indices[0], indices[1]] = maskval
```

`offset=1` 表示连对角线也一起屏蔽。填 `-inf` 而不是填 0，是因为 softmax
里 `exp(-inf) = 0`，权重会精确归零；填 0 的话 `exp(0) = 1`，反而给了一个
非零权重。

```python
queries = torch.randn(1, 3, 3)
keys = torch.randn(1, 3, 3)
dot = torch.bmm(queries, keys.transpose(1, 2))

indices = torch.triu_indices(3, 3, offset=1)
dot[:, indices[0], indices[1]] = float('-inf')
dot = F.softmax(dot, dim=2)
```

结果是下三角矩阵，每一行只对自己和更早的位置有权重。3x3 的情况一眼能看出来，
序列长到 512 时同样的逻辑依然成立，只是矩阵大到画不出来。

## 完整结构

把上面这些拼起来就是完整的 Transformer：

```python
class TransformerBlock(nn.Module):
    def __init__(self, emb, heads, mask, seq_length,
                 ff_hidden_mult=4, dropout=0.0, wide=True):
        super().__init__()
        self.attention = SelfAttentionWide(emb, heads=heads, mask=mask) if wide \
                    else SelfAttentionNarrow(emb, heads=heads, mask=mask)
        self.norm1 = nn.LayerNorm(emb)
        self.norm2 = nn.LayerNorm(emb)
        self.ff = nn.Sequential(
            nn.Linear(emb, ff_hidden_mult * emb),
            nn.ReLU(),
            nn.Linear(ff_hidden_mult * emb, emb))
        self.do = nn.Dropout(dropout)

    def forward(self, x):
        x = self.norm1(self.attention(x) + x)
        x = self.do(x)
        x = self.norm2(self.ff(x) + x)
        return self.do(x)
```

两处残差都是 post-norm：`LayerNorm` 放在加法之后。原始论文是 post-norm，
后来 pre-norm（`norm1` 放在子层之前）在深层训练里更稳，两者都能用，但
不要在同一份实现里混着写。

顶层把 block 堆起来，输出端对 token 维做平均池化再投影到类别：

```python
self.token_emb = nn.Embedding(num_tokens, k)
self.pos_emb = nn.Embedding(seq_length, k)
self.toprobs = nn.Linear(k, num_classes)

x = self.tblocks(tokens + positions)
x = self.toprobs(x.mean(dim=1))
return F.log_softmax(x, dim=1)
```

`mean(dim=1)` 在 token 维上平均——这个设计适合做句子级分类。如果要预测
每个 token 的标签，把池化去掉、直接对 `(b, t, k)` 做线性投影即可。

## 几个容易写错的地方

softmax 的 `dim`。沿 query 维归一化，写成 `dim=-1` 最保险；`dim=0` 在
`(b*h, t, t)` 上会把 batch 混进来，训练不会报错，但结果是错的。

`view` 之前的 `.contiguous()`。`transpose` 产生的是非连续内存，缺了这句
就是一条 `view() is not supported on tensors that don't have contiguous
memory` 的报错。

mask 填 `-inf` 而不是 0，以及 mask 必须在 softmax **之前**。放在之后会
把已经算好的权重重新归零，行和就不再是 1。

`e ** (1/4)` 这个写法。它看起来奇怪，但拆成两半正是为了让缩放发生在
`b*h*t*e` 上而不是 `b*h*t*t` 上，序列越长省得越多。
