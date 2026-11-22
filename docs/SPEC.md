---
title: Design spec
nav_order: 3
---

# decision-life-sim · Spec

A shared, watch-only pixel town where ~1,000 sims live out their financial lives month by month. Each sim's money decisions come from a **decision model** (Kev, self-hosted) instead of scripts, and the whole point of the tech demo is that you can see what the model weighed.

Status: milestones 1–2 built (engine, Kev gateway, CLI, golden eval suite, experiment, ledger, connected economy, dashboard). See `docs/WORKLOG.md` for progress.

## Decisions made

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Decision model | Any `/v1/systemone` model behind one `Decider` interface (`--kev-url`, `--model` / `KEV_URL`, `KEV_MODEL`). **Best so far: d3:4b on Ollama** (77% overall, 61% pairs, 8.5 calls/s on an RTX 4070 Super). Kev-0.8B/4B via `scripts/kev.sh` on the Mac | Open weights, self-hosted, and Kev, Jev and Ollama's d3 share the request shape, so swapping is config. See `docs/results.md` |
| 2 | Sim goal | **Act in character.** No explicit goals or optimization yet | Personal goals + a second leaderboard are a later option |
| 3 | Prediction market | **Out of v1** | Stocks, housing, cars, businesses first |
| 4 | Language | TypeScript for engine and worker (shared with the browser later). Python only inside Kev | The browser must replay the same paths and rules |
| 5 | Money | Integer cents, **today's dollars** (real terms, no inflation) | Comparable across 50+ years; returns are after inflation |
| 6 | Randomness | Every draw keyed by (seed, purpose, month, sim) | Exact replays; processing order never changes results |
| 7 | Legality | The **rules engine** builds legal moves with real costs; Kev only picks among them; executor re-checks | Kev can never buy what a sim can't afford |
| 8 | Call policy | **Events + staggered quarterly reviews** (`--policy events`), `monthly` available | ~1/3 of sims per month; laptop-friendly |
| 9 | Storage (v1) | Append-only NDJSON logs + yearly JSON snapshots, **no database yet** | Zero native dependencies; SQLite later if queries need it |
| 10 | Read model | Static files: `latest.json`, `months/N.json`, `people/ID.json`, `leaderboard.json` | Same layout locally and on S3/CloudFront; viewers never hit the worker |
| 11 | Population while building | 200 sims (CLI `--pop`), 1,000 is a flag | Fast iteration |
| 13 | Money auditing | Every cash change goes through `post(sim, kind, amount)`; `sim.flows` holds the month's totals | A test proves cash never appears or vanishes; the dashboard shows money in/out |
| 14 | Connected economy | Renters live in **sim-owned rentals** when one is free and affordable (else town apartments); business profit comes from **residents' spending** shared among all businesses, with crowding by type | The town's stories come from sims affecting each other |
| 15 | Model evaluation | **Golden eval suite** (30 scenarios + 18 counterfactual pairs written by Claude Opus) graded automatically; a whole-world experiment measures personality separation | Kev has to beat heuristic and random before it earns its place |
| 16 | State wording | Four styles (`words`, `numbers`, `terse`, `focused`); **`words` is the default** | 4B models score best with `words`; models of about 2B or less prefer the shorter, persona-first `focused` |
| 12 | Hosting (later) | One rented GPU (RunPod 4090/L4) running Kev + worker; S3 + CloudFront for files | ~$260–300/mo 24/7; viewers cost nothing extra |

## Kev request (exact shape)

`POST http://127.0.0.1:8009/v1/systemone`. `state` may be an object; Kev flattens it to `key: value` lines. Choice options are shown to the model as `name: description`.

```json
{
  "model": "kev-latest",
  "state": {
    "person": "Maya Chen, 34, nurse earning $78k a year",
    "personality": "A real estate investor. Comfortable with leverage, wants to own many rentals...",
    "traits": "risk taking medium, comfort with debt high, status seeking low, patience medium, discipline medium, follows the crowd low",
    "money": "cash $47k (keeps $10k as a cushion), index fund $22k, stocks $0, net worth $212k",
    "debts": "mortgage $150k at 6.1%",
    "monthly": "takes home $4.9k, spends about $4.1k, auto-invests 10% of what is left",
    "housing": "owns a $260k home",
    "property": "no rentals",
    "business": "no business",
    "market": "index fund +1.2% last month, home prices rising, mortgage rates 6.1%, jobs report weak",
    "recent": "Got a raise to $78k; Paid $3.1k in surprise repairs"
  },
  "questions": {
    "main": { "type": "choice", "instructions": "Acting true to Maya's personality and situation, what does Maya do with money this month?",
      "criteria": {
        "nothing": "Change nothing this month",
        "invest_index": "Put spare cash in a broad index fund (up to $37k available)",
        "buy_rental": "Buy a $180k starter rental: $41k down and closing, about -$80/mo after mortgage and costs" } },
    "invest_share": { "type": "score", "instructions": "If Maya invests or pays down debt this month, how much of the spare cash goes in?",
      "criteria": ["10% of spare cash", "25% of spare cash", "half of spare cash", "75% of spare cash", "all spare cash"] },
    "retire": { "type": "noul", "instructions": "Does Maya retire from work this month?" }
  }
}
```

- `invest_share` is only asked when an invest or pay-debt move is legal; `retire` only from 55 when retirement is affordable (or 67+).
- Response: `answers.main.probabilities` (per move id), `answers.invest_share.probabilities` (per level), `answers.retire.noul` (p(yes)), `usage.input_tokens`, `latency_ms`.
- Picking: probabilities are sharpened by the sim's discipline (temperature `0.35 + (1 - discipline) * 0.9`) and sampled with a seeded draw. The full spread, the draw and the heuristic's pick are logged for every decision.
- Market info is **public signals only** (index move, home price direction, rates, a noisy jobs report). The hidden regime is never sent.

## The month (one tick)

1. Market: hidden regime (expansion, boom, recession, crash) → index return, home price change, mortgage rate drift, noisy jobs signal.
2. Arrivals: the town fills up over 10 years; afterwards each death is replaced by a new 18-year-old.
3. Upkeep per sim: school loans accrue, careers start, raises, layoffs and rehiring, taxes, rent or home costs, living costs (archetype consumption share), loan payments, rentals (vacancy, rent), businesses (profit, failure, rare exits), repairs, auto-invest standing order, market moves on holdings, shortfalls → sell investments → credit card → missed payments → bankruptcy after 3.
4. Deaths at a hidden lifespan (triangular 35–95, peak 65) → Hall of Fame.
5. Decisions for triggered sims: legal moves → state + questions → decider → pick → validate → apply.
6. Publish the month.

## Data model (packages/sim-core/src/types.ts)

`World { seed, month, market, sims[], hallOfFame[] }` · `Sim { identity, traits, cash, index, stocks, assets[], loans[], creditScore, employment, autoInvestPct, memory[6] }` · `Asset { home | rental | car | business }` · `Loan { mortgage | auto | student | business | card }` · `DecisionRecord { answers, picked, draw, heuristicPick, valid, latencyMs, tokens }` · `SimEvent`.

## Economy rules (tunable numbers)

- Careers: 21, with start age, student debt, start and peak salary, layoff risk (`data.ts`). School months break even; tuition goes on a student loan repaid over 10 years.
- Archetypes: 9 (saver, index, picker, real estate, business, spender, status, early retiree, balanced) with persona text, trait averages (+ jitter per sim), consumption share and heuristic weights.
- Homes: starter $180k × home index; family 1.8×; luxury 3.5×. Sims look at the largest tier under ~3.5× salary (plus one tier up). 10% down + 3% closing, 30-year fixed, DTI ≤ 43%, carrying cost 2.7%/yr.
- Rentals: starter price, 20% down + 3% closing, rent 0.8% of price per month, investor rate +0.5%, lenders count 75% of rent.
- Purchases may sell investments for the down payment; the emergency floor (3 months of essentials; savers 6, spenders 1.5) is never touched.
- Businesses: 25 types (`data.ts`), profits scaled ×0.5, failure hazard highest in year one and in downturns, ≥$100k financed 80% over 10 years.
- Stocks: each sim's picks = 1.15 × index − 0.15%/mo + personal noise. Index investors usually beat stock pickers.
- Retirement: affordable early retirement or 67+; forced at 72. Retirees spend toward their lifestyle but within pension + 4% drawdown.
- Businesses: startups over $10k mean quitting the job (needs six months of essentials as runway on top of the startup cash); side hustles run alongside a job. Profit = range scaled by town demand, crowding of the same type, and the economy. Six losing months in a row and the owner closes it. Loans survive a closed business.
- Rentals: tenants are matched each month (45% chance per empty unit if an affordable renter exists, rent ≤ 40% of their income); 1% monthly move-outs (more in downturns); landlords cut rent 5% every 3 empty months.
- Debt: shortfalls sell investments, then go on the card up to its limit (30% of salary); anything beyond becomes past-due bills (+2%/month). Missed payments = past-due bills at month end. Three in a row means bankruptcy. Debt-to-income counts rent, except for a home purchase that replaces it.
- Inheritance: positive estates go to the next newcomer (90% after costs), who takes the family name.
- Out of work: the living-cost floor drops from $1,100 to $800.

## Evaluation

**Golden suite** (`packages/evals/golden/`, run with `npm run eval`). Written by Claude Opus as the reference for "acting true to this person's personality and situation".
- 30 scenarios in 4 categories: personality (16), situation (6), memory (3), lifecycle (5). Each lists the in-character picks (`best`), out-of-character picks (`avoid`, with a probability budget), ordering constraints, and for retirement cases a probability range. Each has a written rationale.
- Scenario score = 40% top pick in character + 30% stayed within the avoid budget + 30% constraints met (retirement takes a 25% share when graded). Pass at 0.7.
- 18 counterfactual pairs change one thing (archetype, persona text only, one trait, rates, a crash, a memory line, debt, unemployment, town vacancies, age) and require the measured probability to move the right way by at least 0.03. These show whether the model reads each part of the state.
- Overall = 60% scenario score + 40% pair pass rate.
- Baselines (words style): random 15% overall, heuristic 77% overall (98% on personality because its weights and the labels share an author; only 56% of pairs, since it ignores memory, debt and most market signals).

**World experiment** (`npm run experiment`): same seeds, different deciders, 30 years. Separation = average distance between archetypes' decision mixes; signature = share of decisions going to each archetype's own move. Baselines over 3 seeds: random separation 8% / signature 21%; heuristic 32% / 43%.

## Roadmap: proposed improvements (in priority order)

**1. ~~Validate Kev for real~~ (done in session 3; see `docs/results.md`).** So far Kev has only been tested against a mock server that copies its API shape from Kev's source. Run `kev:check`, the eval suite (all three state styles) and a short experiment on the Mac, and record the numbers in the worklog. Success bar: beat the heuristic's 77% overall, and especially its 56% on counterfactual pairs, which show whether Kev reads debt, memory and market signals.

**2. If Kev underperforms, in this order:** pick the best state style; shorten the state (fewer, sharper fields); try Kev-4B (`./scripts/kev.sh jaredpalmer/kev-4b`, ~32 GB Mac); fine-tune Kev on golden-style labels (Kev's repo supports fine-tuning). Keep the eval suite as the yardstick, and add scenarios where Kev fails in interesting ways.

**3. "Why?" for every decision card.**
- Counterfactual probes on demand: re-ask Kev with one field changed (persona, traits, money, market, memory) and show which fields moved the probabilities most.
- Side gauges asked in the same call: "How worried is X about money?", "How risky is this move for X?" (score questions).
- An option-order bias check with Kev's `/v1/systemone/permute`.
- Make clear in the UI that probes show what changes the answer, not the model's internal reasoning.

**4. Employment links.** Some sims work for sim-owned businesses; a business failure lays them off; a growing business hires. Completes the connected economy (rentals and local spending are already connected).

**5. Tuning backlog** (see the worklog for numbers):
- Wealth compounds across generations through inheritance: consider estate tax or splitting estates.
- Bankruptcy (~0.6%/yr) is concentrated in business owners and status seekers; check it reads as believable in the dashboard.
- Rentals can oversupply (frequent rent cuts); homeownership varies a lot by seed.
- Inflation, capital gains tax and progressive taxes are simplified (real terms, flat effective tax).

**6. The pixel town** (Phaser 3 + React), reading the same month files the dashboard uses:
- A month plays as a ~90 s "day in town": dawn commute, payday, midday errands driven by decisions, evening home. The next month's decisions are computed while the current month plays ("decide ahead, play behind"); a month stretches if decisions aren't ready.
- Movement is computed in the browser from the street grid, each sim's home/work/errand lot and a shared seed, so every viewer sees identical paths and month files stay ~100–150 KB.
- Click a sim to follow it; side panel with life story and money; decision-model sidebar toggled off by default. UI mock-ups exist on claude.ai (Life Sim — Town UI).
- Memory stays bounded: keep only last/current/next month, LRU-cache people files, pool sprites and pop-ups, cap feeds, pause on hidden tabs and jump to live on return. Add a Playwright soak test that fails if the JS heap keeps climbing.
- Needs: a `town.json` map (streets, blocks, lots), lot assignment for homes, workplaces and businesses, and errand buildings per move (`ERRAND` in `worker/src/store.ts`).

**7. One shared world in the cloud.** One GPU box (RunPod RTX 4090 or L4, ~$250–290/month 24/7) running Kev + the worker; the read model on S3 + CloudFront; AWS CDK; pause the world after 15 minutes with no viewers; a spending guardrail. Hosted Jev ($0.042/M input tokens) is the no-GPU alternative: ~$0.08 per sim month at 1,000 sims, cheaper only for light viewing.

**8. Later / optional.** Personal goals per sim plus a second "life well lived" leaderboard (deferred: sims act in character for now); households and families; prediction market (out of v1); SQLite if the logs need querying; sims' trades moving prices.

## Open questions
- Endogenous prices (sims' buying moving stock and home prices).
- Households and families.
- Sims working for sim-owned businesses (employment links).
- Wealth may run high over generations because inheritance compounds; savers and index investors reach $2–3M medians on some seeds.
- Status seekers and business owners go bankrupt most; check that this is believable rather than a tuning artifact.
