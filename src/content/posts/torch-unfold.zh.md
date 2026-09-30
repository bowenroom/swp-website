---
title: 用 unfold 与 fold 手工搭滑动窗口
---

把一张大图切成小 patch、再把小 patch 拼回原图，这件事几乎出现在所有
遥感与分割的流程里。问题是：`unfold` 这个名字听起来太聪明了，聪明到
让人不敢用。这一篇从 `torch.arange` 造出来的 3x4x4 小张量开始，把
`tensor.unfold` 每一个尺寸变化都算清楚，然后用 `torch.nn.Unfold` 和
`torch.nn.Fold` 真正完成一次切图与还原。

## tensor.unfold 的形状规则

`unfold` 的签名是 `x.unfold(dim, size, step)`：在 `dim` 这一维上，
以 `step` 为步长，取出连续的 `size` 个元素。规则可以用一行写完——
如果 `x.shape` 是 `(a, b, ...)`，那么 `x.unfold(c, d, e)` 之后，第 `c`
维的长度变成

```text
floor((a - d) / e) + 1
```

同时在**最后**多出一维，长度为 `size`，也就是 `d`。先看一个最小的例子：

```python
x = torch.arange(48).view(3, 4, 4)
x.shape                      # torch.Size([3, 4, 4])

x.unfold(0, 2, 1).shape      # torch.Size([2, 4, 4, 2])
```

第 0 维长度 3，取 2、步长 1，于是 `floor((3-2)/1)+1 = 2`；原来第 0 维
的每个位置都长出了一个长度为 2 的小段。注意规律里那一项 `+1`：只要
步长跨过最后一个元素，新的一维就停在最后一个元素上，而不是要求它完整
地落在张量内部。

动手算之前有一点值得先记住：`unfold` 返回的是**视图**而不是拷贝。
`x.unfold(...)` 只是记下一组偏移量，数据本身还躺在原来的内存里，所以这一步
几乎不花时间，也不额外占显存。真正把窗口数据复制出来的是后面接上的
`ToPILImage()` 或者 `.contiguous()`，这一点在内存那一节还会再提。

把步长改大，覆盖关系立刻显出来：

```python
x.unfold(0, 3, 3).shape      # torch.Size([1, 4, 4, 3])
```

`floor((3-3)/3)+1 = 1`，只切出一块，但这一次它把整个第 0 维都吃掉了。
`unfold` 可以在调用链上一次切多维，这正是滑动窗口的来源：

```python
x.unfold(0, 3, 3).unfold(1, 2, 2).shape
# torch.Size([1, 2, 4, 3, 2])

x.unfold(0, 3, 3).unfold(1, 2, 2).unfold(2, 2, 2).shape
# torch.Size([1, 2, 2, 3, 2, 2])
```

连续三次之后，结果张量的形状是 `(1, 2, 2, 3, 2, 2)`：前三维是窗口在
空间上的排布，第四维 3 是通道，后面两维 `2 x 2` 是窗口自身的空间大小。
把它想成"批量 = 1、通道 = 3、像素 = 4x4，一张 4x4 的灰度图，用 2x2 的
窗口、无重叠地切成 2x2 = 4 块"，就顺了。

## 在真实尺寸上对一遍公式

小例子容易让人以为 `unfold` 总是刚好切完。真实影像不会配合。设图像
大小是 5176 x 3793，窗口 128、步长 128：

```python
temp = torch.randint(0, 10, (3, 5176, 3793))

temp.unfold(0, 3, 3).shape             # torch.Size([1, 5176, 3793, 3])
temp.unfold(0, 3, 3)
     .unfold(1, 128, 128).shape         # torch.Size([1, 40, 3793, 3, 128])
temp.unfold(0, 3, 3)
     .unfold(1, 128, 128)
     .unfold(2, 128, 128).shape         # torch.Size([1, 40, 29, 3, 128, 128])
```

高这一维：

```python
math.floor((5176 - 128) / 128) + 1     # 40
math.floor((3793 - 128) / 128) + 1     # 29
```

两个数字和 shape 完全一致。注意 3793 不是 128 的整数倍，多出来的 81 行
被直接丢掉了——`unfold` 不会补齐，它只是停在最后一个合法的起点上。
遥感切图时这一点必须自己处理：要么先把图裁到整数倍，要么改用
`torch.nn.Unfold` 加掩码，才能把边缘的残余像素也利用起来。

还有一个反直觉的细节：`unfold` 的返回值和步长无关。笔记本里那行
`test_eq` 就是在验证这件事——

```python
test_eq(temp.unfold(0, 3, 3), temp.unfold(0, 3, 4))
```

两种写法都通过，因为在这一维上 `size=3` 恰好等于该维长度 3，只可能有一种
窗口划分方式。换句话说，步长只决定切出来的**排布**（窗口之间是否重叠、
数量多少），不改变每个窗口的**内容**。这也解释了为什么上面的 shape 里
只有窗口数和窗口尺寸，没有步长。

## 手工把 patch 拆成列表

`tensor.unfold` 出来的是一个大张量，把它拿去做 batch 还需要拆开。
下面是把 1500x1500 的图按 512 的窗口无重叠切成四块的完整过程：

```python
patch_size = 512
stride = patch_size

im1 = Image.open('niobrara_photo_lrg.jpg').resize((1500, 1500), Image.BILINEAR)
rgb_image = transforms.ToTensor()(im1)
rgb_image.shape                       # torch.Size([3, 1500, 1500])

patches = rgb_image.data.unfold(0, 3, 3) \
                    .unfold(1, patch_size, stride) \
                    .unfold(2, patch_size, stride)
patches.shape                         # torch.Size([1, 2, 2, 3, 512, 512])
```

然后两次 `split` 就把窗口索引维切平：

```python
rows = patches.split(1, dim=1)
len(rows)                             # 2
rows[0].shape                         # torch.Size([1, 1, 2, 3, 512, 512])

for i in range(patches.shape[1]):
    cols = rows[i].split(1, dim=2)
    for j in range(patches.shape[2]):
        img = ToPILImage()(cols[j].squeeze(0).squeeze(0).squeeze(0))
```

三次 `squeeze` 依次消掉 batch、列索引、块索引，剩下的是一个规规矩矩的
`[3, 512, 512]` 图像张量。

![Niobrara 河谷影像被切成 2x2 的 512 像素方块](/blogs/torch-unfold/01.webp)

*原图 1500x1500，`unfold` 之后得到 4 个 512x512 的方块；两侧各有一截
没有被窗口覆盖的余量。*

## 用 nn.Unfold 与 nn.Fold 真正做一遍

`torch.nn.Unfold` 是带参数的版本：它把 kernel 和 stride 写进构造过程，
并且默认在最后拼上 `kernel 的所有元素个数` 那一维——也就是把所有重叠
像素拉平成一个向量。

```python
inp = torch.randn(1, 3, 10, 12)
inp_unf = torch.nn.functional.unfold(inp, (4, 5))
inp_unf.shape                        # torch.Size([1, 60, 56])
```

`3 x 4 x 5 = 60` 是每个 patch 拉平后的长度；第二个 56 是窗口个数：
高 `floor((10-4)/1)+1 = 7`、宽 `floor((12-5)/1)+1 = 8`，`7 x 8 = 56`。

`torch.nn.Fold` 正好是它的逆运算。关键在于重叠区域会被重复累加，所以要
用同一个 mask 归一化：

```python
def split_tensor(tensor, tile_size=256):
    mask = torch.ones_like(tensor)
    stride = tile_size // 2
    unfold = nn.Unfold(kernel_size=(tile_size, tile_size), stride=stride)
    mask_p = unfold(mask)
    patches = unfold(tensor)
    patches = patches.reshape(3, tile_size, tile_size, -1).permute(3, 0, 1, 2)
    return patches, mask_p, (tensor.size(2), tensor.size(3))

def rebuild_tensor(patches, mask_p, t_size, tile_size=256):
    stride = tile_size // 2
    base = patches.permute(1, 2, 3, 0).reshape(3 * tile_size * tile_size, -1)
    base = base.unsqueeze(0)
    fold = nn.Fold(output_size=(t_size[0], t_size[1]),
                   kernel_size=(tile_size, tile_size), stride=stride)
    return fold(base) / fold(mask_p)
```

除以 `fold(mask_p)` 这一步不能省。它统计了每个像素被多少个窗口覆盖，
重复累加的次数被一次性除掉之后，还原出来的才是原图。对 1024 宽的测试
影像、660 的 tile、`tile_size // 2` 的步长，拿到的是 6 块，尺寸为
`[1, 3, 660, 660]`，拼回来是 1365x1024。

![重叠切出的六个 660 像素方块](/blogs/torch-unfold/06.webp)

*步长取 tile 的一半，相邻方块重叠 330 像素；重叠部分在 `fold` 之后
被加了两次。*

![重叠区域在归一化之后被还原](/blogs/torch-unfold/12.webp)

*左：单块 tile。右：六块 tile 叠回原图，接缝处没有明暗分界——除法归一化
起了作用。*

## 两个容易踩的坑

第一，`unfold` 丢边界。`5176 -> 40` 块、`3793 -> 29` 块，那 81 行残余
像素就此消失。如果它们是有用的高分辨率影像，等于白扔了。遥感语义
分割里这一点尤其难受：道路边界、隔离带、车辆轮廓往往正好落在被丢掉
的那几行上，而这恰恰是评价指标最在意的地方。常见的补救办法有三种——
事先把影像裁到窗口的整数倍、给边缘补零再切、或者干脆改用带 mask 的
`nn.Unfold` 路径，让最后一块窗口从影像末尾往回退。三种做法各有代价，
但都要自己算清楚，别指望 `unfold` 替你处理。

第二，`nn.Unfold` 与 `tensor.unfold` 不是一回事。前者默认追加的是
`C x kH x kW` 这么一整维 flatten 后的结果，后者追加的是 `size` 本身。
把 `tensor.unfold` 的输出直接喂给 `nn.Fold` 会因为维度对不上而报错。
真正要还原，还是走 `nn.Unfold -> reshape -> permute -> nn.Fold` 这条路。

最后补一个关于内存的观察。`unfold` 返回的是**视图**而不是拷贝，索引
本身几乎不占额外空间；但一旦接上 `ToPILImage()` 或者 `.contiguous()`，
窗口数据就会被真实地复制出来。切一张 6000x6000、窗口 512 的图意味着
上百个 `3 x 512 x 512` 的 float 张量同时驻留显存，这比原图本身大好几倍。
所以在训练循环里更稳妥的写法是：先 `unfold` 出索引，真正要用到哪一块
再索引、再释放，而不是一次性把整个窗口塔拉进 GPU。
