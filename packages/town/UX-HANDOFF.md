# Maple Hollow UX handoff

## Visitor experience

The street is the landing page. A first-time visitor can watch a day unfold without opening a panel. Keep the selected lighting, playback speed, camera, and audio through panel navigation. Music defaults on and starts with the first town interaction when the browser requires a gesture. Use a quiet original lo-fi loop, offer volume control, and remember local preferences. Audio settings belong to the viewer.

Selecting a resident opens a small card. Show their portrait, occupation, age, actual balances and latest available move. Show balances in crowns and use the town frame's presentation labels for personalities and choices. Follow is an explicit control. An ordinary trip should read as part of a daily routine. Where the financial decision assigned the destination, link the errand to that month's decision. Avoid inferring motives from a sprite or assigning a purchase to an ambient bakery visit.

Resident Advanced should expose one dated decision with available options, raw odds, the actual draw, and outcome. Keep unavailable fields inside this expanded view. For example, show “Decision inputs weren’t saved for this month” when the input snapshot is absent. A resident can legitimately have no decision this month. Missing provider data and an actual heuristic fallback are distinct states.

Leaderboard opens from the street, sorts living residents by net worth in the viewed month, and lets the visitor inspect anyone listed. World dashboard labels the viewed month and shows its population, market conditions and decision activity. The resident timeline refreshes coverage and probe availability as the shared world advances, including when the scene is paused. Keep these views bound to the street's world. Preserve the scene when returning. The existing historical dashboard is the reference for charts, decisions and Hall of Fame.

## Data handoff

| Feature | Available in town frame | Needed for the deeper experience |
|---|---|---|
| Resident | Stable resident ID, name, age, career, archetype, persona, memories, cash, debt, net worth, spending level | Dated milestones and monthly net-worth/income/expense series from the same live world's journey store. Frame balances use cents. Journey files use their documented units. |
| Monthly decision | Picked move, raw main probabilities, ordered sampling odds, sampled move, rule validity, provider/model, draw, errand destination when applicable | Persist the complete engine DecisionRecord keyed by world, month and resident. Retain the latest meaningful decision across months. Include ordered legal moves, descriptions, state snapshot, all answers, actual provider/model, validity, latency and heuristic comparison. The retained timeline already carries sampling, draw, source and outcome. |
| Personal “why” | Current character and financial state | The timeline compares selected pre-decision inputs and offered moves. New decisions privately retain a reproducible double-coin variant request or its heuristic odds, with availability exposed per month. What changes the odds? compares both raw distributions for the double-coin scenario. A model decision can be probed only while its request and matching configured model are available. |
| Town and leaderboard | Living residents, market conditions, Guild Fund return, house loan rate, current decision counts, and retained decision mix by personality and recorded source | Publish same-world annual aggregates, deceased residents' records, peak wealth and dated decision history. Introduce a stable world ID and a replay link carrying world, month, resident and decision. |
| Activity | Seeded visual routine; financial moves have an errand mapping | If additional activity decisions are added, persist activity source, destination, time interval and optional financial decision ID. Ambient activity should never change the ledger by itself. |

The scene calls GET /api/town. Its checkpoint contains the current and pending frame plus up to eleven prior compact monthly balance and decision-evidence snapshots. GET /api/town/history/{resident} reads the retained timeline without advancing the world. GET /api/town/mix/{month} reads retained decision counts through the viewed month. GET /api/town/probe/{resident}/{month} returns the double-coin comparison without advancing the world. The older dashboard reads public month, decision, journey and leaderboard files written by WorldStore. Future work should publish those read models from the authoritative shared world and load detail on demand. A UI placeholder needs an absence state and a named data dependency. Invented trends, example money and simulated model identifiers would undermine the article.

## Acceptance walkthrough

1. Open the street on a desktop and phone. Check default playback, first-interaction playback when autoplay is blocked, and that mute and volume survive a reload.
2. Click a resident while the camera is stationary. Inspect their balances. Follow, stop following, and inspect another resident.
3. Expand Advanced for a resident who decided and one who did not. Check raw odds and the recorded draw; exercise absent inputs, provider and historical records.
4. Open Leaderboard, inspect a ranked resident, visit World dashboard, then return to the street. Verify month, camera and sound continuity and usable keyboard controls.
5. When the history pipeline lands, replace each placeholder with a record from the same world and month. Verify one featured decision end to end before using it in an article.
