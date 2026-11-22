---
title: Learn fine-tuning from scratch
parent: Training our own decision model
nav_order: 3
has_children: true
---

# Learning to train a model, from the very basics

This is a study guide built around one real project: teaching a small open model to make in-character money decisions for the sims in this town. Every idea is tied to something we actually did, with the numbers we got, so you can check each claim in the [lab notebook](../index.md) and the [results](../results.md).

Read it in order. Each lesson ends with **check yourself** questions; the answers are in the lesson. The [glossary](glossary.md) defines every term, and the [reading list](reading.md) says where to go deeper.

---

## Lesson 1 · What a model is, and what "training" changes

A **neural network** is a very large function: numbers go in, numbers come out. What makes it *this* function rather than another is its **parameters** (also called **weights**): hundreds of millions of numbers. The model we fine-tuned, Qwen3.5-0.8B, has about 0.8 billion of them ("0.8B").

**Training** means nudging those numbers so the function's outputs get closer to answers we want. You need three things:

1. **Examples**: inputs paired with the desired output. Ours: a sim's situation (the state text) plus the questions (*which move? how much to spend?*), paired with an answer.
2. **A loss**: one number that says how wrong the model is on an example. Lower is better.
3. **An optimiser**: the rule that adjusts the weights a little in the direction that lowers the loss. It works out that direction with **gradients** (how much the loss changes if each weight moves slightly) via **backpropagation**.

One pass of "show a few examples → measure loss → nudge weights" is a **step**. One trip through the whole training set is an **epoch**. Our runs did 2 epochs of 3,687 decisions, 8 decisions per step: about 920 steps, ~22 minutes on an RTX 4070 SUPER.

**Pre-training vs fine-tuning.** The base model was already *pre-trained* by its makers on huge amounts of text, which is where its general knowledge of words, money and people comes from. **Fine-tuning** is a short second round of training on *our* examples, to point that knowledge at our task. Fine-tuning is cheap (minutes, one consumer GPU); pre-training costs millions.

**Check yourself:** What are the three ingredients of training? Why can a 0.8B model learn our task in 20 minutes when building it took months?

---

## Lesson 2 · A decision model is a classifier in disguise

A chatbot generates text one word at a time. A **decision model** doesn't need to: our questions have a fixed set of answers (the legal moves, spend levels 1–10, invest share 0–4, retire yes/no). So the model reads the situation and outputs a **probability for each option**: e.g. `save_cash 0.62 · invest_index 0.21 · nothing 0.17`.

That makes it a **classifier**. Unsloth's `FastDecisionModel` adds a small **head** on top of the language model that scores each option, and the loss is **cross-entropy**: roughly, "how surprised was the model by the right answer?" If it gave the correct option probability 0.9, the loss is small (−log 0.9 ≈ 0.1); if it gave 0.05, it's large (−log 0.05 ≈ 3.0).

**Three question types**, three output shapes: *choice* (pick one of N moves), *score* (an ordered scale like spend level 1–10, where being off by one is less wrong than off by five), and *noul* (yes/no, e.g. retire).

**Why probabilities matter for this town:** the sim doesn't just take the top answer: a seeded dice roll picks among the options *in proportion to* the probabilities. So a model that says 62% / 21% / 17% produces a town where most similar sims save, some invest, a few do nothing, which is more lifelike than everyone doing the same thing.

**Check yourself:** Why is spend level a "score" question rather than a "choice"? Why does the sim want probabilities and not just the best answer?

---

## Lesson 3 · LoRA: training a tiny add-on instead of the whole model

Updating all 0.8 billion weights needs lots of memory. **LoRA** (low-rank adaptation) freezes the original weights and trains small extra matrices beside some layers. With **rank r = 16**, our runs trained **38 million of 699 million** parameters (5.5%), and peaked at **2.5 GB of GPU memory** out of 12.

- **Rank (r)**: the size of the add-on. Higher rank = more capacity to learn, more memory, more risk of memorising.
- **Alpha**: a scale on how strongly the add-on affects outputs (we used alpha = r).
- **4-bit loading (QLoRA)**: the frozen base weights are stored at 4 bits instead of 16, cutting memory ~4×, with little quality loss.

The output of training is the small **adapter** plus the head; at serving time it rides on the base model.

**Check yourself:** Why does LoRA make fine-tuning possible on a gaming PC? What would you expect from raising r from 16 to 64?

---

## Lesson 4 · Data: splits, and why we split by town

You can't judge a model on examples it trained on: it may have memorised them. So data is split three ways:

- **Train**: the model learns from it (towns with seeds 101–140).
- **Validation**: watched during training to decide when to stop and to tune settings (seeds 141–150).
- **Test**: touched only at the end, for the honest score (seeds 151–160).

We split **by town**, not by row. If the same town (same people, same economy) appeared in train and test, the model could recognise a sim it had already seen and look better than it is. This is **leakage**.

**Truncation.** Models read a limited number of **tokens** (word pieces). Our first "smoke" run used 1,024 tokens, and 68% of states didn't fit. Unsloth cuts the *end* of the state, which is where the sim's recent **memories** live, exactly what the memory tests check. All real runs used 2,048 tokens: 0 truncated.

**Check yourself:** What is leakage, and how does splitting by town prevent it? What did truncation silently remove?

---

## Lesson 5 · Watching training: loss curves, overfitting, calibration

During training you watch two curves: **training loss** (on the data being learned) and **validation loss** (on held-out data).

- Both falling: learning.
- Training falling but validation flat or rising: **overfitting**, memorising rather than generalising. Stop or add data.
- In E01, validation loss went 0.935 → 0.561 and was flat for the last ~200 steps: **2 epochs was about where learning stopped**.

**Accuracy** is the share of questions answered right. We also used **record accuracy**: every question in a decision right at once (E01: 43%).

**Calibration**: when the model says 80%, is it right ~80% of the time? **ECE** (expected calibration error) measures the gap. Unsloth fits a **temperature** per question type after training (dividing scores by T > 1 softens over-confident probabilities; T < 1 sharpens). E01's ECE was 0.022 (good). E05's was 0.124: trained on single "hard" answers, it became over-sure, and since this town rolls dice on those probabilities, calibration actually changes behaviour.

**Check yourself:** What does a flat validation curve tell you? Why does calibration matter more for this sim than for a typical classifier?

---

## Lesson 6 · Labels: the student copies the teacher

The single biggest lesson of this project. We trained the *same* model on the *same* 3,687 states, changing only **who wrote the answers** (the **labels**), then scored each against a hand-made **gold** set:

| Run | Teacher (who labelled) | Teacher vs gold | Student vs gold |
|---|---|---|---|
| E01 | hand-written rules (heuristic) | 64% | **60%** |
| E02 | d3, an existing decision model | 56% | **61%** |
| E05 | Haiku with a written rubric | 95% | **96%** |

Each student landed almost exactly on its teacher. Fine-tuning **copies the teacher, mistakes included**. More training or more data didn't close the gap (2,680 → 3,687 Haiku labels: +1 point); a better teacher did (+36 points).

This is also why a student can beat its teacher only a little: it smooths over the teacher's random slips, but it can't learn what the teacher never showed it.

**Check yourself:** E02 imitated d3 at 87.5% but agreed with gold at only 61%. How can both be true?

---

## Lesson 7 · Making good labels: rubrics, noise, and checking

Labels came from Haiku agents following a **rubric** (a written labelling guide). We improved it the way you improve code: measure, read the failures, fix, measure again.

- **Hidden label noise.** Five agents read the same rule ("cash below the cushion → no new commitments") in opposite ways; consistency was **35%**. One clarifying sentence took it to **97%**. Noise like this is invisible in any single file.
- **Defaults beat ranges.** "Spend 3–4" left agents guessing; a default per personality with ±1 rules took exact spend agreement from 51% to 68%.
- **Measure the labeller on gold before scaling.** Haiku's agreement with gold went 57% → 78% (v1.1) → 94% (v1.3) → 100% on a fresh batch (v1.4).
- **A rule checker** flags labels that break hard rules (buying with 24% card debt, investing with no paycheck…): 2.2% of labels under v1.2, 0.3% by v1.7. And when the first strict checker flagged 8 *gold* labels, the rule was wrong, not the gold: **a checker must pass on the gold before it judges anything else.**
- **Some ambiguity is irreducible.** As code, the spend rule matches gold spend exactly only ~60% of the time but within one level 98%: judge spend by "within one", and consider **soft labels** (probabilities instead of one answer).

**Check yourself:** Why did one sentence change consistency from 35% to 97%? Why must a checker pass on the gold set first?

---

## Lesson 8 · The test you didn't write

95% on gold looked like victory. Then we ran the model through the **golden suite**, hand-built scenarios and **counterfactual pairs** written earlier for Kev and d3 (a pair changes one thing, e.g. "same person, but with $150k cash", and checks the answer moves the right way). Result: **70% overall, 48% pairs**, no better than d3.

Why? It failed exactly where a personality's signature deal *was* on offer with money to spare: the real-estate investor saved cash instead of buying the rental. In all 3,887 training labels, a rental was bought **4 times**. The training towns almost never offered an affordable deal, so the model learned "never take the deal", and the gold test, drawn from the same towns, couldn't notice.

Lessons:
- **A test from the same distribution as training can't see a gap the distribution has.** You need an independent test, built from a different angle.
- **Coverage matters as much as label quality.** The fix is **targeted data**: we sampled 734 states where a signature deal *is* offered (about two-thirds affordable) and labelled them with the same rubric.
- **Check behaviour, not just a number**, including a whole-town run, where the model's choices compound for decades.

**Check yourself:** Why couldn't the gold test catch the "never take the deal" problem? What is a counterfactual pair testing that a single scenario isn't?

---

## Lesson 9 · Infrastructure you'll meet in practice

Not glamorous, but every project hits these:

- **Run one GPU job at a time**, through a queue, and log each job's start, end and exit code.
- **Process lifetimes:** on Windows, a process started over SSH dies when the session closes; use a scheduled task. A "is it running?" check that matches its own command line will lie to you.
- **Permissions:** jobs run as a different user than your SSH session can't read its files.
- **Never commit secrets or private addresses**; an automated leak check caught a LAN address in a script.
- **Make every run reproducible:** a config file with a written *why*, keyed randomness, fixed splits, and a notebook row per result.

---

## What to try next (exercises)

1. Retrain with the deal states added and re-run the golden suite. Did pairs improve? Did gold accuracy drop?
2. Train on **soft labels** (d3's probabilities: run E03) and compare calibration with E02.
3. Change one setting at a time (epochs 1 vs 4, LoRA rank 16 vs 64, learning rate 2e-4 vs 2e-5) and predict the loss curve before you look.
4. Swap the 0.8B base for 2B or 4B on the same labels: does size or labels matter more?
