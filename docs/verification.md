---
title: Shipping Maple Hollow with verification evidence
nav_order: 10
---

# Shipping Maple Hollow with verification evidence

Maple Hollow is a watchable pixel town backed by a decision model. Its release candidate is a 100-year recording of a town targeting 200 residents. The review question is whether someone can load the packaged site, follow the town across dates, and inspect the same E06 decisions the generator saved.

## What changed

The first local preview used a one-off adapter and browser walkthrough. The repository now builds the static replay, tests it through the public UI, and emits a review packet. [Lauren Tan’s verification skill](https://github.com/cursor/plugins/blob/main/pstack/skills/create-verification-skill/SKILL.md) informed the separation between the [project skill](../.agents/skills/verify-maple-hollow/SKILL.md), its [feature map](../.agents/skills/verify-maple-hollow/references/feature-map.md), and executable evidence.

| Gate | What the reviewer gets |
|---|---|
| Data and packaging | Every month decompresses in order, each resident has a matching timeline row, and every recorded decision agrees with the declared model. A deliberately corrupted month must fail before the site entry point is written. |
| Browser journeys | Four districts, a jump to the final month, a named resident’s history, a dated decision link, lifetime wealth, personality mix, and a phone layout. Screenshots let reviewers inspect the result directly. |
| Recovery | A forced HTTP 503 at the final-month boundary. The test observes the reconnect state and checks that the date remains on the last good frame until the first month loads. |
| Delivery | The client loads its data from static files, including both raw and HTTP-decoded gzip. The test checks that no API calls occur and the private checkpoint is inaccessible. |

## Reproduce the result

For any checkout, `npm ci` followed by `npm run verify -- --all` runs the standard gates and the deterministic replay fixture. The fixture requires Chrome and makes no model calls. GitHub Actions attaches the report and browser evidence to both Node matrix jobs.

For an actual release, run this from a clean checkout with a complete recording and fresh output paths.

```sh
npm run town:replay:verify -- \
  --source <recorded-run-dir> \
  --site <new-static-site-dir> \
  --evidence <new-evidence-dir>
```

The report records the commit, working-tree status, bundle digest, browser, timing, and results. Keep that exact site directory with the report so a reviewer can identify the tested bundle. On failure, open the saved Playwright trace to see the browser actions and network state.

## How I use the evidence

The code author runs the narrowest failing journey, fixes the cause, and reruns the larger gate. A reviewer can start with the report, screenshots, and failure demonstration. If a bug escapes, the follow-up changes the feature map or adds a failing assertion at the layer that should have caught it.

The E06 recording contains **1,200 consecutive months, 207,287 model decisions, zero heuristic fallbacks, and 629 lifetime histories**. Those counts describe the data exercised. The gate does not evaluate E06’s financial judgment, establish that the music sounds good, or verify a production CloudFront distribution. Those claims require model evaluations, listening, and a check of the deployed candidate respectively.
