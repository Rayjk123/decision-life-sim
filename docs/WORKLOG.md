# Work log

Newest session first. Each entry: what was done, the current state, and the next steps, so work can resume after a break or a context reset.

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
