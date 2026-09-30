---
title: 读懂 HRNet 的代码
---

HRNet 的论文图很直观：一条 1/4 分辨率的粗分支一路贯穿网络，同时不断有
更高分辨率的分支被接进来。真正去读
`seg_hrnet_ocr.py` 的时候，这份直观反而容易骗人——因为代码里没有一个
叫 `HighResolutionNet` 的地方能让你一眼看出整条数据流。这一篇按执行
顺序把 HRNet + OCR 的实现拆开：先看 base part 怎么把 RGB 压成四尺度的
特征，再看 HighResolutionModule 怎么在多分支之间反复融合，最后看 OCR
头怎么用粗预测反过来给细分支提供上下文。

## Base part：一路减分辨率的 stem

开头非常朴素，就是 ResNet 那一套：

```python
self.conv1 = nn.Conv2d(3, 64, kernel_size=3, stride=2, padding=1, bias=False)
self.bn1   = BatchNorm2d(64, momentum=BN_MOMENTUM)
self.conv2 = nn.Conv2d(64, 64, kernel_size=3, stride=2, padding=1, bias=False)
self.bn2   = BatchNorm2d(64, momentum=BN_MOMENTUM)
self.relu  = nn.ReLU(inplace=relu_inplace)
self.layer1 = self._make_layer(block, 64, num_channels, num_blocks)
```

两次 stride=2 把输入降到 1/4，`layer1` 是一组 Bottleneck。HRNet 的
stage1 输出分辨率是 1/4，之后的所有分支都以这个为最粗的那一支。
值得记一笔的是 `BN_MOMENTUM = 0.1`：HRNet 用的是较慢的 BN 动量，
和 fastai 默认的 0.02 不是一套经验值，迁移代码时不要照抄。

## Transition layer：从一支变多支

每个 stage 之前都有一层 transition，把上一 stage 的输出改造成新 stage
需要的分支列表。这段代码值得逐行看，因为它同时处理了三种情况：

```python
def _make_transition_layer(self, num_channels_pre_layer, num_channels_cur_layer):
    num_branches_cur = len(num_channels_cur_layer)
    num_branches_pre = len(num_channels_pre_layer)
    transition_layers = []
    for i in range(num_branches_cur):
        if i < num_branches_pre:
            # 已存在的分支：分辨率对得上，只改通道数
            if num_channels_cur_layer[i] != num_channels_pre_layer[i]:
                transition_layers.append(nn.Sequential(
                    nn.Conv2d(num_channels_pre_layer[i], num_channels_cur_layer[i],
                              3, 1, 1, bias=False),
                    BatchNorm2d(num_channels_cur_layer[i], momentum=BN_MOMENTUM),
                    nn.ReLU(inplace=relu_inplace)))
            else:
                transition_layers.append(None)
        else:
            # 新增的分支：从最粗的那一支逐级 stride=2 下采样上来
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

注意那个 `None`：当新旧分支的通道数完全一样时，代码直接放一个空操作，
省掉一次无意义的 3x3 卷积。forward 里对应地做判断：

```python
for i in range(self.stage2_cfg['NUM_BRANCHES']):
    if self.transition1[i] is not None:
        x_list.append(self.transition1[i](x))
    else:
        x_list.append(x)
y_list = self.stage2(x_list)
```

从 stage3 开始，代码里多了一个 `y_list[-1]` 的分支：当要新增的分支数量
超过了上一 stage 的分支数，多出来的那些都从最粗的分支接出来。

## HighResolutionModule：三件事

每个 HighResolutionModule 只做三件事：跑各分支、做多尺度融合、再走一次
ReLU。分支的构造很机械——第一块带 downsample，后续块不带：

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

真正需要盯住的是 `_make_fuse_layers`。它为每个输出分支 `i` 准备一套
变换，用来把其他分支 `j` 的输出搬到 `i` 的分辨率上：

- `j == i`：不放任何层，forward 里直接相加，保留恒等通路。
- `j > i`（`j` 更细）：1x1 卷积改通道数，然后在 forward 里双线性插值放大。
- `j < i`（`j` 更粗）：串若干个 stride=2 的 3x3 卷积逐级降采样。

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

中间那些卷积后面跟了 ReLU，最后一个没有——因为它们的输出马上要被
加进 `y` 里再统一过一次 ReLU。这是很典型的实现细节：不改变数学结果，
但改变了中间激活的分布。

对应的 forward 是整个 HRNet 最值得背下来的一段：

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

分辨率尺寸是**从 `x[i]` 现场取**的，不是写死的常数。输入 256x256 时最
细的分支是 1/8 也就是 32x32，最粗的是 1/32 也就是 8x8——这解释了为什么
HRNet 对输入尺寸有下限要求：太小的话最粗分支会退化成 1x1。

## OCR head：用粗预测去指导细分支

stage4 之后，四个分支被统一插值到最细分支的尺寸再拼接：

```python
x0_h, x0_w = x[0].size(2), x[0].size(3)
x1 = F.interpolate(x[1], size=(x0_h, x0_w), mode='bilinear', align_corners=ALIGN_CORNERS)
x2 = F.interpolate(x[2], size=(x0_h, x0_w), mode='bilinear', align_corners=ALIGN_CORNERS)
x3 = F.interpolate(x[3], size=(x0_h, x0_w), mode='bilinear', align_corners=ALIGN_CORNERS)
feats = torch.cat([x[0], x1, x2, x3], 1)
```

接着是一个很有意思的设计。先用 `aux_head` 出一个粗糙的类别预测，**把这个
预测本身当作权重**，再去聚合特征：

```python
out_aux = self.aux_head(feats)          # 先出一版粗预测
feats = self.conv3x3_ocr(feats)         # 3x3 卷积 + BN + ReLU

context = self.ocr_gather_head(feats, out_aux)   # 用粗预测聚合上下文
feats = self.ocr_distri_head(feats, context)    # 把上下文分发回每个像素

out = self.cls_head(feats)
out_aux_seg.append(out_aux)
out_aux_seg.append(out)
```

forward 返回两个张量，`out_aux_seg` 里第一个是辅助监督用的粗预测，第二
个是最终输出。训练时两条损失一起算，测试只取第二个。

`SpatialGather_Module` 是整个 OCR 的核心，其实只有四行有效代码：

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

`probs` 是 `k` 个类别在 `hw` 个像素上的分布，softmax 在 `hw` 维上做，
于是每个类别得到一个加权的特征向量——这就是"物体级上下文"。再由
`_ObjectAttentionBlock` 把它按注意力分发回每一个像素：

```python
query = self.f_pixel(x).view(batch_size, self.key_channels, -1).permute(0, 2, 1)
key   = self.f_object(proxy).view(batch_size, self.key_channels, -1)
value = self.f_down(proxy).view(batch_size, self.key_channels, -1).permute(0, 2, 1)

sim_map = torch.matmul(query, key)
sim_map = (self.key_channels ** -.5) * sim_map
sim_map = F.softmax(sim_map, dim=-1)

context = torch.matmul(sim_map, value)
```

形式上这就是一次标准 attention：query 来自特征本身，key 和 value 都来自
那 `k` 个类别向量。区别在于 value 空间只有 `k` 行（Cityscapes 是 19），
比 `hw` 小几个数量级，所以代价可以忽略。最后拼回原特征：

```python
self.conv_bn_dropout = nn.Sequential(
    nn.Conv2d(2 * in_channels, out_channels, kernel_size=1, padding=0, bias=False),
    ModuleHelper.BNReLU(out_channels, bn_type=bn_type),
    nn.Dropout2d(dropout))

def forward(self, feats, proxy_feats):
    context = self.object_context_block(feats, proxy_feats)
    return self.conv_bn_dropout(torch.cat([context, feats], 1))
```

`2 * in_channels` 就是 `context` 和 `feats` 拼接的结果。

## 跑起来看看

把配置合进来，直接实例化验证是最快的 sanity check：

```python
config.merge_from_file(path)   # seg_hrnet_ocr_w48_trainval_512x1024_...yaml

model = HighResolutionNet(config).cuda()
x = torch.randn(1, 3, 256, 256).cuda()
out = model(x)
```

`out` 是一个长度为 2 的 list，两个元素都是 `[1, 19, 64, 64]`——19 是
Cityscapes 的类别数，64 是 256 除以 4 再对齐到 stage4 最细分支的结果。
记下这两个数字，之后改配置时如果输出维度变了，多半是 `NUM_CLASSES` 或者
stage 的 `NUM_BRANCHES` 被改动了。

## 几个读代码时的判断

`multi_scale_output` 只在 stage 的**最后一个** module 上被关掉，其余 module
都返回完整的多尺度列表。这解释了为什么 stage 内部模块数可以堆叠：中间
那些 module 的多尺度输出会被下一个 module 全部吃下去，只有最后一个需要
把四条分支交回给 transition 去生成下一 stage。

`fuse_method` 被读了、存了，但 `_make_fuse_layers` 里并没有按它分支。
HRNet 论文里 SUM 和 CONCAT 的对比实验在这份实现里没有保留，只剩 SUM。
读代码时遇到这种"接了参数但没用"的情况，先确认它是不是历史遗留，
别默认自己读错了。

最后是 `init_weights`：加载 ImageNet 预训练权重时，key 会被改写，
`last_layer` 换成 `aux_head`、`model.` 前缀去掉，然后取交集再
`load_state_dict`。函数里特意 `print` 出了两个方向的差集——这在生产代码里
不会保留，但它救了我好几次：预训练权重和新模型结构对不上时，先看这个
差集比逐层对参数名快得多。
