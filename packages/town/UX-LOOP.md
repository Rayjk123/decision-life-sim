# Maple Hollow UX improvement loop

Work in the isolated pixel-town checkout. Read this log and the relevant sections of the spec and handoff at the start of each round. Make one focused, verifiable improvement at a time and log the result, browser evidence, review findings, and next priority. Count completed rounds rather than scheduler triggers.

Spend roughly ten rounds on the watch experience. Prioritize resident identity, home and workplace scenes, unhurried movement, believable doors and routes, audio, and a phone layout that leaves the scene visible. Have an independent UX agent review the current build every third round and act on the highest-impact findings. Exercise the town in desktop and phone viewports against an isolated checkpoint. Keep real decisions visibly distinct from ambient routines. Run the repository verification gate before committing.

Once the watching experience is solid or around round ten, wire the deeper resident experience. Include month-by-month history, changes since the last decision, decision odds and outcomes, personality comparisons, and counterfactual probes where the data supports them. Mark missing history explicitly and keep advanced details optional.

## Round 1

- Added illustrated interiors for all seven career workplace types and entered those scenes when following a resident at work. Workplace assignment uses the resident's career category. An actual employer or business lot will need its own data.
- Added an inspect button in follow mode and kept the selected resident when switching between the illustrated street and the overview.
- Independent review found that interior scenes trapped first-time viewers out of the resident card, phone follow controls could sit below the fold, and the illustrated street reused the same doors. Addressed the first finding and part of the third. Next, fix phone follow controls and make doors and transitions reflect the location being visited.
- Verified all seven workplace backgrounds in Chrome, including opening the resident card from inside, stepping back outside, and continuing to an errand and home. The full gate passed with 96 tests and 38 dashboard UX checks.
