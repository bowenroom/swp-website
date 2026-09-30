---
title: "走向鲁棒的 Vision Transformer"
---

原始 notebook 的标题是「Robust transformer models」，内容分成两半：前半是一份五条的改进清单，后半是两份可以直接跑的实现——一份 `PoolingTransformer`，一份 T2T-ViT。我的注意力全在第一份上，因为它把「Transformer 为什么脆弱」这件事拆成了五个非常具体的改法，每一条都能对应到代码里的一行。

先说清楚一点：这份笔记**没有任何实验结果**。没有 benchmark 表格，没有 mIoU 数字，`output.shape` 只打印出 `torch.Size([1000])`——那只是确认模型能前向。所以下面所有内容都是结构层面的理解，不是性能结论。

## 动机来自哪里

notebook 开头把 Potsdam 的三个目录挂进来，读一张 RGB、一张标签、一张 DSM：

```python
rgbTensor  = image2tensor(rgbImage)   # torch.Size([3, 6000, 6000])
lblTensor  = image2tensor(lblImage)   # torch.Size([1, 6000, 6000])
dsmTensor  = image2tensor(dsmImage)
torch.unique(lblTensor)                # tensor([0, 1, 2, 3, 4, 5], dtype=torch.uint8)
```

6000×6000 的整景影像，标签是 6 类的 `uint8`。这样的输入正是 ViT 最不擅长的场景：标准 ViT 把图切成 16×16 的 patch，一个 224×224 输入会产生 196 个 token、自注意力代价是 196²；而这里一张图是 5600 万像素，朴素做法会产生 22 万个 token —— 不只是慢，是根本放不下。清单里的每一条，几乎都是在回答这个矛盾。

## 五条清单，逐条对上代码

清单本身只有五行：

1. 用卷积 stem 提取 patch 的低层特征；
2. 采用 ViT 的多阶段设计，避免在过高空间分辨率上堆 block；
3. 选择合适的注意力头数；
4. 在 FFN 里使用卷积；
5. 用 token feature pooling 替代 CLS token。

### 1. 卷积 stem

```python
class conv_embedding(nn.Module):
    def __init__(self, in_channels, out_channels, patch_size, stride, padding):
        super().__init__()
        self.out_channels = out_channels
        self.proj = nn.Sequential(
            nn.Conv2d(in_channels, 32, kernel_size=(7, 7), stride=(2, 2), padding=(2, 2)),
            nn.BatchNorm2d(32),
            nn.MaxPool2d(3, stride=2, padding=1),
            nn.Conv2d(32, out_channels, kernel_size=(4, 4), stride=(4, 4))
        )
```

普通 ViT 是一层 `Conv2d(kernel=16, stride=16)` 做 patchify，然后直接进自注意力。问题是那个 16×16 的大核直接作用在**原始像素**上——此时还没有任何平移等变性，边缘、纹理这些低层特征完全靠后续注意力自己学。这里换成 7×7 卷积 + BN + 最大池化 + 4×4 卷积的两级结构，先把局部结构提出来，再交给 transformer。代价是多了几层卷积，收益是低层特征不必硬学。

### 2. 多阶段 + 降采样

`PoolingTransformer` 分两个 stage，stage 之间用一个深度卷积做 patch merging：

```python
class conv_head_pooling(nn.Module):
    def __init__(self, in_feature, out_feature, stride, padding_mode='zeros'):
        super().__init__()
        self.conv = nn.Conv2d(in_feature, out_feature, kernel_size=stride + 1,
                              padding=stride // 2, stride=stride,
                              padding_mode=padding_mode, groups=in_feature)
```

`groups=in_feature` 意味着每个通道独立做空间混合，只在最后把通道数对回去——本质上是「先各自下采样，再拼接」，参数量远低于普通卷积。清单里「avoid blocks with larger spatial resolution」说的就是这个：自注意力是 O(N²)，token 数必须尽早降下来。

### 3. 合适的头数

实例化时：

```python
model = PoolingTransformer(
    image_size=224,
    patch_size=16,
    stride=16,
    base_dims=[32, 32],
    depth=[10, 2],
    heads=[6, 12],
    mlp_ratio=4
)
```

注意这里 `base_dims` 配合 `heads` 才决定实际宽度——`embed_dim = base_dim * heads`，两个 stage 分别是 32×6=192 和 32×12=384。头数不是随便挑的：维度固定时，头越多则每头维度越小，注意力图越碎；头太少则单头承载的语义过重。`depth=[10, 2]` 同样说明了第 2 条——计算量大的 stage 只放 10 个 block，第二个 stage 已经降到低分辨率，才放 2 个。

### 4. FFN 里加卷积

这是整个实现里最巧妙的一段。`Mlp` 按维度分流：

```python
class Mlp(nn.Module):
    def __init__(self, in_features, hidden_features=None, out_features=None, act_layer=nn.GELU, drop=0.):
        super().__init__()
        ...
        if in_features == 768:
            self.fc1 = nn.Linear(in_features, hidden_features)
            self.act = act_layer()
            self.fc2 = nn.Linear(hidden_features, out_features)
        else:
            self.fc1 = nn.Conv2d(in_features, hidden_features, 1)
            self.bn1 = nn.BatchNorm2d(hidden_features)
            self.dwconv = nn.Conv2d(hidden_features, hidden_features, 3, padding=1, groups=hidden_features)
            self.bn2 = nn.BatchNorm2d(hidden_features)
            self.act = act_layer()
            self.fc2 = nn.Conv2d(hidden_features, out_features, 1)
            self.bn3 = nn.BatchNorm2d(out_features)
```

1×1 卷积等价于逐位置的全连接；中间那个 `groups=hidden_features` 的 3×3 是深度卷积，给每个通道一个空间感受野；再用 1×1 混通道。forward 里把 token 序列 reshape 回二维再处理：

```python
B,N,C = x.shape
x = x.reshape(B, int(N**0.5), int(N**0.5), C).permute(0,3,1,2)
x = self.bn1(self.fc1(x))
x = self.act(x)
x = self.drop(x)
x = self.act(self.bn2(self.dwconv(x)))
x = self.bn3(self.fc2(x))
x = x.permute(0,2,3,1).reshape(B, -1, C)
```

为什么这对鲁棒性有用？因为纯 MLP 是**逐 token 独立**的，它没有空间归纳偏置。加入深度卷积后，FFN 内部就有了局部平移等变性，模型不必再靠注意力去学「相邻像素相关」这种先验。在分布外数据上，先验越强、拟合越不死的模型通常越稳。

顺带说一句我的怀疑：`if in_features == 768` 这个硬编码分支很脆。只要哪个 stage 恰好算出 768 维，它就会静默走 Linear 分支，整个结构的性质都变了。这种写法在实验代码里可以接受，进了工程代码我会改成显式传参。

### 5. 去掉 CLS token

```python
self.gap = nn.AdaptiveAvgPool2d(1)

def forward_features(self, x):
    x = self.patch_embed(x)
    x = self.pos_drop(x)
    for stage in range(len(self.pools)):
        x = self.transformers[stage](x)
        x = self.pools[stage](x)
    x = self.transformers[-1](x)
    cls_features = self.norm(self.gap(x).squeeze())
    return cls_features
```

没有 `cls_token` 参数，没有位置编码，最后用全局平均池化直接汇聚。CLS token 的老问题在于：它是人为加进去的、必须靠训练学会「代表全局」的特殊 token——在数据量不够或分布偏移时，这个 token 常常训练不稳定。换成平均池化之后，表征是所有 token 的自然汇聚，鲁棒得多。分割任务里这个选择尤其合理，因为密集预测本来就关心局部而非某个全局摘要。

## 附带的部分：T2T-ViT

后半部分还有一份 T2T-ViT 实现，用 `Token_performer` 做 tokens-to-token：

```python
class Token_performer(nn.Module):
    def prm_exp(self, x):
        # 用正交随机特征近似 softmax 核，避免显式构造 N×N 矩阵
        xd = ((x * x).sum(dim=-1, keepdim=True)).repeat(1, 1, self.m) / 2
        wtx = torch.einsum('bti,mi->btm', x.float(), self.w)
        return torch.exp(wtx - xd) / math.sqrt(self.m)
```

思路是用核方法把 `softmax(QK^T)V` 写成 `φ(Q)(φ(K)ᵀV)`，中间矩阵从 N×N 变成 N×m，线性注意力。`T2T_module` 里用三层 `nn.Unfold`（kernel/stride 分别是 7/4、3/2、3/2）反复重组 token。跑起来是：

```python
t2tModel = T2T_ViT()
x = torch.randn(1, 3, 224, 224)
y = t2tModel(x)   # 打印 'adopt performer encoder for tokens-to-token'，y.shape = [1, 1000]
```

顺带，notebook 里还有一段 `torch.nn.Unfold` 的最小演示，用 3×3 的 `arange` 张量走一遍：

```python
temp = torch.arange(1,28).view(1,3,3,3).float()
temp2 = torch.nn.Unfold(kernel_size=2, stride=1)(temp)
temp2.shape   # torch.Size([1, 12, 4])：3×3=9 个位置，每个 2×2=4 个元素
```

输出印证了 `Unfold` 的语义：把重叠的滑窗一次性摊平成序列，通道维变成 `kernel²`。理解 `Unfold` 是理解 T2T 和很多轻量 ViT 变体的前提，值得单独玩一遍。

## 这份笔记没有回答什么

我想把边界划清楚。notebook 提供了可运行的实现和一份设计清单，但：

- **没有鲁棒性实验**。没有在模糊、噪声、分布外数据上跑过任何对比，零结果。
- **没有权重、没有预训练**。这些模型都是随机初始化，只验证了前向能跑通。
- **没有和 baseline 对照**。「比 ViT 更鲁棒」这句话在这份笔记里完全没有被检验。

所以这更像是「把一份结构方案读通」，而不是「验证了一个结论」。对遥感分割来说这五条的动机非常清楚——高分辨率、大尺度变化、密集标注，全是 ViT 的弱项；但具体哪一条贡献了多少、值不值得为它放弃预训练权重，得自己在数据上做消融。

我打算下一步就在 Potsdam + 雾天数据上做这件事：固定其余配置，每次只动一条，看 mIoU 掉多少。那才是能写进结论的部分。
