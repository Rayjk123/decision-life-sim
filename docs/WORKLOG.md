---
title: Work log
nav_order: 4
---

# Work log

Newest session first. Each entry: what was done, the current state, and the next steps, so work can resume after a break or a context reset.


## Maple Hollow UX · round 2

- The resident profile keeps Follow beside the name and leaves room for the scene on small phones. Chrome verified touch scrolling and camera panning against an isolated town.
- Next round focuses on doors and transitions. [UX loop](../packages/town/UX-LOOP.md)

## Maple Hollow UX · round 1

- Following a working resident opens one of seven illustrated workplace scenes based on their career. The resident name opens their card from inside or outside. The overview keeps the selected resident.
- The [UX loop](../packages/town/UX-LOOP.md) records the initial independent review and the next priorities.

## Session 2026-11-22 (late): fine-tuning parked, d3 kept; town history; medieval re-theme; behaviour work; handoff

- **Fine-tuning study** (`docs/finetune/`): labels were the lever (same 0.8B: heuristic labels 62% of gold moves, d3 61%, Haiku 96%); on the independent golden suite the best fine-tune (E06) ties d3:4b (71/48 vs 72/48), beating it on red flags and losing on signature deals. **User: stick with d3.**
- **Loop 31** towns with a past (every age from month 0); **32** medieval re-theme (SPEC #19); **33** d3 re-measured and re-worded (64/38 → 68/43); **34** market news as consequences, red-flag warnings, memories up, rentals legal more often, bankruptcy frees tenants, older residents' full life stories (d3 70/48, published); **35** "Why?" probes.
- **Numbers:** d3:4b `words` 70% overall / 48% pairs (medieval); heuristic 82.7 / 66.7; health: largest age group 0.22-0.26, median retirement 62-67.
- **Verified:** `npm run verify` green at every commit (types, ~96 tests, eval regression, health, UX smoke 38 checks, docs sync, leak scan). **Not verified:** the 20-year d3 world on the medieval town (running at handoff).
- **Next:** `docs/HANDOFF.md`.

## Maple Hollow · isolated pixel-town branch

- Added a watch-only town with a shared 90-second month clock, resident follow mode, leaderboard, and an optional decision feed showing actual move probabilities and draws.
- The standalone town uses its own checkpoint and port. It starts with the heuristic and can connect to a decision model through `DECISION_URL` in a separate deployment.
- Added a standalone AWS deployment with CloudFront and S3 for static files, a throttled API Gateway route to Lambda, and a private S3 checkpoint. The next month is prepared when a viewer polls, and conditional writes keep concurrent viewers on one timeline. The clock resumes from the last observed phase after 15 minutes away.
- See [the town runbook](../packages/town/README.md) for launch and deployment.

## Handoff to the next session (start here)

**Verified**
- 37 tests pass; heuristic and random modes run end to end; resume is byte-identical; dashboard serves the world files.
- Eval baselines: random 15% overall, heuristic 77% (scenarios high, pairs 56%). Experiment separation: random 8%, heuristic 32%.

**Not verified yet**
- **Kev has never run for real.** `worker/src/kev.ts` was built against Kev's source and tested only with a mock server (`worker/test/kev.test.ts`). The cloud workspace couldn't reach Hugging Face, so weights never downloaded. Expect small fixes on first contact (response field names, `state` format, timeouts, throughput).
- Kev-0.8B speed on the Mac (MLX). We need it to decide ~1,000 sims × ~1/3 per month inside a ~90 s month.

**Steps, in order**
1. Put the repo under git: `git init -b main && git add -A && git commit -m "Initial import: sim core, worker, evals, dashboard"`.
2. `npm install && npm test` (all 37 must pass).
3. Install `uv` if missing (`curl -LsSf https://astral.sh/uv/install.sh | sh`), then run `./scripts/kev.sh` in the background and wait for it to say it's serving on port 8009. First run clones Kev into `.kev/` and downloads weights (if Hugging Face is slow, the `kev-1.0` GitHub release has `kev-0.8b.tar.gz` plus `SHA256SUMS.txt`).
4. `npm run kev:check`: one real decision compared with the heuristic, plus throughput. Fix `kev.ts` (and the mock in `kev.test.ts`) if the real response differs.
5. `npm run eval -- --decider kev --style all --verbose`: compare with the heuristic's 77% / 56% pairs. Record the scores per style here.
6. `npm run experiment -- --deciders heuristic,kev --seeds 1 --years 10`: record separation and signature moves.
7. Short real run: `npm run sim -- --decider kev --months 24 --pop 200`, then `npm run dashboard` and check the decision cards read sensibly.
8. Then follow the roadmap in `docs/SPEC.md` (item 2 if Kev underperforms, otherwise item 3 "Why?" probes, then employment links).
9. Update this log and commit.

**Prompt to paste into the new session**
> Read CLAUDE.md, docs/SPEC.md and docs/WORKLOG.md (start with "Handoff to the next session"). Kev has never been run for real: get Kev-0.8B serving locally on this Mac's GPU, fix anything in the Kev client that doesn't match the real API, then run kev:check, the eval suite with all three styles, and the experiment. Record the results in the worklog, compare against the heuristic baseline, and propose what to do next from the roadmap. Commit after each step.

## Session 3 · 2026-11-21 (Mac, first real Kev)

**Done**
- Repo under git (initial commit); open-source README, MIT `LICENSE`, `docs/assets/icon.svg`. `scripts/kev.sh` had lost its execute bit; now committed as 100755.
- 37/37 tests pass on the Mac (Node 20.11).
- Kev-0.8B serving locally: `kev.serve` on `mps via mlx (bfloat16)`, port 8009. Not Ollama: Kev's own Uvicorn server, weights from Hugging Face.
- **`kev:check` passes with no client changes.** The real response matches `kev.ts`: `answers.main.probabilities` keyed by our move ids, `usage.input_tokens`, `latency_ms`.
  - Sample (Ivy, early retiree, 388 input tokens): Kev nothing 71% / buy_home 22% / buy_car 7%; heuristic 70 / 28 / 2. Sensible: a frugal early retiree mostly stands pat and avoids the car.

**Throughput (the problem)**
- One decision takes ~1.7 s of model time. 8 concurrent requests: 23 calls in 43.9 s = **0.5 calls/s**, p50 13.3 s (queueing).
- Why concurrency doesn't help: Kev's MLX backend runs batches **one request at a time** (`.kev/kev/mlx_model.py` `probs_batch`); only the CUDA path runs requests together.
- 300 calls (1,000 sims × ~⅓ a month) take ~570 s against a 90 s month target, so **~6× short**. 200 sims (~65 calls) take ~2 min a month, which is fine for evals and short runs.
- Levers: shorter states (`terse` style, trimming `recent`), fewer calls (yearly reviews for steady sims), the CUDA box in roadmap item 7 (real batching), or hosted Jev.

**Golden eval, Kev-0.8B** (`evals-results/eval-kev-all-2026-11-22T02-03-45-389Z.*`)

| Style | Overall | Scenario score | Top pick in character | Pairs | Personality pass | Memory | Lifecycle |
|---|---|---|---|---|---|---|---|
| words | **53%** | 62% | 50% | **39%** | 19% | 100% | 80% |
| numbers | 52% | 61% | 50% | 39% | 19% | 100% | 80% |
| terse | 46% | 61% | 50% | 22% | 19% | 100% | 100% |
| *heuristic (words)* | *77%* | | | *56%* | *98% score* | | |
| *random* | *15%* | | | | | | |

- **Kev does not beat the heuristic.** Best style is `words` (keep it as the default), at 53% overall and 39% on pairs, against 77% and 56%.
- **"Nothing" is Kev's top pick in all 30 scenarios.** It gets 27–45% of the probability, and the rest is spread fairly flat with similar shapes across archetypes (buy_rental is often second, even for savers and spenders). "Top pick in character" is 50% only because `nothing` is an acceptable pick in about half the scenarios.
- **What it reads:** layoffs (laid-off-nothing +0.25), card debt (-0.04), a stock-loss memory (-0.04), and archetype swaps somewhat (4 of 5 pass in `words`). **What it ignores:** persona text alone and traits alone (+0.00), rates, crashes, a weak jobs report, boom FOMO, town vacancies, age. So it reacts to big situation facts but barely to personality, which is the point of the sim.
- An untested hypothesis: option-order bias, since `nothing` is always listed first. Check with `/v1/systemone/permute` (roadmap item 3) before concluding it's a pure prior.
- The eval ran much faster per call (14 s for the `words` run) than `kev:check`'s 1.7 s/decision. Eval states are probably shorter and share prefixes (Kev has a prefix cache). Not investigated.

**Option-order check** (`npm run eval:permute`, 30 scenarios × 8 orders, `words`)
- **Not the cause.** `nothing` is the top pick in 99% of 240 orders. p(nothing) is 0.37 when listed first, 0.38 when not first and 0.40 when last.
- An option listed first gets 0.82× its mean probability, a mild penalty for going first, not a bonus. The argmax is stable in 28 of 30 scenarios, and the mean max spread across orders is 0.10.
- So the pull toward "change nothing" is a genuine preference; Kev's training uses "none" options (`--p_none_pair`), which may explain it.

**`focused` state style** (new; persona first, standout traits as phrases, spare cash, empty fields dropped, repeated memories collapsed; about 35–40% shorter than `words`)

| Kev-0.8B | Overall | Scenario score | Top pick in character | Personality pass | Pairs |
|---|---|---|---|---|---|
| words | 53% | 62% | 50% | 19% | 39% (7/18) |
| **focused** | **55%** | **70%** | **63%** | **44%** | 33% (6/18) |

- Personality reads much better: archetype swaps move picker→stocks +0.24 and fire→index +0.23, and `nothing` is no longer the top pick for picker, fire and biz.
- Pairs are a wash, within about one pair. Two misses are just under the 0.03 bar (card debt -0.027, rates -0.026). Persona-only, traits-only, crash, jobs, boom, age and vacancies still barely move.

**Kev-4B** (`./scripts/kev.sh jaredpalmer/kev-4b`: a rank-16 LoRA on `Qwen/Qwen3.5-4B-Base`, MLX bf16, temperature 2.41; about 11 GB in the HF cache together with 0.8B)
- **Faster than 0.8B on this Mac.** `kev:check` takes 664 ms for one decision (0.8B: 1,768 ms). Throughput is 1.1 calls/s, p50 6.0 s at 8 concurrent (0.8B: 0.5/s). 300 calls take ~260 s, still ~3× over a 90 s month. So the 0.8B per-call cost was mostly not model size: probably overhead or warm-up, worth profiling.
- Ivy sample: nothing 78% / buy_home 19% / buy_car 3%.

| Golden eval | Overall | Scenario score | Top in character | Avoided | Personality pass | Pairs |
|---|---|---|---|---|---|---|
| Kev-0.8B words | 53% | 62% | 50% | 67% | 19% | 39% |
| Kev-0.8B focused | 55% | 70% | 63% | 73% | 44% | 33% |
| **Kev-4B words** | **72%** | **82%** | **77%** | **93%** | **75%** | **56% (10/18)** |
| Kev-4B focused | 70% | 80% | 77% | 80% | 75% | 56% |
| *heuristic* | *77%* | | | | *98% score* | *56%* |

- On 4B, `words` beats `focused` (better at staying out of avoid, 93% vs 80%). `focused` only helped the small model, so keep `words` as the default.
- **Pairs: same count as the heuristic, different pairs.** Kev-4B reads persona text alone (spender +0.14), a stock-loss memory (-0.28), card debt (-0.07), town vacancies (-0.09), a layoff (+0.17), and every archetype swap (picker→stocks +0.50). The heuristic passes traits-only, rates and the business-failure memory, where Kev doesn't. **Both fail** crash, weak jobs, boom FOMO, raise memory and age, so Kev ignores market signals and age entirely.
- **New failure mode: over-investing.** `invest_index` is the top pick for the spender, the unemployed sim (59% avoid), card debt, the new grad and the status lawyer. The 0.8B "nothing" prior is gone, and an index-fund prior has taken its place.

**d3 via Ollama (desktop GPU over the LAN)**
- `d3` is vLLM Semantic Router's decision model in the Ollama library (`d3:2b/4b/9b/27b`, Apache 2.0). The 4B tag is 4.84B parameters (Qwen3.5-4B plus a 334M vision projector), Q8_0, 5.8 GB, with a 4,096-token context. It needs Ollama ≥ 0.40.9.
- **Ollama serves the same `POST /v1/systemone` shape as Kev**, so `kev.ts` works unchanged: point `--kev-url`/`KEV_URL` at `http://<host>:11434` and set `--model d3` or `KEV_MODEL=d3`. The response matches (choice probabilities keyed by move id, score probabilities, `noul`, `usage.input_tokens`) except there's no `latency_ms`, and the client falls back to wall-clock time.
- Added `KEV_MODEL` (and `--model` on the experiment) so `kev:check`, eval, experiment and sim can all target another model.
- **Speed:** the first call took 40 s (model load); warm calls take ~40 ms. `kev:check` gives 8.9 calls/s at 8 concurrent, p50 0.9 s, **300 calls ≈ 34 s, inside the 90 s month.** That's the first setup that fits the 1,000-sim target.

| Golden eval | Overall | Scenario score | Top in character | Avoided | Personality pass | Pairs | Suite time |
|---|---|---|---|---|---|---|---|
| **d3 words** | **77%** | **88%** | **87%** | 93% | **94%** | **61% (11/18)** | 6 s |
| d3 focused | 72% | 90% | 90% | 93% | 94% | 44% | 5 s |
| Kev-4B words | 72% | 82% | 77% | 93% | 75% | 56% | 55 s |
| *heuristic* | *77%* | | | | *98% score* | *56%* | |

- d3 ties the heuristic overall and is **the first model to beat it on pairs**. `words` is again the best style.
- **Reads strongly:** archetype and persona text (picker→stocks +0.90, persona-only spender +0.65), all three memories (stock loss -0.18, business failure -0.11, raise +0.04), card debt (-0.26), age (+0.04).
- **Ignores:** traits alone, rates, crash, weak jobs, boom and vacancies. Every model so far misses market signals; that's now the clearest gap in the state or the suite.
- **Situation blind spots:** the unemployed sim still invests (90% avoid; laid-off pair -0.01), and an investor buys another rental while rentals sit empty (93% avoid). Personality overrides red-flag situations.
- **Very sharp distributions** (often > 0.9 on one move, e.g. 0.99 in a probe). With discipline-scaled sampling this means less variety than Kev; check archetype mixes in the experiment.

**d3:2b** (2.4B, Q8_0, 3.2 GB)
- 16.5 calls/s (p50 69 ms at concurrency 1), about 2× d3:4b. 300 calls take ~18 s.
- 66% overall with `focused` (61% with `words`), pairs 44%. Like Kev-0.8B, the small model prefers `focused`. It defaults to `invest_index` (the top pick in 12 of 30 scenarios with `words`), the way Kev-0.8B defaults to `nothing`. Not good enough to trade quality for speed.

**Ollama parallelism**
- Even with `OLLAMA_NUM_PARALLEL=4` confirmed on the desktop, d3 serves one request at a time. Throughput is flat at ~8.5/s from concurrency 2 to 16 while latency doubles, and the model loads at a byte-identical 6,337,593,343 bytes, so no extra slots were allocated. The cause isn't verified: it may be forced single-slot for vision or recurrent models, or the decision endpoint may not batch. vLLM (d3's home project) would batch, but needs WSL or Linux.

**Docs site** (GitHub Pages from `/docs`, theme `just-the-docs` as a remote theme)
- `docs/index.md` (home), `docs/results.md` (leaderboard, speed, pair and scenario matrices, findings, method), plus SPEC and WORKLOG with nav front matter.
- Raw results in `docs/results/data/<model>-<style>.json`. `npm run docs:results` regenerates the tables between the `<!-- generated:* -->` markers. To add a run, copy its JSON there (with a `model` field) and add the model to `MODELS` in `scripts/results-page.ts`.
- `npm run eval` now records `model` in its JSON and file name (`eval-kev-d3-words-...`). Host URLs are deliberately left out so LAN addresses don't get published.
- Not verified: the Jekyll build (no Jekyll on the Mac). Check the first GitHub Pages build.

**Next**
1. **Publish the docs**: create the GitHub repo, push, and enable Pages from `main` `/docs`.
2. **Market signals**: no model reacts to crash, boom or weak-jobs pairs, not even the heuristic. Rewrite the market line so it states consequences ("the index just fell 14%, a crash"), or check whether the pairs measure the right move. Then target the red-flag cases (an unemployed sim investing, buying rentals into vacancies).
3. **Experiment and a 24-month run with d3:4b** (fast enough now). Watch whether its sharp distributions reduce variety within an archetype.
4. Fine-tuning on golden-style labels with held-out scenarios, and profiling Kev's MLX per-call overhead, are both lower priority now that d3 on the desktop covers speed.

## Session 2 · 2026-11-21 (evening)

**Done**
- **Golden eval suite** (`packages/evals`): 30 scenarios + 18 counterfactual pairs authored by Claude Opus with rationales; scenario builder that uses the real rules engine; grader; `npm run eval` for random, heuristic and Kev, with `--style all` to compare state wordings; JSON + markdown reports in `evals-results/`.
- **World experiment** (`npm run experiment`): random vs heuristic (vs Kev) on the same seeds; personality separation and signature-move metrics.
- **Ledger**: every cash change goes through `post()`; per-sim monthly flows; shown on the dashboard.
- **Realism fixes**: full-time business owners quit their job (with a six-month runway requirement), side hustles don't; losing businesses close after six months; credit card limit, then past-due bills, then bankruptcy; debt-to-income counts rent; car price capped at half of income; inheritance to newcomers; leaner budget when out of work.
- **Connected economy**: sim landlords and sim tenants (matching, move-outs, rent cuts); business profit from residents' spending with crowding.
- **Resume** from yearly snapshots (`--resume`), byte-identical to a straight run.
- **Dashboard** (`npm run dashboard`, zero dependencies): archetype chart, leaderboard, decision explorer (probability bars, dice roll, what the model saw, filters for close calls / surprises / disagreements), sim panel (money in/out, what they own, life story).
- **State styles**: words / numbers / terse.
- **Tests**: 37 passing. Unit tests for moves, rules, policy, triggers, prompts and the grader; integration tests for 20-year ledger conservation, tenant/landlord consistency, files written, resume, Kev outage fallback, Kev disk cache, golden dataset validity, and heuristic beating random.

**Current state (seed 1, 200 sims, 50 years, heuristic)**
- 64 bankruptcies in 50 years (~0.6% of sims a year); homeownership 47–73% by archetype.
- Medians: index $2.7M, saver $2.6M, early retiree $1.9M, business owner $1.3M, real estate $1.2M, stock picker $963k, balanced $934k, status $819k, spender $308k.
- Eval baselines: random 15% overall, heuristic 77% overall (pairs 56%).
- Experiment baselines (3 seeds × 30 years): separation random 8%, heuristic 32%.

**Next**
1. On the Mac: `./scripts/kev.sh`, then `npm run kev:check` and `npm run eval -- --decider kev --style all --verbose`. Record the numbers here. This is the key result: does Kev beat 77%, and especially the heuristic's 56% on pairs?
2. `npm run experiment -- --deciders heuristic,kev --seeds 1 --years 10` for the world-level comparison.
3. Depending on results: pick the best state style as default; try Kev-4B; consider fine-tuning Kev on golden-style labels.
4. Then "Why?" probes, employment links to sim businesses, and the pixel town.

**Tuning notes**
- Wealth runs high across generations (inheritance compounds). Consider estate taxes or splitting estates.
- Bankruptcy is concentrated in business owners and status seekers; check whether that reads as believable in the dashboard.
- Rentals can oversupply (many rent cuts); real estate investors respond by buying fewer.

## Session 1 · 2026-11-21

**Done**
- Repo scaffold (npm workspaces, TypeScript via `tsx`, no native dependencies), `sim-core` engine, Kev gateway, CLI, `kev:check`, first 7 tests, first tuning passes (student and retiree cash flow, down payments from investments, today's dollars, home tiers, business profit scale, per-sim stock noise).

**Notes**
- Kev's default port is 8008; `scripts/kev.sh` uses 8009 to match the code (`KEV_URL` overrides).
- The device shell is a Linux VM, so Kev must be started from macOS Terminal to use the Apple GPU (MLX).
- Remote tools cannot write inside `.git`, so commits are made from your own terminal.
