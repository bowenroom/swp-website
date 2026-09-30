---
title: "D3Net: How the Denoising Network Is Built"
---

This is my first code record from reading the D3Net implementation. The goal was
to work out how "densely connected, multi-dilation" convolution actually gets
written in PyTorch, and how the channel bookkeeping really works. What the
notebook actually runs is the D2Net dense multi-dilation block borrowed from a
source-separation repository: two constructors, one convolution primitive, and
a shape check. There is no denoising branch, no loss, and no image/label pairing
anywhere in the file. Everything below is the part you can verify line by line
against that code.

## A convolution primitive that refuses to downsample

The whole structure rests on `ConvBlock2d`, a wrapper around normalize →
activate → dilated-convolve. Its first act is to refuse downsampling:

```python
class ConvBlock2d(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size, stride=1,
                 dilation=1, norm=True, nonlinear='relu', eps=EPS):
        super().__init__()

        assert stride == 1, "`stride` is expected 1"

        self.kernel_size = _pair(kernel_size)
        self.dilation = _pair(dilation)
```

An `assert` rather than a warning. This is not "defaults to no downsampling, but
you really shouldn't" — the block cannot change spatial size by construction.
The reason follows from what comes later: dense connectivity reuses features by
concatenating channels, so the moment one layer alters H or W, every downstream
`torch.split` stops lining up. Size preservation is a hard constraint here, not
a side effect.

Both `kernel_size` and `dilation` go through `_pair`, turning the scalar `1` into
`(1, 1)` so the padding arithmetic never has to branch on type:

```python
>>> _pair(1)
(1, 1)
```

## Hand-computed "same" padding

The interesting part of `forward` is the padding, computed by hand. The
convolution itself is given `dilation=` and no `padding=`, so preserving size is
made explicit:

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

Output size is `H + (up + down) - d * (k - 1)`. Substituting
`(up + down) = (Kh - 1) * Dh`, the two `Dh` terms cancel and the result is
exactly `H`, for any `k` and any `d`, odd included.

The `// 2` does introduce asymmetry. When `(k - 1) * d` is odd — say `k=4, d=1`,
total padding 3 — you get `padding_up = 1` and `padding_bottom = 2`, so the four
numbers handed to `F.pad` are not equal. That is not a bug, just a reminder that
this padding is derived by index arithmetic rather than assumed symmetric. With
the default `k=3` the total is even and the asymmetry never shows.

More easily missed is the ordering: normalization and ReLU run **before** the
padding, not after.

```python
x = input
if self.norm:
    x = self.norm2d(x)
if self.nonlinear:
    x = self.nonlinear2d(x)

x = F.pad(x, (padding_left, padding_right, padding_up, padding_bottom))
output = self.conv2d(x)
```

Activating before zero-padding means the convolution sees a constant 0 in the
border rather than a post-ReLU 0. That introduces a small bias at the boundary,
and in exchange it skips a renormalization of the padded tensor and keeps
BatchNorm from accumulating statistics over the zeros. A deliberate trade, not an
equivalent transformation.

Both switches can be turned off independently, and with `norm=False,
nonlinear=None` the class collapses to a plain dilated convolution:

```python
temp = ConvBlock2d(3, 128, 3, 1, 1, norm=False, nonlinear=None)
temp(torch.randn(1, 3, 32, 32)).shape
# torch.Size([1, 128, 32, 32])
```

Note `dilation=1` there. That is `ConvBlock2d`'s own smoke test; the multi-scale
logic has not entered yet.

## Channel bookkeeping in a dense block

`D2Block` does something unusual on top of this primitive. It does not feed the
previous output into the next layer whole. Each step **splits the residual**: the
freshly produced channels go through convolution, the rest keeps accumulating.

The constructor normalizes its arguments first. `growth_rate` can be an int
(broadcast against `depth`) or an already-built list; `dilated`, `norm` and
`nonlinear` follow the same scalar-broadcast-or-list-as-given pattern. After
normalization the loop picks each layer's input and output channels by index:

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

Two details matter. First, `_out_channels` is the sum of **all remaining** growth
rates, not the current one, because the output has to survive being split again
by the layers that follow. Second, the dilation doubles with the index, so layer 0
is pinned at 1 — which means it never appears in the printed `repr` and is easy
to miss.

`forward` is the bookkeeping itself, four lines per iteration:

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

The first element of `sections`, `growth_rate[idx - 1]`, is exactly what the
previous convolution produced, so `x` is always the freshest slice.
`x_residual` collects everything older. Adding them back restores a total of
`sum(growth_rate[idx:])` channels, which is exactly enough for the next split.
That invariant is the only reason the block runs at all.

## Expanding `depth=4`

The notebook's test uses the smallest workable configuration: `in_channels=3`,
`growth_rate=2`, `depth=4`, `kernel_size=(3,3)`, `dilated=True`, and input
`torch.randn(4, 3, 64, 64)`. Running the loop above by hand reproduces the printed
structure exactly:

| Layer | dilation | in channels | out channels | receptive field |
| --- | --- | --- | --- | --- |
| 0 | 1 | 3 | 8 | 3 |
| 1 | 2 | 2 | 6 | 7 |
| 2 | 4 | 2 | 4 | 15 |
| 3 | 8 | 2 | 2 | 31 |

The output column is `sum(growth_rate[idx:])`, falling 8 → 6 → 4 → 2. The
receptive field accumulates as `R ← R + 2 * d * (k - 1)`, giving 3 → 7 → 15 →
31, which is `2^(depth+1) - 1`. Four layers buy a receptive field close to 32
pixels while adding only two or three channels each. That is the trade the name
is advertising: a small channel budget for cross-scale coverage.

## One number that does not reconcile

The last line of recorded output in the notebook is:

```text
torch.Size([4, 3, 64, 64]) torch.Size([4, 2, 64, 64])
```

The 3-channel input checks out, and the four printed `Conv2d` layers match the
table above line for line. But tracing the `torch.split` by hand, the residual
goes 0 → 8 → 12 → 14 → 14, so `output` should carry 14 channels, not 2. The
docstring's claim that `out_channels = growth_rate[-1]` also does not follow from
this bookkeeping.

My reading is that the recorded shape and the pasted code are not the same state
of the repository — the original project probably changed what `forward` returns
and the notebook was never re-run. I cannot confirm that from this file, so both
are shown here: **the shape line is unreliable; the `repr` and the channel
arithmetic are not.** Settling it needs the current `d2net.py` from
`tky823/DNN-based_source_separation` and a re-run.

## What this notebook does not contain

Worth stating the boundary plainly: no denoising branch, no denoising loss, no
dataset construction, no `U-Net`, no segmentation backbone. This is a record of
structural primitives, and the source is a source-separation repository rather
than an official D3Net implementation.

One defect is directly visible. In `D2BlockFixedDilation.forward`, the `else`
branch is indented one space too deep:

```python
        sections = [_in_channels, sum(growth_rate[idx:])]
         x, x_residual = torch.split(x_residual, sections, dim=1)
```

That line is an `IndentationError` raised at class-definition time. Its
constructor has a second problem: the error message raised for a bad `dilation`
type references an undefined name, `dilated`, instead of `dilation`, so that
branch would raise again on the way out. `D2Block` is the only usable one of the
two.

Going further — how denoising supervision is designed, how it attaches to a
segmentation network — needs a different source: the paper, an official
repository, or an implementation that has actually been trained. This notebook
supplies only the bottom brick, and even that brick makes the case for why dense
connectivity requires hand-written channel bookkeeping.
