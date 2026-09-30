---
title: "数据增强实操：什么时候该增强什么"
---

这篇笔记的标题叫「数据增强」，但如果你翻到原始 notebook，会发现它里面一行 `albumentations` 都没有——它做的事情是**改文件名和复制文件**。

我把它整理出来，是因为这个误会本身很有教育意义：把同一张图复制 50 份，和把同一张图做 50 种像素变换，是两件完全不同的事。前者只改变了「一个 epoch 里这张图出现几次」，后者才真正改变了模型看到的输入分布。绝大多数「我做了数据增强」的自欺，都发生在这两者之间。

## 先看这份 notebook 到底做了什么

数据用的是 ISPRS Potsdam 的验证集，RGB 正射影像和标签分在两个目录：

```python
train_path = Path("/home/ubuntu/sharedData/swp/dlLab/fastaiRepository/fastai/data/rsData/kaggleOriginal/Potsdam/2_Ortho_RGB/validation/")
label_path = Path("/home/ubuntu/sharedData/swp/dlLab/fastaiRepository/fastai/data/rsData/kaggleOriginal/Potsdam/5_labels_for_participants/validation/")

imgNames = get_image_files(train_path)
lblNames = get_image_files(label_path)
```

各 5 个文件。整套操作围绕一个字符串：`top_potsdam_2_12_label.tif` 怎么变成 `mod_top_potsdam_2_12_label.tif`，再变成 `mod7_top_potsdam_2_12_label.tif`。

`os.path.split` 和 `os.path.splitext` 是这里唯一真正用到的工具：

```python
pathName, fileName = os.path.split(lblNames[0])
prefix_name = os.path.splitext(fileName)[0]
suffix_name = os.path.splitext(fileName)[1]
```

得到 `('.../5_labels_for_participants/validation', 'top_potsdam_2_12_label.tif', 'top_potsdam_2_12_label', '.tif')`。拼上新名字：

```python
replaced_name = pathName+'/'+'mod_'+prefix_name+suffix_name
```

结果是 `.../validation/mod_top_potsdam_2_12_label.tif`。单独改一个名字没什么用，真正的目的是给批量复制做准备——新名字必须和原名字不同，否则 `shutil.copy` 会把文件复制成自己。

然后用 `glob` 把 `.tif` 全部捞出来（`len(fileList)` 是 5），进入正题：

```python
count=0
for i in range(50):
    for path in fileList:
        pathName, fileName = os.path.split(path)
        prefix_name = os.path.splitext(fileName)[0]
        suffix_name = os.path.splitext(fileName)[1]
        replaced_name = pathName+'/mod'+str(i)+'_'+prefix_name+suffix_name
        print(replaced_name)
        shutil.copy(path,replaced_name)
        count+=1
    print(count)
```

5 × 50 = 250，最后 `count` 打印 250。notebook 最后一个 markdown 单元格写着一行：把数据集变成 `(18*100, 250, 250)` 用于训练/验证/测试。250 正好对得上 5 × 50；而 250 × 250 的空间尺寸来自切块那一步——**那一步不在这个 notebook 里**，所以这个数字的完整推导我不能替它补。

## 复制文件不是增强，但也不是完全没用

把话说得直白一点：50 份内容完全相同的图像，模型看到的信息量增加是 **0**。它不会带来任何新的边缘、纹理、光照条件。如果把这 250 张图当成 250 个独立样本去做训练集划分，甚至会引入一个更隐蔽的问题——**数据泄漏**：同一张影像的副本同时出现在训练集和测试集里，指标会好看，而且好看得不真实。

那它什么时候真的有用？只有一个场景：**类别不平衡，而你想用「重采样」而不是「损失加权」来纠正**。假设你有 3 张建筑图和 300 张裸地图，把那 3 张复制 100 份，采样器在无放回抽取时看到的就是相对均衡的分布。这不是增强，是**过采样**。过采样本身没错，但它必须配合数据泄漏检查，否则你只是在给自己发奖状。

还有一个正当用途：为后续实验准备**文件名空间**。遥感项目里同一张影像经常要挂多个变体——原图、裁剪图、旋转图、跨域图——而 dataloader 靠文件名配对图像和标签。`mod{i}_` 前缀就是在给这些变体留位置。这个用法是文件级的、确定性的、可复现的，我觉得比假装它是增强要有价值得多。

## 那真正的像素级增强长什么样

notebook 开头 import 了 `fastai.vision.all` 和 `fastai.torch_basics`，工具其实是现成的，只是没用。对照着看，差别一眼就清楚：

```python
# 这一段不在原 notebook 里，是我补的对照：fastai 里像素级增强的标准写法
tfms = [SegmentationTransform(Resize(256), ToTensor(), AugmentationRegular())
        for _ in range(2)]
```

`AugmentationRegular` 会在每个 batch 上随机施加 `RandomResizedCrop`、`RandomFlip`、`RandomBrightness`、`RandomContrast`、`RandomErasing` 等等。关键差别有三个：

1. **每次采样的结果不同**。图像和标签一起变换，几何变换的参数同时作用于两者。
2. **变换在 batch 内发生**。同一次前向里 8 张图是 8 个不同的裁剪，不是 8 张一模一样的图。
3. **写在 pipeline 里而不是磁盘上**。不需要在硬盘上堆 250 份副本。

如果你用的是 PyTorch 原生或者 `albumentations`、`kornia`，思路完全一样。`kornia.augmentation` 之所以对我有吸引力，是因为它能直接作用在 GPU 上的 batch 上——遥感图动辄 5000×5000，先裁到 512 再增强，比在 CPU 上折腾大图快得多。

## 什么时候该增强什么

「什么时候该增强什么」比「要不要增强」重要得多。我的经验判断是这样：

| 场景 | 该做什么 |
| --- | --- |
| 类别极不均衡，几何不变 | 过采样少数类，或者损失加权；别指望几何增强 |
| 训练/部署存在光照、天气差异 | 亮度、对比度、色彩抖动、雾/雨模拟 |
| 目标尺度在图内变化剧烈（遥感典型） | `RandomResizedCrop`，大比例范围 |
| 标注稀疏且方向无关 | 翻转、90° 旋转（前提：方向不携带语义） |
| 传感器差异（不同无人机/卫星） | 模糊、噪声、JPEG 压缩、色彩偏移 |
| 已经过 EDA、类别分布合理 | 少做，甚至不做 |

最后一行我想多说一句。增强是**正则化手段**，不是免费午餐。我见过太多项目在数据集还没看清楚的时候就挂上全套增强，然后把「指标涨了 2 个点」当成结论。真正该先做的是上一篇文章说的探索性分析：先知道你的少数类有多少像素、你的目标尺度差多少倍、你的训练集和测试域到底差在哪。搞清楚了，增强才有方向；没搞清楚，增强只是在碰运气。

## 一句话总结

这篇 notebook 记录的是文件级的准备工作，不是增强算法本身。但它留了一个很值得记住的对照：**复制文件改变的是采样频率，变换像素改变的是数据分布**。混淆这两者，是新手最常犯、也最难自己发现的错误。
