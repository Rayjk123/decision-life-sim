---
title: Training our own decision model
nav_order: 6
---

# Training our own decision model

A deep dive into fine-tuning a small decision model for this town, using Unsloth's decision-model recipe and Kev's own training recipe, and comparing the results against Kev-4B, d3:4b and the heuristic. This page is the lab notebook: the plan, every run, what worked, what didn't and why.
{: .fs-5 .fw-300 }

Status: **setting up** (2026-11-22). The improvement loop is paused while this runs (see `docs/LOOP.md`).

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
  - **Claude labels** (primary): Claude, in this Claude Code session, labels each state against a written rubric (act true to this person's personality and situation), with a one-line rationale.
  - **d3 distilled** (control): d3:4b's top pick (hard) and full probabilities (soft), from the desktop's Ollama.
  - **Heuristic** (control): the rules-based heuristic's pick.
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
| Label source | Claude · d3 hard · d3 soft · heuristic · blends |
| Data volume | 500 / 2,000 / 8,000 states |
| Hyperparameters | learning rate 2e-5 vs 2e-4 (the guide is inconsistent), LoRA rank 16 vs 64, epochs 1–4 |
| Calibration | on / off |
| Augmentation | option-order shuffling (position bias) |

## Lab notebook

| # | Date | Run | Result | Notes |
|---|---|---|---|---|
| 0 | 2026-11-22 | setup | | Plan written; waiting for SSH to the desktop (RTX 4070 Super, 12 GB) |
