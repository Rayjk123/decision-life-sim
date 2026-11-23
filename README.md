<p align="center">
  <img src="docs/assets/icon.svg" width="96" height="96" alt="decision-life-sim icon: a pixel house with a gold coin">
</p>

<h1 align="center">decision-life-sim</h1>

<p align="center">
  A town of sims living out their financial lives month by month, with every money decision made by a small open-weights model running on your own machine.
</p>

<p align="center">
  <a href="https://rayjk123.github.io/decision-life-sim/"><b>Docs &amp; model results</b></a>
</p>

<p align="center">
  <a href="https://github.com/Rayjk123/decision-life-sim/actions/workflows/verify.yml"><img src="https://github.com/Rayjk123/decision-life-sim/actions/workflows/verify.yml/badge.svg" alt="verify"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white" alt="Node 20+">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/tests-37%20passing-brightgreen" alt="37 tests passing">
  <a href="https://rayjk123.github.io/decision-life-sim/results.html"><img src="https://img.shields.io/badge/best%20model-d3%3A4b%2077%25-8a2be2" alt="Best model: d3:4b, 77%"></a>
  <img src="https://img.shields.io/badge/runtime%20deps-0-lightgrey" alt="Zero runtime dependencies">
</p>

---

## Table of contents

- [What is it?](#what-is-it)
- [Features](#features)
- [Quick start](#quick-start)
- [Run E07m, the default decision model](#run-e07m-the-default-decision-model) · [how we trained it](docs/finetune/story.md)
- [Run with Kev](#run-with-kev-macos-apple-silicon)
- [How a month works](#how-a-month-works)
- [Evaluating the decision model](#evaluating-the-decision-model) · [full results](docs/results.md)
- [Interesting learnings](#interesting-learnings)
- [CLI options](#cli-options)
- [Output](#output)
- [Project layout](#project-layout)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## What is it?

Sims start out at 18 with a career, a personality and some student debt. Each month they get paid, pay rent or a mortgage, pick up repair bills, get raises or lose their jobs, and ride the markets. Every so often each sim decides what to do with their money: invest, pay down debt, buy a home, a rental or a car, start a business, or retire.

Three parts split up the work:

1. **The rules engine** (`packages/sim-core`) works out which moves are legal and what each one really costs. It also keeps the books: every cent that moves goes through a ledger.
2. **A decision model, Kev**, reads the sim's situation in plain language and assigns a probability to each legal move, according to what *this person* would do.
3. **A seeded dice roll** picks a move from those probabilities, so the same seed always replays the same world.

Kev never decides what is legal, so a sim can't buy something it can't afford. A hand-tuned heuristic and a random decider run behind the same interface, which gives every model a baseline to beat.

The aim is a tech demo where you can see what the model weighed. Every decision card shows the probability spread, the dice roll, the exact state the model saw, and what the heuristic would have picked.

## Features

- **Deterministic world.** Every random draw is keyed by `(seed, purpose, month, sim)`, so the order sims are processed in never changes the results. Resuming from a snapshot gives byte-identical output to a straight run.
- **Audited money.** All amounts are integer cents in today's dollars. A test runs 20 years and proves that no cash appears or vanishes.
- **Connected economy.** Renters live in rentals owned by other sims, business profits come from residents' spending (shared out with crowding by business type), and estates pass to newcomers.
- **Realistic money mechanics.** 21 careers and 9 personality archetypes, plus market regimes (expansion, boom, recession, crash), 30-year mortgages with debt-to-income limits, credit cards, past-due bills, bankruptcy, 25 business types, and early retirement.
- **Golden eval suite.** 30 scenarios and 21 counterfactual pairs, graded automatically, check whether a model acts in character *and* reads each part of the state.
- **Zero-dependency dashboard.** Leaderboard, archetype chart, a decision explorer with filters for close calls, surprises and disagreements with the heuristic, plus each sim's life story.
- **Laptop-friendly.** 50 years × 200 sims takes about 10 s in heuristic mode. Kev answers are cached on disk, so replays never call the model again.

## Quick start

Requires **Node 20+**. No model is needed for the heuristic mode.

```bash
git clone <this repo> && cd decision-life-sim
npm install
npm test                                  # 37 tests

npm run sim -- --months 600 --pop 200     # 50 years, 200 sims, about 10 s
npm run dashboard                         # http://localhost:5173
```

```bash
npm run eval -- --verbose                 # grade random + heuristic on the golden suite
npm run experiment                        # whole-world comparison across seeds
```

## Run E07m, the default decision model

E07m is our own fine-tuned decision model (a 4.7B LoRA fine-tune of Qwen3.5-4B, Apache-2.0). It runs on [llama.cpp](https://github.com/ggml-org/llama.cpp) (build b11443 or newer, which has the `/v1/systemone` decision API), on a Mac, Linux or Windows, GPU or CPU:

```bash
# 1. get llama.cpp (prebuilt: github.com/ggml-org/llama.cpp/releases) and the model files from https://huggingface.co/bdleecs95/decision-life-sim-e07m
hf download bdleecs95/decision-life-sim-e07m gguf/model-Q4_K_M.gguf gguf/mmproj-Q8_0.gguf --local-dir e07m && cd e07m/gguf
llama-server -m model-Q4_K_M.gguf --mmproj mmproj-Q8_0.gguf --port 8010 -c 16384 -b 4096 -ub 4096   # 2.6 GB; big batch: it reads each request in one pass
# 2. point the town at it
export DECISION_URL=http://localhost:8010
npm run sim -- --decider model --months 24 --pop 200
npm run eval -- --decider model --style words      # reproduces 77% overall / 57% pairs (~1.2 decisions/s on an M3 Pro; ~13/s on an RTX 4070 Super)
```

Model, data and card on Hugging Face: **[bdleecs95/decision-life-sim-e07m](https://huggingface.co/bdleecs95/decision-life-sim-e07m)** (upload pending: the account is being set up) (source of the card: [`research/finetune/release/MODEL_CARD.md`](research/finetune/release/MODEL_CARD.md)); the training data and the labelling rubric are published with it. With a GPU and Python you can also load the merged weights with Unsloth (`FastDecisionModel.from_pretrained`).

## Run with Kev (macOS, Apple Silicon)

Also requires git and [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`).

**Terminal 1:** start the Kev server. The first run clones Kev into `.kev/`, installs its Python environment and downloads the weights. On Apple Silicon it runs on the GPU through MLX.

```bash
./scripts/kev.sh                          # Kev-0.8B on http://127.0.0.1:8009
./scripts/kev.sh jaredpalmer/kev-4b       # bigger model, needs about 32 GB of RAM
```

**Terminal 2:**

```bash
npm run kev:check                                        # one real decision vs the heuristic, plus throughput
npm run eval -- --decider model --style all --verbose      # Kev on the golden suite, three state wordings
npm run experiment -- --deciders heuristic,model --seeds 1 --years 10
npm run sim -- --decider model --months 24 --pop 200       # two years with Kev (add --resume to continue)
```

## How a month works

```
market ─▶ arrivals ─▶ upkeep ─▶ deaths ─▶ decisions ─▶ publish
  │          │           │                    │
  │          │           │                    └─ legal moves → state → Kev → seeded pick → re-check → apply
  │          │           └─ pay, rent/mortgage, loans, rentals, businesses, repairs, shortfalls → card → bankruptcy
  │          └─ the town fills over 10 years; afterwards each death brings an 18-year-old newcomer
  └─ hidden regime → index return, home prices, rates, a noisy jobs report (only public signals reach the model)
```

Not every sim decides every month. Decisions come from life events plus staggered quarterly reviews, which works out to about a third of the town each month.

## Evaluating the decision model

Claude Opus wrote the golden dataset in `packages/evals/golden/` as a reference for "acting true to this person's personality and situation". Each entry includes a written rationale.

| | |
|---|---|
| **30 scenarios** | personality (16), situation (6), memory (3), lifecycle (5). Each lists in-character picks, out-of-character picks with a probability budget, and ordering constraints. |
| **21 counterfactual pairs** | Each pair changes one thing (archetype, persona text, a trait, rates, a crash, a memory, debt, unemployment, vacancies, age) and requires the probability to move the right way by at least 0.03. |
| **Score** | 60% scenario score + 40% pair pass rate. A scenario passes at 0.7. |

**Results** (full tables, per-pair and per-scenario breakdowns in [`docs/results.md`](docs/results.md))

| Decider | Ran on | Overall | Counterfactual pairs | Speed |
|---|---|---|---|---|
| **E07m** (ours, 4.7B fine-tune) · default | RTX 4070 Super | **77%** | **57%** | ~13 decisions/s |
| d3:4b (4.8B, Ollama) | RTX 4070 Super | 70% | 48% | 8.5 decisions/s |
| Heuristic | CPU | 83% | 67% | instant |

Scores on the medieval golden suite (Nov 2026). Older models (Kev, d3:2b) were measured on earlier wording; see the results page. How E07m was trained, with every trial and lesson: [docs/finetune/story.md](docs/finetune/story.md).

Any model that speaks the `/v1/systemone` decision API can be swapped in with `--decision-url` and `--model` (or `DECISION_URL` / `DECISION_MODEL`; the older `--kev-url` / `KEV_URL` / `KEV_MODEL` still work). Ollama serves d3 on that endpoint, so it works unchanged:

```bash
npm run eval -- --decider model --decision-url http://<ollama-host>:11434 --model d3
```

The world experiment also measures "world separation", the average distance between archetypes' decision mixes over 30-year runs: random 8%, heuristic 32% (3 seeds).

## Interesting learnings

- **To train a better decision model, change the teacher, not the training.** The same small model scored 62% on gold decisions trained on the hand-written rules' answers, 61% on d3's, and 96% on answers written to a careful rubric; more data added a point. Then the independent test caught what the gold test couldn't (the model never took a good deal, because the training towns rarely offered one), and targeted data plus a 4B base produced E07m, the first model to beat d3. [The story](docs/finetune/story.md).

- **A baseline can grade well because its author also wrote the test.** The heuristic scores 98% on personality scenarios, mostly because its weights and the golden labels come from the same author. Counterfactual pairs expose it: at 56%, they show that it ignores memory, debt and most market signals. Pairs are the honest test of whether a model *reads* the state.
- **Index investors beat stock pickers, as they do in real life.** Each picker's portfolio is modelled as 1.15 × the index minus fees plus personal noise. Over 50 years, the median index investor ends with about $2.7M and the median stock picker with about $963k.
- **Inheritance compounds.** Estates pass to newcomers, so the richest family lines keep getting richer. Savers and index investors reach $2–3M medians on some seeds. An estate tax or split estates is on the tuning list.
- **Bankruptcy clusters by personality.** It runs at about 0.6% of sims a year, concentrated among business owners and status seekers. That matches intuition, but it might also be a tuning artifact, and it's being checked against the dashboard stories.
- **Keyed randomness pays for itself.** With one RNG stream per `(seed, purpose, month, sim)`, async model calls, parallelism and resuming can't change outcomes, which made replay and resume tests trivial to write.
- **The model never touches legality.** Moves come with their real costs written into their descriptions, and the executor re-checks every pick. A model that misreads the state makes an odd choice, never an impossible one.

## CLI options

| Flag | Default | Meaning |
|---|---|---|
| `--months` | 600 | Months to simulate |
| `--pop` | 200 | Target population |
| `--seed` | 1 | World seed (same seed = same world) |
| `--decider` | heuristic | `heuristic` or `kev` |
| `--decision-url` | http://127.0.0.1:8009 | decision model server: Kev, Ollama (d3) or a fine-tuned model (or `DECISION_URL`; `--kev-url` / `KEV_URL` still work) |
| `--policy` | events | `events` (quarterly reviews + life events) or `monthly` |
| `--style` | words | State wording sent to the model: `words`, `numbers`, `terse` |
| `--resume` | off | Continue from the latest yearly snapshot in the output folder |
| `--concurrency` | 8 | Parallel Kev requests |
| `--out` | world | Output folder |

## Output

Each run writes `world/seed-<seed>-<decider>/`, or `world/seed-<seed>-<model>/` for a non-default model (e.g. `seed-1-d3`). Every decision records the `model` that answered:

- `log/events.ndjson`, `log/decisions.ndjson`: full history, one JSON object per line
- `snapshots/month-N.json`: the whole world every 12 months (used by `--resume`)
- `public/latest.json`, `public/months/N.json`, `public/decisions/N.json`, `public/people/<id>.json`, `public/leaderboard.json`, `public/stats.json`: the static read model the dashboard (and later the pixel town) reads
- `kev-cache.ndjson`: cached Kev answers, so replays never call Kev again

## Project layout

```
packages/sim-core   the world: rules, ledger, markets, rentals, businesses, decisions (pure, deterministic)
packages/worker     Kev gateway, storage, resume, CLI, experiment
packages/evals      golden dataset, grader, eval runner
packages/dashboard  zero-dependency local dashboard
scripts/kev.sh      starts a local Kev server
docs/               GitHub Pages site: results, spec, work log (npm run docs:results regenerates tables)
docs/SPEC.md        every design decision and the roadmap
docs/WORKLOG.md     progress, current numbers, next steps
```

## Roadmap

1. ~~Validate a decision model on real hardware~~ (done: d3:4b ties the heuristic overall and beats it on pairs)
1. Make models read market signals: no model reacts to crashes, booms or weak jobs reports yet
2. "Why?" for every decision card: counterfactual probes, side gauges, an option-order bias check
3. Employment links: sims working for sim-owned businesses
4. A watch-only pixel town (Phaser 3 + React) that replays the same month files
5. One shared world in the cloud

Details are in [`docs/SPEC.md`](docs/SPEC.md#roadmap-proposed-improvements-in-priority-order).

## Contributing

Issues and pull requests are welcome. A few house rules keep the world honest:

- Every cash change goes through `post(sim, kind, amount)` in `ledger.ts`.
- Never use `Math.random`; use `rngFor(seed, purpose, month, simId)`.
- New moves go in `rules.ts` (with real costs in the description), get applied in `executor.ts`, and are taught to `heuristic.ts`.
- `npm test` must pass, including the check that every golden scenario's expected options are still legal.

## License

[MIT](LICENSE)
