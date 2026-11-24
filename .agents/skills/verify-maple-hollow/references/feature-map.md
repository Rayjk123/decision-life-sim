# Maple Hollow feature map

## Open the right build

| Surface | Entry point | Use |
|---|---|---|
| Recorded replay | `npm run town:replay:build -- <run-dir> <new-site-dir>` then serve that directory through a static origin | Inspect actual historical frames with no inference dependency |
| Live town | `TOWN_PORT=5197 TOWN_DATA=<new-temp-dir> TOWN_POP=32 npm run town` | Exercise a new simulation using a disposable checkpoint |
| Technical dashboard | `npm run dashboard` | Explore engine output using the dashboard's world directory |

Use a free loopback port. The replay builder accepts an optional shared epoch in Unix milliseconds. The replay test owns an ephemeral port. Never point tests at a live checkpoint or upload a replay's private checkpoint or generation log.

## Drive like a visitor

| Journey | Navigation | Observable proof | Repeatable check |
|---|---|---|---|
| Discover streets | Overview → district sign → Who’s here → Zoom to street | Four district signs, occupants, illustrated street, and stable viewed month | Replay and `town:smoke` |
| Follow a life | Leaderboard → resident → Follow → close profile | Same resident in the street story and appropriate destination as the day advances. Pause holds the canvas | `town:smoke` |
| Visit indoors | Street entrance label → Look inside → click a moving resident | Room remains visible and the profile is the clicked resident | `town:smoke` |
| Inspect recorded E06 decisions | Jump to a date → Technical view → View decision | Dated outcome, model identity, odds where recorded, and the same result from its deep link after changing date | Replay verifier |
| Inspect financial history | Technical view → resident → Monthly timeline → date | Dated decision and balances for that resident | Replay verifier and `town:smoke` |
| Browse completed lives | Technical view → Past residents → select a life | Lifetime chart and milestones for the chosen resident | Replay verifier |
| Compare behavior | Technical view → Decision mix by personality | Personality and source selector, outcomes and offer counts | Replay verifier |
| Watch and listen | Pause or choose speed, change lighting, open Tracks | Player state, artwork and track choice respond. Music audibility needs a listening check | `town:smoke` and manual audio check |
| Recover the shared clock | Advance beyond the last replay month with its next frame download failing once | Last good date remains visible, reconnect status appears, and retry opens month one | Replay verifier with injected fault |

## Read the evidence

- **Repository gate:** Type checks, deterministic engine and ledger tests, golden prompt fingerprint, heuristic regression, simulation health, Chrome dashboard and town smoke, and static replay fixture. See [the gate](../../../../scripts/verify.ts).
- **Soak:** `npm run town:soak` for the 1,000-resident live scenario and heap check. Run when changing time, connectivity, or retention behavior.
- **Static replay:** The report includes the validated month and decision counts, fallback count, lifetime count, model, bundle hash, browser, screenshots, and on failure a trace. Open traces with `npx playwright-core show-trace <failure-trace.zip>`.
- **Hosted candidate:** Confirm assets and gzip responses decode, no live API requests appear, and a fresh browser can load an older decision link. Compare the staged bundle hash to the reviewed build. Keep deployed CDN checks distinct from local-origin results.
- **Model quality:** Re-run the golden suite on the exact model and wording when changing model behavior. A replay can have complete provenance and still have poor decisions.
