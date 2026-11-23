---
license: apache-2.0
language:
- en
tags:
- decision-model
- simulation
- synthetic
pretty_name: decision-life-sim E07m training data
size_categories:
- 1K<n<10K
---

# E07m training data: in-character money decisions in a medieval town sim

The data used to train and test [E07m](../README.md), the decision model in [decision-life-sim](https://github.com/Rayjk123/decision-life-sim). Every row is one decision a simulated townsperson faced, exactly as the model sees it, with the in-character answer to each question. Entirely synthetic: fictional people, fictional town, fictional currency.

| File | Rows | From | Labels by |
|---|---|---|---|
| `train.jsonl` | 4,304 | 40 towns (seeds 101–140), incl. 617 decisions where a signature deal was on offer | Claude Haiku, following the rubric |
| `val.jsonl` | 317 | 10 towns (seeds 141–150) | Claude Haiku |
| `test.jsonl` | 200 | 10 held-out towns (seeds 151–160) | Claude Opus (gold) |
| `labeling-rubric.md` | | the labelling guide (v1.10) and its changelog | |

Splits are **by town**: no person in the test set appears in training.

## Row format

```json
{"id": "152-354-s00066", "archetype": "saver",
 "state": {"person": "...", "personality": "...", "recent": "...", "money": "...", "debts": "...", "market": "...", "...": "..."},
 "questions": {"main": {"type": "choice", "instructions": "...", "criteria": {"nothing": "Change nothing this month", "save_cash": "Put spare coin in the counting-house vault, ...", "...": "..."}},
               "invest_share": {"type": "score", "criteria": ["...10%", "...25%", "...half", "...75%", "...all"]},
               "spend_level": {"type": "score", "criteria": ["1: Bare bones: bread and rent only", "...", "10: A blowout: ..."]}},
 "gold": {"main": "save_cash", "invest_share": 2, "spend_level": 2}}
```

- `id`: `<town seed>-<month>-<person id>`. `archetype`: the personality (saver, index = Guild Fund investor, picker = voyage backer, re = landlord, biz = business owner, spender, status, fire = early retiree, balanced).
- `main` is one of the move ids in `criteria` (the legal moves that month, each described with its real costs). `invest_share` is a position 0–4 (10% to all of the spare money). `spend_level` is a position 0–9 (spend level 1–10).

## How it was made

1. **States**: a hand-written rules engine ran each town for 40 years; about 90 decisions per town were sampled (keyed, reproducible), plus targeted decisions where a rental, business, home or vehicle was on offer, because ordinary towns almost never offer an affordable one.
2. **Labels**: Claude Haiku agents labelled each decision following the rubric, step by step (red flags, then personality and its fallbacks, the bar a deal must clear, memories, life stage, default spend and invest levels). Every label passed a rule checker for the rubric's hard rules; under 1% needed fixes. On held-out gold decisions, Haiku matched 94–100% of moves.
3. **Wording**: states were rewritten into the town's medieval wording (gold crowns, the Guild Fund, trading voyages, cottages to let) with every decision and label kept.

The full process, including what didn't work: [How we trained a decision model that beats d3](https://github.com/Rayjk123/decision-life-sim/blob/main/docs/finetune/story.md).

## Limitations

The rubric, the gold labels and the simulation's evaluation suite share an author. Hard labels (one answer per question) hide genuine ties; spend level in particular is a judgement call (exact agreement ~60–70%, within one level ~99%).
