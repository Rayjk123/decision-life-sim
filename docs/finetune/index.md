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

## Run queue (the research cadence works through this in order)

Each run: config in `research/finetune/configs/<name>.json` (copied to `runs/<name>/config.json`), `sync.sh push-run`, train on the desktop, then **evaluate** with `eval_unsloth.py runs/<name> data/sets/heuristic-hard/test.jsonl data/sets/d3-hard/test.jsonl data/sets/claude-hard/test.jsonl`, `sync.sh pull-run`, record a notebook row, commit. **Check run status from the desktop's `train.log` / `eval.log`, not the local `.done` files**: an SSH drop (exit 255) ends the local wait while training carries on. **The GPU should never sit idle**: start the next run as soon as one finishes. Defaults unless stated: 0.8B, r 16, lr 2e-4, 2 epochs, 2,048 tokens.

| Run | Changes vs E01 | Question it answers | Status |
|---|---|---|---|
| E01 | heuristic labels (baseline) | the baseline | ✅ 77.6% / record 43% |
| E02 | d3 hard labels | does distilling a decision model beat rules? | running |
| E03 | d3 **soft** labels | do full probabilities teach more than top picks? | queued |
| E04 | Haiku v1.2 labels (needs train batches 16–29 + val 30–34 labelled) | in-character labels vs d3 | needs labels |
| E05 | Haiku v1.1 (noisy) labels, same states as E04 | how much does hidden label noise cost? | needs E04 |
| E06 | LoRA r 64 | capacity | queued after E02–E03 |
| E07 | lr 2e-5 | the guide's two learning rates | queued |
| E08 | 1 and 4 epochs | under- vs over-fitting | queued |
| E09 | Brier + ordinal + label smoothing | the Clef loss terms | queued |
| E10 | permute_fields | order-bias augmentation | queued |
| E11 | Qwen3.5-2B, then 4B, on the best labels | does size matter more than labels? | queued |
| E12 | best model served via `serve_unsloth.py` on the golden suite + pairs + a 20-year world | the real test vs d3 and Kev | after E11 |

**Labelling queue:** Haiku train batches 16–29 and val 30–34 (rubric v1.2); **Opus gold test batches 36–42** (Claude labels them itself between runs).

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
| 8 | 2026-11-22 | d3 labels | ✅ | All 5,580 states, 0 failures, 1,004 s (5.6/s): top pick + full probabilities for every question |
| 9 | 2026-11-22 | Haiku at scale (v1.1) | 🔍 | 5 parallel Haiku agents labelled train batches 1–15 (600 states). **Found: the cushion rule was read in opposite ways.** 83% of states show "cash below the cushion", but in 85% of those the savings account covers it. For index investors, early retirees and pickers in that situation, batches 10–12 picked the signature move 18/19 times while batches 4–9 and 13–15 picked it 6/66. Same rule, opposite readings depending on which agent got the batch: hidden label noise. **Rubric v1.2** clarifies it; v1.1 Haiku labels are kept as a "noisy labels" arm. Also model-facing: the live sim shows the same misleading line to d3 and Kev (filed for the improvement loop) |
| 10 | 2026-11-22 | Opus gold test batch 35 | ✅ | 40 more gold labels from held-out test towns |
| 11 | 2026-11-22 | smoke run (0.8B, heuristic, 60 steps) | ✅ | Lessons before it even finished: (a) **one item per decision**: the Qwen3.5 base trains Clef-style, all questions in one pass, like Kev; (b) **68% of inputs exceed 1,024 tokens**, and Unsloth puts questions and options *first*, so it cuts the **end of the state: the recent memories**, exactly what the memory pairs test. 27 decisions were skipped (schema alone > 1,024 tokens). Real runs use `max_seq_length: 2048`; (c) LoRA r = 16 trains 38M of 699M parameters (5.5%) |
| 12 | 2026-11-22 | Haiku relabel under rubric v1.2 | ✅ | Batches 1–15 relabelled by 5 fresh Haiku agents. **Cushion consistency: v1.1 40/113 (35%), agent-dependent from 0% to 100% → v1.2 110/113 (97%), consistent in every batch.** One clarified sentence removed the hidden label noise. New gap found: whether to *sell a rental to restore a zero-cash cushion* (Haiku: no; Opus test labels: yes) → next rubric note. Check: `research/finetune/cushion-consistency.cjs` |
| 11b | 2026-11-22 | smoke run results | ✅ | **Pipeline works end to end** (load → LoRA → train → evaluate → calibrate → save, over SSH). 60 steps (≈ 480 decisions, 13% of an epoch) in **4.7 min** (1.7 decisions/s), **peak VRAM 2.7 GB** of 12 (4B will fit; bigger batches possible). Training loss 1.81 → 1.28, validation 1.52 → 1.35. **Test accuracy 49.2% per question** (chance ≈ 15%), record accuracy 11.7%. **Calibration ECE 0.085 → 0.064**; temperatures: choice 0.88 (sharpened), score 1.11 (softened). Bug in my script: the per-question-type breakdown lumps everything (Clef items hold all of a decision's questions); replacing it with an evaluator that scores each question and archetype separately. Full-run budget at this speed: ~75–80 min for 2 epochs of 3,678 decisions at 1,024 tokens |
| 13 | 2026-11-22 | teachers vs Opus gold | 📊 | Before training anything: how well does each *teacher* match the Opus gold labels (80 states)? **Move: heuristic 55%, d3 55%, Haiku 78%.** Spend level exact: 28% / 35% / 70%; invest share exact: 33% / 32% / 17% (that question is noisy for everyone). **d3 is no better a teacher of acting in character than the hand-written heuristic.** Prediction: students trained on d3 or heuristic labels top out near 55% on gold moves; a Haiku-trained student could approach ~78%. Script: `research/finetune/teacher-agreement.cjs` |
| 14 | 2026-11-22 | E01 started | ✅ | 0.8B on heuristic labels, 2 epochs at 2,048 tokens: the baseline |
| 15 | 2026-11-22 | Opus gold test batch 36 + Haiku train complete | ✅ | Gold test set now **80 states** (batches 35–36). With 120 Opus labels, teacher agreement on moves: **heuristic 62%, d3 59%, Haiku 78%** (Haiku measured on 40). The heuristic/d3 tie holds as the sample grows. Haiku train set complete: **1,200 train + 40 val** under v1.2. Rubric v1.3 candidates raised by labellers: selling a rental to rebuild a zero-cash cushion; whether "under 25 → pay student debt" overrides a "change nothing" fallback |
| 16 | 2026-11-22 | **E01 result** (0.8B, heuristic labels, 2 epochs, 2,048 tokens) | ✅ | **Test 77.6% per question** (smoke 49%), **record accuracy 43.1%** (all of a decision's questions right; smoke 12%), **ECE 0.022**. At 2,048 tokens: 0 truncated, 0 skipped (smoke: 68% truncated). 922 steps in **22.6 min** (1.47 s/step; faster than the smoke run, whose time included one-off compilation), peak VRAM 2.5 GB. Validation loss 0.935 → 0.561, flat over the last ~200 steps (900 and 922 both 0.561): **2 epochs is about where it stops learning** (E08 tests 1 vs 4). Training loss ends at ~0.45–0.52, a little under validation: mild, healthy gap, no overfitting yet. Caveat: this is accuracy at *imitating the heuristic*; agreement with gold labels comes from the evaluator (next row) |
| 17 | 2026-11-22 | Opus gold test batch 37 | ✅ | Gold test set **120 states** (batches 35–37). Teacher agreement with 160 gold labels, on moves: **heuristic 61%, d3 57%**; spend level exact 24% vs 39% (±1: 64% vs 69%). The pattern is stable as the sample grows: d3 is slightly *worse* than the rules on moves and better on spending. Labelling convention made explicit: when cash + savings is below the cushion and a rental is owned, selling it is the in-character fix (rubric v1.3 will state this) |
| 18 | 2026-11-22 | **E01 scored question by question** | ✅ | Same model, three answer keys (`eval_unsloth.py`): **vs heuristic** (its teacher): move **96.4%**, invest share 92.2%, spend level 48.0% (±1: 88.6%). **vs d3**: move 45.5%, spend 19.1%. **vs Opus gold (120)**: move **60.0%**, invest share 38.7%, spend 27.5% (±1: 70.0%). **The student matched its teacher almost perfectly on moves, then landed exactly where the teacher does on gold labels (heuristic itself: 61%).** First lesson for the learning track: *fine-tuning copies the teacher, including its mistakes*; a student is capped near its teacher's agreement with the truth. Spend level is hard even against its own teacher (48%) because the heuristic's spend answer is a spread-out distribution whose top pick is close to a coin flip between neighbouring levels (±1 is 89%) |

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
