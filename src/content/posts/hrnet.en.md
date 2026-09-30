---
title: Understanding HRNet, with Code
---

The HRNet paper figure is intuitive: one coarse branch at 1/4 resolution
runs all the way through, while progressively finer branches are attached
alongside it. Reading `seg_hrnet_ocr.py` for real, that intuition works
against you — there is no single place in the code where the whole data flow
becomes visible. This post walks the HRNet + OCR implementation in execution
order: how the base part turns RGB into four scales of features, how the
HighResolutionModule repeatedly fuses them, and how the OCR head uses a coarse
prediction to hand context back to the fine branch.

## The base part: a stem that keeps downsampling

The opening is unremarkable — the usual ResNet preamble:

```python
self.conv1 = nn.Conv2d(3, 64, kernel_size=3, stride=2, padding=1, bias=False)
self.bn1   = BatchNorm2d(64, momentum=BN_MOMENTUM)
self.conv2 = nn.Conv2d(64, 64, kernel_size=3, stride=2, padding=1, bias=False)
self.bn2   = BatchNorm2d(64, momentum=BN_MOMENTUM)
self.relu  = nn.ReLU(inplace=relu_inplace)
self.layer1 = self._make_layer(block, 64, num_channels, num_blocks)
```

Two stride-2 convolutions bring the input to 1/4, and `layer1` is a run of
bottlenecks. Stage 1 therefore outputs at 1/4, and every later branch is built
on that as the coarsest one. Worth noting immediately: `BN_MOMENTUM = 0.1`.
HRNet uses a slower BN momentum than the 0.02 you may be used to from fastai,
so do not copy values across when porting this code.

## Transition layers: one branch becomes several

Each stage is preceded by a transition that reshapes the previous stage's
output into the branch list the new stage expects. This function is worth
reading line by line because it covers three cases at once:

```python
def _make_transition_layer(self, num_channels_pre_layer, num_channels_cur_layer):
    num_branches_cur = len(num_channels_cur_layer)
    num_branches_pre = len(num_channels_pre_layer)
    transition_layers = []
    for i in range(num_branches_cur):
        if i < num_branches_pre:
            # existing branch: resolution already matches, only channels change
            if num_channels_cur_layer[i] != num_channels_pre_layer[i]:
                transition_layers.append(nn.Sequential(
                    nn.Conv2d(num_channels_pre_layer[i], num_channels_cur_layer[i],
                              3, 1, 1, bias=False),
                    BatchNorm2d(num_channels_cur_layer[i], momentum=BN_MOMENTUM),
                    nn.ReLU(inplace=relu_inplace)))
            else:
                transition_layers.append(None)
        else:
            # a new branch: stride-2 convs down from the coarsest one
            conv3x3s = []
            for j in range(i + 1 - num_branches_pre):
                inchannels = num_channels_pre_layer[-1]
                outchannels = num_channels_cur_layer[i] \
                    if j == i - num_branches_pre else inchannels
                conv3x3s.append(nn.Sequential(
                    nn.Conv2d(inchannels, outchannels, 3, 2, 1, bias=False),
                    BatchNorm2d(outchannels, momentum=BN_MOMENTUM),
                    nn.ReLU(inplace=relu_inplace)))
            transition_layers.append(nn.Sequential(*conv3x3s))
    return nn.ModuleList(transition_layers)
```

That `None` is deliberate: when the channel counts already agree, the code
skips a pointless 3x3 convolution, and `forward` checks for it:

```python
for i in range(self.stage2_cfg['NUM_BRANCHES']):
    if self.transition1[i] is not None:
        x_list.append(self.transition1[i](x))
    else:
        x_list.append(x)
y_list = self.stage2(x_list)
```

From stage 3 onward there is an extra `y_list[-1]` arm: when the new stage
wants more branches than the previous one had, every additional branch is
derived from the coarsest one.

## HighResolutionModule: three jobs

Each HighResolutionModule does three things — run the branches, fuse across
scales, then a ReLU. Branch construction is mechanical: the first block
carries a downsample, the rest do not.

```python
def _make_one_branch(self, branch_index, block, num_blocks, num_channels, stride=1):
    downsample = None
    if stride != 1 or \
       self.num_inchannels[branch_index] != num_channels[branch_index] * block.expansion:
        downsample = nn.Sequential(
            nn.Conv2d(self.num_inchannels[branch_index],
                      num_channels[branch_index] * block.expansion,
                      kernel_size=1, stride=stride, bias=False),
            BatchNorm2d(num_channels[branch_index] * block.expansion,
                        momentum=BN_MOMENTUM))
    layers = [block(self.num_inchannels[branch_index],
                    num_channels[branch_index], stride, downsample)]
    self.num_inchannels[branch_index] = \
        num_channels[branch_index] * block.expansion
    for i in range(1, num_blocks[branch_index]):
        layers.append(block(self.num_inchannels[branch_index], num_channels[branch_index]))
    return nn.Sequential(*layers)
```

The part that actually deserves attention is `_make_fuse_layers`. For each
output branch `i` it builds the transforms that bring every other branch `j`
onto `i`'s resolution:

- `j == i`: no layer at all; `forward` adds directly, preserving an identity path.
- `j > i` (finer): a 1x1 conv to match channels, then bilinear upsampling in `forward`.
- `j < i` (coarser): a chain of stride-2 3x3 convs to walk the resolution down.

```python
for j in range(num_branches):
    if j > i:
        fuse_layer.append(nn.Sequential(
            nn.Conv2d(num_inchannels[j], num_inchannels[i], 1, 1, 0, bias=False),
            BatchNorm2d(num_inchannels[i], momentum=BN_MOMENTUM)))
    elif j == i:
        fuse_layer.append(None)
    else:
        conv3x3s = []
        for k in range(i - j):
            if k == i - j - 1:
                num_outchannels_conv3x3 = num_inchannels[i]
                conv3x3s.append(nn.Sequential(
                    nn.Conv2d(num_inchannels[j], num_outchannels_conv3x3, 3, 2, 1, bias=False),
                    BatchNorm2d(num_outchannels_conv3x3, momentum=BN_MOMENTUM)))
            else:
                num_outchannels_conv3x3 = num_inchannels[j]
                conv3x3s.append(nn.Sequential(
                    nn.Conv2d(num_inchannels[j], num_outchannels_conv3x3, 3, 2, 1, bias=False),
                    BatchNorm2d(num_outchannels_conv3x3, momentum=BN_MOMENTUM),
                    nn.ReLU(inplace=relu_inplace)))
        fuse_layer.append(nn.Sequential(*conv3x3s))
```

The intermediate convs are followed by a ReLU; the last one is not, because
its output is about to be summed into `y` and passed through a ReLU anyway.
A small implementation detail that leaves the mathematics unchanged and the
intermediate activations different.

The matching `forward` is the part of HRNet worth memorising:

```python
x_fuse = []
for i in range(len(self.fuse_layers)):
    y = x[0] if i == 0 else self.fuse_layers[i][0](x[0])
    for j in range(1, self.num_branches):
        if i == j:
            y = y + x[j]
        elif j > i:
            width_output  = x[i].shape[-1]
            height_output = x[i].shape[-2]
            y = y + F.interpolate(self.fuse_layers[i][j](x[j]),
                                  size=[height_output, width_output],
                                  mode='bilinear', align_corners=ALIGN_CORNERS)
        else:
            y = y + self.fuse_layers[i][j](x[j])
    x_fuse.append(self.relu(y))
return x_fuse
```

The target size is read live off `x[i]`, not hard-coded. For a 256x256 input
the finest stage-4 branch is 1/8, so 32x32, and the coarsest is 1/32, so 8x8.
That is also why HRNet has a floor on input size: push it lower and the
coarsest branch degenerates to 1x1.

## The OCR head: letting a coarse prediction guide the fine branch

After stage 4, all four branches are interpolated to the finest branch's size
and concatenated:

```python
x0_h, x0_w = x[0].size(2), x[0].size(3)
x1 = F.interpolate(x[1], size=(x0_h, x0_w), mode='bilinear', align_corners=ALIGN_CORNERS)
x2 = F.interpolate(x[2], size=(x0_h, x0_w), mode='bilinear', align_corners=ALIGN_CORNERS)
x3 = F.interpolate(x[3], size=(x0_h, x0_w), mode='bilinear', align_corners=ALIGN_CORNERS)
feats = torch.cat([x[0], x1, x2, x3], 1)
```

Then comes the genuinely interesting design. A coarse class prediction is
produced first, and **that prediction itself becomes the weighting** used to
aggregate features:

```python
out_aux = self.aux_head(feats)                   # a first, rough prediction
feats = self.conv3x3_ocr(feats)                  # 3x3 conv + BN + ReLU

context = self.ocr_gather_head(feats, out_aux)   # aggregate context with it
feats = self.ocr_distri_head(feats, context)    # distribute context to pixels

out = self.cls_head(feats)
out_aux_seg.append(out_aux)
out_aux_seg.append(out)
```

`forward` returns two tensors: the auxiliary coarse prediction first, the
final output second. Both losses are trained; only the second is used at test
time.

`SpatialGather_Module` is the core of OCR, and only four lines of it do the
work:

```python
def forward(self, feats, probs):
    batch_size, c, h, w = probs.size(0), probs.size(1), probs.size(2), probs.size(3)
    probs = probs.view(batch_size, c, -1)          # batch x k x hw
    feats = feats.view(batch_size, feats.size(1), -1)
    feats = feats.permute(0, 2, 1)                # batch x hw x c
    probs = F.softmax(self.scale * probs, dim=2)  # batch x k x hw
    ocr_context = torch.matmul(probs, feats)       # batch x k x c
    return ocr_context.permute(0, 2, 1).unsqueeze(3)
```

`probs` is a distribution over `hw` pixels for each of `k` classes, and the
softmax runs along `hw`, so each class collapses to one weighted feature
vector. That is the "object-level context". `_ObjectAttentionBlock` then
distributes it back to every pixel by attention:

```python
query = self.f_pixel(x).view(batch_size, self.key_channels, -1).permute(0, 2, 1)
key   = self.f_object(proxy).view(batch_size, self.key_channels, -1)
value = self.f_down(proxy).view(batch_size, self.key_channels, -1).permute(0, 2, 1)

sim_map = torch.matmul(query, key)
sim_map = (self.key_channels ** -.5) * sim_map
sim_map = F.softmax(sim_map, dim=-1)

context = torch.matmul(sim_map, value)
```

Formally this is ordinary attention: the query comes from the features, while
key and value both come from those `k` class vectors. The difference is that
the value space has only `k` rows (19 for Cityscapes) instead of `hw`, so the
cost is negligible. The result is concatenated back onto the features:

```python
self.conv_bn_dropout = nn.Sequential(
    nn.Conv2d(2 * in_channels, out_channels, kernel_size=1, padding=0, bias=False),
    ModuleHelper.BNReLU(out_channels, bn_type=bn_type),
    nn.Dropout2d(dropout))

def forward(self, feats, proxy_feats):
    context = self.object_context_block(feats, proxy_feats)
    return self.conv_bn_dropout(torch.cat([context, feats], 1))
```

The `2 * in_channels` is `context` and `feats` joined.

## Running it

The fastest sanity check is to merge the config and instantiate:

```python
config.merge_from_file(path)   # seg_hrnet_ocr_w48_trainval_512x1024_...yaml

model = HighResolutionNet(config).cuda()
x = torch.randn(1, 3, 256, 256).cuda()
out = model(x)
```

`out` is a list of two tensors, each `[1, 19, 64, 64]`: 19 is the Cityscapes
class count, and 64 is 256 divided by 4 and aligned to stage 4's finest
branch. Remember those two numbers — if the output shape changes after you
touch the config, the cause is almost always `NUM_CLASSES` or a stage's
`NUM_BRANCHES`.

## Judgements formed while reading

`multi_scale_output` is disabled only on the **last** module of a stage; every
other module returns the full multi-scale list. That is what makes the depth
of a stage stackable: the intermediate modules' multi-scale outputs are all
consumed by the next module, and only the last one has to hand four branches
back to the transition that builds the following stage.

`fuse_method` is read and stored, but `_make_fuse_layers` never branches on
it. The SUM-versus-CONCAT ablation from the paper is not preserved in this
implementation; only SUM remains. When you meet a parameter that is accepted
and then unused, check for a historical leftover before assuming you
misread the code.

Finally, `init_weights`: loading ImageNet weights rewrites the keys
(`last_layer` to `aux_head`, `model.` prefix stripped), intersects them, and
calls `load_state_dict`. The function deliberately `print`s the difference in
both directions. That would not survive a code review, but it has saved me
more than once: when pretrained weights and a modified architecture disagree,
reading that set difference is far faster than diffing parameter names by
hand.
