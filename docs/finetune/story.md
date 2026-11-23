---
title: How we beat d3
parent: Training our own decision model
nav_order: 0
---

# How we trained a decision model that beats d3

**In two days we went from "can we fine-tune our own model?" to E07m, a 4B model that is now the town's default decision-maker.** On the independent golden suite, the test none of its training data came from, it scores **77% overall and 57% on counterfactual pairs**, against **70% / 48%** for d3:4b, the best off-the-shelf model we had. This page tells how we got there: every trial, what each one taught us, and which changes actually moved the numbers.

The detail lives elsewhere: the [lab notebook](index.md) (every run and finding, in order), the [results](results.md) (charts), the [labelling rubric](labeling-rubric.md) (v1.0 → v1.10, with its changelog) and a [nine-lesson course](learn/index.md) on the basics.

---

## The goal and the setup

Every month, each sim in the town faces a decision: which of the legal moves to make (invest, save, pay debt, buy a home or rental, start a business…), how much of the spare money to commit, and how much to spend. The rules engine decides what's legal; a **decision model** assigns a probability to each option; a seeded dice roll picks. "Good" means **in character**: a careful saver saves, a landlord buys rentals when the numbers work, a spender splurges unless the situation says otherwise.

- **Base models:** Qwen3.5-0.8B and Qwen3.5-4B, fine-tuned with [Unsloth](https://unsloth.ai/docs/basics/train-your-own-decision-model-with-unsloth)'s `FastDecisionModel` (a small head scores the options; LoRA adapters train ~2–5% of the weights).
- **Hardware:** one RTX 4070 SUPER (12 GB) on a desktop, driven over SSH from a Mac. A 0.8B run took ~20 minutes; the 4B ~2 h 20 min.
- **Data:** decision requests sampled from simulated towns, **split by town** (train seeds 101–140, validation 141–150, test 151–160), so no test sim was ever seen in training.
- **Two tests:**
  1. **Gold labels:** 200 held-out decisions labelled by hand (Claude Opus) to a written rubric. Fast and fine-grained, but the rubric's author also wrote them.
  2. **The golden suite:** 30 hand-built scenarios and 21 **counterfactual pairs** (same sim, one fact changed: does the answer move the right way?), written earlier, for Kev and d3, independent of all our training data. **This is the test that counts.**

## The journey in numbers

| Step | What changed | Gold moves | Golden suite (overall / pairs) |
|---|---|---|---|
| E01 | 0.8B on the hand-written rules' answers | 62% | – |
| E02 | 0.8B on d3's answers | 61% | – |
| E03 | 0.8B on d3's full probabilities (soft labels) | 61% | – |
| E04 | 0.8B on Haiku's answers to our rubric (2,680) | 95% | 70% / 48% |
| E05 | E04 with all 3,687 Haiku labels | 96% | 68% / 43% |
| E06 | E05 + 617 targeted "deal" decisions | 96% | 71% / 48% |
| **E07m** | **E06's data, medieval wording, on a 4B base** | **96%** | **77% / 57%** |
| *d3:4b* | *the model to beat* | *56%* | *72% / 48% (modern), 70% / 48% (medieval)* |

Golden-suite scores for E04–E06 are on the modern wording (compare with d3's 72% / 48%); E07m's are on the medieval wording (compare with d3's 70% / 48% on the same requests). Gold moves are on the same 200 decisions throughout (E07m's in the medieval wording).

## What we tried, and what each step taught us

### 1. The first runs: the student copies the teacher

We trained the same 0.8B model three ways, changing only who wrote the answers. Against our gold labels:

- On the **hand-written rules** (E01), it matched the rules 96% of the time and gold 62%.
- On **d3's answers** (E02), it matched d3 87% and gold 61%.
- On **d3's full probabilities** (E03), no better: soft labels passed on d3's uncertainty, not better judgment.

Each student landed almost exactly where its teacher did (the rules agree with gold 64%, d3 56%). **Fine-tuning copies the teacher, mistakes included.** More training couldn't fix that; only a better teacher could. The per-personality breakdown showed where: real estate investors 14%, business owners 15%, balanced sims 0%. The rules and d3 both sent them to the index fund when their signature move wasn't on offer.

### 2. Building a better teacher: Haiku and a written rubric

We wrote a labelling rubric and had Claude Haiku agents label thousands of decisions with it, then measured Haiku against the gold labels before trusting it. The rubric went through ten versions, each driven by measured disagreements:

- **v1.1:** Haiku agreed with gold on only 57% of moves. Nearly every miss was the index fund chosen when a personality's usual move wasn't offered. A table of in-character fallbacks took it to 78%.
- **v1.2, hidden label noise:** five Haiku agents read "cash below the cushion: no new commitments" in **opposite** ways. One clarifying sentence took their consistency from **35% to 97%**. Noise like this is invisible in any single file.
- **v1.3:** the three weak personalities got explicit rules (a fixed decision order for balanced sims; the bar a rental or business deal must clear). Haiku: **94%** on 120 gold decisions.
- **v1.4:** default spend level and invest share per personality: exact invest share 42% → **87%**, moves **100%** on a fresh batch.
- **v1.5–v1.10:** a number behind every soft word ("thin cushion" = under 1.5× the cushion), cases the labellers flagged, and a **rule checker** that flags labels breaking hard rules (buying with 24% debt, investing with no paycheck). Flag rate: 2.2% → 0.3%. When the first strict checker flagged 8 *gold* labels, the rule was wrong, not the gold.

With Haiku labels, the same 0.8B model went from **62% to 95–96%** of gold moves (E04, E05). Adding a third more data added one point; changing the teacher added 34.

### 3. The independent test said "not so fast"

E04 and E05 scored 95–96% on gold, then only **70% and 68% on the golden suite**, no better than d3. The comparison showed why: they **never took a signature deal**. Offered a rental with money to spare, the real estate investor saved; offered a business, the entrepreneur saved.

In all 3,887 training labels, a rental was bought **4 times** and a business started **twice**. The training towns, run by the hand-written rules, almost never offered an affordable deal, so the model learned "never take the deal", and the gold test, drawn from the same towns, couldn't notice. **A test from the same distribution as training can't see a gap the distribution has.**

### 4. Coverage: targeted examples

We sampled **734 decisions where a signature deal was on offer** (about two-thirds affordable), labelled them with the same rubric (rentals then taken in 40 of 210, businesses 26 of 210, status purchases 135 of 197), and retrained (E06). The golden suite moved: the rental and status-home cases improved, but two other pairs flipped and overall stayed level with d3 (**71% / 48%**). The 0.8B model now **tied** a model six times its size, winning on situations (saving when out of work, cutting back in a crash) and losing on deals.

### 5. The town changed under us: translating, not relabelling

Mid-project the town became medieval (gold crowns, the Guild Fund, trading voyages, cottages to let). Everything the model reads changed, and d3 itself dropped from 72% to 64% until we added plain glosses ("the Guild Fund, a broad index fund") and recovered to 70%.

Re-sampling towns would have produced different decisions (the simulation had changed too), so the existing labels would no longer match. Instead, `medievalize.ts` **rewrote all 6,314 stored decisions into the new wording**, keeping every id, number and label: same field order the sim uses now, consequence-style market news, the glossed options. A residue check confirmed no modern wording remained. No relabelling, no new tokens.

### 6. Scale: the 4B model

Finally we trained **Qwen3.5-4B** (4.66B parameters, the size of d3:4b) on E06's decisions in the medieval wording: E07m. It fit in 7.3 GB with batch 1 and gradient accumulation 8, and trained in about 2 h 20 min.

**Golden suite: 77% overall, 57% pairs, 90% scenario score**, against d3:4b's 70 / 48 / 86 on the same requests, with no regressions. It now:

- **pays off a 24% debt** instead of investing (d3 invested);
- **saves when out of work** (d3 invested);
- **won't start a business right after one failed** (−0.71 on that pair; d3 +0.07);
- **cuts spending hard in a crash** (−1.08 levels) and **spends more after a raise** (+0.96).

It still misses the big deals (two rental scenarios and one business scenario): the 0.8B's gap, inherited from data where rentals were taken in only 40 of 210 deal decisions.

## How we improved, in one list

1. **Change the teacher, not the training.** Swapping heuristic labels for rubric-guided Haiku labels was worth +34 points on gold; more data +1; soft labels 0.
2. **Treat the labelling guide like code.** Measure the labeller on held-out gold, read the misses, write the missing rule, measure again (57% → 78% → 94% → 100%). Clarify any rule two labellers read differently.
3. **Check labels mechanically.** A rule checker caught 0.3–2.2% of labels breaking hard rules; and checks must pass on the gold before they judge anything else.
4. **Trust the independent test.** A held-out set from the same towns gave 96% while the real-behaviour test said 70%. Only the independent suite showed the missing deals.
5. **Fix coverage with targeted data.** When the data lacks a case, sample it on purpose and label it.
6. **Reuse labels across wording changes.** Rewriting the inputs mechanically kept thousands of labels valid through a full re-theme.
7. **Then scale the model.** Size helped most where the 0.8B was weakest, on subtle reactions to memories and the economy, once the data was right.

## What it took

- **Labels:** ~4,600 Haiku labels (about 1.6M tokens per 1,000) and 240 Opus gold labels; no labelling for the final run.
- **Compute:** a 0.8B run ~20 min, the 4B ~2 h 20 min, all on one 12 GB consumer GPU.
- **Infrastructure lessons:** jobs on the Windows desktop run as scheduled tasks (SSH kills its children), with a far-future trigger (a same-day placeholder re-fired three queues overnight); evaluate with frozen test copies; never commit a LAN address.

## Where it stands, and what's next

- **E07m is the default decision model** (2026-11-23), served from the desktop on port 8010 by `research/finetune/desktop/serve-default.ps1` (a logon task that restarts the server if it exits). The code defaults to model `e07m`; point `DECISION_URL` at the desktop.
- **Next improvement:** ~100–200 more labelled "the deal clears the bar, take it" decisions to close the rental and new-business gap, then a 2-hour retrain.
- **Faster serving:** export to a single GGUF file for llama.cpp's `/v1/systemone` server (`save_pretrained_gguf`), so the model runs without Python and potentially on the Mac.
