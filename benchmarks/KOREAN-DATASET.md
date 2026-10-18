# Korean food-label benchmark

This workflow separates real photographs, manually reviewed references,
synthetic debugging fixtures, OCR, extraction, and allergen semantics.
**Generated labels are never evidence of accuracy on real packages.**

For the requested larger stages (1,000 Korean products, then 10,000 English
ingredient photos), use [BULK-DATASET.md](BULK-DATASET.md). It documents the
provider's official AWS bulk route and separates candidate, downloaded and
reviewed counts.

## Collect actual label photographs

```sh
python benchmarks/collect-off.py --output benchmarks/data/off-korean-candidates --pages 3 --limit 40
```

This needs HTTPS access to `world.openfoodfacts.org` and
`images.openfoodfacts.org`. The script uses the public search API at a bounded
rate, selects photos explicitly identified as Korean ingredient photos, saves
the original photo, API metadata, author attribution, and SHA-256. Candidates
without an attributable author are excluded. The API integration must be
verified against an actual response; unit fixtures alone do not prove access.

On 2026-10-18 the search endpoint returned HTTP 503 and the image host returned
an explicit request to stop automated requests because the service was
overloaded. Collection was stopped; do not retry in a loop or use mirrors to
evade this response. No real photographs were obtained in this attempt.

The generated `candidates.jsonl` is **unreviewed**, not a scoring dataset. Country
tags and imported allergen/ingredient fields are hints and can be wrong. Do
not generate reference labels with the OCR/model being evaluated. A Korean
ingredient photo can still omit another side or warning sticker.

Open Food Facts [documents its licenses here](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/tutorials/license-be-on-the-legal-side.md):
database ODbL 1.0; individual contents DbCL 1.0; product images CC BY-SA 3.0,
with possible third-party rights in graphical elements. Read the provider's
terms before reuse. Retain attribution and distinguish imported database
metadata, photos and newly authored annotations. The collector does not
upload or publish images. Raw data/results are ignored by Git and excluded
from the mobile build allowlist.

## Annotate before running OCR

Start with a clearly labelled provisional pilot of 20–40 independent SKUs,
then expand toward the larger protocol in `README.md`. Include direct and
precautionary statements, products with no selected allergen declaration,
cocoa/nut fats, small print, glare, curvature, rotation, import stickers and
incomplete/nutrition-only photographs. Do not treat one capture's omissions
as proof about the entire product.

Each JSONL row in `labels.jsonl` represents a capture of one product, with up
to three photographs. Its fields are:

- `product_id`, `family_id`, `capture_id`: stable identifiers; variants and
  recaptures of the same product family must stay in the same split.
- `kind`: `real_package` or `synthetic`; `language`: `ko`; `split`:
  `development`, `validation`, or `holdout`.
- `annotation`: `status` (`single_review` or `adjudicated`), `reviewers`
  (distinct people/identifiers), and optionally notes on disagreement.
  A model is not an independent second human reviewer.
- `images`: objects with relative `path`, exact file `sha256`, independently
  transcribed complete visible `transcript`, `source_url`, `license` and
  `attribution`. Do not correct spelling on the package or use API text as a
  verified transcription. Record visible text in reading order, with newlines.
- `ingredients`: original top-level ingredient strings, keeping nested
  parentheses intact, excluding separate allergen/storage/nutrition text.
- `direct_allergens`, `caution_allergens`: current app category IDs.
  Direct evidence takes precedence when the same allergen has both contexts.
- `required_abstention`: true for captures where a reassuring negative is
  unsupported, such as incomplete panels. Recognised positive evidence can
  still warrant a warning on an incomplete capture.

The current scored categories are milk, egg, peanut, tree nuts, soy, wheat,
sesame, fish and shellfish. **This is not complete Korean regulatory allergen
coverage.** Buckwheat, peach, tomato, pork, beef, chicken and sulfites, for
example, require additional ontology/profile work and separate evaluation.
This benchmark does not evaluate custom avoidance terms or glossary
translation quality.

Freeze holdout labels, product-family assignments and image hashes before
tuning. Do not move failed cases into development or revise their labels to
agree with predictions. Two independent reviewers should adjudicate release
references; `--allow-provisional` explicitly permits a single-review pilot
and labels its report provisional. Unknown/unreviewed references are rejected.

## Run the shipped source adapter

```sh
npm ci
npm run build:mobile
node benchmarks/run.mjs --dataset /path/to/labels.jsonl --output benchmarks/results/korean-baseline
# For a separately labelled, provisional single-review pilot only:
node benchmarks/run.mjs --dataset /path/to/labels.jsonl --output benchmarks/results/korean-pilot --allow-provisional
```

Chromium is required (`CHROMIUM_PATH` can override its path). In the restricted
cloud sandbox, use the supported execution permission for loopback sockets.
The runner imports the actual `src/tesseract.js` `analyzeProducts` function
with the official bundled primary `kor/eng/fra` models. It tests that source
adapter with local assets, not camera interaction or a physical phone. It
intercepts page HTTPS requests; unbundled experimental models may be
unavailable and their failures/timeouts must stay in the results. A fresh
Chromium profile is used. Each capture creates workers as the app does.

Outputs are `predictions.jsonl` (all sources/confidences/failures),
`summary.json` and `metadata.json` (commit, dirty state, dependency/model/source
hashes, dataset hash, browser, CPU, timeout and timing scope). Use a new
output directory for every run. A partial interrupted run has no completed
summary and must not be presented as a passing benchmark.
Source/model hashes and the manifest/image checksums are rechecked before
the completed summary is written; changed inputs invalidate the run.

## Metrics and practical limits

- CER/WER use NFC-normalised, lower-case, whitespace-collapsed text. CER
  operates on Unicode code points, important for Korean. Errors can exceed
  100% if insertions dominate. OCR uses the **first original primary source
  retained by the adapter for each photo**, never whichever reading best
  matches the reference. Multiple rotated panels may not be fully represented
  by that canonical transcript; inspect the other retained sources too.
  A second CER with whitespace removed distinguishes syllable spacing errors
  from character recognition errors; do not substitute it for the strict CER.
- Direct, caution and combined allergen precision/recall/F1 are separate.
  Reports show per-allergen denominators, missed positive pairs and capture
  IDs. A caution classified as direct can count as combined detection while
  still being a context error. Zero-positive categories have null recall.
  False-positive rates use label-reference negatives within the nine-category
  universe, not verified absence of allergens in the physical product.
- `missed_positive_pairs` includes abstentions and failures. An abstention is
  not a detected allergen. `unsafe_negative_captures` counts reassuring
  negatives on known-positive/required-abstention captures;
  `reassuring_negative_captures` also exposes any negative output at all,
  which violates the current app policy. Both should remain zero.
- Ingredient scores compare normalised top-level row strings exactly. These
  are extraction metrics, not chemical identity or glossary correctness.
- Failures and missing predictions remain in denominators. Zero-test runs,
  checksum failures, unreviewed references, duplicate captures and split
  leakage cannot produce a valid benchmark.
- Latency is successful-call desktop p50/p95, including preprocessing,
  worker/model initialisation, rotation and retry; image retrieval, camera
  and CDN downloads are excluded. Timeouts/failures are listed separately,
  so a fast successful median cannot hide failed captures. First/subsequent
  call labels are retained but are not a statistically sound cold/warm phone
  benchmark. Run repeated cold/warm sessions on actual target phones too.
- A separate reference-text semantic result shows errors that persist even
  with perfect OCR; these call for logic/ontology fixes, not model training.

## Debug the workflow without real photographs

```sh
python benchmarks/generate-synthetic.py
node benchmarks/run.mjs --dataset benchmarks/generated/korean-debug-v1/labels.jsonl --output benchmarks/results/korean-debug --allow-provisional --timeout-ms 15000
```

This creates **18 synthetic captures from nine templates and zero real
packages**, using installed Noto Sans CJK fonts (not bundled). Their text is
specified before rendering, not read back from OCR. These are development
fixtures only, with no independent held-out population or human review pair.
They can expose spacing, context, non-dairy and timeout bugs; they cannot
establish real-package accuracy or justify a public safety claim.

## Decide whether to train

First compare perfect-reference semantics with image-to-result behavior.
Fix reproducible context/extraction/dictionary bugs independently. For actual
OCR errors, compare primary language/model settings and preprocessing on
development data before changing the recogniser. Do not deploy a synthetic-only
gain as a proven improvement on real packages.

Fine-tuning needs a substantially larger, legally usable, independently
transcribed training corpus with representative lines/characters and separate
product-family validation/holdout sets. Training on the evaluation set or
reusing augmented versions of its photos in training leaks the answers. Save
training code, seed, data/model hashes, environment, checkpoint and before/after
holdout metrics. Keep a candidate checkpoint separate until recall, false
positives, abstention behavior, phone latency and resource use are validated.
Insufficient data or a blocked provider means training is **not performed**,
not that the current model has been shown to need no training.
