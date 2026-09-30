---
title: "Introducing the NJLCC2022 Dataset"
---

**Weipeng Shi, Wenhu Qin, Zhonghua Yun, Chao Wu, Yukun Yang, and Tao Zhao**

This note introduces NJLCC2022 — **NanJing Land Cover Classification in 2022** — a land-cover dataset we collected ourselves with a drone around Nanjing. It backs the paper below:

> W. Shi, W. Qin, Z. Yun, C. Wu, Y. Yang, and T. Zhao, "Semantic Representation Fusion-Based Network for Robust Land Cover Classification in Foggy Conditions," *IEEE Transactions on Geoscience and Remote Sensing*, 2023, 61: 1–16.

## Why collect a foggy dataset at all

The motivation fits in one sentence: **almost every existing land-cover dataset was collected under clear skies, and fog badly damages accuracy in real deployments.**

This is not something you can paper over with augmentation. Potsdam, ISPRS and the rest were acquired in ideal weather; a model can post excellent mIoU on them and still fall apart on foggy aerial imagery, because the distribution it was trained on simply never contained those imaging conditions.

So the dataset has three direct goals:

- Quantify how far accuracy degrades from clear conditions to fog.
- Study the shared and differing visual representations between foggy and clear imagery, as a basis for designing robust models.
- Provide real dual-domain (clear/fog) data for transfer learning.

## Collection parameters

| Parameter | Value |
| --- | --- |
| Platform | DJI Mavic 3 drone |
| Bands | RGB (red, green, blue) |
| Flight altitude | 200 m |
| Ground sampling distance (GSD) | 4 cm/pixel |
| Imagery | 22 orthorectified images (as of 2023-04-01) |
| Foggy / clear | 9 / 13 |
| Average resolution | 9000 × 9000 px |
| Classes | 5 |

A few numbers deserve a second look. **200 m altitude paired with 4 cm/pixel GSD** means fine ground detail: at 4 cm per pixel, a car occupies on the order of a few tens of pixels, which is good news for small objects. **9000×9000 on average** is roughly 81 megapixels per image, one to two orders of magnitude larger than typical remote-sensing benchmarks, and it is the reason the data has to be tiled before it can go anywhere near a GPU.

## Sampling design: deliberately crossing the urban/rural divide

The 22 images are scattered across two districts of Nanjing, Jiangsu: the urban **Xuanwu District** (roughly 118.78–118.87 E, 32.05–32.07 N) and the rural **Jiangning District** (roughly 118.86–118.87 E, 31.91–31.93 N). The intent is **to reduce model bias** — sample only in the city and the model may simply learn the morphology of urban land cover and fail the moment it meets a rural tile.

Here is part of the collection log (the full 22 rows ship with the dataset):

| Sample ID | Collection date | Fog type | Longitude | Latitude |
| --- | --- | --- | --- | --- |
| ortho1 | 2023-02-06 | Thick | 118.818251 | 32.064312 |
| ortho2 | 2023-02-06 | Thick | 118.823017 | 32.065051 |
| ortho3 | 2023-02-06 | Thick | 118.816626 | 32.066614 |
| ortho4 | 2022-11-03 | Clear | 118.809120 | 32.054298 |
| ortho5 | 2022-12-07 | Moderate | 118.819967 | 32.072009 |
| ortho6 | 2022-12-09 | Thin | 118.825302 | 32.072846 |
| ortho7 | 2022-12-07 | Moderate | 118.861529 | 31.914914 |
| ortho8 | 2022-12-09 | Thin | 118.869680 | 31.925127 |
| ortho9 | 2022-12-09 | Thin | 118.870319 | 31.915301 |
| ortho10 | 2022-12-07 | Moderate | 118.874873 | 31.914486 |

Something easy to miss is visible in this table: **the foggy images cluster on three collection dates** — 2022-12-07, 2022-12-09 and 2023-02-06 — while the clear images spread across many batches from October to December 2022. Weather and collection time are therefore **correlated**, which means a random train/test split can let the model quietly memorise the imaging signature of a particular date and report a flattering generalisation number. **Split by collection date, not at random.**

Also note that fog is graded into three levels: Thick, Moderate and Thin. That makes fog density a controllable variable rather than a binary has-fog/has-no-fog flag.

## Annotation scheme: 5 classes, fixed RGB colours

Labels are **palette RGB**, one fixed colour per class:

| Class | RGB | Notes |
| --- | --- | --- |
| Clutter Background | (0, 0, 0) | Black; non-target region |
| Car | (0, 128, 0) | Dark green |
| Playground | (128, 0, 128) | Purple |
| Water | (0, 0, 128) | Navy blue |
| Building | (128, 0, 0) | Dark red |

This scheme is common in remote-sensing segmentation, and its virtue is that **visual inspection is immediate** — open the label and you can spot mislabels at a glance, because the colours line up with how people already read land-cover maps (buildings red, water blue).

But it carries a trap worth naming: **these label images cannot go into the model as-is**. If you take the conversion path from the EDA post — inverting the RGB palette into index encoding — make sure the inverted palette is complete and not truncated. In a long config block (I had exactly this while working with Potsdam) the palette defines only the first few classes and ends in `...`; if a colour appears in the label image that the palette never listed, those pixels silently become background. No exception is raised. The metric is just mysteriously bad.

The most consequential design choice here is that **Clutter Background is an explicit class rather than an ignore label**. Roads, bare soil and vegetation all collapse into it. That is a real trade-off: an explicit background class stops the model from reading a road as a building, and it costs additional annotation effort.

## Access

For model training and evaluation, please email `qinwenhu@seu.edu.cn` with a short statement of your intended use.

## Citation

```bibtex
@article{shiSemanticRepresentationFusionBased2023,
  title = {Semantic {{Representation Fusion-Based Network}} for {{Robust Land Cover Classification}} in {{Foggy Conditions}}},
  author = {Shi, Weipeng and Qin, Wenhu and Yun, Zhonghua and Wu, Chao and Yang, Yukun and Zhao, Tao},
  year = {2023},
  journal = {IEEE Transactions on Geoscience and Remote Sensing},
  volume = {61},
  pages = {1--16},
  issn = {1558-0644},
  doi = {10.1109/TGRS.2023.3280158}
}
```

## My own notes on using it

I use this dataset for two things.

The first is **a robustness benchmark**. Most papers reporting "how many points does the model lose in fog" evaluate on *synthetic* fog generated by a haze function. Synthetic fog is the problem: it is far too regular, and a physical scattering model is not the same thing as real atmospheric attenuation. Real fog imagery carries details that are hard to synthesise — uneven attenuation over the acquisition, edge scattering, global contrast collapse.

The second is **the source of my dual-domain evaluation protocol**. A problem I only noticed while running experiments: because foggy and clear images are strongly correlated with collection time, a **random split inflates results**. The protocol I now use is:

1. Group the split by **collection date**, not at random per image.
2. Report clear→clear and clear→fog separately, instead of one blended mIoU.
3. Look at recall for `Car` and `Playground` individually — they are usually a small pixel share, and an overall score propped up by `Building` and background hides that they are failing.

Item 1 is a mistake I made myself, recorded here so I do not make it twice.

**Contact**: `qinwenhu@seu.edu.cn`
