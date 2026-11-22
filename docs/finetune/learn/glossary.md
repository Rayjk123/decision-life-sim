---
title: Glossary
parent: Learn fine-tuning from scratch
grand_parent: Training our own decision model
nav_order: 1
---

# Glossary

Terms in the order you'll meet them, each with where it showed up in this project.

| Term | Meaning | In this project |
|---|---|---|
| **Parameters / weights** | The numbers inside a model that training adjusts | Qwen3.5-0.8B has ~0.8 billion |
| **Base model** | A model already pre-trained on general text, before your fine-tuning | `unsloth/Qwen3.5-0.8B` |
| **Pre-training** | The huge, expensive first training on general data | Done by the model's makers |
| **Fine-tuning** | A short second training on your own examples for your task | Every run E01–E05, ~15–22 min each |
| **Example / row** | One input with its desired output | One sim decision: state + questions + answers |
| **Label** | The desired answer attached to an example | Written by the heuristic, d3, Haiku or Opus |
| **Teacher / student** | Whoever wrote the labels / the model trained on them | Haiku (teacher) → E05 (student) |
| **Gold labels** | The most trusted labels, used only for testing | 200 Opus-labelled test states |
| **Loss** | One number measuring how wrong the model is | Soft cross-entropy |
| **Cross-entropy** | Loss that punishes giving low probability to the right answer | −log(probability of the right answer) |
| **Soft labels** | Labels given as probabilities rather than one answer | d3's probabilities (E03) |
| **Hard labels** | One answer per question | Haiku and heuristic labels |
| **Gradient / backpropagation** | How the loss changes as each weight changes / the method that computes it | Done by PyTorch |
| **Optimiser** | Rule that updates weights from gradients | AdamW (Hugging Face's default; our config doesn't set one). Calibration uses a different one, LBFGS, to fit temperatures |
| **Learning rate (lr)** | How big each update is | 2e-4 for LoRA; the decision head uses Unsloth's default (1e-4) |
| **Batch / gradient accumulation** | Examples processed together / adding up several batches before an update | batch 2 × accumulation 4 = 8 per step |
| **Step / epoch** | One weight update / one full pass over the training set | ~920 steps = 2 epochs |
| **Warmup** | Starting with a smaller learning rate for the first steps | 10 steps |
| **LoRA** | Training small add-on matrices instead of all weights | r 16: 38M of 699M parameters (5.5%) |
| **Rank (r) / alpha** | Size of the LoRA add-on / its strength | r 16, alpha 16 |
| **Quantisation (4-bit)** | Storing weights with fewer bits to save memory | Base loaded at 4 bits; 2.5 GB peak |
| **Head** | A small layer on top of the model that turns its reading into option scores | Unsloth's decision head |
| **Choice / score / noul** | Question types: pick one / ordered scale / yes-no | Move / spend level & invest share / retire |
| **Token / context length** | Word pieces / how many the model reads at once | 2,048 (1,024 truncated 68% of states) |
| **Truncation** | Cutting input that doesn't fit | Cut the memories at 1,024 tokens |
| **Train / validation / test split** | Learn from / tune on / judge on | Seeds 101–140 / 141–150 / 151–160 |
| **Leakage** | Test information sneaking into training | Prevented by splitting by town |
| **Overfitting** | Memorising training data instead of generalising | Watched via validation loss |
| **Accuracy** | Share of answers that match the labels | Per question |
| **Record accuracy** | Every question in a decision right at once | E01 43% |
| **Within ±1** | For ordered scales: right or off by one level | Spend: ~98% for Haiku-trained models |
| **Calibration / ECE** | Do stated probabilities match how often it's right / the size of the mismatch | E01 0.022, E05 0.124 |
| **Temperature** | A divisor on scores that softens (T > 1) or sharpens (T < 1) probabilities | Fitted per question type |
| **Distillation** | Training a small student to imitate a bigger teacher | d3 → E02/E03; Haiku → E04/E05 |
| **Rubric** | A written labelling guide | v1.0 → v1.9 |
| **Label noise** | Wrong or inconsistent labels | Cushion rule read two ways (35% consistent) |
| **Rule checker** | Code that flags labels breaking hard rules | `check-labels.cjs` |
| **Distribution / coverage** | The kinds of situations in the data / how well rare ones are represented | Affordable deals: 4 of 3,887 |
| **Independent test** | A test built separately from the training data | The golden suite and counterfactual pairs |
| **Counterfactual pair** | Two inputs differing in one thing, checking the answer moves the right way | "Same sim, more cash → rental more likely" |
| **Serving / inference** | Running the trained model to answer requests | `serve_unsloth.py` on :8010 |
