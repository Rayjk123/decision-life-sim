---
title: Reading list
parent: Learn fine-tuning from scratch
grand_parent: Training our own decision model
nav_order: 2
---

# Reading list

In the order to read them. Look these up by title; editions and links change.

## Foundations (lessons 1–2)

- **3Blue1Brown, *Neural networks* video series**: the clearest visual intuition for weights, gradients and backpropagation. Start here.
- **Andrej Karpathy, *Neural Networks: Zero to Hero*** (videos): builds a network from scratch in code; the micrograd episode makes backpropagation concrete.
- **fast.ai, *Practical Deep Learning for Coders***: a hands-on course that trains real models early, then explains.

## Transformers and language models (background for lesson 1)

- **Jay Alammar, *The Illustrated Transformer*** (blog post): what's inside the base model.
- **Vaswani et al., *Attention Is All You Need*** (2017): the original transformer paper, for after the illustrated version.

## Fine-tuning and LoRA (lesson 3)

- **Hu et al., *LoRA: Low-Rank Adaptation of Large Language Models*** (2021): the method we used.
- **Dettmers et al., *QLoRA*** (2023): fine-tuning a 4-bit base model, which is why it fits on a gaming GPU.
- **Unsloth documentation**, especially *Train your own decision model*: the library and recipe used in every run here.

## Data, splits and evaluation (lessons 4–5, 8)

- **Google's *Machine Learning Crash Course***: sections on training/validation/test splits, overfitting and generalisation.
- **Guo et al., *On Calibration of Modern Neural Networks*** (2017): why models are over-confident, and temperature scaling (what Unsloth's calibration step does).
- **Ribeiro et al., *Beyond Accuracy: Behavioral Testing of NLP Models with CheckList*** (2020): the idea behind our counterfactual pairs: test behaviour, not just a score.

## Labels and distillation (lessons 6–7)

- **Hinton, Vinyals & Dean, *Distilling the Knowledge in a Neural Network*** (2015): students learning from a teacher's soft probabilities (our E03).
- **Northcutt et al., *Pervasive Label Errors in Test Sets*** (2021): how common label noise is, even in famous datasets.
- **Snorkel / weak-supervision papers (Ratner et al.)**: combining several imperfect labellers, the next step after our single-labeller setup.

## This project

- [Lab notebook](../index.md): every run, finding and number, in order.
- [Labelling rubric](../labeling-rubric.md): the rubric and its changelog (v1.0 → v1.9), a case study in improving labels.
- [Results](../results.md): the charts.
