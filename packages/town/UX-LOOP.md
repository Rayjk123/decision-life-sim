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
