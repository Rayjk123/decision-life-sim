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
| 1 | Decision model | Any `/v1/systemone` model behind one `Decider` interface (`--decision-url`, `--model` / `DECISION_URL`, `KEV_MODEL`). **Best so far: d3:4b on Ollama** (77% overall, 61% pairs, 8.5 calls/s on an RTX 4070 Super). Kev-0.8B/4B via `scripts/kev.sh` on the Mac | Open weights, self-hosted, and Kev, Jev and Ollama's d3 share the request shape, so swapping is config. See `docs/results.md` |
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
| 15 | Model evaluation | **Golden eval suite** (30 scenarios + 21 counterfactual pairs written by Claude Opus) graded automatically; a whole-world experiment measures personality separation | Kev has to beat heuristic and random before it earns its place |
| 16 | State wording | Four styles (`words`, `numbers`, `terse`, `focused`); **`words` is the default** | 4B models score best with `words`; models of about 2B or less prefer the shorter, persona-first `focused` |
| 17 | Taxes | **One crude progressive schedule**, marginal: 0% to $12k, 18% to $50k, 28% to $100k, 33% to $200k, 37% above (payroll folded in, no state tax). Effective ≈ 11% at $30k, 16% at $60k, 21% at $100k, 29% at $250k | Simple to compute and explain; a raise never cuts take-home (the old whole-income brackets did) |
| 18 | Spending | **A spend level 1–10, decided with the rest of the month** (a `spend_level` score question in the same model call, so no extra cost). Levels: 1 bare bones (essentials only) · 2–4 frugal→modest (5–15% of take-home on extras) · 5 normal (20%) · 6 treat (+$100–400) · 7 splurge (+$400–2,000) · 8 big purchase (+$2k–8k) · 9 major (+$8k–30k, e.g. a car bought outright) · 10 blowout (+$30k–80k, can go on the card). Amounts are a keyed random draw within the level's range. Personality sets the baseline (spender/status ~7, balanced ~5, saver ~3, early retiree ~2, scaled by the sim's saving habit); market, job news and recent events move it. The chosen level persists until the next decision | Spending is a personality trait and a choice, not a fixed share. Folding it into the existing call keeps it cheap |
| 19 | Setting | **A medieval market town** (user, 2026-11-22, to match the pixel town): gold crowns at the same numbers; the index fund is the **Guild Fund** (pooled, steady), stocks are **merchant ventures** (one ship or caravan, big swings), the savings account is the **counting-house vault**; cottages, townhouses and manor houses; cottages to let; a horse and cart; a tavern tab (the 24% card); medieval careers and businesses (the tech startup is an alchemist's workshop). Every word comes from `sim-core/src/theme.ts` and the tables in `data.ts`; **mechanics, numbers and ids are unchanged** (`invest_index`, `trade_stocks`, … stay) | The town's look and its numbers tell one story; one theme file keeps the wording consistent; unchanged ids keep logs, labels and golden expectations valid. Changes what the model reads, so model results are re-run and fine-tuned models retrained on re-sampled states (same towns, same labels) |
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
- 21 counterfactual pairs change one thing (archetype, persona text only, one trait, rates, a crash, a memory line, debt, unemployment, town vacancies, age) and require the measured probability to move the right way by at least 0.03. These show whether the model reads each part of the state.
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

**6. The pixel town.** The first Maple Hollow build uses a Canvas street grid and frames projected from the same simulation engine. The remaining roadmap includes:
- Follow view opens one of seven illustrated workplace interiors based on the resident’s career category and a cottage at dawn and after the evening walk home. Residents approach the door from the sidewalk and each interior visit has an arrival and departure animation, with a reduced-motion option. Quiet interiors add occasional posture changes and cottage hearth sparks. The town clock names the time of day, while the resident caption describes their own activity. The [UX loop](../packages/town/UX-LOOP.md) tracks improvements to the watch experience before deeper history and decision views.

- A month plays as a ~90 s "day in town": dawn commute, payday, midday errands driven by decisions, evening home. The next month's decisions are computed while the current month plays ("decide ahead, play behind"); a month stretches if decisions aren't ready. Playback speed and pause are local. Both preserve the current playhead and viewed month. After a local day ends, playback can start the most recently received month. Go live explicitly returns to the latest shared month and clock.
- Movement is computed in the browser from the street grid, each sim's home/work/errand lot and a shared seed, so every viewer sees identical paths and month files stay ~100–150 KB. On the illustrated block, civic errands lead across the bridge. Street zoom is relative to the fitted view. Street and Overview remember their cameras independently and preserve resident selection and playback when switching. Interiors are framed automatically, with a tighter resident-centered view when the canvas is taller than it is wide.
- Click a sim to follow it; side panel with life story and money; decision-model sidebar toggled off by default. UI mock-ups exist on claude.ai (Life Sim — Town UI). The scene has separate controls for following and opening the resident profile. Profiles and lists use the career label from the simulation. On phones, the profile shares the viewport with the scene.
- Town balances and balance changes display crowns. The town frame supplies display labels for market conditions, personalities and moves from the simulation's theme and data tables. Resident details, archived comparisons, counterfactuals and World use the same display labels.
- The checkpoint keeps current and pending scene frames and eleven compact historical balance snapshots. The resident profile loads up to twelve recorded months on demand, showing each month’s move and net-worth change. Expand a month for ending balances and cash and debt changes. Comparisons require the immediately previous month. Advanced shows the actual source, raw odds, ordered sampling odds, draw, winning interval, and recorded outcome when available. Exact sampling values are available in a separate disclosure. Expanded timeline rows show the same evidence for retained decisions and can compare a decision with the previous recorded one. New records capture the trigger, offered moves, and selected pre-decision inputs for that comparison. Live updates keep retained rows open and the focused control in view. Focus returns to Monthly timeline if the focused month expires, or to Advanced if its decision controls disappear. Older checkpoints begin collecting history from their current month. Browser memory stays bounded with capped feeds and on-demand details. Add a Playwright soak test that fails if the JS heap keeps climbing.
- The World panel labels the viewed month and loads a decision mix by personality and recorded source over retained months through that date. Final recorded outcomes, saved offers, and outcomes among those offers are counted by move kind. Older records without an archetype are counted separately. Reopening the mix refreshes the date range. The resident timeline refreshes retained rows and probe availability on shared-month changes or when reopened, including during paused local playback.
- New decision recordings capture the double-coin counterfactual before any monthly decisions execute. The checkpoint keeps heuristic comparison odds for the twelve-month timeline and model variant requests for the current and two most recent archived months, plus the unpublished pending month. Public frame and timeline responses expose availability only. What changes the odds? opens a read-only comparison for the recorded decision. The recorded heuristic and fallback use precomputed odds. Model decisions require a matching configured model, with bounded calls and cached results.
- World labels the configured decider by model name when available. The resident profile, history and decision mix still show which source actually answered each recorded decision, including heuristic fallback.
- Needs: a `town.json` map (streets, blocks, lots), lot assignment for homes, workplaces and businesses, and errand buildings per move (`ERRAND` in `worker/src/store.ts`).

**7. One shared world in the cloud.** One GPU box (RunPod RTX 4090 or L4, ~$250–290/month 24/7) running Kev + the worker; the read model on S3 + CloudFront; AWS CDK; pause the world after 15 minutes with no viewers; a spending guardrail. Hosted Jev ($0.042/M input tokens) is the no-GPU alternative: ~$0.08 per sim month at 1,000 sims, cheaper only for light viewing.

**7b. Our own decision model (later; user-triggered).** *Trigger:* tuning has plateaued: state wording, golden fixes, spend levels and prompt changes stop moving d3/Kev on the counterfactual pairs and the world-level realism metrics. Kev is Apache-2.0 and ships its recipe (`PLAN.md`, `kev.train`) and its training corpus (`evals/v7/decision-v7`), so in increasing cost:
1. **Fine-tune Kev** on our decisions (`--init_from jaredpalmer/kev-4b`; ~$1/run on Modal; needs 1,000–5,000 labelled sim states). Labels from a teacher LLM given the persona and our act-in-character rubric. Never train on golden scenarios; judge mainly by counterfactual pairs and world-level metrics, since Claude wrote the golden labels (circularity).
2. **Rerun Kev's recipe from the Qwen3.5 base** with our sim decisions mixed into decision-v7 (LoRA rank 16, 2 epochs, cross-entropy, temperature fit). 0.8B fits a 4 GB GPU (the 4070 Super under WSL); 4B needs an H100 for a few hours.
3. **Our own architecture** (pointer head over an LM's hidden states, or other) only if Kev's design blocks us, e.g. memory across decisions or batched serving on Apple Silicon.
Do level 1 before level 2: it shows whether our data teaches anything at all.

**8. Later / optional.** Personal goals per sim plus a second "life well lived" leaderboard (deferred: sims act in character for now); households and families; prediction market (out of v1); SQLite if the logs need querying; sims' trades moving prices.

## Open questions
- Endogenous prices (sims' buying moving stock and home prices).
- Households and families.
- Sims working for sim-owned businesses (employment links).
- Wealth may run high over generations because inheritance compounds; savers and index investors reach $2–3M medians on some seeds.
- Status seekers and business owners go bankrupt most; check that this is believable rather than a tuning artifact.
