# decision-life-sim · guide for Claude Code

Read these first, every session:
1. `docs/SPEC.md`: what we're building, every decision made, the eval design, and the roadmap of improvements.
2. `docs/WORKLOG.md`: what's done, current numbers, what is and isn't verified, and the next steps. Start with the newest session entry.

## What this is
A town of sims living out their financial lives month by month. The rules engine (`packages/sim-core`) decides what is legal and keeps the books. A decision model, **Kev** (open weights, run locally), picks what each sim does among legal moves. A seeded dice roll makes the final pick. Behaviour is "act in character", with no explicit goals yet.

## Commands
```bash
npm install && npm test                                   # 51 tests, all must pass
npm run verify                                            # the quality gate: types, tests, eval regression, sim health, docs sync, leak scan
npm run health [-- --record]                              # 50-year worlds x 3 seeds: integrity, realism bands, time budget
npm run sim -- --months 600 --pop 200                     # heuristic mode, ~10 s
npm run dashboard                                         # http://localhost:5173 over ./world
npm run eval -- --verbose                                 # golden suite: random + heuristic baselines
./scripts/kev.sh                                          # Kev-0.8B on http://127.0.0.1:8009 (macOS uses MLX on the GPU)
npm run kev:check                                         # one real Kev decision vs heuristic + throughput
npm run eval -- --decider kev --style all --verbose       # Kev on the golden suite, all state wordings
npm run eval:compare -- <new.json> [--against <base.json>] # flips + regression verdict between two eval runs
npm run experiment -- --deciders heuristic,kev --seeds 1 --years 10
npm run sim -- --decider kev --months 24 --pop 200 [--resume]
```
Run `./scripts/kev.sh` in the background (or a second terminal) and wait for "serving ..." before calling it. First run clones Kev into `.kev/`, installs its env with `uv`, and downloads weights from Hugging Face.

## Conventions
- Money is integer cents in today's dollars. Every cash change goes through `post(sim, kind, amount)` (`ledger.ts`); the ledger test must keep passing.
- All randomness is keyed: `rngFor(seed, purpose, month, simId)`. Never use `Math.random`. Same seed must replay identically (there's a test).
- The model never decides legality: add a move in `rules.ts` (with real costs in its description), apply it in `executor.ts` (re-check, then post flows), and teach `heuristic.ts` about it.
- Changing the rules can invalidate golden scenarios: `npm test` checks every scenario's expected options are still legal. Fix the scenario spec, not the test.
- Keep `docs/SPEC.md` (decisions) and `docs/WORKLOG.md` (progress, numbers, next steps) updated at the end of every session.
- Commit at the end of each piece of work with a clear message.
