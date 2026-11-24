---
name: verify-maple-hollow
description: Launch, drive, and verify Maple Hollow as a player. Use to test town UX, simulation regressions, recorded replay releases, or a candidate deployment and produce evidence a reviewer can assess without reading a code diff.
---

# Verify Maple Hollow

Write the user-visible claim and the expected result before running a check. Choose the live town or the recorded replay based on what will ship. Use the [feature map](references/feature-map.md) for navigation and exact assertions.

1. **Run the candidate.** Use `npm run verify -- --all` for the repository gate. Use `npm run town:replay:verify` for the fast static fixture loop. For a replay release, run `npm run town:replay:verify -- --source <run-dir> --evidence <new-evidence-dir> --site <new-site-dir>` against the complete recording. The verifier launches a private origin, drives Chromium, and shuts it down. For final release evidence use a clean commit. Record any working-tree changes in exploratory evidence.
2. **Prove the claim through the UI.** Follow the shortest relevant journey and assert both what the user sees and a result that could fail. For a new path, reproduce the failure on a baseline or introduce one controlled fault in an isolated fixture. Use `CHROMIUM_PATH` if Chrome discovery requires an override. Keep playback on a test clock for month transitions.
3. **Diagnose and rerun.** Use the failed assertion, screenshot, and Playwright trace to distinguish a product defect, test defect, or environment issue. Fix the cause, rerun the targeted journey, then rerun the broader gate. Keep the failing evidence when it demonstrates that the guard caught a real regression. Never count a skip, manual impression, or missing environment as a pass.
4. **Hand over evidence.** Link `report.md`, the machine-readable `report.json`, and the screenshots that answer the release claim. Include the source revision, bundle hash, result, and unverified claims. For production approval, also open the actual candidate URL and verify its first frame, a later month, a dated link, and the network contract. Deployment stays within the caller’s authorization.
5. **Maintain the loop.** When a user path changes, update the feature map and its browser assertion together. When a defect escapes, add the smallest failing reproduction to the layer that should have caught it, then rerun that layer and the release gate. For ambiguous visual or new release-critical behavior, give an independent verifier the same acceptance criteria and candidate with hidden implementation details.

A fixture verifies the replay path. A full-run report verifies the actual recorded data and browser surface. A live model quality claim needs its own golden evaluation. Report each claim with its own evidence.
