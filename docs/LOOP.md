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
5. **Verify:** run `npm run verify` (G1, G2–G5, G6 heuristic, G9). Run G6 for d3, G7 and G8 by hand until they're automated. All gates must pass. If quality improved, raise the floors in `scripts/verify.baseline.json`; never lower them.
6. **Self-review the diff** (`git diff main...`) against the review lenses. Fix what you find.
7. **Record:** update the iteration log (result, numbers), the backlog, `docs/WORKLOG.md` when numbers changed, and `docs/results.md` via `npm run docs:results` when evals changed.
8. **Commit and push** with a clear message and the session's attribution trailer, then stop. Don't start a second iteration in the same run.

## Verification gates (the quality bar)

| Gate | Command | Passes when |
|---|---|---|
| G1 Types | `npm run typecheck` | no errors |
| G2 Tests | `npm test` | all pass (count never goes down) |
| G3 Determinism | in G2 (same seed replays; resume byte-identical) | stays green; every new random draw uses `rngFor` |
| G4 Money conservation | in G2 (20-year ledger test) | cash never appears or vanishes |
| G5 Golden validity | in G2 | every scenario's expected options are legal |
| G6 Eval regression | `npm run eval` (and d3 if reachable) | heuristic ≥ 77% / pairs ≥ 56%; d3:4b `words` doesn't drop > 2 points overall or on pairs vs `docs/results/data/d3-4b-words.json` |
| G7 Sim health | `npm run health` *(to build)* | a 50-year heuristic world over 3 seeds stays inside realism bands (bankruptcy, homeownership, wealth medians, unemployment, no NaN or negative balances that shouldn't exist) |
| G8 Performance | `npm run health` *(to build)* | 600 months × 200 sims in heuristic mode stays under its time budget (record the baseline first) |
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
2. (M) `npm run health`: 50-year heuristic runs over seeds 1–3 with realism bands and a time budget. Record the baselines, then make it part of `verify`.
3. (S) GitHub Actions CI on push and PR running `npm run verify` (no model needed).
4. (M) Randomized property test: random legal-move sequences over many seeds, checking money conservation, no negative cash after shortfall handling, loans ≥ 0, asset and owner consistency, tenant and landlord symmetry.
5. (S) Eval regression check that compares a new d3 run to the recorded best and prints the pairs that flipped.

**B0. Found in the first 20-year d3:4b world** (seed 1, 200 sims, 9,386 decisions, 0 fallbacks, 17.5 min)
- (M, high) **Business owners pick `trade_stocks` 75% of the time** and start a business only 5%. Spenders also trade stocks 41%. d3 seems to read "business/entrepreneur" as "active investing". Probe with `/permute` and counterfactuals, then fix the move descriptions or the persona text, and add a golden scenario that pins it.
- (M) **Real estate investors buy rentals only 8%**, but invest in the index 48%. Check whether rentals are rarely legal (cash and DTI), or legal but rejected; measure legality rate vs pick rate per archetype.
- (S) Agreement with the heuristic ranges from 6% (business owner) to 99% (index investor). Add this per-archetype table to the dashboard and the results page as a behaviour fingerprint.
- Healthy signs to keep: early retirees lead (median $319k), spenders trail ($55k), and bankruptcies are rare (6 in 20 years).

**B. Simulation realism and impressiveness**
6. (M) Market signals the model can read: describe crashes, booms and rates as consequences ("the index fell 14% last month, the worst drop in years"), then rerun the market pairs. Target: d3 passes ≥ 2 of crash, weak-jobs, boom.
7. (M) Red-flag situations: make unemployment, card debt and vacancies salient in the state; add golden scenarios for them. Target: S-unemployed and S-rentals-empty pass with d3.
8. (L) Employment links (SPEC roadmap 4): sims work at sim-owned businesses; failures cause layoffs; growth hires.
9. (M) Estate tax or estate splitting, to stop dynastic wealth compounding (SPEC tuning backlog).
10. (M) Life events with texture: marriage or partner income, children's costs, health shocks. Keep each behind keyed RNG and the ledger.
11. (S) A d3:9b eval if it fits in 12 GB (Ollama lists ~10 GB).

**C. UX**
12. (S) The dashboard shows the real model name (d3:4b) instead of "kev" on decision cards and headers.
13. (M) Dashboard "why" panel: per-decision counterfactual probe (re-ask with one field changed) for d3 (SPEC roadmap 3).
14. (M) Results page: a chart of the decision mix by archetype per model (from the experiment), and a life-story gallery.
15. (L) The pixel town (SPEC roadmap 6), started as a slice: the static map plus sims walking home and work on month ticks.

**D. Performance**
16. (S) Decision cache hit-rate and latency percentiles shown in the sim CLI summary and the dashboard.
17. (M) Run the 1,000-sim world with d3:4b and record month time. Target ≤ 90 s.

**E. Software-factory structure**
18. (M) A decider registry and config (`deciders.json`: name, url, model, style), so a new model is config, not code. Record the model in every decision log line.
19. (S) `CONTRIBUTING.md` recipes: add a move, a decider, a golden scenario, a chart. Plus a PR template carrying the gate checklist.

## Iteration log

| # | Date | Type | Change | Gates | Result |
|---|---|---|---|---|---|
| 0 | 2026-11-21 | setup | Loop created; branch `improve/loop`; backlog seeded | G1–G2 green, 37 tests | d3:4b 77% / 61% pairs is the bar |
| 1 | 2026-11-22 | build (A1) | `npm run verify`: one command for types, tests (with a floor on the count), deterministic heuristic eval regression, docs-in-sync (`docs:results --check`) and a leak scan (LAN IPs, GitHub/API tokens, private keys) over tracked files. Floors in `scripts/verify.baseline.json`; `scripts/` now typechecked; 3 tests for the gate's own logic | verify green in 2.7 s; 40 tests | Proven by planting 4 faults (LAN IP, stale generated table, failing test; prose outside generated blocks is allowed). Also: the 20-year d3:4b world finished, 9,386 decisions, 0 fallbacks, 17.5 min; findings in backlog B0 |
