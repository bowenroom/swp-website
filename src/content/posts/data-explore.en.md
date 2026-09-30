---
title: "Exploratory Data Analysis of Images"
---

Getting a new remote-sensing image dataset and going straight to training is usually a mistake. The score tells you how the model did **on your test set**. It does not tell you that the labels are wrong, that one class has 200 pixels while another has nine million, or that a class you assumed exists is not in there at all. Half a day of exploratory data analysis before the first training run saves days of confusion afterwards.

This post works through DroneDeploy and ISPRS Potsdam, using `fastai` together with `PILMask` and `TensorImage`.

## Start with three simple things

First confirm the directory layout is what you think it is — images, labels and elevation data in separate directories, with filenames that line up:

```python
set_seed(105)
train_a_path = Path('/data/dronedeploy/dataset-medium/image')
label_a_path = Path('/data/dronedeploy/dataset-medium/labels')
elev_path    = Path('/data/dronedeploy/dataset-medium/elevations')

imgNames = get_image_files(train_a_path)
lblNames = get_image_files(label_a_path)
eleNames = get_image_files(elev_path)
```

Then pull a random label and print its unique values:

```python
lblFileNameA = lblNames[random.randint(1, 19)]
lblFile = PILMask.create(lblFileNameA)
np.unique(lblFile)
```

This answers the question everything else depends on: **is the label index-encoded or palette-encoded?** A scatter of small consecutive integers means index encoding. Values like `0`, `76`, `172` with gaps in between mean it is really an RGB image quantised to greyscale, and the meaning is only recoverable through the palette. Get this wrong and every statistic downstream is wrong.

![Class distribution across the dataset: ground and building dominate, water and car are rare](/blogs/eda-grid.png)

*Look at the class distribution first. Ground and building account for most pixels here while car occupies a tiny slice — that alone decides whether you need resampling or loss weighting.*

## Greyscale or RGB: a conversion you cannot skip

Remote-sensing labels come in two common shapes. ISPRS Potsdam uses **palette greyscale**, one greyscale value per class. DroneDeploy uses **colour RGB**, one fixed colour per class. Both need converting to a single index encoding before you can count anything or train anything.

```python
def getGrayScaleValue(palette):
    # palette is {id: (r, g, b)}; invert it to {grey value: id}
    ...

def converFromGray(lblname, palette):
    label = PILMask.create(lblname)
    labelArray = np.array(label)
    paletteGray = getGrayScaleValue(palette)

    # build a fresh array instead of rewriting labelArray in place
    arr_2d = np.zeros(labelArray.shape, dtype=np.uint8)
    for i, o in paletteGray.items():
        arr_2d[labelArray == o] = i
    return arr_2d
```

There is a trap here worth naming: **do not modify in place**. A line like `labelArray[labelArray == 0] = 1` becomes ambiguous the moment you handle class `0`, because after the assignment you cannot tell a `0` that was already there from one you just produced. Allocate a zero array and write each class in.

The RGB version needs the inverted palette instead:

```python
def getInverPalette(palette):
    inverted = {}
    for k, v in palette.items():
        inverted[v] = k
    return inverted
```

The two palettes are below. Note that the class numbering is completely different between them, so they cannot be mixed:

```python
paletteISPRS = {0: (255, 255, 255),  # impervious surfaces
                1: (0, 0, 255),     # buildings
                2: (0, 255, 255),   # low vegetation
                3: (0, 255, 0),     # trees
                4: (255, 255, 0),   # cars
                5: (255, 0, 0)}     # clutter

paletteDDSG = {0: (230, 25, 75),   # building
               1: (145, 30, 180),  # clutter
               2: (60, 180, 75),   # vegetation
               ...}
```

![An aerial image and its index-encoded label mask side by side](/blogs/data-explore/01.png)

*Original on the left, converted index encoding on the right. If the conversion is correct, the two align geometrically and exactly.*

## Class distribution: one function, every chart

With index encoding in hand you can count pixels per class. Rather than writing it again for each dataset, make it reusable:

```python
def get_all_piestatics(palette, lblNames, title='dataset'):
    n_pixel     = [0] * 7   # accumulated pixels per class
    n_all_pixel = [0] * 7
    labels = ['BUILDING', 'CLUTTER', 'VEGETATION',
              'WATER', 'GROUND', 'CAR', 'IGNORE']
    colrDDSG = ['#e6194b', '#911eb4', '#3cb44b',
                '#f58231', 'whitesmoke', '#0082c8', '#ff00ff']

    for lblName in lblNames:
        arr = converFromGray(lblName, palette)
        pixelAllCount = np.bincount(arr.flatten(), minlength=7)
        for i, n in enumerate(pixelAllCount):
            n_pixel[i] += n
            n_all_pixel[i] += arr.size

    ratio = [n_pixel[i] / n_all_pixel[i] for i in range(7)]
    ...
```

Watch the `IGNORE` class specifically. If it holds a meaningful share of the pixels, whether your mIoU is dragged down or quietly inflated depends entirely on whether you excluded it during `evaluate`.

![Per-class pixel share across the dataset](/blogs/data-explore/02.png)

*After the counts, the question that matters is: how many pixels does the smallest class have? A few hundred means it deserves its own sampling strategy.*

## Size distribution and label quality

Remote-sensing imagery has one property that catches people out: **object scale varies enormously within a single image**. In an aerial tile a car might be 20×20 pixels while a building fills half the frame. This directly constrains your cropping strategy.

![Image size distributions compared across datasets](/blogs/data-explore/03.png)

So alongside class balance, always chart the **size distribution** of the images. If your set mixes 512×512 tiles with 5000×5000 orthoimages, the crop size and batch size both need rethinking — a mistake I made with Potsdam.

Then check **label quality**. Lay out twenty random samples side by side and you will routinely find a region labelled as one class that is obviously another, boundaries a ring wider than the real object, or areas labelled not at all. None of that is visible in a training metric.

## What this pass should answer

| Question | Method |
| --- | --- |
| Is the label index- or palette-encoded? | `np.unique` on a sample |
| Does the class numbering match? | Print the palette and compare visually |
| Is the class distribution lopsided? | Per-class pixel counts |
| Is there an `IGNORE` class? | Look at its pixel share |
| How much does object scale vary? | Image size distribution plus object sizes |
| Are there mislabels or gaps? | Random visual audit |

None of these six questions surfaces from a training run, and all six shape every experiment you run after it.
