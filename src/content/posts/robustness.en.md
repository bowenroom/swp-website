---
title: "Towards Robust Vision Transformer"
---

The original notebook is called "Robust transformer models" and splits into two halves: a five-item checklist of improvements at the front, and two runnable implementations at the back — a `PoolingTransformer` and T2T-ViT. I spent most of my time on the first, because it decomposes "why transformers are fragile" into five concrete edits, each of which maps to a specific line of code.

One caveat up front: this notebook contains **no experiments**. No benchmark table, no mIoU numbers. `output.shape` just prints `torch.Size([1000])`, which confirms the forward pass runs. Everything below is structural understanding, not a performance claim.

## Where the motivation comes from

The notebook starts by wiring up three Potsdam directories and reading one RGB tile, one label, one DSM:

```python
rgbTensor  = image2tensor(rgbImage)   # torch.Size([3, 6000, 6000])
lblTensor  = image2tensor(lblImage)   # torch.Size([1, 6000, 6000])
dsmTensor  = image2tensor(dsmImage)
torch.unique(lblTensor)                # tensor([0, 1, 2, 3, 4, 5], dtype=torch.uint8)
```

6000×6000 whole-scene imagery, six-class `uint8` labels. This is precisely the input regime ViT handles worst. A standard ViT cuts the image into 16×16 patches, so a 224×224 input yields 196 tokens and a 196×196 self-attention matrix. This image is 56 megapixels — a naive patchification would give 220,000 tokens. That is not merely slow, it simply does not fit. Almost every item on the checklist is an answer to that tension.

## The five items, mapped onto code

The checklist itself is five lines:

1. Extract low-level features of patches with a convolutional stem.
2. Adopt the multi-stage ViT design; avoid blocks at unnecessarily high spatial resolution.
3. Choose a suitable number of heads.
4. Use convolution in the FFN.
5. Replace the CLS token with token feature pooling.

### 1. Convolutional stem

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

A vanilla ViT does patchification with one `Conv2d(kernel=16, stride=16)` and drops the result straight into self-attention. The problem is that a single 16×16 kernel is applied to **raw pixels** — there is no translational equivariance yet, so edges and textures have to be learned from scratch by the attention stack. This replaces it with a two-stage 7×7 conv + BN + max-pool + 4×4 conv, which extracts local structure first and only then hands over to the transformer. It costs a few extra conv layers and saves the transformer from learning low-level priors.

### 2. Multi-stage with downsampling

`PoolingTransformer` runs two stages with a depthwise conv as the patch-merging operation between them:

```python
class conv_head_pooling(nn.Module):
    def __init__(self, in_feature, out_feature, stride, padding_mode='zeros'):
        super().__init__()
        self.conv = nn.Conv2d(in_feature, out_feature, kernel_size=stride + 1,
                              padding=stride // 2, stride=stride,
                              padding_mode=padding_mode, groups=in_feature)
```

`groups=in_feature` means each channel is spatially mixed independently and the channel count is realigned only at the end — effectively "downsample each one, then reassemble", for far fewer parameters than a dense convolution. This is what "avoid blocks with larger spatial resolution" is about: self-attention is O(N²), so the token count has to come down early.

### 3. A suitable number of heads

At instantiation:

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

Note that `base_dims` combined with `heads` determines the real width — `embed_dim = base_dim * heads`, giving 32×6=192 and 32×12=384 for the two stages. Head count is not arbitrary: at fixed dimension, more heads means a smaller per-head dimension and a more fragmented attention map; too few and each head carries too much semantics. `depth=[10, 2]` says the same thing as item 2 — the expensive stage gets 10 blocks, and the already-downsampled second stage gets 2.

### 4. Convolution inside the FFN

This is the cleverest part of the implementation. `Mlp` branches on dimensionality:

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

The 1×1 conv is equivalent to a position-wise fully connected layer; the middle `groups=hidden_features` 3×3 is a depthwise convolution giving each channel its own spatial receptive field; the final 1×1 mixes channels back. The forward reshapes the token sequence back to 2D to use it:

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

Why does this help robustness? A plain MLP is **per-token independent** — it carries no spatial inductive bias. The depthwise convolution gives the FFN local translational equivariance, so the model no longer has to spend attention learning the prior that neighbouring pixels are correlated. Models with stronger built-in priors tend to degrade less on out-of-distribution data, and this is one of them.

A suspicion of my own: that `if in_features == 768` branch is brittle. Any stage that happens to land on 768 dimensions silently takes the Linear path, and the structural character of the model changes underneath you. Acceptable in experiment code; in anything shipped I would make it an explicit argument.

### 5. Dropping the CLS token

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

No `cls_token` parameter, no position embedding, and global average pooling for the final aggregation. The long-standing objection to CLS is that it is a special token bolted on and has to *learn* to stand in for the whole image — with limited data or under distribution shift it trains unreliably. Average pooling makes the representation a natural aggregate over all tokens instead. For dense prediction this is the more defensible choice anyway: segmentation cares about local structure, not a global summary.

## The second half: T2T-ViT

The back half implements T2T-ViT with a `Token_performer` doing the tokens-to-token work:

```python
class Token_performer(nn.Module):
    def prm_exp(self, x):
        # approximate the softmax kernel with orthogonal random features,
        # so no explicit N x N matrix is ever built
        xd = ((x * x).sum(dim=-1, keepdim=True)).repeat(1, 1, self.m) / 2
        wtx = torch.einsum('bti,mi->btm', x.float(), self.w)
        return torch.exp(wtx - xd) / math.sqrt(self.m)
```

The idea is a kernel-method rewrite of `softmax(QKᵀ)V` into `φ(Q)(φ(K)ᵀV)`, turning the middle matrix from N×N into N×m — linear attention. `T2T_module` applies three `nn.Unfold` layers (kernel/stride 7/4, 3/2, 3/2) to progressively restructure tokens. Running it:

```python
t2tModel = T2T_ViT()
x = torch.randn(1, 3, 224, 224)
y = t2tModel(x)   # prints 'adopt performer encoder for tokens-to-token'; y.shape = [1, 1000]
```

There is also a minimal `torch.nn.Unfold` demo in the notebook, running a 3×3 `arange` tensor through it:

```python
temp = torch.arange(1,28).view(1,3,3,3).float()
temp2 = torch.nn.Unfold(kernel_size=2, stride=1)(temp)
temp2.shape   # torch.Size([1, 12, 4]): 3x3 = 9 positions, each 2x2 = 4 elements
```

The output confirms the semantics of `Unfold`: overlapping sliding windows flattened into a sequence, with the channel dimension becoming `kernel²`. Getting comfortable with `Unfold` is a prerequisite for T2T and many lightweight ViT variants, and it takes about five minutes to play with.

## What this notebook does not answer

I want to draw the boundary clearly. The notebook gives you working implementations and a design checklist, but it does not:

- **Run any robustness experiment.** Nothing was evaluated under fog, noise, or distribution shift. Zero results.
- **Load any weights.** Every model here is randomly initialised; the forward pass is all that was verified.
- **Compare against a baseline.** The claim "more robust than ViT" is completely untested in this notebook.

So this is closer to "understand one structural proposal" than "verify a conclusion". The motivation for all five items is very legible for remote-sensing segmentation — high resolution, wild scale variation, dense labels, all of them ViT's weak spots — but how much each item actually contributes, and whether it is worth giving up pretrained weights, is something you have to ablate on your own data.

That is the next thing I want to do: take Potsdam plus foggy imagery, hold everything else fixed, change one item at a time, and watch how much mIoU moves. That would be the part worth writing a conclusion about.
