# ADPAI: Korean packaged-food 100-item reliability pilot

## Priority and current state (2026-11-10)
Target: 100 independently checked physical Korean retail products, then 1,000.
Current validated package-label records in the first-party catalog: **0**.
The two real Nongshim barcodes in data/catalog-korea-review-queue.json are
**candidates only**; live public-catalog lookup did not prove Korean ingredients.
No verified real-world allergy accuracy, mobile end-to-end recall, or safety
claim exists yet. All source code and preliminary tests remain on the private
feature branch; the production site and app store are unchanged.

## Capture and independent reference
1. Get consent and provenance for each original physical Korean-market
   package. Record full GTIN, exact product name, weight/variant, photograph
   timestamp, image SHA-256 and a private image reference; **do not commit
   unlicensed package photos or user data to the repository**.
2. Capture the complete Korean ingredient panel, allergen declaration, and
   cross-contact warnings with legible photos. Capture barcode and front pack.
   Different variants/regions are separate ground-truth records.
3. Have two separate people transcribe the labels without seeing ADPAI output.
   Resolve discrepancies and record their distinct reviewer IDs and date.
4. Populate data/catalog-korea-verified.json with only reviewed records.
   Required: barcode, market KR, productName, brand, packageVariant,
   ingredientsText, allergenDeclaration, crossContactDeclaration, evidence
   (type physical-package, photoSha256, privatePhotoRef, capturedAt),
   review (status verified, verifiedAt, reviewers >=2).
   For example, the test-only Korean words in tests/catalog-core.test.mjs
   are **synthetic** and MUST NOT be copied into production.
5. Run: node scripts/audit-korean-catalog.mjs
   Duplicates, missing provenance and single-reviewer records fail validation.
   The UI checks this at runtime too. NO label record authorizes an "allergen
   free" result; when absent or ambiguous, the app continues to public
   catalog as unverified and requests an actual package label.

## Product information matching
Priority: first-party human-reviewed Korean label -> Open Food Facts
(unverified, may be an export formula) -> physical-label OCR fallback.
GTIN prefix **does not prove origin or formulation**.
Food Safety Korea's public ingredient/report APIs are useful for source
cross-checks but require an independently verified join to the exact GTIN
and physical retail label. The legacy Korean barcode-linked data has not
been updated since 2018. Do not join by product name alone.

Official public data sources:
- https://www.foodsafetykorea.go.kr/apiMain.do
- https://www.data.go.kr/data/15062098/openapi.do
- https://www.data.go.kr/data/15058665/openapi.do
- https://www.data.go.kr/data/15060549/openapi.do

## End-to-end evaluation (never infer from unit test totals)
For each physical package test, capture an INDEPENDENT reference record
and actual observed mobile/browser result, including failures. The input
for scripts/evaluate-b2c-pilot.mjs is JSON, of the form:
{
 "cases": [
  {
   "id": "private-local-case-001",
   "reference": {
    "adjudicated": true,
    "photoSha256": "<64-character SHA-256 hex from real photo>",
    "reviewers": ["reviewer-1", "reviewer-2"],
    "risk": "direct"
   },
   "observed": {
    "barcodeRead": false,
    "catalogSource": null,
    "status": "unverified",
    "latencyMs": 8500
   }
  }
 ]
}
The example is illustrative ONLY, not an observed result. Store real
case files outside the repository if they contain personal or licensed data.
Risk is "direct", "caution", or "none". Observed status is "conflict",
"caution", "unverified", or "no_listed_conflict"; missing results count.
Run: node scripts/evaluate-b2c-pilot.mjs /path/to/pilot.json report.json
The report includes barcode read coverage, reviewed catalog coverage,
direct/caution recall, missed positives, false conflicts, unverified rate,
unsafe reassuring negatives, and observed p50/p95 latency. Empty
denominators produce null, never invented percentages.

## Phase gates
- 20 distinct reviewable packages to debug the capture/provenance process.
- 100 independently checked packages across multiple brands, foods,
  allergens, packaging formats and phone cameras; freeze a holdout subset
  of product families before model tuning.
- For OCR, separately record complete human transcription and raw OCR output,
  Korean syllable/character errors, missed allergen terms, package-panel
  completion and barcode failure. Do not use an ingredients database lookup
  as proof that OCR succeeded.
- Verify on actual Android and iOS devices, online and offline. Track
  cold/warm run, failed model download, crashes, and blurry/incomplete panels.
- Only then evaluate expansion to 1,000 products, store release or public
  safety claims. Never claim a precision/recall percentage from this pilot
  before independent real data exists.
