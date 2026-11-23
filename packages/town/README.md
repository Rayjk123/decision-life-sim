# Maple Hollow

Watch one shared simulation advance on a 90-second day clock. Click a resident or select one from Residents to follow them. Open Decisions to see the selected resident's move odds and the latest town decisions. Speed and pause controls affect the local animation. Street opens the illustrated waterfront, while Overview shows the complete simulation map. Auto light follows the simulated clock. Use the lighting control to preview Daylight or Evening immediately. The waterfront and bakery are illustrated scenes, and the other interiors use the same palette with programmatic pixel art.

The [UX handoff](UX-HANDOFF.md) maps the resident, leaderboard, and world inspector views to current fields and the records needed for future historical detail.

## Run locally

From the repository root, run `npm ci` and `npm run town`, then open http://127.0.0.1:5192. The town warms up ten simulated years from seed 42 before opening. Set `DECISION_URL` to a server that supports `/v1/systemone` and `DECISION_MODEL` to its model name, such as `d3`. Without a URL, the town uses the heuristic. Configure `TOWN_DATA`, `TOWN_PORT`, or `TOWN_POP` to give local instances separate checkpoints, ports, and population sizes. Use one local server per checkpoint.

Run `npm run town:smoke` to check the watch-to-decision flow in Chrome at desktop and 320-pixel phone widths. The test starts a temporary heuristic town on a free loopback port. Set `CHROMIUM_PATH` to use a specific Chromium executable. The full verification gate runs this check as well.

## Host a shared town

Run `bash packages/town/deploy/aws.sh` from an AWS profile with CloudFormation, CloudFront, API Gateway, Lambda, IAM, and S3 deployment access. It prints a public HTTPS URL. The stack stores the private checkpoint in S3, writes with an ETag precondition, and retains the checkpoint bucket on stack deletion. The deployment artifacts have a separate private bucket. CloudFront serves the static app from a private S3 bucket. Only the town API reaches Lambda, through API Gateway with a best-effort throttle of 5 requests per second and a burst of 10. Static delivery and API requests are metered. This throttle limits downstream work and is not a hard billing cap.

The hosted app uses the heuristic. A foreground viewer requests the latest frame periodically and triggers preparation of the next month. After 15 minutes without viewers the shared clock resumes where it was last observed. The server retains one visible frame and one pending frame. Resident placement and route animation are deterministic and represent map locations, while resident money and choices come from the simulation engine.
