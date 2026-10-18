# Bulk Korean and English ingredient-label collection

Requested targets are **up to 1,000 products with Korean ingredient labels**
and **10,000 English ingredient-label photographs** of global food products.
These are targets, not counts of obtained or independently annotated data.
A label language does not establish the product's country of manufacture.
Actual counts and limitations are in [the dated collection report](BULK-STATUS-2026-10-18.md).

## Source and rights

Use the provider-supported Open Food Facts AWS export/image route:

- [Download many images from AWS](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/how-to-download-images.md).
- [Official image and public Google Vision OCR buckets](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/aws-images-dataset.md).
- [Official catalog redirect](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/conf/nginx/snippets/off.locations-redirects.include):
  `https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/openfoodfacts-products.jsonl.gz`.
- Image origin: `https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/`.
- [Provider's rights documentation](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/tutorials/license-be-on-the-legal-side.md):
  photos CC BY-SA 3.0, database ODbL 1.0, individual contents DbCL 1.0,
  with possible third-party rights.

Keep source partitions and photo attribution. Public retail availability is
not a blanket reuse license. No retailer crawler, login/CAPTCHA bypass,
proxy rotation, raw-photo publication, or third-party training upload is part
of this workflow. Before distributing a database/model, review the applicable
share-alike, attribution, database and third-party rights obligations.

The first 2026-10-18 network checks failed at the environment proxy (403).
After network access changed, the official AWS catalog/images and public OCR
were accessible. The main OFF service had separately requested stopping
retrieval during overload; do not loop against it or substitute main-server
URLs after a bulk failure. The AWS route is explicitly recommended for bulk use.

Later site checks: Coupang robots returned 403; Amazon robots disallowed
GPTBot; AI Hub public policies were readable, but downloads need identity,
application and dataset-specific permission. Its commodity-identification and
prepared-meal datasets do not provide independently transcribed ingredient
references for this task. Food Safety Korea robots returned 503. No retail or
restricted AI Hub images were collected. This is currently a single-provider
collection, not a multi-retailer corpus.

## Reproducible setup

From the repository root, with Python 3.11.9:

```sh
uv pip install --python .venv/bin/python -r benchmarks/requirements.txt
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
```

Use supported execution permissions for the FastAPI TestClient's local
communication when running the complete suite in a restricted sandbox.
The collector needs HTTPS access to the two exact official AWS origins;
no API key is needed. TLS verification remains enabled. Connections are
reused per worker; redirects and automatic network retries are disabled.
Connections are retired after 45 seconds to limit the lifetime of a proxy
tunnel; this did not establish a fix for the observed intermittent 503 errors.

## Freeze oversampled candidate queues

`bulk-off.py` streams a local official JSONL export (`.gz`, `.bz2` or plain)
or the exact documented catalog URL. A remote multi-GB catalog is not stored
in full or loaded into memory.

```sh
.venv/bin/python benchmarks/bulk-off.py prepare \
  --catalog https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/openfoodfacts-products.jsonl.gz \
  --output benchmarks/data/NEW-CANDIDATES \
  --ko-products 1000 --en-candidates 20000 --max-records 10000000
```

Use a new directory; existing queues cannot be replaced. Outputs are
`ko-candidates.jsonl`, `en-candidates.jsonl` and `selection.json`. Selection
requires explicit `ingredients_ko`/`ingredients_en` image metadata and an
original image uploader. Barcode normalization collapses UPC/zero-prefix
aliases. One original photo per product/language is selected.

**Metadata can be wrong:** actual pilot images included another language,
front-only photos, toys and cosmetics. Candidate counts do not establish
food suitability, correct language, readable ingredients or panel completeness.
The 20,000 English candidates oversample for exclusions and duplicates.

Reports preserve ETag/Last-Modified, queue SHA-256, catalog line and a hash
explicitly scoped to the scanned uncompressed prefix. The remote byte-key
prefilter validates JSON for candidate records; local exports validate every
nonempty record. Checkpoints are written every 25,000 records. A record cap,
interruption or truncated gzip stream must not be called a complete catalog.
Complete records in a preserved partial queue can still be collected with
that limitation recorded. Do not blindly restart a 13 GB transfer to conceal
an EOF: diagnose the transfer/source and preserve the original report.

Export-order selection is a convenience sample, not a global representative
holdout. A later shuffle cannot undo its catalog-selection bias.

## Pilot and source screening

Download a small raw pilot with `bulk-off.py download` and visually inspect
language, food/non-food, small print, glare, rotation and missing panels:

```sh
.venv/bin/python benchmarks/bulk-off.py download \
  --queue benchmarks/data/NEW-CANDIDATES/ko-candidates.jsonl \
  --output benchmarks/data/NEW-KO-PILOT --limit 100 --workers 2 --delay 0.3
```

`screen-off.py` optionally uses OFF's already public Google Vision OCR files
(`original-image-id.json.gz`) to screen likely label language/panel content.
It does not submit images to a new OCR service. Source OCR is **not independent
reference text**, an app prediction, an allergen result, or a completeness
check. Its readability bias must be disclosed; retain excluded/challenging
candidate IDs for separately annotated challenge tests.

```sh
.venv/bin/python benchmarks/screen-off.py \
  --queue benchmarks/data/NEW-CANDIDATES/ko-candidates.jsonl \
  --output benchmarks/data/NEW-KO-SCREENED --language ko \
  --limit 1000 --workers 2 --delay 0.3 --cache benchmarks/data/NEW-KO-PILOT

.venv/bin/python benchmarks/screen-off.py \
  --queue benchmarks/data/NEW-CANDIDATES/en-candidates.jsonl \
  --output benchmarks/data/NEW-EN-SCREENED --language en \
  --limit 10000 --workers 4 --delay 0.2 \
  --provider-ocr-cache benchmarks/data/PROVIDER-OCR-CACHE
```

`--cache` can be repeated. Cached photo paths/hashes are verified before use;
source screening is still performed for a new collection.
The optional public-OCR cache pins URL and compressed-file SHA-256; changed
bytes fail integrity checking. It stores provider output separately from blank
human-reference worksheets. A cached response is not a human transcription.
Screening version, language and script hashes are pinned. Changed rules require a new output;
reuse verified cached images instead of mixing rule versions silently.
English screening looks for ingredient/food-word context; Korean screening
looks for Hangul plus ingredient/declaration cues. Explicit cosmetic, cleaning
and toy-use phrases are excluded; technical chemical names alone do not make
a product non-food. These heuristics still need manual quality review.

The bounded pool supports 1–8 workers and preserves queue order. `--delay`
spaces **candidate dispatches**, not every HTTP call: a screened candidate
can need both an OCR-file request and a photograph request. Use a modest pool;
respect denials, rate limits and service failures. No automatic retries or
fallback hosts are used. A 404 is an exclusion (monthly snapshots can omit
images/OCR); other access/service/integrity failures stop new dispatches and
preserve completed records. Resume only after a meaningful access/service
change, with the unchanged queue/output/code. Document diagnosis and recovery.

Downloaded images have bounded size, decoder verification, dimensions and
SHA-256. Byte-identical photos do not inflate the within-output count. Resume
checks hashes before requests. `download.json`, `downloaded.jsonl` and
`excluded.jsonl` distinguish a target reached from a queue exhausted below
target. `source_screening_UNVERIFIED` is never a human annotation.

## Independent annotation and evaluation

Create a blank worksheet only after collection:

```sh
.venv/bin/python benchmarks/export-review.py benchmarks/data/NEW-KO-SCREENED
```

`labels-UNREVIEWED.jsonl` has empty transcripts, null allergen/abstention
fields, no reviewers and unassigned family/split. It deliberately cannot be
scored. The exporter verifies images and refuses to overwrite annotator work;
provider text, OCR and allergen hints are not copied into reference fields.

Two people independently transcribe visible text and annotate direct versus
precautionary allergen evidence, missing panels and required abstention;
adjudicate disagreements before release evaluation. Preserve original ingredient
names, with simple English/Korean explanations authored separately. A model's
visual screening is not an independent human reviewer.

Globally group product families and duplicate/near-duplicate photos across
languages and sources before freezing development/validation/holdout. One
bilingual photograph can occur in both queues; two language rows are not two
independent images. Per-output byte deduplication alone does not prevent leakage.

Use [KOREAN-DATASET.md](KOREAN-DATASET.md) and [the benchmark protocol](README.md)
for CER/WER, per-allergen recall, false negatives/positives, context errors,
abstention, unsafe negative output and target-phone p50/p95 latency. Keep
failures in denominators. Uncertain inputs remain unverified. No new training
or accuracy claim follows from collecting unreviewed photos.

Raw photos/catalogs/results remain under ignored `benchmarks/data/` or
`benchmarks/results/`, outside mobile assets. Data-tool changes do not deploy
an app, produce an APK or publish to Google Play/App Store.
