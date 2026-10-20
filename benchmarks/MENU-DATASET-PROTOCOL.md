# Korean/English restaurant-menu dataset and model comparison

Status: proposed collection and annotation protocol, **not a collected or trained
dataset**. The current development pilot contains three historical bilingual
photos from two Korean venues, with partial model-visual references and zero
independent human reviewers. It is unsuitable for training or release claims.

## Collect and label before training

Start with at least 30 menus from 15 venues to debug layouts. For a broader
comparison, target 300 menu captures from at least 100 venues. Record Korean-only,
English-only and bilingual pages separately. Include grid/photo cards, plain
lists, columns, handwritten changes, dark backgrounds, small print, glare,
rotation, screenshots and camera photos. Track menu edition, capture condition,
venue/chain, source URL, permission/license, attribution, original bytes and SHA.
Do not treat search metadata or an automatically generated transcript as truth.

Two independent Korean/English readers should transcribe and adjudicate each
evaluation image. Label visible text and regions, dish names and printed aliases,
ingredient-to-dish links, page-wide warnings, direct vs precautionary statements,
negation, unreadable regions and required abstention. A dish picture or a familiar
recipe does not establish ingredients. Keep the printed technical ingredient
name as well as any reviewed plain-language explanation; unknown origins remain
unknown. Non-milk lactic acid, milk-free claims and shared-facility warnings need
explicit challenge examples to measure false alarms as well as omissions.

Group all editions/views from a venue or chain before splitting. A proposed
venue-grouped split is 60% training, 20% development, 20% locked test; keep capture
and positive-pair denominators visible because venue sizes differ. No tuning,
translation-dictionary additions or prompt selection on the locked test. Freeze
manifest/scorer/source/model hashes before a final run. Reserve additional
independent positive cases if the locked split cannot support the desired recall
confidence intervals. Three hundred photographs do not imply three hundred
independent positives, much less enough positives for each allergen/language.

## Compare ready-made engines first

1. Run the current browser Tesseract and Android ML Kit paths on the same
   originals and representative phones. Compare the optional PaddleOCR service
   separately; it is not the deployed Pages path. Save raw words, boxes, real
   scores, timeouts and model/runtime versions. Missing scores stay unknown.
2. Compare one or more image-capable LLMs on the same reviewed development set.
   Record model/version, prompt, settings, image resolution, costs, latency and
   provider data terms. Use public/licensed benchmark images for a service pilot.
   A future upload of user photographs requires an accurately disclosed product
   flow; do not silently replace current on-device processing.
3. Separate image reading from layout/reasoning: replay the same human transcript
   and regions through each association method. Require JSON containing the
   printed dish name, exact ingredient quote and supporting region. Unsupported
   guesses, uncertain readings and absent ingredients must remain unknown.
   An LLM's self-reported confidence is not OCR calibration or a safety verdict.
4. Use deterministic allergen/negation/context checks on supported evidence.
   Simple English/Korean explanations can use a reviewed glossary; retain the
   original name. Do not translate an uncertain word into a certain ingredient.
5. Only fine-tune an OCR/layout model if reviewed training examples and a specific
   remaining error pattern justify it. The dev set chooses the configuration;
   test once on the locked set after freezing it. Keep an untouched later test
   edition for subsequent iterations. No training has been performed here.

## Decision criteria

Measure CER/WER and allergen-token deletion; dish discovery and correct
ingredient-to-dish assignment; direct and precautionary recall; missed positives,
precision, false-positive rate, unsupported assertions, abstention/answer coverage;
and phone p50/p95 cold/warm latency, memory and per-scan cost. Count unreadable,
timed-out, missing and abstained positives as misses in detection recall. Report
reassuring negatives on known-positive/incomplete images separately: the current
app must return none. Review additional associations; partial positive-only
references cannot establish precision or a false-positive rate.

Use the confidence-interval and release restrictions in [QUALITY-GATES.md](QUALITY-GATES.md).
Passing a text test, adding an LLM, a disclaimer or fine-tuning on unreviewed
images does not establish food safety. Keep store publication disabled.

## Existing reproducible tools

`collect-menus.py` performs bounded, licensed discovery only.
`diagnose-menu.mjs` runs the actual browser OCR plus menu rules and preserves
failure denominators. `prepare-native-corpus.mjs` uses the shared image decoder;
`run-native-corpus.py` optionally runs the bundled Android engine on an explicitly
selected test device. `replay-menu.mjs` scores saved words with current menu rules
without rerunning OCR. None of these tools substitutes for independent human
annotation or validates a full camera/Capacitor lifecycle by itself.
