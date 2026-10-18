# Real-package benchmark protocol

No real-image dataset or accuracy claim is included in this change. Text regression fixtures are not an OCR benchmark.

The executable Korean collection, annotation and evaluation workflow is in
[KOREAN-DATASET.md](KOREAN-DATASET.md). Its synthetic debug fixtures do not
replace this real-package protocol.

1. Collect at least 300 independent products with clear reference captures and difficult captures (roughly 900–1500 images). Stratify Korean/English/French and multilingual panels; report experimental languages separately. Include glare, curvature, blur, crops, fine print, all orientations, importer stickers, direct/caution/negated statements, non-dairy compounds, nested ingredients and nutrition-only crops.
2. Two annotators transcribe text and annotate panel polygons, reading order, ingredient spans, allergen concept and context; adjudicate disagreements. Annotate missing/illegible panels as requiring abstention. Ground truth describes the package, not laboratory allergen absence.
3. Store versioned JSONL with product_id, variant_id, capture_id, image_sha256, relative image paths, polygons, transcript, ingredient spans, direct_allergens, caution_allergens, required_abstention, and annotation version. Keep source rights and consent alongside the corpus. Split by product family/SKU, never by photo; freeze the holdout before tuning.
4. Run three layers: OCR versus transcripts (CER/WER and allergen-token deletion), semantics versus adjudicated text, and complete page/API versus product labels. For each layer record commit, dependency/model hashes, browser/device, threads, cache/network state, failures and raw evidence. Clear local learning for the baseline.
5. Report direct and caution recall/precision per allergen and language; count positive products incorrectly assigned a negative; separately report abstention and answer coverage. An abstention prevents false reassurance but is not a detected allergen.
6. Record cold and warm end-to-end p50/p95 latency, model download time separately, timeouts and memory. Use repeated runs on representative phones and the CPU backend. Bootstrap by product, not by correlated capture.
7. Block release on any unsafe negative in the locked safety cases and any regression of known positive evidence. Keep automatic negatives disabled until panel-completeness checks have independently demonstrated adequate performance. Zero observed errors is not a safety guarantee: 0 errors in approximately 300 independent positive products still has an upper 95% error bound near 1%.

Run the three implementations independently, since changing OCR engines does not fix semantic rules. Preserve failures and unknowns in the denominators; never score a zero-test run or missing prediction as success.
