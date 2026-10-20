# Recognition quality: evidence required before relying on ADPAI

"Excellent" recognition must describe measured behavior, not passing code tests,
a model name, a disclaimer or a single screenshot. Package labels and restaurant
menus need separate evaluation. Current development references are partial
model-visual readings, with no independent human review or locked holdout.
They cannot establish a population accuracy claim. No model was trained from
these unreviewed samples.

## Development sequence

1. Fix observable decoding, contrast, word-box, column and alias defects; replay
   the same frozen development captures and retain raw failures. Test with the
   actual browser/native path. A generated white-on-blue menu is a regression
   check, never the user's actual Naver screenshot or a real-menu benchmark.
2. Transcribe diverse source images with two independent Korean/English human
   reviewers, then adjudicate. Annotate full visible text, food titles, title
   aliases, ingredient regions, global warnings, negations, low-legibility and
   required abstention. Record source rights and restaurant location. Do not
   infer ingredients from food pictures, traditional recipes or generic names.
3. Compare OCR engines on the same original pixels and compare dish grouping
   separately on the same reference text/regions. Better word reading can still
   fail to associate an ingredient with its food. Paddle's optional API path
   does not automatically improve the shipped Tesseract page/APK. Native ML Kit
   or Apple Vision are candidates requiring actual platform/device validation;
   they have not been integrated or verified by merely inspecting SDK metadata.
4. Freeze source/model/scorer/reference hashes and hold out product families
   and restaurant/menu editions before tuning. New photos of the same product
   or two languages on one menu are correlated, not extra independent cases.
5. Run clean and difficult captures on representative phones: small lettering,
   white-on-blue/dark menus, glare, folds, skew, grid cards, columns, screenshot
   compression and incomplete panels. Report cold/warm timing, downloads,
   memory, deadlines and missing predictions, not just successful-call medians.

An initial layout-development expansion should cover at least30 menus from15
venues, with genuinely Korean-only, English-only and bilingual pages. This is a
data-collection target, not enough evidence by itself for a medical safety claim.
The existing3 historical bilingual images from2 venues fall far short.

## What to measure

- OCR CER/WER against full independent transcripts, including Korean spacing
  and syllable errors. Report allergen-token deletion separately; average text
  quality can hide the one missed ingredient that matters.
- Dish-title discovery and correct ingredient-to-dish association. Finding a
  selected word somewhere on a page does not identify the correct dish.
- Per-language/per-allergen direct/caution recall, missed positives, precision,
  false-positive rate and assignment errors. Keep abstentions, missing images,
  failed workers and deadlines in the missed-positive denominators.
- Reassuring negative output on known-positive/incomplete captures, and answer
  coverage separately. Current automatic safe/clear outputs must remain zero;
  absence of such output does not prove every allergen was detected.
- Phone end-to-end p50/p95 latency and memory. A desktop source-adapter probe is
  not camera/WebView/device validation. Keep model-download latency separate.

An initial desired target is at least99% known-positive recall on independent
reviewed held-out cases, with zero reassuring negatives in locked safety cases.
This is a proposed validation target, **not current performance or a guarantee**.
Report confidence intervals and each category's denominator. Zero misses in
about300 independent positive cases only bounds the one-sided95% miss rate near
1%; it does not establish the same bound for every allergen, language, device or
capture condition, and it does not guarantee future safety. False-positive and
coverage criteria also need explicit review once complete negative references
exist. Do not improve apparent accuracy by excluding unreadable captures or
changing held-out labels/scoring after seeing predictions.

## Deployment boundary

Keep unknown results unverified and explicit printed matches as potential risks
requiring label/staff confirmation. Preserve original names/quotes, word-level
scores where supplied, and the model's confidence scope. A Paddle line score
is not calibrated Tesseract word confidence. Do not silently replace on-device
processing with a photo-upload service. Store publication remains outside the
user-authorized GitHub/web/test-build scope.
