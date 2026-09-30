---
title: The Self-Attention Method
---

Transformer diagrams are so clean that reading one often feels like
understanding it: every token looks at every other token, the weights are
normalised, and the results are averaged. Writing the thing out is where it
gets interesting, because each box in the figure turns out to be a tensor
reshuffle that is easy to get wrong. This post builds self-attention from a
single `torch.bmm` upward — the definition, the QKV projections, the multi-head
split, positional encoding and the causal mask — checking the shape of every
intermediate against real output.

## Starting from the plainest form

No heads, no projections, just two sentences: every position asks a question,
every position offers an answer, and answers are pooled by how well they
match.

```python
x = torch.randn(2, 3, 4)              # batch=2, 3 tokens, 4 dims
raw_weights = torch.bmm(x, x.transpose(1, 2))
weights = F.softmax(raw_weights, dim=2)
weights.shape                          # torch.Size([2, 3, 3])
```

`torch.bmm` on `x` and its transpose gives the similarity matrix **between
tokens**: `(2, 3, 4) x (2, 4, 3) -> (2, 3, 3)`. Entry `(i, j)` is the dot
product of token `i` with token `j`. These are still meaningless numbers, so a
softmax along `dim=2` makes each row sum to one — and the row is now "where
token `i` is looking".

Picking the wrong `dim` is the classic error. Softmaxing along `dim=1`
normalises the **columns** instead, which means something entirely different.
The rule: normalise over everything that is not the query axis, which in
practice is written `dim=-1`.

## Wide and Narrow: two ways to do multi-head

The paper splits the embedding and gives each head `emb / heads` dimensions.
Plenty of implementations, including the first version in this notebook, do
the opposite: project into a larger space, then slice. Both work, but they
lay out parameters very differently.

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

Each head still has the full `emb` width, so there are `heads * emb` channels
in total. The projection matrices are `heads` times larger as a result.

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

Narrow splits the last dimension first with `x.view(b, t, h, s)` and then runs
an independent `s -> s` projection per head, which is far cheaper. The
`TransformerBlock` selects between them with a `wide` boolean; the interface
is identical.

## Folding the head dimension into the batch

Both variants then do the same thing. `torch.bmm` is a two-dimensional batched
matrix multiply and has nowhere to put the head count, so the head axis gets
folded into the batch:

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

`transpose(1, 2)` turns `(b, t, h, e)` into `(b, h, t, e)`, and the following
`view` merges `b` and `h`. After that one `torch.bmm` produces the attention
matrix for every batch and every head at once, as `(b*h, t, t)`. The
`.contiguous()` is not optional — a transpose leaves non-contiguous memory and
`view` raises outright.

## Where the scaling factor goes

The paper writes `softmax(QK^T / sqrt(d_k))`. Code often expresses the same
thing differently:

```python
queries = queries / (e ** (1 / 4))
keys    = keys / (e ** (1 / 4))

dot = torch.bmm(queries, keys.transpose(1, 2))
```

`(q / e^(1/4))` dotted with `(k / e^(1/4))` is `q * k / e^(1/2)`, which is
exactly the paper's `q * k / sqrt(e)`. The split exists for a reason:
rescaling `b*h*t*e` before the matmul is cheaper than dividing the
`b*h*t*t` result afterwards, and `t` is normally much larger than `e`.

The scaling is not a numerical trick for its own sake. As `e` grows, the
variance of the inner products grows with it; unscaled, the softmax saturates
and the gradient collapses toward zero.

## Weights and output

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

The softmax runs along `dim=2`, normalising across all keys for each query
position. `bmm(dot, values)` applies those weights to the values, producing a
weighted average at every position. `unifyheads` then compresses `h * e` back
to `e` — the only structural difference between multi-head and single-head.

## Replacing the reshuffles with einsum

The Wide version's reshape chain collapses into two einsum lines, which reads
considerably better:

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

The subscripts `b t h e` spell out batch, token, head and embedding, and the
output subscript says what the result is. `bhtd,bdhe->bthe` consumes `d` and
produces `e`, which reads as "weighted sum". The last line folds the
`unifyheads` projection in as well: viewing the weight as `(e, h, e)` and
contracting it with the output is exactly `out @ W.T + b`.

## Positional encoding

Self-attention is permutation-equivariant: shuffle the input tokens and the
output shuffles with them, so the model cannot tell first from last. Position
has to be injected explicitly.

The learnable version is the simplest:

```python
b, t, e = 3, 5, 6
position = nn.Embedding(10, 6)(torch.arange(t))[None, :, :].expand(b, t, e)
```

`[None, :, :]` adds the batch axis and `expand` broadcasts it across samples.

The sinusoidal version adds no parameters at all — the encoding is a fixed
function of position:

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

Even dimensions take sin, odd dimensions take cos, and the frequency decays
exponentially with dimension: low dimensions encode fine position
differences, high dimensions encode coarse ones. Plotting 10 tokens at 64
dimensions:

![Positional encoding heatmap, embedding dimension against token position](/blogs/transformer/01.png)

*Horizontal axis is the embedding dimension, vertical axis the token
position. The left region is finely striped and changes quickly with position;
beyond dimension 20 it is almost solid, meaning the high dimensions carry
only coarse positional information.*

The encoding is **added** to the token embedding rather than concatenated:

```python
tokens = self.token_emb(x)
b, t, k = tokens.size()

positions = torch.arange(t)
positions = self.pos_emb(positions)[None, :, :].expand(b, t, k)

x = tokens + positions
```

## The causal mask

For a language model, position `i` must not see anything after it. That is
enforced by filling the upper triangle with negative infinity before the
softmax:

```python
def mask_(matrices, maskval=0.0, mask_diagonal=True):
    b, h, w = matrices.size()
    indices = torch.triu_indices(h, w, offset=0 if mask_diagonal else 1)
    matrices[:, indices[0], indices[1]] = maskval
```

`offset=1` masks the diagonal as well. The value matters: `-inf` rather than
`0`, because `exp(-inf) = 0` sends the weight to exactly zero, whereas `0`
gives `exp(0) = 1` and a non-trivial weight.

```python
queries = torch.randn(1, 3, 3)
keys = torch.randn(1, 3, 3)
dot = torch.bmm(queries, keys.transpose(1, 2))

indices = torch.triu_indices(3, 3, offset=1)
dot[:, indices[0], indices[1]] = float('-inf')
dot = F.softmax(dot, dim=2)
```

The result is lower-triangular: every row carries weight only for itself and
for what came before. That is obvious at 3x3 and just as true at length 512,
where the matrix is far too large to look at.

## The full structure

Assembling the pieces gives the complete Transformer:

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

Both residuals are post-norm: `LayerNorm` comes after the addition. The
original paper is post-norm; the later pre-norm arrangement, with `norm1`
before the sublayer, is easier to train at depth. Both work, but do not mix
them inside one implementation.

The top level stacks the blocks and pools over the token axis before
projecting to classes:

```python
self.token_emb = nn.Embedding(num_tokens, k)
self.pos_emb = nn.Embedding(seq_length, k)
self.toprobs = nn.Linear(k, num_classes)

x = self.tblocks(tokens + positions)
x = self.toprobs(x.mean(dim=1))
return F.log_softmax(x, dim=1)
```

`mean(dim=1)` averages across tokens, which suits sentence classification. For
per-token labels, drop the pooling and project `(b, t, k)` directly instead.

## The things that go wrong most often

The softmax `dim`. Normalise across keys, and write `dim=-1`; `dim=0` on a
`(b*h, t, t)` tensor folds the batch in, and training will not complain — the
result will simply be wrong.

The `.contiguous()` before `view`. A transpose produces non-contiguous memory,
and omitting it yields a `view() is not supported on tensors that don't have
contiguous memory` error.

Masking with `-inf` rather than 0, and masking **before** the softmax. Doing it
afterwards zeroes weights that were already normalised, and the rows no longer
sum to 1.

`e ** (1 / 4)`. It looks odd, but splitting the scale in half is what makes it
apply to `b*h*t*e` instead of `b*h*t*t` — the longer the sequence, the more it
saves.
