---
title: Improvement loop
nav_order: 5
---

# The improvement loop

An autonomous loop that keeps making decision-life-sim more realistic, more impressive and more trustworthy, one verified change at a time. A scheduled job fires a run every 30 minutes while the Claude Code session is open and idle. Each run reads this file and does **exactly one iteration**.

**Goal:** continuous self-improvement of the simulation, the decision model's behaviour, the UX and the codebase, with a quality bar that keeps regressions out.

**Stance:** act as the owner. Pick the change that most improves what someone sees when they open the town or the results page, as long as it can be verified.

## Guardrails (never break these)

- Work only on the **`improve/loop`** branch. Never commit to or push `main`, never force-push, never rewrite pushed history. `main` is merged by the human.
- Push the branch at the end of every iteration (`git push -u origin improve/loop`). The repo is public: never commit secrets, LAN addresses (`192.168.*`), tokens or personal data. Use `<ollama-host>` in docs.
- Never delete `world/`, `.kev/` or results data. Never kill processes this loop didn't start (Kev on :8009 and the dashboard on :5180 may be serving the human).
- The desktop Ollama (d3) may be offline. Probe it with a 5 s timeout. If it's down, skip model evals and say so; never block on it.
- One iteration = one coherent change, small enough to verify in the same run. If a change is too big, split it and do the first slice.
- If a gate fails and can't be fixed in this iteration, revert the change (`git restore`), record why in the backlog, and pick something else.
- Stay inside the conventions in `CLAUDE.md`: money in cents through `post()`, keyed RNG only, the model never decides legality.

## One iteration

1. **Orient (≤ 2 min).** `git switch improve/loop && git pull --ff-only`. Read the top of `docs/WORKLOG.md`, the [Iteration log](#iteration-log) and the [Backlog](#backlog) below. Check `git status` is clean, or finish or stash what's there.
2. **Pick.** Take the highest-priority unblocked backlog item. Every 4th iteration is an **adversarial review** iteration instead (see below). If the backlog is empty, generate new items from the review lenses.
3. **Plan.** Write 3–6 lines in the iteration log: what, why it matters, how it will be verified.
4. **Build** with tests. New behaviour gets a test. Every bug fixed gets a regression test written first.
5. **Verify:** run `npm run verify` (G1–G9 except d3 evals). Run G6 for d3 by hand when the desktop is reachable. All gates must pass. If quality improved, raise the floors in `scripts/verify.baseline.json`; never lower them.
6. **Self-review the diff** (`git diff main...`) against the review lenses. Fix what you find.
7. **Record:** update the iteration log (result, numbers), the backlog, `docs/WORKLOG.md` when numbers changed, and `docs/results.md` via `npm run docs:results` when evals changed.
8. **Commit and push** with a clear message and the session's attribution trailer. Check CI: `gh run list --branch improve/loop --limit 1`, and if it's red, fixing it is the next iteration's first job. Then stop; don't start a second iteration in the same run.

## Verification gates (the quality bar)

| Gate | Command | Passes when |
|---|---|---|
| G1 Types | `npm run typecheck` | no errors |
| G2 Tests | `npm test` | all pass (count never goes down) |
| G3 Determinism | in G2 (same seed replays; resume byte-identical) | stays green; every new random draw uses `rngFor` |
| G4 Money conservation | in G2 (20-year ledger test) | cash never appears or vanishes |
| G5 Golden validity | in G2 | every scenario's expected options are legal |
| G6b Golden requests | `npm run eval:fingerprint` (in `verify`) | the 192 golden requests (48 × 4 styles) match `docs/results/data/golden-fingerprint.json`, so the published model results are still valid; accept a change only after re-running model evals or marking results stale |
| G6 Eval regression | `npm run eval` (in `verify`); d3 when reachable: `npm run eval -- --decider kev --kev-url http://<ollama-host>:11434 --model d3 --compare docs/results/data/d3-4b-words.json` | heuristic ≥ 77% / pairs ≥ 56%; d3:4b `words` doesn't drop > 2 points overall or on pairs vs `docs/results/data/d3-4b-words.json` |
| G7 Sim health | `npm run health` (in `verify`) | a 50-year heuristic world over 3 seeds stays inside realism bands (bankruptcy, homeownership, wealth medians, unemployment, no NaN or negative balances that shouldn't exist) |
| G8 Performance | `npm run health` (in `verify`) | each 50-year, 200-sim heuristic world finishes within `secondsPerRunBudget` (6 s; ~1 s today) |
| G9 Docs | `npm run docs:results` | regenerates without error; no `192.168` in tracked files |
| G10 Adversarial | review lenses below | no unresolved high-severity finding |

The first backlog items build the missing gates (`verify`, `health`, CI) so every later iteration is checked automatically.

## Review lenses (adversarial review iterations)

Attack the project as a skeptic would, and file each finding as a backlog item with a severity:

- **Exploits in the rules:** can a sequence of legal moves mint money, dodge a loan, own a negative-value asset, or bankrupt without consequence? Write a randomized property test that plays random legal moves and checks invariants.
- **Realism:** does anything a viewer would see feel fake? Check wealth spread, bankruptcy causes, homeownership by age, retirement ages and business survival against rough real-world figures, and read 5 random life stories end to end.
- **Model behaviour:** where does d3 act out of character (unemployed sims investing, buying rentals into vacancies)? Are market signals ignored? Does it ever pick a move whose description it should have rejected?
- **Eval integrity:** could a change game the golden suite? Is the heuristic still circular? Add held-out scenarios when you change the state wording.
- **UX:** open the dashboard (`http://127.0.0.1:5180`; another app owns `localhost:5180` over IPv6) and the docs site. What's confusing, slow, or lying (for example, the provider label says "kev" while d3 is running)?
- **Software-factory fitness:** could another agent add a move, a decider, a scenario or a chart from the docs alone? Are module boundaries clean, configs declarative, and failures loud?

## Backlog

Priority order. Size: S (< 1 iteration), M (1–2), L (split it). Move done items to the log.

**A. Verification infrastructure (do first)**
1. ~~(S) `npm run verify`~~ done in iteration 1.
2. ~~(M) `npm run health`~~ done in iteration 2 (part of `verify`).
3. ~~(S) GitHub Actions CI~~ done in iteration 3 (`.github/workflows/verify.yml`).
4. ~~(M) Randomized property test~~ done in iteration 4 (`packages/worker/test/adversarial.test.ts`).
4b. ~~(S) Cross-sim money conservation~~ done in iteration 5. each month, total `rent_received` by sim landlords equals total rent paid by sim tenants, and estates paid out equal estates left (minus the 10% costs). The per-sim ledger can't see money created *between* sims.
4c. ~~(S) More adversaries~~ done in iteration 6.
5. ~~(S) Eval regression check~~ done in iteration 7 (`npm run eval:compare`, `npm run eval -- --compare <baseline>`).

**B0. Found in the first 20-year d3:4b world** (seed 1, 200 sims, 9,386 decisions, 0 fallbacks, 17.5 min)
- (M, high) **Business owners pick `trade_stocks` 75% of the time** and start a business only 5%. Spenders also trade stocks 41%. d3 seems to read "business/entrepreneur" as "active investing". Probe with `/permute` and counterfactuals, then fix the move descriptions or the persona text, and add a golden scenario that pins it.
- (M) **Real estate investors buy rentals only 8%**, but invest in the index 48%. Check whether rentals are rarely legal (cash and DTI), or legal but rejected; measure legality rate vs pick rate per archetype.
- (S) Agreement with the heuristic ranges from 6% (business owner) to 99% (index investor). Add this per-archetype table to the dashboard and the results page as a behaviour fingerprint.
- Healthy signs to keep: early retirees lead (median $319k), spenders trail ($55k), and bankruptcies are rare (6 in 20 years).

**B. Simulation realism and impressiveness**
- ~~(S) Business values are static~~ done in iteration 10. Every snack cart used to be worth exactly $15,000 for its whole life. Value businesses from recent profit (a multiple of trailing profit), so winners and losers show in net worth.

*Realism gaps measured by `npm run health` (heuristic, seeds 1–3, 50 years). Fix, then tighten the bands in `scripts/health.baseline.json` toward the target:*
- (M, high) **Wealth is too high:** median adult net worth is $0.39M–1.52M in today's dollars, against roughly $190k in reality. Target ≤ $400k on every seed. *Iteration 13: the main driver was whole estates going to one 18-year-old (median 18–29 net worth $879k). Estates are now split among 1–4 heirs, giving $0.29M–1.27M; the 18–29 median is $380k. What remains sits with people in their 60s ($1.4M median on seed 1): check the savings rate (18–23% of lifetime income invested), real index returns, and whether retirees ever draw their investments down.*
- (M, high) **Everyone invests:** every sim puts 18–23% of income into investments. In the US about 40% of households own no stocks and many save almost nothing. Give savings and participation real spread (spenders and low earners rarely invest; some never open an account; emergencies drain savings). Probably the biggest remaining lever on both the median and Gini.
- (M) **Inflation, done honestly** (the user's suggestion; the engine stays in real dollars): (a) idle cash loses ~2.5%/yr real unless it sits in a savings account; (b) loan rates are nominal-looking (~6.2% mortgage) but applied in a real-terms model, so debt is too expensive. Use real rates, or carry nominal fixed-rate debt that inflation erodes. Measured real index return is 4.6–5.3%/yr on seeds 1 and 3 (historical US ~6–7%), so returns are not the wealth problem.
- (S) **Nominal display mode** for the dashboard: show prices and salaries rising with ~2.5% inflation over the decades (the engine keeps computing in today's dollars), with a toggle back to today's dollars.
- (M) **Lumpy age pyramid:** the town arrives at 18 during its first 10 years, so 50 years later seed 1 has 86 sims in their 60s and 3 in their 40s. Seed the initial town with a realistic age mix (and matching wealth and careers), which also makes early years less empty.
- (M, high) **Wealth is too equal:** Gini 0.47–0.54, against about 0.85 for US wealth. Needs fatter tails (renters with nothing, debt, heirs vs non-heirs). Target 0.65–0.85. *Iteration 10: business quality and valuation did **not** move Gini (businesses are too small a share of wealth). Look at savings rates, inheritance going to one newcomer, and the floor (nobody ends with nothing).*
- ~~(S) **People retire too early**~~ fixed in iteration 11 (90-year median 57 → 62).
- (S) No one retires at 62–66 (6%): real people often claim reduced Social Security at 62. Add a reduced benefit from 62 (about 70% of the 67 amount) and let the retire decision weigh it.
- (S) Health's `medianRetirementAge` is biased young by the 50-year window (the oldest sim is ~68, so normal-age retirements are barely observed). Measure retirement from a longer run, or as the share of sims reaching 67 who retired before 60.
6. (M) Market signals the model can read: describe crashes, booms and rates as consequences ("the index fell 14% last month, the worst drop in years"), then rerun the market pairs. Target: d3 passes ≥ 2 of crash, weak-jobs, boom.
6b. (S) The `focused` style drops d3's memory reading: `eval:compare` shows memory-raise flipping sign (+0.044 → −0.043) and memory-biz-failed collapsing (−0.111 → +0.008) against `words`. Check whether `focused`'s memory dedupe or truncation to 4 lines hides the memory, before any state-wording change ships.
7. (M) Red-flag situations: make unemployment, card debt and vacancies salient in the state; add golden scenarios for them. Target: S-unemployed and S-rentals-empty pass with d3.
8. (L) Employment links (SPEC roadmap 4): sims work at sim-owned businesses; failures cause layoffs; growth hires.
9. ~~(M) Estate splitting~~ done in iteration 13 (1–4 heirs; estate tax only matters for estates far above town sizes).
10. (M) Life events with texture: marriage or partner income, children's costs, health shocks. Keep each behind keyed RNG and the ledger.
11. (S) A d3:9b eval if it fits in 12 GB (Ollama lists ~10 GB).

**C. UX**
- (S) Life stories list raw month numbers ("92 Paid down $394") with no age or year. Show "age 25 · year 8" and group repeats ("Paid down debt ×9").
12. ~~(S, high)~~ done in iteration 9. Decision records, people files and the dashboard say `provider: "kev"` for every d3 decision (confirmed in the 20-year d3 world). Record the model name in each DecisionRecord and show it on cards and headers.
13. (M) Dashboard "why" panel: per-decision counterfactual probe (re-ask with one field changed) for d3 (SPEC roadmap 3).
14. (M) Results page: a chart of the decision mix by archetype per model (from the experiment), and a life-story gallery.
15. (L) The pixel town (SPEC roadmap 6), started as a slice: the static map plus sims walking home and work on month ticks.

**D. Performance**
16. (S) Decision cache hit-rate and latency percentiles shown in the sim CLI summary and the dashboard.
17. (M) Run the 1,000-sim world with d3:4b and record month time. Target ≤ 90 s.

**E. Software-factory structure**
- (M) Move `scripts/verify-lib.ts` and `scripts/health-lib.ts` into a `packages/qa` workspace. Tests currently import from `scripts/` across package boundaries.
- (S) Eval integrity: hold out 6 golden scenarios that no prompt or style change is tuned on, and report them separately on the results page.
18. (M) A decider registry and config (`deciders.json`: name, url, model, style), so a new model is config, not code. Record the model in every decision log line.
19. (S) `CONTRIBUTING.md` recipes: add a move, a decider, a golden scenario, a chart. Plus a PR template carrying the gate checklist.

## Iteration log

| # | Date | Type | Change | Gates | Result |
|---|---|---|---|---|---|
| 0 | 2026-11-21 | setup | Loop created; branch `improve/loop`; backlog seeded | G1–G2 green, 37 tests | d3:4b 77% / 61% pairs is the bar |
| 1 | 2026-11-22 | build (A1) | `npm run verify`: one command for types, tests (with a floor on the count), deterministic heuristic eval regression, docs-in-sync (`docs:results --check`) and a leak scan (LAN IPs, GitHub/API tokens, private keys) over tracked files. Floors in `scripts/verify.baseline.json`; `scripts/` now typechecked; 3 tests for the gate's own logic | verify green in 2.7 s; 40 tests | Proven by planting 4 faults (LAN IP, stale generated table, failing test; prose outside generated blocks is allowed). Also: the 20-year d3:4b world finished, 9,386 decisions, 0 fallbacks, 17.5 min; findings in backlog B0 |
| 2 | 2026-11-22 | build (A2) | `npm run health` (G7 + G8, now inside `verify`): 3 seeds × 50 years × 200 sims, in memory, heuristic. Integrity scan over the whole world (finite numbers, whole cents, no negative debts, assets or holdings), 7 realism bands, 6 s/run budget. 3 tests incl. planted NaN, fractional cents and negative debt | verify green in 5.8 s; 43 tests | Breach proven by narrowing a band. Health found 3 realism gaps (wealth too high, too equal, retirement at 56–57), now top of backlog B |
| 3 | 2026-11-22 | build (A3) | GitHub Actions `verify` workflow on every push and PR, Node 20 + 22 matrix, `npm ci && npm run verify -- --all`; CI badge in the README | CI green on both (run 44993509432): 12.6 s / 18.0 s | Identical eval numbers on Node 20, 22 and macOS (cross-platform determinism). CI runners are ~2.5× slower: health ≈ 2.5 s/run against the 6 s budget. Gotcha: `npm ci --dry-run` deleted `node_modules` locally; don't use it as a check |
| 4 | 2026-11-22 | adversarial review | Property test with two hostile deciders (uniform random; max-leverage: biggest purchase, all-in, retire ASAP), every sim every month, 3 seeds × 30 years, checking ledger, integrity, tenancy symmetry, one home, collateral, bankrupt borrowing and cash ≥ 0. **Bug fixed:** buying a home didn't end the sim's tenancy until next month's rental settlement, so every snapshot (dashboard, yearly saves) could show a sim owning a home while renting someone's unit, and vacancy counts were off. Rent was never double-charged (settlement runs before upkeep), so no money was created. Now ended at purchase in the executor | verify green 7.1 s; 45 tests; CI checked | Test proven to fail without the fix. One false alarm was my own off-by-one (`bankruptUntil` means "before this month"). Filed: cross-sim money conservation (4b), more adversaries (4c), a `packages/qa` boundary, held-out eval scenarios. Health metrics unchanged |
| 5 | 2026-11-22 | build (4b) | Cross-sim money checks in the adversarial test: (1) every occupied unit's rent equals what its tenant pays (no drift, so the landlord can't collect a different amount than the tenant pays); (2) each month, rent received by sim landlords ≤ rent paid; (3) over 30 years, inheritances paid equal the rounded 90% of every estate distributed, FIFO, with the rest still queued, plus a guard that at least one estate was distributed | verify green; 45 tests (2 strengthened); CI checked | No bugs: rent only changes on vacant units by design, and estates balance to the cent. Proven by planting 95% inheritance (caught as an exact mismatch) and rent raises on occupied units (caught as drift). The rent-minted bound alone wouldn't catch drift, because town-apartment rent hides it; the per-unit check does |
| 6 | 2026-11-22 | build (4c) | Two more hostile deciders, *churner* (sell any rental, else buy one, start businesses, buy cars) and *never-pays* (never pays off or invests; cars and homes; never retires), via a `prefers(order)` factory. Each adversary must now **reach** its target paths (e.g. churner: sold_rental; never-pays: missed_payment + bankrupt) or the test fails. Added a 65-year life run (random, seed 14) that must reach retirement, death and inheritance. **Bug fixed:** when a landlord or tenant died, their tenancies lingered until next month's settlement, so snapshots showed sims renting from the dead. `releaseTenancies` now ends them both ways at death | verify green 9.6 s; 48 tests; CI checked | The coverage guard caught that 30-year runs never reach old age (max age 48), so retirement at 72, deaths and estates were never stressed; the long-life run found the death bug on its first try. No money was misrouted (settlement runs before rent) |
| 7 | 2026-11-22 | build (A5) | `packages/evals/src/compare.ts`: compares two eval runs, giving headline deltas, a regression verdict (> 2 pts on overall, pairs or scenario score) and every scenario and pair that flipped pass/fail with the before/after numbers. CLI `npm run eval:compare -- <new> [--against <baseline>]` (exit 1 on regression), and `npm run eval -- ... --compare <baseline>` runs it automatically after an eval. 3 tests on the recorded d3 runs | verify green; 51 tests; CI checked | d3 host unreachable (desktop off), so it was built and proven on recorded data. First use: d3 `focused` vs `words` loses the memory pairs (filed as 6b). **Section A (verification infrastructure) is complete** |
| 8 | 2026-11-22 | adversarial review | Read 5 life stories from the 20-year d3 world end to end, and audited the UX and the eval. **Bug fixed (realism, high):** every sim's credit score converged to 820 (+1 per clean month, capped) whatever their debt. A dentist at −$140k net worth with $210k of loans showed 820. The score is now derived monthly from payment history (decaying penalty), card utilization, non-mortgage debt vs income, history length and bankruptcy (`creditScoreFor`, 300–850). It matters because borrowing eligibility (≥ 580) and loan rates depend on it. Health now tracks `creditMedian` and `creditSpread` | verify green 9.9 s; 54 tests; CI checked | Distribution: p10 ~680, median 815, 11–13 sims < 580 per seed (US median ~715: generous because sims are too rich, a filed gap). Planting the old constant score fails health (`creditSpread 0`). Filed: the `provider: kev` label is false for d3 (now high), raw month numbers in life stories, static business values |
| 9 | 2026-11-22 | build (C12) | Decisions now record the `model` that answered (`DecisionResult.model` → `DecisionRecord.model`, including on Kev disk-cache hits, which predate the field). The dashboard shows the model on decision cards and the explorer header instead of the protocol name. The CLI names world folders by model for non-default models (`seed-1-d3`, not `seed-1-kev`) and prints the model in its banner | verify green; 55 tests; CI checked | End-to-end CLI run against the live Kev-4B server: every public decision carries `model: kev-latest`. The existing d3 world on disk keeps its old `seed-1-kev` name and has no model field (left untouched) |
| 10 | 2026-11-22 | build (realism) | Businesses are valued at 24 months of their own trailing profit (`avgProfit`: each month weighs 10%; `businessValue`), not a fixed multiple of the type's average. Each business gets a lasting **quality** (lognormal around 1, clipped 0.4–2.2, from its own keyed stream `business-quality`, so no other random draws shift) that scales its demand level: well-run ones reach the top of the type's profit range, badly run ones slide into losses and close via the six-losing-months rule | verify green 10.3 s; 58 tests; CI checked | Values now differ within a type (vending $3.9k–4.7k, car washes $60k vs $70k); survivors cluster near the top because losers close (survivorship, which is realistic). Health is essentially unchanged: Gini 0.48–0.53, so business tails aren't the inequality lever (noted in backlog B) |
| 11 | 2026-11-22 | build (realism) | **Bug fixed:** `canAffordRetirement` compared pension + 4% drawdown against a *working* sim's spending money, which excludes housing and loan payments, so a sim with a mortgage could "afford" to retire at 55. It now requires covering 85% of the retiree lifestyle (`retiredLifestyle`) + housing + loan payments + health insurance before Medicare (`preMedicareHealth`, $650/mo under 65, also charged to retirees under 65 for consistency) | verify green; 61 tests; CI checked | 90-year world: median retirement age 57 → **62**; archetypes now separate (early retiree 55, saver 56, index 59; balanced, biz, re, picker, status, spender mostly 67). 3 tests, proven by planting the spending-money-only rule (2 fail). Filed: reduced Social Security at 62; health's retirement metric is biased by the 50-year window |
| 12 | 2026-11-22 | adversarial review (eval integrity, factory fitness) | Asked whether the published model results are still valid after 11 iterations of rules changes: diffed all 48 golden requests on `main` vs this branch, and they were **byte-identical**, so the results stand. But nothing guaranteed it, so I added **G6b**: `packages/evals/src/fingerprint.ts` fingerprints all 192 requests (48 × 4 styles); `verify` fails on drift, and accepting a change (`-- --write`) is explicit. Factory fitness: CLAUDE.md still named Kev as *the* model and said nothing about `verify`, the fingerprint rule, health or adversarial invariants, or the loop. Updated | verify green 10.5 s; 64 tests; CI checked | Proven by planting a reworded "Change nothing" description: both the fingerprint test and the gate fail. No bugs found in the engine this time |
| 13 | 2026-11-22 | build (realism: wealth) | Measured before changing anything: the median 18–29-year-old had a $879k net worth, almost all of it inherited, because a whole estate (90%) went to a single 18-year-old newcomer. Estates now split among 1–4 heirs (`ESTATE_HEIRS`, mean 2.5, own keyed stream `heirs`); the newcomer in town gets one share (`estateShare`), the rest leave with heirs elsewhere. The heir count is recorded in the hall of fame and pending estates, and the adversarial estate check stays exact (plus a guard that splitting is exercised). Health floors raised: Gini ≥ 0.45, median NW ≤ $2.5M | verify green 10.9 s; 66 tests; CI checked | Median NW $1.14M/$388k/$1.58M → **$889k/$289k/$1.27M**; Gini 0.49/0.48/0.53 → **0.53/0.53/0.58**; 18–29 median $879k → $380k. Golden requests unchanged. Filed: what remains of the wealth gap sits with people in their 60s (savings and returns), and the lumpy age pyramid |
