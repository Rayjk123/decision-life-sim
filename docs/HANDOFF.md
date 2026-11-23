---
title: Handoff
nav_order: 9
---

# Handoff: open tasks (2026-11-22)

Written for the next agent picking up **decision behaviour and simulation** work. A separate agent owns the **UX** (the pixel town in `packages/town` and the dashboard); coordinate before touching either. Read `docs/SPEC.md` (decisions; #19 is the medieval setting), the newest entries in `docs/LOOP.md` (iterations 31–35) and this file.

## Where things stand

- **Decision model: d3:4b on Ollama** (`http://<ollama-host>:11434`, model `d3`). User decision: stick with d3. Golden suite on the medieval wording: **70% overall, 48% pairs** (`docs/results/data/d3-4b-words.json`). Heuristic baseline 82.7% / 66.7%.
- **The town is medieval** (`packages/sim-core/src/theme.ts`, SPEC #19): gold crowns at the same numbers; Guild Fund (index fund), trading voyages (stocks), counting-house vault (savings), cottages, cottages to let, horse and cart / fine carriage, moneylender's debt (the 24% card). **Ids, mechanics and numbers are unchanged** (`invest_index`, `trade_stocks`, … still the move ids). The model gets plain glosses ("the Guild Fund, a broad index fund"); without them d3 lost 8 points.
- **Towns have a past**: 70 years of rules-driven history before month 0 (`growHistory`), movers aged 18–55, so every age is present; history-era milestones feed residents' life stories.
- **"Why?" probes** exist: `probe(world, simId, changeId, decider)` / `npm run probe` (one fact changed, odds compared).
- **Fine-tuning** (`docs/finetune/`): **E07m, a 4B fine-tune on medieval-worded data, beats d3:4b on the medieval golden suite (77% / 57% pairs vs 70 / 48)**, winning red flags and memories, still losing the big deals (rentals, new businesses). Not yet the default: wiring it in means serving it (`serve_unsloth.py` on the desktop, or a GGUF export for Ollama) and a world run. User's call.

## Open tasks, in priority order

### P0 · d3 baseline on the medieval town: DONE (2026-11-22)
20-year world, seed 1, 200 sims (`experiments/p0-medieval/`, gitignored; 48 min at ~4 decisions/s even at concurrency 8). Personality separation **d3 58%** vs heuristic 35%. Decision mix (`npx tsx scripts/decision-mix.ts experiments/p0-medieval/seed-1-kev`):

| Archetype | d3 top picks | Signature offered · picked when offered |
|---|---|---|
| Real estate | vault 45%, Guild Fund 18%, sell 12%, rental 11% | 12% · **91%** (fixed by the 50% rental DTI) |
| Business owner | **trading voyages 70%**, rental 7% | 14% · 29% |
| Spender | **trading voyages 37%**, nothing 25%, Guild Fund 10% | 20% · 29% |
| Status seeker | Guild Fund 31%, **trading voyages 22%**, nothing 14% | 24% · 21% |
| Index / early retiree / saver / balanced / picker | their signature move | 63–99% |

### P1 · decision behaviour (top priority). Measure every change with d3: `npm run eval -- --decider model --decision-url … --model d3 --style words`, then `npm run eval:compare -- <new.json> --against docs/results/data/d3-4b-words.json`. Never ship a drop > 2 points overall or on pairs without a written reason.
2. **Trading voyages as everyone's default** (top P1 item, from the P0 world): business owners pick them 70%, spenders 37%, status seekers 22%. Business owners: in the last modern d3 world they picked stocks 75% of the time and started a business 5%. In a heuristic town 87% of business owners already own a business (one at a time), so starts are rare by design. Use the P0 world to see what d3 business owners pick *while* running a business; if it's mostly trading voyages, fix the wording or add an in-character move (e.g. "put profits back into the business": a small, keyed boost to its value/profit), with a rule, executor flow, heuristic weight and golden scenario.
3. **Red flags d3 ignores** (S-unemployed still invests ~50%; S-rentals-empty buys at 95%; S-card-debt invests over paying a 24% debt). Warnings are already in the state and inside the options; d3 doesn't react. Options: (a) accept and document; (b) a rules-level nudge where it's realistic (e.g. no new rental while the town's vacancy is extreme); (c) revisit the fine-tuned model, which passes these (see "Fine-tuning" below). Ask the user before (b) or (c).
4. **Status seekers**: P-status-lawyer picks the fine carriage over the manor house; A-status spends at level 3–4 (should be ≥ 6). Try status-flavoured spend items and house wording; measure.
5. **Small effects that flip** (memory-raise, lossaversion-save, crash/boom pairs): deltas are near zero; look for wording that makes memories and traits matter more (probes help: `npm run probe -- --world … --decider model … --change raise|cautious|crash`).
6. **Re-run the other published rows** on the medieval wording if they matter (d3:2b, `focused` style, Kev): they're marked historic on `docs/results.md`.

### P2 · realism (user: "fuzzy is good enough", don't over-tune)
7. **Lifespans too short**: only ~7% of sims are 70+ (US adults ~15%). `world.ts` draws lifespan from triangular(35, 65, 95); a peak near 78 would fix it. Re-check health bands.
8. **Jobs at town businesses**: sims work at sim-owned businesses (the bakery, the tavern); closures cause layoffs. Fits the pixel town. Bigger change: design first (SPEC roadmap 4).
9. **Life events with texture**: partner income, children's costs, illness. Keyed RNG, ledger, adversarial invariants, health metric.

### P3 · performance and structure
10. **1,000-sim month with d3 ≤ 90 s** (the town shows 1,000 residents; ~2 min a month today at 8.5 decisions/s). Measure; then caching, fewer decision triggers, or replaying recorded months for the demo.
11. **Decider registry** (`deciders.json`: name, url, model, style) so switching models is config, not code.

### For the UX agent (not this track)
- Dashboard and town still show dollars and "Expansion/Recession": use `fmt` (crowns), `REGIME_NAME` and `JOBS_NAME` from `@dls/sim-core`.
- "What changes the odds" panel: `probe(world, simId, id, decider, { base: recordedDecision.answers.main })`; `probeChangesFor(sim, world)` lists the toggles that apply.

## Fine-tuning (parked; how to resume)
- Everything is in `docs/finetune/` (lab notebook, results, labelling rubric v1.10, a nine-lesson learning guide). Desktop training box: `C:\Users\User\dls-ft`, reached with `DLS_TRAINER=user@<desktop-host> research/finetune/sync.sh …`; GPU jobs go through `desktop/queue.ps1` launched as a **scheduled task** (not over SSH) with a **far-future trigger** (`/sc once /sd 01/01/2099 /st 00:00`), deleted when done: a same-day placeholder time fires again that night and re-runs the queue (it happened once; see `queue.ps1`).
- To retrain on the medieval wording without new labels: `npx tsx research/finetune/sample-states.ts` (deterministic: same ids, new wording) and the `--deals` set, then `make-dataset.ts --source haiku-plus-deals …` and E06's config. Labels key on ids, so they carry over.
- The 4B run (E07) was stopped before finishing at the user's request.

## Rules that bite
- `npm run verify` must pass before every commit (CI runs it on push). It includes a **leak scan**: never commit LAN addresses (use `<ollama-host>` / `<desktop-host>` in docs) or secrets.
- Changing anything the model reads (state wording, move descriptions, golden scenarios) fails `eval:fingerprint`: re-run d3, then accept with `npm run eval:fingerprint -- --write` and say so in the log.
- New realism needs a health metric or band (`scripts/health.baseline.json`); rules changes need an invariant in `packages/worker/test/adversarial.test.ts` where one applies.
- Money is integer cents via `post()`; all randomness via `rngFor(...)`; same seed must replay identically.
- Work on `improve/loop`, log each iteration in `docs/LOOP.md`, push; `main` is updated by fast-forward when the user asks.
