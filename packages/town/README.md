# Maple Hollow

Watch one shared simulation advance on a 90-second day clock. Click a resident or find one in Leaderboard. Open Advanced decision details to inspect a recorded move. Speed and pause controls affect the local animation. In Overview, inspect any of the four street pins to see who is there and what they are doing. Zoom to street opens the illustrated scene. Following a resident carries the camera between streets and into interiors. Use the lighting control to preview Daylight or Evening.

The [UX handoff](UX-HANDOFF.md) maps the resident, leaderboard, and world inspector views to current fields and the records needed for future historical detail.

Open **Lifetime history** in a resident profile for milestones by year and a net-worth chart. **World → Past residents** lets you search completed lives. An older town shows where its saved coverage begins.

Choose **View decision** during a recorded errand or in the monthly timeline. The dated evidence opens over the town. Copy the link to share it. The link opens the record while it is retained and carries a labeled copy of the evidence for after the twelve-month timeline rolls over.

## Run locally

From the repository root, run `npm ci` and `npm run town`, then open http://127.0.0.1:5192. The town warms up ten simulated years from seed 42 before opening. Set `DECISION_URL` to a server that supports `/v1/systemone` and `DECISION_MODEL` to its model name, such as `d3`. Without a URL, the town uses the heuristic. Configure `TOWN_DATA`, `TOWN_PORT`, or `TOWN_POP` to give local instances separate checkpoints, ports, and population sizes. Use one local server per checkpoint.

Run `npm run town:smoke` to check the watch-to-decision flow in Chrome at desktop and 320/390-pixel phone widths. The test starts a temporary heuristic town on a free loopback port. Set `CHROMIUM_PATH` to use a specific Chromium executable. The full verification gate runs this check as well. For Safari-engine coverage, install WebKit with `npx playwright-core install webkit` and run `npm run town:smoke -- --webkit`.

Run `npm run town:soak` for the 1,000-resident Chrome check. It accelerates the shared clock and checks reconnect, pause, Go live, model fallback, resident death, timeline retention, and browser heap after garbage collection across published months.

To exercise the configured model and its counterfactual from the same browser flow, run:

```sh
DECISION_URL='http://<ollama-host>:11434' DECISION_MODEL=d3 npm run town:smoke -- --live-model
```

The live check uses a 12-resident town. It requires a recorded decision and a double-coin comparison from the named model and checks both against the saved evidence. The full verification gate runs the heuristic check.

## Host a shared town

Run `bash packages/town/deploy/aws.sh` from an AWS profile with CloudFormation, CloudFront, API Gateway, Lambda, IAM, and S3 deployment access. It prints a public HTTPS URL. The stack stores the private checkpoint in S3, writes with an ETag precondition, and retains the checkpoint bucket on stack deletion. The deployment artifacts have a separate private bucket. CloudFront serves the static app from a private S3 bucket. Only the town API reaches Lambda, through API Gateway with a best-effort throttle of 5 requests per second and a burst of 10. Static delivery and API requests are metered. This throttle limits downstream work and is not a hard billing cap.

The hosted app uses the heuristic. A foreground viewer requests the latest frame periodically and triggers preparation of the next month. After 15 minutes without viewers the shared clock resumes where it was last observed. The server retains one visible frame and one pending frame. Resident placement and route animation are deterministic and represent map locations, while resident money and choices come from the simulation engine.
