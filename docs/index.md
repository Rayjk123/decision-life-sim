---
title: Home
nav_order: 1
---

# decision-life-sim
{: .fs-9 }

A town of sims living out their financial lives month by month. Every money decision comes from a small, open-weights decision model running on your own hardware.
{: .fs-6 .fw-300 }

[Model results](results.md){: .btn .btn-primary .mr-2 } [Design spec](SPEC.md){: .btn .mr-2 } [Work log](WORKLOG.md){: .btn }

---

## How it works

1. **The rules engine** works out which moves are legal for a sim this month (invest, pay down debt, buy a home, a rental or a car, start a business, retire) and what each one really costs.
2. **A decision model** reads the sim's situation in plain language and gives each legal move a probability, according to what *this person* would do.
3. **A seeded dice roll** picks from those probabilities, so the same seed replays the same world exactly.

The model never decides legality, so a sim can't buy what it can't afford. Any model that speaks the `/v1/systemone` decision API can be plugged in: Kev (served locally with MLX on a Mac) or d3 (served by Ollama on a gaming PC) work unchanged.

## Headline results

| | Overall | Counterfactual pairs | Speed |
|---|---|---|---|
| **d3:4b** on an RTX 4070 Super | **77%** | **61%** | 8.5 decisions/s |
| Kev-4B on an M3 Pro | 72% | 56% | 1.1 decisions/s |
| Hand-tuned heuristic | 77% | 56% | instant |
| Random | 15% | 6% | instant |

d3:4b is the first model to match the heuristic overall and beat it on the counterfactual pairs, which test whether a model actually *reads* each part of a sim's state. It's also the first fast enough for the full 1,000-sim town (a month in about 35 s). See [the full results](results.md) for every model, every scenario and what each model ignores.

## Pages

- **[Model results](results.md)**: leaderboard, speed, pair-by-pair and scenario-by-scenario comparisons, and what we learned.
- **[Design spec](SPEC.md)**: every decision made, the economy rules, the eval design and the roadmap.
- **[Work log](WORKLOG.md)**: progress by session, with the raw numbers behind every result.
