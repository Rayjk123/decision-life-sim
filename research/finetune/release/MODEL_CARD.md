---
license: apache-2.0
base_model: Qwen/Qwen3.5-4B
library_name: unsloth
language:
- en
tags:
- decision-model
- simulation
- unsloth
- lora
- gguf
pipeline_tag: text-classification
---

# E07m: an in-character money decision model for a medieval town sim

E07m picks what a simulated townsperson does with their money each month in [decision-life-sim](https://github.com/Rayjk123/decision-life-sim), a medieval market town where a rules engine decides which moves are legal and keeps the books, and a decision model chooses among them **in character**: a careful saver saves, a would-be landlord buys a cottage to let when the numbers work, a spender splurges unless the situation says otherwise.

It is a small, single-purpose model: it scores a fixed list of options for one fictional person in one fictional town. It is not a chat model and not useful outside this simulation.

| | |
|---|---|
| Base | Qwen3.5-4B (4.66B parameters), Apache-2.0 |
| Method | LoRA fine-tune with a decision head (Unsloth `FastDecisionModel`) |
| Output | a probability for every option of each question (choice / score / yes-no) |
| API | `POST /v1/systemone` (llama.cpp's decision server; the simulation's `--decision-url`) |
| Files | `gguf/model-Q4_K_M.gguf` (2.6 GB, recommended) or `gguf/model-Q8_0.gguf` (4.3 GB), plus `gguf/mmproj-Q8_0.gguf` (350 MB, required by the loader); `merged/` (16-bit weights, 8.9 GB, for Unsloth) |
| Licence | Apache-2.0 |

## Results

On the simulation's **golden suite** (30 hand-built scenarios and 21 counterfactual pairs, written independently of the training data), medieval wording:

| Model | Overall | Scenario score | Counterfactual pairs |
|---|---|---|---|
| **E07m** | **77%** | **90%** | **57%** |
| d3:4b (best off-the-shelf model tried) | 70% | 86% | 48% |
| Hand-written rules (heuristic) | 83% | 93% | 67% |

On **200 held-out gold decisions** (towns never seen in training; labelled by Claude Opus to the rubric): move **96.0%**, invest share 83.3% (within one step 99%), spend level 65.5% (within one level 99%). By personality, move accuracy 91–100% for all nine.

**Where it is strong:** reacting to the situation and to memories (pays off a 24% debt instead of investing; saves when out of work; avoids starting a business right after one failed; cuts spending in a crash, spends more after a raise).
**Known weakness:** it under-takes signature deals: real estate investors and entrepreneurs often save instead of buying a rental or starting a business when the deal is good (the training data had rentals taken in only 40 of 210 deal decisions).

## How to run it

Download (the 2.6 GB Q4_K_M file and the loader's projector):
```bash
hf download bdleecs95/decision-life-sim-e07m gguf/model-Q4_K_M.gguf gguf/mmproj-Q8_0.gguf --local-dir e07m
```

**llama.cpp** (build b11443 or newer; no Python). A decision model reads the whole request in one pass, so raise the batch size to fit it (requests are up to ~1,400 tokens):
```bash
llama-server -m model-Q4_K_M.gguf --mmproj mmproj-Q8_0.gguf --port 8010 -c 16384 -b 4096 -ub 4096
# then, in decision-life-sim:
DECISION_URL=http://localhost:8010 npm run sim -- --decider model --months 24 --pop 200
DECISION_URL=http://localhost:8010 npm run eval -- --decider model --style words
```

| Build | Hardware | Golden suite (overall / pairs) | Speed |
|---|---|---|---|
| Q4_K_M GGUF, llama.cpp b12651 | Mac M3 Pro (Metal) | 77% / 57% | ~1.2 decisions/s |
| Q8_0 GGUF, llama.cpp b12651 | Mac M3 Pro (Metal) | 76% / 57% | ~1.4 decisions/s |
| 4-bit, Unsloth (Python) | RTX 4070 SUPER | 77% / 57% | ~13 decisions/s |

On a Mac it is fine for small towns and demos; a 1,000-person town needs a GPU (~3.3 decisions/s keeps up with it).

**Unsloth** (Python, GPU):
```python
from unsloth import FastDecisionModel
# hf download bdleecs95/decision-life-sim-e07m --include "merged/*" --local-dir e07m
model, tokenizer = FastDecisionModel.from_pretrained("e07m/merged", load_in_4bit=True)
FastDecisionModel.for_inference(model)
answers = FastDecisionModel.predict(model, tokenizer, state, questions)
```

**Input.** `state` is a small object of plain-English facts about one person, written by the simulation (who they are, personality, recent memories, money, debts, housing, the economy, the town); `questions` asks for the move (`choice` over the legal moves, each with its real costs), how much spare money to commit (`score` 0–4), how much to spend (`score` 1–10) and sometimes whether to retire (`noul`). Example state:

```text
person: Diego Adeyemi, 40, traveling merchant earning 146k crowns a year
personality: A balanced, ordinary townsperson. A bit of saving, a bit of investing, a bit of fun.
recent: Put 5.7k crowns in the counting-house vault; Paid 4.2k crowns in surprise repairs
money: coin 17k crowns (keeps 25k crowns in reserve), counting-house vault 98k crowns, Guild Fund 82k crowns, trading voyages 11k crowns, net worth 340k crowns
market: the Guild Fund rose strongly, 5.2% last month; work is plentiful and wages are rising; house prices rising; moneylender's rate 6.1%
```

## Training

**Data.** Decision requests sampled from 40 simulated towns (seeds 101–140) run by the hand-written rules, plus 617 targeted decisions in which a personality's signature deal was on offer; validation from towns 141–150, test from towns 151–160 (split by town, so no test person was seen in training). 4,304 training decisions, 317 validation, 200 gold test. The text was rewritten into the town's medieval wording (`medievalize.ts`) keeping every decision and label.

**Labels.** Written by Claude Haiku agents following a written labelling rubric (v1.10: red flags, personality, fallbacks when a signature move isn't offered, the bar a deal must clear, life stage, default spend and invest levels), each label machine-checked against the rubric's hard rules. Haiku's agreement with the gold labels: 94–100% of moves on held-out batches. Gold test labels by Claude Opus. The training data and rubric are published alongside this model.

**Recipe.** Unsloth 2026.11.9; base loaded in 4-bit; LoRA rank 16, alpha 16 (64.5M trainable of 3.07B text parameters, 2.1%); learning rate 2e-4 (head: Unsloth default); 2 epochs (1,076 steps); batch 1 × gradient accumulation 8; max sequence length 2,048 (no input truncated); soft cross-entropy on hard labels; temperature calibration per question type after training. One RTX 4070 SUPER (12 GB): 2 h 20 min, 7.3 GB peak.

**How it got here.** Seven training runs: the same 0.8B model trained on the hand-written rules' answers (62% of gold moves), on d3's answers (61%), on d3's probabilities (61%), on rubric-guided Haiku labels (95–96%), then with targeted deal data, then this 4B run, which is the first to beat d3 on the independent suite. The full story, every run and the lessons: [How we trained a decision model that beats d3](https://github.com/Rayjk123/decision-life-sim/blob/main/docs/finetune/story.md).

## Limitations

- Trained and evaluated only on this simulation's states and wording; other phrasings or domains are out of scope.
- The rubric, the gold labels and the golden suite share an author, so gold accuracy partly measures agreement with that author; the golden suite and whole-town runs are the independent checks.
- Under-takes signature deals (rentals, new businesses), as above.
- English only. Fictional people, fictional currency; no real financial advice.
