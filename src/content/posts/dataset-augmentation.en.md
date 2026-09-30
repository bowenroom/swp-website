---
title: "Data Augmentation in Practice: What to Augment, and When"
---

This notebook is titled "augment the dataset", but if you open the original you will not find a single `albumentations` call in it. What it actually does is **rename files and copy files**.

I am writing it up because the misunderstanding is itself the useful part: copying one image 50 times and applying 50 different pixel transformations to that image are two completely different operations. The first changes *how often an image shows up in an epoch*. The second changes *the input distribution the model sees*. Most of the self-deception behind "I added data augmentation" happens somewhere in that gap.

## What this notebook really does

The data is the ISPRS Potsdam validation split, with RGB orthoimages and labels in two separate directories:

```python
train_path = Path("/home/ubuntu/sharedData/swp/dlLab/fastaiRepository/fastai/data/rsData/kaggleOriginal/Potsdam/2_Ortho_RGB/validation/")
label_path = Path("/home/ubuntu/sharedData/swp/dlLab/fastaiRepository/fastai/data/rsData/kaggleOriginal/Potsdam/5_labels_for_participants/validation/")

imgNames = get_image_files(train_path)
lblNames = get_image_files(label_path)
```

Five files each. Everything that follows is about one string: how `top_potsdam_2_12_label.tif` becomes `mod_top_potsdam_2_12_label.tif`, and then `mod7_top_potsdam_2_12_label.tif`.

The only tools actually used are `os.path.split` and `os.path.splitext`:

```python
pathName, fileName = os.path.split(lblNames[0])
prefix_name = os.path.splitext(fileName)[0]
suffix_name = os.path.splitext(fileName)[1]
```

which gives `('.../5_labels_for_participants/validation', 'top_potsdam_2_12_label.tif', 'top_potsdam_2_12_label', '.tif')`. Gluing on a new name:

```python
replaced_name = pathName+'/'+'mod_'+prefix_name+suffix_name
```

produces `.../validation/mod_top_potsdam_2_12_label.tif`. Renaming one file on its own accomplishes nothing. The point is preparation for bulk copying: the new name has to differ from the old one, otherwise `shutil.copy` copies each file onto itself.

Then `glob` picks up every `.tif` (`len(fileList)` is 5), and the main event:

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

5 × 50 = 250, and the last printed `count` is 250. The notebook's final markdown cell notes turning the dataset into `(18*100, 250,250)` for train/validation/test. The 250 lines up with 5 × 50. The 250 × 250 spatial size comes from a tiling step — **and that step is not in this notebook**, so I am not going to invent its derivation.

## Copying files is not augmentation, but it is not useless either

Plainly: 50 byte-identical images add **zero** information to the model. No new edges, no new textures, no new lighting conditions. Worse, if you treat those 250 files as 250 independent samples and split them into train and test, you have created **data leakage** — copies of the same source image land on both sides of the split, and your metric becomes flattering for reasons that have nothing to do with the model.

So when is it legitimately useful? One case: **severe class imbalance where you want to fix it by resampling rather than by loss weighting**. Three building images against 300 bare-ground images, copy the three 100 times, and a sampler drawing without replacement now sees a roughly balanced distribution. That is oversampling, not augmentation. Oversampling is fine — as long as you check for leakage alongside it, otherwise you are just handing yourself an award.

There is a second legitimate use: **creating a filename namespace**. Remote-sensing projects routinely hang several variants off one source image — original, crop, rotation, cross-domain sample — and the dataloader pairs images to labels by filename. The `mod{i}_` prefix is reserving slots for exactly those. That is a file-level, deterministic, reproducible operation, and I think it is worth more than pretending it is augmentation.

## What pixel-level augmentation actually looks like

The notebook imports `fastai.vision.all` and `fastai.torch_basics` and then never uses them. Side by side, the difference is obvious:

```python
# not in the original notebook — added here as the contrast: the standard fastai pipeline
tfms = [SegmentationTransform(Resize(256), ToTensor(), AugmentationRegular())
        for _ in range(2)]
```

`AugmentationRegular` applies `RandomResizedCrop`, `RandomFlip`, `RandomBrightness`, `RandomContrast`, `RandomErasing` and friends, sampled per batch. Three things differ:

1. **Every sample differs.** Image and label are transformed together, with the same geometric parameters applied to both.
2. **It happens inside the batch.** Eight images in one forward pass are eight different crops, not eight identical copies.
3. **It lives in the pipeline, not on disk.** No need to accumulate 250 duplicates in your storage.

The same thinking applies in raw PyTorch, `albumentations`, or `kornia`. `kornia.augmentation` is the one I keep coming back to, because it operates on a batch already sitting on the GPU. Remote-sensing tiles are routinely 5000×5000; cropping to 512 first and augmenting afterwards is far cheaper than fighting giant images on the CPU.

## What to augment, and when

"*What* to augment, *when*" matters considerably more than whether to augment at all. My working judgement:

| Situation | Do this |
| --- | --- |
| Heavy class imbalance, geometry is not the issue | Oversample the minority, or weight the loss. Geometric augmentation will not help |
| Train and deployment differ in light or weather | Brightness, contrast, colour jitter, fog/rain simulation |
| Object scale varies wildly within one image (typical for remote sensing) | `RandomResizedCrop` with a wide scale range |
| Sparse labels where orientation carries no meaning | Flip, 90° rotation — provided direction is not semantic |
| Sensor differences across drones or satellites | Blur, noise, JPEG artefacts, colour shift |
| You have done EDA and the distribution is already sane | Less, or nothing |

The last row deserves emphasis. Augmentation is a **regularisation tool**, not a free win. I have watched too many projects bolt on a full augmentation stack before anyone has looked at the dataset, then treat "the metric went up 2 points" as a finding. Do the exploratory analysis first — know how many pixels your rarest class has, how much your object scales vary, and where your training domain actually differs from your test domain. Augmentation needs a direction to aim at. Without one it is just guessing.

## One sentence to remember

This notebook records file-level groundwork, not an augmentation algorithm. But it leaves behind a useful contrast: **copying files changes sampling frequency; transforming pixels changes the data distribution**. Confusing the two is the most common mistake beginners make, and the hardest one to catch on their own.
