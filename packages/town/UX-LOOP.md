# Maple Hollow UX improvement loop

Work in the isolated pixel-town checkout. Read this log and the relevant sections of the spec and handoff at the start of each round. Make one focused, verifiable improvement at a time and log the result, browser evidence, review findings, and next priority. Count completed rounds rather than scheduler triggers.

Spend roughly ten rounds on the watch experience. Prioritize resident identity, home and workplace scenes, unhurried movement, believable doors and routes, audio, and a phone layout that leaves the scene visible. Have an independent UX agent review the current build every third round and act on the highest-impact findings. Exercise the town in desktop and phone viewports against an isolated checkpoint. Keep real decisions visibly distinct from ambient routines. Run the repository verification gate before committing.

Once the watching experience is solid or around round ten, wire the deeper resident experience. Include month-by-month history, changes since the last decision, decision odds and outcomes, personality comparisons, and counterfactual probes where the data supports them. Mark missing history explicitly and keep advanced details optional.

## Round 1

- Added illustrated interiors for all seven career workplace types and entered those scenes when following a resident at work. Workplace assignment uses the resident's career category. An actual employer or business lot will need its own data.
- Added an inspect button in follow mode and kept the selected resident when switching between the illustrated street and the overview.
- Independent review found that interior scenes trapped first-time viewers out of the resident card, phone follow controls could sit below the fold, and the illustrated street reused the same doors. Addressed the first finding and part of the third. Next, fix phone follow controls and make doors and transitions reflect the location being visited.
- Verified all seven workplace backgrounds in Chrome, including opening the resident card from inside, stepping back outside, and continuing to an errand and home. The full gate passed with 96 tests and 38 dashboard UX checks.

## Round 2

- Moved Follow beside the resident name. On phones, opening the profile makes room under the scene for the profile heading and controls. Vertical swipes scroll the page and horizontal swipes pan the scene.
- Chrome passed at 320 × 640, 390 × 844, and 1440 × 900 against a local town with an isolated checkpoint. Verified Follow visibility and toggling, vertical swipes preserving follow, and horizontal pans leaving follow.
- Round 3 should clarify doorway transitions and commission the next independent review.

## Round 3

- Residents turn from the sidewalk toward the doorway. Follow view softens the cut into work and errand interiors and shows the resident walking back out before returning to the street. Reduced motion skips the automatic shade and indoor walk.
- A continuity check caught late commuters whose errand could start before they arrived at work. Midday now leaves a minimum stop after arrival. The check passed for 480 combinations of resident, job status and errand.
- Chrome verified the work-to-bank-to-home route and the inside/outside control on a desktop and a 320 px phone viewport with reduced motion.
- Independent Chrome review confirmed continued follow and inside/outside controls on desktop and phone. It found that work and non-bakery errands share one illustrated doorway, making that walk look stationary. It also found zoom controls that change the displayed number without changing the scene.
- Round 4 should separate destinations on the street, then make zoom controls reflect the active scene.

## Round 4

- Civic errands now lead across the bridge. The bakery uses its storefront, and work uses the workshop-side entrance. The bridge stands in for the rest of town in the illustrated view.
- The street zoom shows magnification relative to the fitted scene. Fixed interiors show Fit and disable both zoom buttons. The overview keeps its existing zoom range.
- Chrome at 1440 × 900 and 320 × 640 verified distinct exterior views at work and the bank, changed canvas pixels when zooming the street, and disabled zoom in both interiors.
- Next, give the resident a quiet scene at home so following covers the start and end of the day.

## Round 5

- Following now opens a cottage at dawn and on the evening return. Stepping outside affects just that visit, so the morning choice does not suppress the evening return.
- The cottage has matching [daylight](art/cottage-day.png) and [evening](art/cottage.png) artwork. Both are built-in ImageGen outputs. The first prompt used the bakery as a style reference and requested a modest medieval living room with a left-hand door, right-hand hearth, autumn window, and open floor for a walking sprite. The daylight prompt kept the composition and switched the window and floor lighting to morning sunlight.
- Chrome at 1440 × 900 and 320 × 640 checked that both assets loaded from the local town and followed one resident from the cottage to work, through an errand, and back home with Follow still on.
- Round 6 should independently review the entire route and the quiet time spent at home. The cottage currently represents the home scene for every resident.

## Round 6

- Illustrated interiors fill more of a tall canvas. The crop follows the resident while preserving the wide illustration on desktop.
- Chrome verified daylight cottage and infirmary framing at 320 × 640, 390 × 844, and 1440 × 900. Both phone views enlarged the interior and kept the resident visible. Opening the profile preserved Follow.
- The independent review followed one resident from the cottage through Guildhall and Maple Bakery, then back home on desktop and phone. It found that returning to 1× rewound the same day, switching Street and Overview reset parts of the viewer setup, and stationary interiors felt static. Round 7 addresses the rewind.

## Round 7

- Changing speed keeps the local playhead, including when switching back to 1× at dusk. Pause and Resume preserve the same local time. Go live is a separate control that joins the shared clock and restores normal speed.
- Isolated Chrome passed at 1440 × 900 and 320 × 640. It checked 12× to dusk, 1× at dusk, pause and resume, speed changes while paused, and explicitly returning to the current shared clock.
- Round 8 should preserve the resident profile and camera settings when switching between Street and Overview. Round 9 can add restrained idle activity and review the whole route again.

## Round 8

- Street and Overview use separate camera settings. Switching keeps the resident profile and Advanced section open, keeps Follow and the playhead, and restores the previous zoom per view.
- The current view is marked on its button. A visitor who stopped following stays unfollowed when switching views.
- Isolated Chrome passed at 1440 × 900 and 320 × 640, including switching from a paused workplace visit, preserving its outside state, restoring distinct zoom levels, and keeping the profile open.
- Round 9 should add a little motion to quiet stops and commission the next independent review.

## Round 9

- At rest, residents occasionally shift their weight. Their feet stay planted, and the gesture varies by scene. The cottage hearth has a few slow sparks. Both effects respect reduced motion and use the local playhead.
- The town clock describes the time of day. The resident caption alone describes the resident's activity.
- Isolated Chrome verified changing cottage pixels and a workplace posture shift at 1440 × 900. At 320 × 640 with reduced motion, the same settled cottage stayed pixel-identical as time advanced.
- The independent review confirmed same-day playback and map continuity. It found that Follow was hard to discover on the scene, occupation labels were unclear, and the next month could replace a paused frame. Round 10 addresses the scene controls and occupation labels.

## Round 10

- Follow and Stop following are on the scene. The resident name opens the profile independently. Opening and closing the profile preserves Follow and the selected resident.
- Profiles, rankings and place lists show the career label from the simulation. The town API derives it from the saved career key, so existing checkpoints can return it.
- Isolated Chrome at 1440 × 900 and 320 × 640 verified stop and resume from the scene, opening and closing the profile during Follow, and distinguishing two people with the same name by occupation in the leaderboard.
- The next phase starts with a retained timeline and predictable behavior across the shared month boundary. The review also flagged sprite clearance under overlays, player-facing financial terms, and explaining the limits of the current decision odds. Carry these into the next passes.

## Round 11

- The resident profile has an on-demand timeline with up to twelve recorded months, including the current month. Each row shows the actual month, age, ending balances, and recorded move when available.
- The same checkpoint archives only published frames. A pending month stays out of the timeline, and a legacy checkpoint starts with its current frame. The history endpoint does not advance the simulation and returns an empty timeline for an unknown resident.
- Isolated Chrome at 1440 × 900 and 320 × 640 loaded two actual promoted months through the timeline endpoint. Tests cover restart, pre-history checkpoints, pending frames, and the retention cap. The CloudFormation template parses locally.
- Round 12 should keep the scene and profile pinned during local playback across a shared month rollover, then commission the next independent review.

## Round 12

- Local playback keeps its own displayed frame while the shared clock receives the latest frame. Pausing keeps the scene, profile, and decision date pinned. Resume continues the local day, and Go live jumps to the current shared frame at 1×.
- At the end of a local day, the next received month starts at dawn when available. When playback has run ahead of the shared clock it shows End of this day.
- Isolated Chrome verified the pinned date and Advanced panel at 1440 × 900 and 320 × 640, then verified a 12× resume into the next month's dawn and a return to the live clock.
- The independent review confirmed timeline rows matched the API and retry worked on desktop and phone. It reproduced a case where replaying the draw against the displayed raw probabilities suggested a different move. Round 13 should expose the distribution used for sampling and the actual decision source when recorded. The next timeline pass should make rows compact and show month-end balances and deltas.

## Round 13

- The engine records the exact ordered distribution sampled after its discipline adjustment and the sampled move before execution. The town shows that evidence in Advanced alongside the raw odds, the final outcome, and the recorded source. The source distinguishes an ordinary heuristic decision from a model fallback.
- Older frames retain whatever raw odds they recorded and explicitly mark the missing source and sampling evidence. Historical timeline rows still retain outcomes rather than full decision records.
- Isolated Chrome at 1440 × 900 and 320 × 640 checked a real decision where the raw odds and sampled odds led to different moves. It also checked the older frame state. Engine tests replay the draw and check fallback provenance.
- Round 14 should give the timeline compact month-end rows and balance changes between adjacent months.

## Round 14

- Monthly timeline rows show the month, recorded move, and signed net-worth change before expansion. Opening a row reveals month-end balances and cash and debt changes. Gaps and the oldest retained month show that a comparison is unavailable.
- On narrow screens, opening the timeline brings the first row into view when the disclosure has focus. The closed rows make twelve months much easier to scan.
- Isolated Chrome at 1440 × 900 and 320 × 640 verified 12 real months, correct adjacent-month changes, and expandable balances. The phone check also verified a missing preceding month.
- Round 15 should let visitors inspect retained decision evidence from timeline rows and commission the next independent review.

## Round 15

- Expanded timeline rows can show Decision evidence. The checkpoint preserves each exposed decision's raw odds, ordered sampling odds, draw, and source when archiving a month. Outcome-only legacy rows explain what was retained.
- Twelve months remain bounded. A local 1,000-resident sample had approximately 1.77 MB of archived data in a 3.70 MB checkpoint. The history endpoint returned about 3.6 KB for the sampled resident.
- Isolated Chrome at 1440 × 900 and 320 × 640 verified the archived odds and draw against the original visible decision. It also checked the outcome-only fallback. The restart test checks retained odds, source, and draw.
- The independent review verified keyboard and touch disclosures and missing-data states. It reproduced a close call where rounded percentages suggested a different sample, and found that live rollover collapsed open timeline rows and lost keyboard focus. The next passes should display the winning draw interval, preserve open rows and focus, then compare consecutive decisions and archetypes.

## Round 16

- The draw and its winning cumulative interval now use the same percentage scale. Close calls add display precision, and Exact sampling values exposes the recorded draw, bounds and ordered weights as unrounded fractions. This works in live and archived decision details.
- An interval check covered close draws, a boundary too small to round safely, and the final move's floating-point remainder. Isolated Chrome verified the review's close-call example at 1440 × 900 via keyboard and at 320 × 640 via touch, plus an older record without sampling evidence.
- Round 17 should preserve open timeline rows and keyboard focus across a live month change.

## Round 17

- The timeline updates its retained rows in place. Open months, nested evidence, and exact sampling values stay open as the shared month rolls over. A focused disclosure stays focused. If its month expires, focus returns to Monthly timeline.
- Month deltas update when their preceding month expires. A failed refresh leaves the existing rows available to read.
- Isolated Chrome at 1440 × 900 and 320 × 640 used a real 12-month record set. The first rollover retained the focused evidence and removed the expired comparison. The second expired the focused month and returned focus to the timeline.
- Round 18 should compare decisions from two recorded months and commission the next independent review.

## Round 18

- Each recorded move can be compared with that resident’s previous retained decision. The comparison shows dates, sources, triggers, draws, sampled and final moves, offered-option changes, and raw odds changes for shared options.
- New frames preserve four model inputs for the comparison: reserve and portfolio, monthly finances, warnings, and market. Earlier frames mark unavailable details. These inputs travel through the on-demand timeline, outside the regular scene polling payload.
- Isolated Chrome at 1440 × 900 and 320 × 640 compared two actual decisions with a skipped month between them and verified the legacy state. A twelve-month sample with 1,000 residents held about 5.04 MB in the checkpoint.
- The independent review replayed 740 retained draws and verified archived and legacy evidence on desktop and phone. It found two focus issues on rollover: a removed exact-values control sent focus to Leaderboard, and an inserted month could push a retained focused control off-screen.

## Round 19

- A focused timeline control that was visible stays in view as a new month is inserted. If a live decision disappears, focus returns to the Advanced decision details summary.
- Isolated Chrome at 1440 × 900 and 320 × 640 reproduced both cases using two months from the same town and verified the resulting focus and viewport position.
- Round 20 should build the decision mix by archetype and recorded source.

## Round 20

- World has an on-demand decision mix through the viewed month. Choose a personality and recorded source to see outcome counts, saved offer counts, and picks among offers. Variants of a move count once per decision in the offer denominator.
- New archived choices retain their personality. Older unclassified decisions remain in the total and appear as a separate count. Known-offer coverage is shown per group. Pending frames never enter the mix.
- The restart test checks date coverage and counts. Isolated Chrome at 1440 × 900 and 320 × 640 checked the actual aggregate endpoint and rendered model, heuristic, and fallback group fixtures. The CloudFormation template parsed locally.
- Round 21 should start the counterfactual path using reproducible recorded inputs and commission the next independent review.

## Round 21

- New decisions capture one counterfactual from the same pre-decision month and economy: double the resident’s cash, rebuild the legal moves, and record the heuristic variant odds. Model-backed towns also capture the variant model request. No additional model calls run during capture.
- The scene and timeline expose availability only. Heuristic captures follow the twelve-month retention window. Full model prompts stay in the current and pending frames and two recent archived months to bound checkpoint size.
- A 1,000-resident replay matched the existing probe’s variant odds and kept all published moves identical. The measured checkpoint was about 5.95 MB with heuristic capture and 8.47 MB with a model fixture after the retention cap.
- Isolated Chrome at 1440 × 900 and 320 × 640 confirmed decision evidence still worked, including timeline availability without the private request. Round 22 should expose the read-only comparison and a resident control.
- The independent review verified source separation, missing-personality counts, and deduplicated offers. It found that Picked was ambiguous because it counts final outcomes, that reopening a paused mix could reuse expired data, and that narrow headers broke mid-word. Fix these before release.

## Round 22

- What changes the odds? uses the selected decision month’s private capture to compare its original raw odds with the double-coin variant. The control shows money on hand, changed offers, and the odds for each move. Current and archived evidence can open it.
- Heuristic and fallback results are precomputed. Model probes require a configured matching model and use a five-second timeout, one in-flight request per process, a three-second cooldown, and a bounded result cache. The probe endpoint leaves the shared checkpoint untouched.
- Isolated Chrome verified the heuristic path at 1440 × 900 and 320 × 640 and the matching model path with a local fixture. The fixture also verified repeated requests use the cache and a different concurrent request respects the cooldown. Direct tests verified archived results and an unchanged checkpoint.
- Round 23 should address the decision-mix review findings before the release review.

## Round 23

- The decision mix distinguishes final outcomes from saved offers and outcomes among those offers. Its explanation covers failed rules checks and grouped move variants. Short headings stay on one line.
- Reopening the disclosure or World refreshes retained coverage without moving the paused scene. A failed refresh explicitly labels the last received mix.
- Isolated Chrome at 1440 × 900 and 320 × 640 verified single-line short headers and two expired months dropping from the mix while the scene stayed paused. The selected group survived refreshes.
- Round 24 should independently assess the release candidate across the full watch route, resident timeline, decision evidence and comparisons, decision mix, and the counterfactual.

## Round 24

- Independent Chrome review passed audio and preference persistence, cottage-to-infirmary-to-bakery follow, local playback, twelve-month history, exact sampling, decision comparisons, mix counts, and current and archived heuristic probes. It found a stale probe on a paused timeline and an ambiguous World date during local playback.
- The timeline now refreshes retention when the shared month changes or the disclosure reopens. It removes expired rows and updates probe availability in place for retained rows. The scene stays on the viewed month. World labels that month explicitly.
- Isolated Chrome at 1440 × 900 and 320 × 640 ran a real heuristic probe, advanced a twelve-month checkpoint, and checked that the expired row disappeared while playback remained pinned. Desktop covered an open timeline and focus recovery. Phone covered closing and reopening the timeline. Both checked the World date.
- Next, align the remaining town currency and move labels with the medieval setting, then verify a featured decision against live d3.

## Round 25

- The town frame supplies labels from the simulation theme and data tables. Profiles, timelines, comparisons, probes and the decision mix use matching move names, including Guild Fund investing and backing trading voyages. Balances display crowns. The street and World show the same market regime and house loan terminology.
- The old bank and vehicle lot are now the Counting House and Carriage Yard in the overview and follow captions. Saved records and the model still use the same move IDs.
- Isolated Chrome at 1440 × 900 and 320 × 640 inspected a real recorded Guild Fund investment across the leaderboard, resident profile, timeline, evidence, double-coin probe and decision mix. Both layouts fit the viewport. The frame and history retained the original move ID.
- Next, walk through a featured decision and its counterfactual against live d3 in an isolated town.

## Round 26

- World displays the configured decision model's identifier. Resident evidence and the mix continue to label the recorded source, including fallbacks. Isolated Chrome at 1440 × 900 and 320 × 640 verified both labels against a local response fixture with successful decisions and deliberate fallbacks.
- The desktop Ollama tags endpoint listed the 4.8B and 2.4B d3 models, but the initial live town frame and a direct inference both timed out after 25 seconds. The GPU was at 100% utilization with approximately 11.7 GiB of its 12 GiB in use. Existing desktop processes were left running.
- The full repository gate passed. The live d3 release check still needs one successful recorded decision and double-coin comparison in an isolated town.

## Round 27

- All six resident designs now walk with twelve full-body frames each. Each frame shares a ground line and a stable head anchor. Street, Overview and doorway walks use the same atlas. Pausing holds the displayed pose, and reduced motion shows a still sprite.
- The built-in ImageGen prompts used the existing cast as identity references and requested one transparent four-column, three-row sheet per resident. The sheets show heel contact, weight transfer, passing, knee lift and the next heel contact. Arms, clothes and props move with the steps. The finished poses are packed in `art/resident-walk.png`.
- Isolated Chrome at 1440 × 900 and 320 × 640 observed all 72 poses in Street and checked pose continuity through Pause, animation in Overview and workplace doorways, and a still pose with reduced motion. The full repository verification gate passed.
- The live d3 release walkthrough remains open.

## Round 28

- Walk poses now advance with distance along each route instead of a fixed clock. Residents take fewer steps on shorter walks and hold a still pose through portions of a route where they are already on the sidewalk and have yet to move. Camera movement leaves the stride phase alone.
- Isolated Chrome at 1440 × 900 and 320 × 640 checked curb and sidewalk segments, a stationary start, overview distance, all six walk cycles, doorway motion, pause, and reduced motion. The full repository verification gate passed.
- The desktop GPU was still fully occupied at this check. Retry the live d3 walkthrough when the GPU has room for inference.

## Round 29

- Independent review verified all 72 ground-aligned frames, recognizable costume details, and pixel-identical paused motion on desktop and phone. It found that the pause banner covered Malik's boots on a 320-pixel phone.
- Playback and connection status now sit under the header clock. Phone camera controls sit below the scene, including while the resident profile is open.
- Isolated Chrome at 1440 × 900 and 320 × 640 reproduced the paused walk with visible boots and confirmed the scene stayed frozen. Phone checks covered the camera rail with a profile open and the doorway control. Chrome also verified that the reconnecting status persists across animation frames.
- The desktop GPU remained fully occupied. Next, verify the live d3 decision and counterfactual when inference can run, and commission the next release recheck.

## Round 30

- Added `npm run town:smoke` to the full verification gate alongside the legacy dashboard smoke test. It starts the actual town server on an OS-assigned loopback port with a temporary two-month heuristic checkpoint.
- Chrome at 1440 × 900 and 320 × 640 verifies the walk atlas loads, following reaches a walking scene, Pause freezes the canvas, the phone controls stay clear of the scene, and the history, recorded source, double-coin comparison and decision mix work together.
- Independent review passed the phone camera rail and paused walk with visible boots. On desktop and phone it opened a resident's exact draw, visited World, and confirmed the same profile, disclosures, Follow state and paused clock on return. It found no blockers in that flow. The live d3 walkthrough remains pending while the desktop GPU is occupied.

## Round 31

- Added `npm run town:smoke -- --live-model` with explicit `DECISION_URL` and `DECISION_MODEL` configuration. It seeds a 12-resident checkpoint and requires a recorded decision and its counterfactual to come from the named model. Both smoke modes check the exact draw, original odds and normalized comparison odds.
- A local SystemOne response fixture passed the model path at 1440 × 900 and 320 × 640 in nine requests. The full gate uses the heuristic path and remains independent of any desktop model server.
- The desktop GPU remained fully occupied. Run the opt-in check against d3 when capacity returns.
