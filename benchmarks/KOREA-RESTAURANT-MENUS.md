# Korean and English menus from restaurants in Korea

This is a **separate restaurant-menu corpus**, not package labels or photos of
prepared dishes. Its first pilot contains original bilingual Korean/English
menu photographs from Wikimedia Commons, with source, author, license and
SHA-256. Restaurant location is documented from the source, not guessed from
the language alone. Historical menus are OCR material, not current restaurant
or allergy advice.

The19 October2026 discovery downloaded6 candidates. Visual screening kept3
printed menus from2 venues in Seoul: a2001 Starbucks board and2 Lago Pasta
pages photographed in2017. The other3 images were plated food, so excluded
from this deferred recipe-inference use case. This is a small convenience
pilot, not a large or representative collection. Both scripts occur in all3
photos; English dish titles and Korean descriptions are correlated, **not6
independent monolingual samples**.

## Collection and references

```sh
.venv/bin/python benchmarks/collect-menus.py \
  --output benchmarks/data/NEW-MENU-DISCOVERY --limit 24
```

This makes bounded Commons API searches, accepts only explicit CC BY/CC BY-SA
or public-domain rights with author attribution, downloads original JPEG/PNG
bytes, decodes them and records hashes. It preserves partial provenance and
stops on network/access/service errors. It does not retry blocked hosts, use
relays, scrape restricted retailers, infer location from Korean text, or
create reference labels from provider/OCR text. It never automatically uploads
raw photos to GitHub, a training service or app assets. Read each source page
and possible third-party rights before reuse; retain attribution and licenses.

The initial requests were denied by the environment proxy with CONNECT403,
including a supported escalated check. Commons access subsequently worked;
the successful download is preserved separately from the earlier errors.
Custom network destinations needed for this collector are
`commons.wikimedia.org` and `upload.wikimedia.org`.

After download, visually verify printed menus, actual Korean venue, languages,
legibility and rights. Reject food photographs, overseas Korean restaurants,
nonmenus and unsupported rights. Keep rejected records and reasons. An empty
or blocked discovery must not be reported as a completed dataset/accuracy test.

Before running evaluated OCR, write a frozen `menu-evidence.jsonl` beside the
images. The local pilot is
`benchmarks/data/korea-real-menu-pilot-2026-10-19-v1/`. Each row includes:

- `kind: real_restaurant_menu`, stable capture identity and `split: development`;
  `reference_method: model_visual_before_app_ocr`, `human_reviewed: false` and
  a freeze timestamp. Do not invent human reviewers or a holdout.
- `restaurant.name`, `country: KR` and quoted source evidence for location;
  verified `languages: [ko,en]` for this bilingual pilot.
- Original `images` with relative path, SHA-256, source URL, author and license.
  Duplicate image bytes are rejected; multiple pages are not independent venues.
- Visually read `entries`: printed name, partial `printed_text`, and
  `positive_allergens` with an `ingredient_quote` for each known positive entry.
  `unassigned_evidence` holds quoted restaurant-wide warnings that must not
  silently be attributed to a nearby dish.

Only explicitly printed ingredients count. Cream/cheese/squid/shrimp can be
mapped to their allergen concepts; do not infer wheat from pasta/pizza, nuts
from pesto, milk from latte or fish/shellfish categories from generic seafood.
An empty positive list means **unknown**, not allergen absence or a safe dish.
Do not derive references from the app OCR under test or relabel misses to match
its predictions. The pilot's38 titles and20 known positive dish/allergen pairs
are partial model-visual evidence, not independent human ground truth.

## Test the actual menu path

```sh
npm ci
npm run build:mobile
node benchmarks/diagnose-menu.mjs \
  --dataset benchmarks/data/korea-real-menu-pilot-2026-10-19-v1/menu-evidence.jsonl \
  --app-root benchmarks/results/candidate-source-1.6.3-r4 \
  --output benchmarks/results/NEW-MENU-RUN \
  --timeout-ms 90000
```

The frozen source path above is retained in the local review archive; omit
`--app-root` to test the current checkout instead and record its commit/hashes.
Chromium and supported loopback/worker process access are required. The runner
uses **`analyzeProducts(...,{purpose:'menu'})` → `evaluateMenu`**, the same source
path as the web/mobile UI. Package-allergen scoring alone would test the wrong
feature. Primary official language models are local and external HTTPS is
blocked during inference. Original source photos are used, not edited/cropped
menu transcriptions. Camera, WebView and physical-phone timing are not included.

It writes raw predictions, sources and word confidences; desktop latency,
deadlines, failures, implementation/model/dataset hashes and a summary. It
rechecks input integrity before finalizing. Use a fresh output directory; do
not edit source, runner, evaluator, manifest, images or model assets while it
runs. Missing/time-limited predictions remain misses.

Known dish/allergen detection requires the **correct normalized printed dish
title**, not just the allergen elsewhere on the page. Exact-title misses are
conservative and should be inspected separately from OCR token misses. Report
unknown extra associations for review rather than declaring them false
positives against partial references. Count quoted global cautions separately.
Any safe/clear item or `safe_items` output violates current fail-closed policy.
CER/WER, precision and false-positive rate remain unavailable without complete
independent references. A green test suite is not a menu-accuracy result.

## Expansion before relying on results

Expand to independent venues, regions and cuisines, with genuinely English-only,
Korean-only and bilingual menus. Include names-only menus, ingredient-rich
descriptions, allergy legends, global caution text, columns, prices, small
print, glare, curved/folded pages, tilted and partial camera captures. Do not
prefer only menus whose ingredients were easy for OCR to read. Group venue and
menu edition before splitting; freeze held-out venues before tuning.

Two independent Korean/English reviewers should transcribe full text, draw
dish/description regions and annotate explicit ingredient associations,
negations, global warnings, omissions and required abstention, then adjudicate.
Use that reference to measure OCR CER/WER, dish discovery, ingredient-to-dish
association, per-allergen recall/missed pairs, false positives and unsafe
negatives. Record p50/p95 cold/warm processing on actual representative phones.
Neither these photos nor this development pilot train a model automatically.
