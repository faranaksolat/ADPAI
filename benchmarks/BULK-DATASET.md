# Bulk Korean and English ingredient-label collection

Targets requested by the user, in order:

1. Up to **1,000 distinct products with Korean ingredient labels**.
2. Then **10,000 English ingredient-label photographs** from global products.

These are targets, not counts of obtained or reviewed data. An English label
does not establish country of manufacture; neither does a Korean label.
The current selector chooses one attributed original ingredient photograph
per product and language, so its English queue also has distinct product IDs.
There is no guarantee the catalog contains enough qualifying Korean photos.

## Sources investigated and current access

On 2026-10-18, read-only requests to `www.coupang.com`, `www.amazon.com`,
`www.aihub.or.kr`, `www.data.go.kr`, and `www.foodsafetykorea.go.kr` failed at
the environment's CONNECT proxy with HTTP 403. This is not evidence of what
those sites' robots rules or terms say: their content was not accessible.
No retailer crawler, login bypass, proxy rotation or CAPTCHA workaround was
implemented. Site-specific collection needs actual access, applicable terms,
and usable photo rights first. This change does not claim multi-retailer data.

The official Open Food Facts documentation provides an intended bulk route:

- [Download many images from AWS](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/how-to-download-images.md).
- [Official image bucket and metadata](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/aws-images-dataset.md).
- [Official catalog redirect](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/conf/nginx/snippets/off.locations-redirects.include):
  `https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/openfoodfacts-products.jsonl.gz`.
- Image host: `openfoodfacts-images.s3.eu-west-3.amazonaws.com`.
- [Provider's rights documentation](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/tutorials/license-be-on-the-legal-side.md):
  photos CC BY-SA 3.0, database ODbL 1.0, individual contents DbCL 1.0,
  with possible third-party rights.

The image bucket HEAD check also failed at the environment proxy (403).
The catalog and image domains were added to the environment configuration
draft, preserving previous domains. A draft save does not activate network
access. Do not use unrelated hosts or repeat requests against the overloaded
main OFF service. The AWS route is explicitly recommended by the provider
for bulk work; use it after supported network access is available.

Keep provider metadata/photos in separate source partitions. A public retail
page is not a blanket reuse license. Do not automatically republish photos,
combine source databases, or upload training data to a service. Retain source,
uploader, image ID, license/attribution, catalog line and export provenance.
Review license obligations before distributing a derivative database/model.

## Prepare candidate queues

`bulk-off.py` supports a local official JSONL export (`.gz`, `.bz2` or plain)
or the exact documented catalog URL. It streams records, without loading a
multi-GB export into memory or saving the full remote export to disk.

```sh
.venv/bin/python benchmarks/bulk-off.py prepare \
  --catalog https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/openfoodfacts-products.jsonl.gz \
  --output benchmarks/data/off-bulk-candidates-v1 \
  --ko-products 1000 --en-images 10000 --max-records 1000000
```

Use a new output directory. The command creates `ko-candidates.jsonl`,
`en-candidates.jsonl`, and `selection.json`. Only explicit `ingredients_ko`
or `ingredients_en` selections with an original image author are accepted.
Front-only, nutrition-only and unknown-language photos are not substituted
to fill the target. Barcode normalization collapses UPC/zero-prefix aliases.

Candidate counts are **not downloaded or annotated image counts**. Reports
show these separately, including incomplete scans, shortfalls and source
errors. Export ETag/Last-Modified are retained for a remote run, along with
queue hashes and a hash explicitly scoped to the scanned uncompressed prefix.
Selection is a convenience sample in export order, not a representative
holdout. Country tags or ingredient/allergen text from the catalog are not
manually verified labels.

## Download a pilot, then expand

```sh
.venv/bin/python benchmarks/bulk-off.py download \
  --queue benchmarks/data/off-bulk-candidates-v1/ko-candidates.jsonl \
  --output benchmarks/data/off-ko-images-v1 --limit 100

# After the source/access issue is resolved and the pilot is inspected:
.venv/bin/python benchmarks/bulk-off.py download \
  --queue benchmarks/data/off-bulk-candidates-v1/ko-candidates.jsonl \
  --output benchmarks/data/off-ko-images-v1 --limit 1000

# Second stage, after the Korean stage:
.venv/bin/python benchmarks/bulk-off.py download \
  --queue benchmarks/data/off-bulk-candidates-v1/en-candidates.jsonl \
  --output benchmarks/data/off-en-images-v1 --limit 10000
```

The exact same queue/output can resume: existing image hashes are verified
before any request. The downloader uses one request at a time with a one-second
delay, bounded image size, decode verification, saved dimensions and SHA-256.
It stops on access denial, rate limiting, service failure, non-image responses
or corrupted data; it never switches to a main-server URL after a bulk failure.
The monthly AWS snapshot can omit recent images: 404 is recorded as an
exclusion. Byte-identical images are excluded and do not inflate the count.
Partial progress/provenance survive a later failed request. A completed
queue scan can still fall short of the requested image target.

The code/fixture tests verify this workflow, not the remote integration or
food-label accuracy. `downloaded.jsonl` remains **unreviewed** and is not a
`labels.jsonl` reference dataset. Inspect small print, real label language,
panel completeness, glare, misleading stickers and missing warnings manually.
Do not use the OFF text or its Google OCR results as independent ground truth.

## Annotation and evaluation after collection

Annotate and adjudicate the actual visible text and direct/precautionary
allergens before running the evaluated OCR. Preserve original technical
ingredient names; author simple English/Korean explanations separately.

Group product families and duplicate/near-duplicate photos globally across
languages and sources before freezing development/validation/holdout. The
same bilingual photograph can be selected in both language queues; two
language rows are not two independent photographs. The downloader deduplicates
within its output, and further cross-output/near-duplicate review is required.

Use the schema/metrics in [KOREAN-DATASET.md](KOREAN-DATASET.md) and the
[real-package protocol](README.md). Expand allergen/condition coverage and
stratify by product category; do not tune on the holdout. Report CER/WER,
per-allergen recall, false-negative/false-positive pairs, abstention, unsafe
negative output, extraction and target-phone latency separately. Uncertain
inputs stay unverified. No model training is justified by queue counts alone.

Raw photos, source catalogs and candidate/results files stay under ignored
`benchmarks/data/` or `benchmarks/results/` and outside mobile assets.
