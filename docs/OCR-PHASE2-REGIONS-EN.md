# Phase 2 — Korean/English label OCR: contrast and original-resolution regions

Status: **experimental**. This branch is not a validated recognition or food-safety release. The current public `main` and Pages deployment remain unchanged.

## Motivation

The previous user-run Korean food-label screenshot showed several readable allergen words but also corrupted Korean characters, units, and nutrition-table rows. A full-photo OCR pass is not always sufficient for small print. The screenshot alone cannot establish a numeric accuracy improvement.

## Implementation

- `src/image.js` adds `labelRegionGeometry`, `sharpenLabelPixels` and `labelReadCanvases`.
- Geometric crops overlap by about 36% along the split axis. They are built lazily, one at a time, from the original photo if available, and are bounded to a 2400-pixel longest side.
- Each crop uses existing deterministic grayscale / contrast normalization plus limited unsharp masking. No generated letters or synthetic confidence values are created.
- `src/tesseract.js` retains the current reduced passes and full original image pass, then adds the optional Korean/English regional reads for food-package shopping labels. Menu OCR retains its separate specialized path.
- Existing `mapMenuItems` maps crop word boxes to original coordinates and marks text near artificial crop boundaries as incomplete; an item that is clipped must remain uncertain downstream.
- No photograph, user allergy profile, or OCR output is sent to external servers. No new model weights, cloud APIs, fine-tuning, or federated updates are introduced.
- App languages and all technical code/comments/results remain English/Korean only.

## Checks and acceptance

Unit checks: `node --test tests/label-regions.test.mjs`; regression: `npm test`, `npm run test:browser`, and manual screenshot comparisons on representative English/Korean food labels.

**Not yet completed:** full repository CI after adding the change, browser/device real-image performance comparison, independent reference transcriptions, holdout testing, confidence calibration, and real-device latency measurements. Avoid merging based only on unit tests.

Compare identical original photos on the existing baseline versus this branch. Track OCR CER/WER, missed allergen terms, direct-versus-precautionary context errors, crop-clipping abstentions, per-image time, and memory. A high-looking character recognition rate does not establish full ingredient coverage. The current fail-closed `unverified` policy must remain.

## Local diagnostic (separate from production)

The standalone Windows lab can compare original full-image OCR, enhanced full-image OCR, and enhanced overlapping region OCR on the same photograph. This tool has a separate downloadable package and does not modify the deployed app. Region merged text is exploratory; prefer raw per-region reads when investigating duplicates or reading order. Input photos stay in browser memory and are not included in exported JSON.

## Release decision

Merge only after real-image evaluations show improvement with no degradation of established safety invariants, and the app tests pass. The experimental branch intentionally does not change the production service worker version or publish a store build.
