---
title: "Notes on the SegFormer Model"
---

This note is short, because the original notebook is short — five cells in total: an import block, a link, an image, and three lines of model construction. So what follows is confined to what those lines actually establish, plus my own read on it. Anything that does not come from those few lines I will mark as such.

## What the notebook is actually about

The only prose in the notebook is a link, to issue #20 in the NVlabs/SegFormer repository, discussing how to port **SegFormer from mmsegmentation to Hugging Face**.

That framing is worth pausing on. My remote-sensing segmentation work has lived in mmsegmentation for a long time — the config system, dataset registration, the `Config`-driven workflow are all genuinely pleasant to work with. But it is a closed box: model definitions, weight formats, preprocessing are all locked inside that one framework. The Hugging Face side is a different ecosystem, with weights on the Hub, `AutoModel` loaders, and a much easier story for deployment. Something has to bridge the two.

So it is clear what this code is for: **load no weights at all, just instantiate the architecture through the HF API**.

```python
from transformers import SegformerModel, SegformerConfig

# Initializing a SegFormer nvidia/segformer-b0-finetuned-ade-512-512 style configuration
configuration = SegformerConfig()

# Initializing a model from the nvidia/segformer-b0-finetuned-ade-512-512 style configuration
model = SegformerModel(configuration)

# Accessing the model configuration
configuration = model.config
```

## Three lines, three things worth noticing

### `SegformerConfig()` with no arguments

The config object is built entirely from defaults. Pay attention to the comment: `nvidia/segformer-b0-finetuned-ade-512-512 style configuration`. It implies the HF implementation is shaped around that ADE20K b0 checkpoint.

But the notebook never prints those defaults, so I will not assert the specific depths, widths, or `num_labels`. If you want the exact values, `print(configuration)` is one line — there is no reason to write them from memory into a note, because these defaults shift between versions and memory is not a reliable store for them.

### Config and model are separable

`SegformerConfig()` and `SegformerModel(configuration)` are two distinct steps, and that is the point HF is making: **structure is data, not code**. Change the scale, add a task, alter the input channels — all configuration edits. The model class does not move.

```python
# same model class, different structure — this is the thing these lines demonstrate
configuration = SegformerConfig(num_labels=<your class count>)
model = SegformerModel(configuration)
```

For remote-sensing segmentation this matters more than usual. Potsdam is 6 classes, my foggy dataset is 5, NJLCC2022 is 5 — and pretrained weights from the Hub almost always carry ADE20K's 150 classes. **Changing `num_labels` to discard the classification head while keeping the encoder weights** is the most realistic starting point when you have small annotation budgets.

### `model.config` reads the config back out

The last line looks redundant, but when you load a checkpoint from the Hub it is the only reliable way to find out what structure that checkpoint actually is — more dependable than reading the model card. In my own training scripts I usually dump it to JSON in the experiment directory, so that weeks later the record can reproduce the architecture.

## The gap that worries me

What the notebook does not do is the longest distance between "it runs" and "it works":

- **No weights are downloaded.** `SegformerModel(configuration)` is randomly initialised — the structure is right, the parameters are noise.
- **No forward pass.** There is not even a `model(input)` line, so not even the input tensor conventions were checked.
- **No preprocessing.** None of the normalisation, cropping, or label-encoding details that mmsegmentation handles are present here.
- **No accuracy numbers.** Nothing in this notebook supports any claim about SegFormer being better on my data.

And I suspect these are exactly where the pitfalls live. **Label encoding** is the dangerous one: if you carry the mmsegmentation habit of encoding classes as palette RGB while `SegformerForSemanticSegmentation` interprets channel indices according to `num_labels`, your loss is computed silently and wrongly — no exception, just accuracy that is mysteriously bad. That one bug can eat a full day.

## Why it was still worth keeping

Because it marks a **starting point**. The motivation at the time was probably: check whether the HF path is viable without giving up mmsegmentation habits. Three lines running is enough to show the interface layer works; everything after that is just filling in real work.

If I were continuing today, the order would be:

1. `print(configuration)`, record the defaults as a baseline to diff against later.
2. Pull a b0 ADE20K checkpoint, run `output = model(pixel_values)`, confirm the output shape and what `logits` means.
3. Run Potsdam's 6 classes, **auditing the label encoding item by item**, and align the loss and mIoU against the same config in mmsegmentation.
4. Only after that alignment, talk about the benefits of switching frameworks.

Until step 3 is done I would not believe any cross-framework accuracy number. That is what several years of remote-sensing segmentation has taught me: the expensive part of moving between frameworks is never the API differences, it is the **conventions that are wrong in silence**.
