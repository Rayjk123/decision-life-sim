---
title: Training our own decision model
nav_order: 6
---

# Training our own decision model

A deep dive into fine-tuning a small decision model for this town, using Unsloth's decision-model recipe and Kev's own training recipe, and comparing the results against Kev-4B, d3:4b and the heuristic. This page is the lab notebook: the plan, every run, what worked, what didn't and why.
{: .fs-5 .fw-300 }

Status: **pipeline built; labelling and the first training runs next** (2026-11-22). The improvement loop is paused while this runs (see `docs/LOOP.md`).

## The question

Can a small model trained on this town's decisions beat the general-purpose decision models (d3:4b, Kev-4B) at acting in character, especially on the counterfactual pairs, where every model so far is weak on market and job news? And which training choices matter most: base size, recipe, label source, data volume, hyperparameters?

## How a decision model works (and what we're training)

Both Unsloth's decision models (the Jev / Laya / Clef family) and Kev use the same idea:

1. A base language model (here Qwen3.5, 0.8B–4B) reads the sim's **state** and every **question** with its options in one pass.
2. A small **head** on top looks at the model's internal representation of each option and **scores** it; a softmax turns the scores into probabilities. Nothing is generated.
3. Training is **LoRA** (small adapter matrices on the attention and MLP layers) plus the head, on labelled examples. A separate **calibration** step fits a temperature so the probabilities match how often the model is right.

Both recipes read the same request (`state` + `questions`) and serve the same `POST /v1/systemone` API, so a trained model drops into the sim, the evals and the dashboard unchanged.

## Data

- **States:** sampled from real simulated worlds (many seeds and years, every archetype, life stage and economy), exactly as the sim builds them for a decision: the legal moves with their real costs, the invest-share and spend-level questions, and retirement when offered.
- **Labels:** per state, the in-character answer to every question.
  - **Claude Opus labels** (primary, "gold"): Claude Opus, in this Claude Code session, labels each state against a written [rubric](labeling-rubric.md) (act true to this person's personality and situation), with a one-line rationale. Highest care, slower: the test and validation sets plus part of training.
  - **Claude Haiku labels** (scale, user suggestion): Haiku sub-agents label with the same rubric, independently and in parallel, so training can scale to thousands of labels. **Opus–Haiku agreement** on overlapping states measures label noise, and where they disagree marks genuinely ambiguous decisions.
  - **d3 distilled** (control): d3:4b's top pick (hard) and full probabilities (soft), from the desktop's Ollama. Tests learning from another decision model rather than from in-character judgment.
  - **Heuristic** (control): the rules-based heuristic's pick. Opus batch 0 agreed with it on only 57% of top picks (business owners 0/5: the rubric saves toward a business the heuristic never chooses), so it's a genuinely different teacher.
- **Splits:** train / validation / held-out test by *world seed*, so no test state comes from a world seen in training. The golden suite (30 scenarios + 21 pairs) is **never** trained on.

## Evaluation (identical for every run)

| Measure | What it tells us |
|---|---|
| Golden overall and scenario score | in-character top picks and avoiding out-of-character ones |
| **Counterfactual pairs** (21) | does the model actually *read* each fact (persona, a trait, a crash, a memory, debt…)? The fairest test |
| Held-out accuracy and agreement with labels | in-distribution fit |
| Calibration: ECE, Brier, reliability diagram | are the probabilities honest? (they drive the dice roll) |
| Speed: decisions per second | can it run a 1,000-sim town? |
| World experiment | personality separation, signature moves, decision mix per archetype, health realism |

**A known bias, reported rather than hidden:** Claude also wrote the golden suite, so a model trained on Claude labels may score well on it partly by sharing an author. That's why the pairs, the held-out set, d3 agreement and the whole-town behavior carry the weight.

## Experiment grid

One change per run against a fixed baseline.

| Axis | Variants |
|---|---|
| Recipe | Unsloth (Clef-style head) vs Kev's recipe (pointer head) |
| Base size | Qwen3.5 0.8B → 2B → 4B |
| Label source | Opus · Haiku · Opus + Haiku · d3 hard · d3 soft · heuristic · blends; **quantity vs quality**: few Opus labels vs many Haiku labels |
| Data volume | 500 / 2,000 / 8,000 states |
| Hyperparameters | learning rate 2e-5 vs 2e-4 (the guide is inconsistent), LoRA rank 16 vs 64, epochs 1–4 |
| Calibration | on / off |
| Augmentation | option-order shuffling (position bias) |

## Deliverable: a learning track (user request)

After the experiments, write `docs/finetune/learn/`: a from-the-basics course built on *this* study's runs, so every concept has a real number from the desktop attached:
1. What a model is: tokens, embeddings, transformers; decision model vs chatbot.
2. How training works: loss, gradients, learning rate, batch and epochs, overfitting, train/val/test (with our loss curves).
3. Efficient fine-tuning: LoRA, 4-bit quantization, VRAM (what limited the 4070 SUPER).
4. Labels and teachers: hard vs soft labels, distillation from d3, label noise (Opus vs Haiku), circular evaluation.
5. Is it any good: accuracy vs record accuracy, calibration (ECE, Brier, reliability diagrams), counterfactual pairs, reading our charts.
6. What we did, step by step: every command and config, explained.
Plus a **glossary**, a **study guide** (reading order, self-check questions with answers, hands-on exercises) and a short **reading list**. *While experimenting: note every surprise, number and gotcha in the lab notebook so the course can tell the real story.*

## Lab notebook

| # | Date | Run | Result | Notes |
|---|---|---|---|---|
| 0 | 2026-11-22 | setup | | Plan written; SSH to the desktop working (RTX 4070 SUPER 12 GB, Ryzen 7 7800X3D, 31 GB RAM, 626 GB free) |
| 1 | 2026-11-22 | environment | ✅ | Native Windows (no WSL, no reboot): uv Python 3.12, torch 2.11 + CUDA 12.8, **unsloth 2026.11.9** with `FastDecisionModel` + `DecisionTrainer`. Warnings: Triton 3.9 lacks block pointers (flex_decoding falls back), xformers doesn't load (PyTorch attention used) |
| 2 | 2026-11-22 | read the source | 📖 | The installed API goes beyond the guide; see *What the source says* below |
| 3 | 2026-11-22 | dataset | ✅ | `sample-states.ts`: 5,580 real decision requests from 60 towns × 40 years (train 3,687 / val 955 / test 938; split by world seed); every archetype; ~5 legal moves each. First try sampled 45,825 (rate formula off by ~8×: a 150-sim town makes ~15,000 decisions in 40 years) |
| 4 | 2026-11-22 | labels | ⏳ | Heuristic labels (instant); d3 labels running (~4.8 states/s, both hard top pick and full probabilities); Claude labels: rubric written, 1,700 states in 43 batches of 40 |
| 5 | 2026-11-22 | Opus batch 0 | ✅ | 40 gold labels; all valid. Agreement with the heuristic's top pick only **57%** (business owners 0/5: the rubric saves toward a business the heuristic never chooses), so the heuristic is a genuinely different teacher |
| 6 | 2026-11-22 | Haiku pilot, rubric v1.0 | 🔍 | Same 40 states, blind. **Main move agrees with Opus 57%**; spend level 60% exact / 100% within ±1; invest share 40% / 70% within ±1. **Systematic bias:** Haiku picks the index fund whenever an archetype's signature move isn't offered (savers 0/4, business owners 0/5, real estate 1/4), the same generic default d3 shows. Real estate without a rental on offer wasn't covered by the rubric at all |
| 7 | 2026-11-22 | **rubric v1.1 → Haiku re-pilot** | ✅ | Added explicit fallbacks per archetype. **Main move agreement 57% → 78%** (business owners 0/5 → 5/5, real estate 1/4 → 4/4, savers 0/4 → 3/4); spend 70% exact / 100% ±1; invest share 17% exact / 70% ±1 (the noisiest question: "25%" vs "half" is genuinely fuzzy, a case for soft or ordinal training). The 9 remaining disagreements are judgment calls: pay a 7.5% car loan or save; Haiku is more cautious about $0-down cars for spenders and status seekers. **Lesson: a small teacher latches onto the generic default; explicit fallback rules fix most of it.** Agreement script: `research/finetune/label-agreement.cjs` |

## What the source says (unsloth 2026.11.9, `unsloth/models/decision.py`)

The guide leaves out most of how training actually works. Reading the installed code:

- **Two model families.** A *Clef* checkpoint reads the state and **all questions in one pass**. A plain base LLM ("converted language model", Laya-style) gets **one sequence per question**, so a decision with three questions is read three times. Kev reads everything once, so this is a structural difference to measure (speed and accuracy).
- **The loss** is soft cross-entropy against a target distribution. Optional terms (Cloudflare's Clef recipe): **label smoothing**, a **Brier** term for calibration, and an **ordinal** term giving partial credit on score questions (spend level 6 for a true 7 costs less than 1). In this version `CLEF_RECIPE = {}`: **every extra term is off by default**.
- **Gold labels** can be a single label or `{"probabilities": {...}}`, so **soft-label distillation from d3 is built in**: the d3-hard vs d3-soft comparison is just a different gold format.
- **`kl_weight` is not distillation**: it's a KL penalty toward the *starting* model (adapters off), against forgetting. A separate axis.
- **`permute_fields`** re-encodes each training record with its fields shuffled (order-bias augmentation).
- **Defaults differ from the guide:** `get_peft_model` defaults to r = 64 (the guide says 16); the head learns at 1e-4 separately from the LoRA rate.
- **Calibration** fits one temperature per question type (choice / score / yes-no) with LBFGS, and reports honest numbers by scoring each half of the rows with temperatures fitted on the other half.
- **Metrics:** accuracy (per question), ECE, loss, and **record accuracy** (every question of a decision right).
