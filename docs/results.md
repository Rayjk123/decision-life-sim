---
title: Model results
nav_order: 2
---

# Model results
{: .no_toc }

Which decision model best plays a sim "in character"? Every model here is graded on the same golden suite: 30 scenarios and 18 counterfactual pairs, written by Claude Opus as the reference for acting true to a person's personality and situation.
{: .fs-5 .fw-300 }

<details open markdown="block">
<summary>Contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>

---

## Summary

- **d3:4b is the best model so far.** It ties the hand-tuned heuristic overall (77%), beats it on counterfactual pairs (61% vs 56%), and is the first model fast enough for the full 1,000-sim town.
- **Size matters more than anything else we tried.** Going from Kev-0.8B to Kev-4B added 19 points. Rewording the state added 2.
- **Market signals barely register.** Crashes, booms and weak jobs reports move no model at all, the heuristic included. Only the heuristic and d3:2b react to interest rates. This is now the clearest gap.
- **Small models have a default move.** Kev-0.8B falls back to "change nothing" and d3:2b to "invest in the index fund", whatever the personality. The 4B models mostly lose that.
- **Personality can override red flags.** Even d3:4b has an unemployed sim invest, and an investor buy another rental while rentals sit empty.

## Leaderboard

★ marks each model's best state style. **Overall** = 60% scenario score + 40% pair pass rate.

<!-- generated:leaderboard -->
| Model | Params | Ran on | State style | **Overall** | Scenario score | Top pick in character | Stayed out of avoid | Personality pass | **Pairs** |
|---|---|---|---|---|---|---|---|---|---|
| **Random** | – | CPU | words ★ | **15%** | 22% | 0% | 53% | 0% | **6%** |
| **Heuristic** | – | CPU | words ★ | **77%** | 91% | 90% | 90% | 94% | **56%** |
| **Kev-0.8B** | 0.8B | Mac M3 Pro (MLX) | focused ★ | **55%** | 70% | 63% | 73% | 44% | **33%** |
| Kev-0.8B | 0.8B | Mac M3 Pro (MLX) | words | 53% | 62% | 50% | 67% | 19% | 39% |
| Kev-0.8B | 0.8B | Mac M3 Pro (MLX) | numbers | 52% | 61% | 50% | 67% | 19% | 39% |
| Kev-0.8B | 0.8B | Mac M3 Pro (MLX) | terse | 46% | 61% | 50% | 67% | 19% | 22% |
| **Kev-4B** | 4B (LoRA) | Mac M3 Pro (MLX) | words ★ | **72%** | 82% | 77% | 93% | 75% | **56%** |
| Kev-4B | 4B (LoRA) | Mac M3 Pro (MLX) | focused | 70% | 80% | 77% | 80% | 75% | 56% |
| **d3:2b** | 2.4B Q8_0 | RTX 4070 Super (Ollama) | focused ★ | **66%** | 80% | 73% | 93% | 75% | **44%** |
| d3:2b | 2.4B Q8_0 | RTX 4070 Super (Ollama) | words | 61% | 72% | 60% | 93% | 50% | 44% |
| **d3:4b** | 4.8B Q8_0 | RTX 4070 Super (Ollama) | words ★ | **77%** | 88% | 87% | 93% | 94% | **61%** |
| d3:4b | 4.8B Q8_0 | RTX 4070 Super (Ollama) | focused | 72% | 90% | 90% | 93% | 94% | 44% |
<!-- /generated:leaderboard -->

**Columns.** *Scenario score*: 40% top pick in character, 30% staying within the out-of-character budget, 30% ordering constraints (a scenario passes at 0.7). *Personality pass*: share of the 16 personality scenarios passed. *Pairs*: share of the 18 counterfactual pairs where the probability moved the right way by at least 0.03.

## Speed

A full 1,000-sim month needs about 300 decisions, and the target is a ~90 s month.

| Model | Ran on | One decision | Throughput | 300 decisions |
|---|---|---|---|---|
| Kev-0.8B | Mac M3 Pro, 36 GB (MLX) | 1.8 s | 0.5/s | ~570 s ❌ |
| Kev-4B | Mac M3 Pro, 36 GB (MLX) | 0.66 s | 1.1/s | ~260 s ❌ |
| d3:4b | RTX 4070 Super, 12 GB (Ollama 0.40.17) | 0.12 s | 8.5/s | **~35 s ✅** |
| d3:2b | RTX 4070 Super, 12 GB (Ollama 0.40.17) | 0.07 s | 16.5/s | **~18 s ✅** |

- **Parallel requests don't help on either server.** Kev's MLX backend runs queued requests one at a time. Ollama also serves d3 one at a time, even with `OLLAMA_NUM_PARALLEL=4`: the model loaded at a byte-identical size, and throughput stayed flat from 2 to 16 concurrent requests while latency doubled each time.
- **Kev-4B beat Kev-0.8B on speed on the Mac.** So the 0.8B's per-call cost is mostly overhead, not model size. This hasn't been profiled yet.
- d3:4b uses 6.3 GB of VRAM, all on the GPU. The first call after a load takes about 40 s; warm calls take about 0.1 s.

## What each model reads

Each counterfactual pair changes one thing about a sim and checks that the probability of the relevant move moves the right way. The number is the change in that probability. Each model is shown with its best state style.

<!-- generated:pairs -->
| Counterfactual pair | Random<br><sub>words</sub> | Heuristic<br><sub>words</sub> | Kev-0.8B<br><sub>focused</sub> | Kev-4B<br><sub>words</sub> | d3:2b<br><sub>focused</sub> | d3:4b<br><sub>words</sub> |
|---|---|---|---|---|---|---|
| `arch-spender-car` | ❌ +0.00 | ✅ +0.46 | ❌ +0.02 | ✅ +0.15 | ✅ +0.60 | ✅ +0.66 |
| `arch-picker-stocks` | ❌ +0.00 | ✅ +0.47 | ✅ +0.24 | ✅ +0.50 | ✅ +0.79 | ✅ +0.90 |
| `arch-re-rental` | ❌ +0.00 | ✅ +0.30 | ✅ +0.07 | ✅ +0.22 | ✅ +0.82 | ✅ +0.93 |
| `arch-biz-start` | ❌ +0.00 | ✅ +0.44 | ✅ +0.08 | ✅ +0.07 | ❌ +0.03 | ✅ +0.38 |
| `arch-fire-invest` | ❌ +0.00 | ✅ +0.61 | ✅ +0.23 | ✅ +0.30 | ✅ +0.94 | ✅ +0.66 |
| `persona-only-spender` | ❌ +0.00 | ❌ +0.00 | ❌ +0.03 | ✅ +0.14 | ✅ +0.66 | ✅ +0.65 |
| `traits-only-status` | ❌ +0.00 | ✅ +0.09 | ❌ -0.00 | ❌ +0.01 | ❌ +0.00 | ❌ +0.01 |
| `rates-up-rental` | ❌ +0.00 | ✅ -0.13 | ❌ -0.03 | ❌ -0.02 | ✅ -0.08 | ❌ -0.01 |
| `crash-big-purchases` | ❌ +0.00 | ❌ -0.01 | ❌ -0.00 | ❌ -0.00 | ❌ -0.00 | ❌ +0.00 |
| `weak-jobs-status-car` | ❌ +0.00 | ❌ +0.00 | ❌ -0.01 | ❌ +0.00 | ❌ -0.01 | ❌ +0.01 |
| `boom-fomo-stocks` | ❌ +0.00 | ❌ +0.01 | ❌ +0.00 | ❌ +0.00 | ❌ -0.00 | ❌ -0.00 |
| `memory-stock-loss` | ❌ +0.00 | ❌ +0.00 | ✅ -0.14 | ✅ -0.28 | ✅ -0.09 | ✅ -0.18 |
| `memory-biz-failed` | ❌ +0.00 | ✅ -0.07 | ❌ +0.00 | ❌ -0.01 | ❌ +0.07 | ✅ -0.11 |
| `memory-raise` | ❌ +0.00 | ❌ +0.00 | ❌ -0.01 | ❌ -0.01 | ❌ +0.00 | ✅ +0.04 |
| `card-debt-investing` | ❌ -0.03 | ❌ -0.03 | ❌ -0.03 | ✅ -0.07 | ✅ -0.28 | ✅ -0.26 |
| `laid-off-nothing` | ✅ +0.13 | ✅ +0.23 | ✅ +0.26 | ✅ +0.17 | ❌ +0.02 | ❌ -0.01 |
| `town-vacancies-rental` | ❌ +0.00 | ✅ -0.31 | ❌ +0.02 | ✅ -0.09 | ❌ +0.05 | ❌ +0.01 |
| `age-retire` | ❌ +0.00 | ❌ +0.00 | ❌ +0.00 | ❌ +0.01 | ❌ -0.00 | ✅ +0.04 |
| **Passed** | **1/18** | **10/18** | **6/18** | **10/18** | **8/18** | **11/18** |
<!-- /generated:pairs -->

**Reading the table.** Archetype and persona swaps are where the 4B models shine: d3:4b moves a stock picker's chance of trading stocks by +0.90. The heuristic is the only one that responds to traits on their own, because it was written to; only it and d3:2b respond to interest rates. The `crash`, `weak-jobs` and `boom` rows are red for every model.

## Scenario by scenario

Each cell shows whether the scenario passed, and the model's most likely move.

<details markdown="block">
<summary>Show all 30 scenarios</summary>

<!-- generated:scenarios -->
| Scenario | Random<br><sub>words</sub> | Heuristic<br><sub>words</sub> | Kev-0.8B<br><sub>focused</sub> | Kev-4B<br><sub>words</sub> | d3:2b<br><sub>focused</sub> | d3:4b<br><sub>words</sub> |
|---|---|---|---|---|---|---|
| `A-saver` | ❌ nothing | ✅ nothing | ❌ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `A-index` | ❌ nothing | ✅ invest_index | ❌ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `A-picker` | ❌ nothing | ✅ trade_stocks | ✅ trade_stocks | ✅ trade_stocks | ✅ trade_stocks | ✅ trade_stocks |
| `A-re` | ❌ nothing | ✅ buy_rental | ❌ nothing | ✅ buy_rental | ✅ buy_rental | ✅ buy_rental |
| `A-biz` | ❌ nothing | ✅ start_laundromat | ❌ trade_stocks | ❌ buy_rental | ❌ trade_stocks | ✅ start_laundromat |
| `A-spender` | ❌ nothing | ✅ buy_car | ✅ nothing | ❌ invest_index | ✅ buy_car | ✅ buy_car |
| `A-status` | ❌ nothing | ✅ buy_home_big | ❌ nothing | ❌ nothing | ❌ invest_index | ✅ buy_home_big |
| `A-fire` | ❌ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `A-balanced` | ❌ nothing | ✅ nothing | ✅ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `B-saver` | ❌ nothing | ✅ pay_debt | ✅ nothing | ✅ invest_index | ✅ invest_index | ✅ pay_debt |
| `B-re` | ❌ nothing | ✅ buy_rental | ❌ nothing | ✅ buy_rental | ✅ buy_rental | ✅ buy_rental |
| `B-picker` | ❌ nothing | ✅ trade_stocks | ✅ trade_stocks | ✅ trade_stocks | ✅ trade_stocks | ✅ trade_stocks |
| `B-fire` | ❌ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `B-biz` | ❌ nothing | ✅ start_auto_repair | ❌ nothing | ✅ start_auto_repair | ❌ trade_stocks | ❌ trade_stocks |
| `B-index` | ❌ nothing | ✅ invest_index | ❌ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `S-card-debt` | ❌ nothing | ❌ nothing | ❌ nothing | ❌ invest_index | ❌ invest_index | ❌ invest_index |
| `S-crash-balanced` | ❌ nothing | ✅ nothing | ✅ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `S-crash-index` | ❌ nothing | ✅ invest_index | ❌ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `S-unemployed` | ❌ nothing | ✅ nothing | ✅ nothing | ❌ invest_index | ❌ invest_index | ❌ invest_index |
| `S-raise-renter` | ❌ nothing | ❌ nothing | ❌ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `S-rentals-empty` | ❌ nothing | ✅ nothing | ✅ nothing | ✅ nothing | ❌ buy_rental | ❌ buy_rental |
| `M-stock-loss` | ❌ nothing | ✅ nothing | ✅ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `M-business-failed` | ❌ nothing | ✅ nothing | ✅ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `M-laid-off-before` | ❌ nothing | ✅ nothing | ✅ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `L-new-grad` | ❌ nothing | ✅ pay_debt | ✅ nothing | ❌ invest_index | ❌ invest_index | ✅ pay_debt |
| `L-fire-58` | ❌ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `L-index-67` | ✅ nothing | ✅ invest_index | ✅ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `L-teacher-62` | ❌ nothing | ✅ nothing | ❌ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `L-retired-72` | ❌ nothing | ✅ nothing | ✅ nothing | ✅ invest_index | ✅ invest_index | ✅ invest_index |
| `P-status-lawyer` | ❌ nothing | ❌ buy_car | ❌ nothing | ❌ invest_index | ❌ invest_index | ✅ buy_home |
| **Passed** | **1/30** | **27/30** | **17/30** | **23/30** | **22/30** | **26/30** |
<!-- /generated:scenarios -->

</details>

## Findings

### "Change nothing" isn't an option-order effect

Kev-0.8B's top pick was "change nothing" in all 30 scenarios, and "nothing" is always listed first, so we re-asked every scenario in 8 shuffled orders through Kev's `/v1/systemone/permute` endpoint (`npm run eval:permute`):

- "Nothing" was still the top pick in **99% of the 240 orders**.
- Its probability was 0.37 when listed first, 0.38 when not first and 0.40 when last.
- Being listed first actually *lowers* an option's probability, to 0.82× its average.

So the lean toward doing nothing is a genuine preference of the small model, not a position bias.

### The best wording depends on model size

The `focused` style puts the persona first, lists only the traits that stand out, shows spare cash above the cushion, and drops empty fields. It's about 35–40% shorter than `words`.

| Model | `words` | `focused` |
|---|---|---|
| Kev-0.8B | 53% | **55%** |
| d3:2b | 61% | **66%** |
| Kev-4B | **72%** | 70% |
| d3:4b | **77%** | 72% |

Small models do better with the shorter, persona-first state. The 4B models do better with the fuller one, especially on pairs (d3:4b: 61% with `words`, 44% with `focused`). `words` stays the default. Kev-0.8B also tried `numbers` (52%) and `terse` (46%).

### The heuristic's high score is partly circular

The heuristic scores 98% on personality scenarios largely because its weights and the golden labels were written by the same author. The counterfactual pairs expose it: it ignores memories, debt and most market signals, so it passes only 56%. That's why pairs are the fairest test of whether a model reads the state, and why d3:4b's 61% matters more than its tie on overall.

## Method

- **Golden suite** (`packages/evals/golden/`): 30 scenarios in 4 categories (personality 16, situation 6, memory 3, lifecycle 5) and 18 counterfactual pairs. Every scenario is built with the real rules engine, so the options shown are exactly the legal moves with their real costs.
- **Decision API**: every model receives the same request (a `state` object, a `choice` question over the legal moves, plus `score` and yes/no questions where relevant) on `POST /v1/systemone`, and returns a probability per move.
- **Models**: Kev-0.8B and Kev-4B served by `./scripts/kev.sh` (Kev's own server, MLX on Apple Silicon, bfloat16). d3:2b and d3:4b from the Ollama library, Q8_0, on a Windows desktop.
- **All runs used temperature as served** (no sampling in the eval; the grader reads the probabilities directly).

### Reproduce

```bash
npm run eval                                                   # random + heuristic baselines
./scripts/kev.sh jaredpalmer/kev-4b                            # then, in another terminal:
npm run eval -- --decider kev --style all --verbose            # Kev on :8009, all four state styles
npm run eval -- --decider kev --kev-url http://<ollama-host>:11434 --model d3 --style words
npm run eval:permute                                           # option-order probe (Kev only)
npm run docs:results                                           # regenerate the tables on this page
```

### Raw data

Every run's full output (per-scenario probabilities and grades, per-pair deltas) as JSON, one file per model and style:

<!-- generated:data -->
[`d3-2b-focused.json`](results/data/d3-2b-focused.json) · [`d3-2b-words.json`](results/data/d3-2b-words.json) · [`d3-4b-focused.json`](results/data/d3-4b-focused.json) · [`d3-4b-words.json`](results/data/d3-4b-words.json) · [`heuristic-words.json`](results/data/heuristic-words.json) · [`kev-0.8b-focused.json`](results/data/kev-0.8b-focused.json) · [`kev-0.8b-numbers.json`](results/data/kev-0.8b-numbers.json) · [`kev-0.8b-terse.json`](results/data/kev-0.8b-terse.json) · [`kev-0.8b-words.json`](results/data/kev-0.8b-words.json) · [`kev-4b-focused.json`](results/data/kev-4b-focused.json) · [`kev-4b-words.json`](results/data/kev-4b-words.json) · [`permute-kev-0.8b-words.json`](results/data/permute-kev-0.8b-words.json) · [`random-words.json`](results/data/random-words.json)
<!-- /generated:data -->

