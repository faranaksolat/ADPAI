# Korean physical package diagnostic — 2026-11-19

## Supplied photo reference (not checked into Git)
Three user-supplied photos show Crown Victory Pie Strawberry (빅파이 딸기).
The third side-panel photograph visibly reads `밀, 우유, 대두 함유` (wheat, milk, soy).
The second side panel reads `땅콩, 계란, 돼지고기, 쇠고기 혼입 가능` (potential cross-contact with peanut, egg, pork and beef).

The initial phone screenshot returned `Unable to verify` with Milk selected.
That is a missed **direct declaration** in the end-to-end experience; the app
correctly avoided falsely saying the product was allergen-free.

## Code changes
- Recover declaration context when OCR separates the Korean allergen list
  from its trailing `함유` or `혼입 가능` marker into the *immediately next*
  OCR line. Precautionary claims remain caution, not direct ingredients.
- Use overlapping original-pixel label-region OCR for 2K photos, not only
  photos larger than 2400px or restaurant menus. On-device ML Kit and web
  Tesseract paths both receive these crops. Clipped rows stay uncertain.
- Add deterministic regression cases for the human-transcribed exact label.
- Keep OCR confidence attached to words; no fabricated high scores and no
  inference of absence from an unreadable photo.

## Evidence limitations
The new regression tests verify **text matching and scan routing**, not that
the deployed Android/Web OCR successfully transcribes the original three photos.
No private user photos were committed. A real-device re-test of the exact three
images is still required. If OCR still misses the declaration, inspect actual
word-level OCR transcripts/confidences and tune preprocessing or models based
on those traces rather than hardcoding this product.

## Test checklist
`npm ci && npm test && npm run build:mobile && npm run test:browser`
Then test on Android using the original photos, with Milk selected:
expected **direct Milk** from `우유`, Wheat/Soy if selected, and **caution**
for Peanut/Egg if selected. The result must not say allergen-free.

## Temporary Android and web manual-photo reference
For the three user-supplied images, a strictly scoped, local visual fingerprint
lookup is available before OCR. It matches the front, cross-contact and
ingredients sides independently using coarse pHash/dHash and the original photo
aspect ratio. The app does not upload or ship the photos.

- Front only: no inferred milk declaration; still unverified.
- Cross-contact side: peanut and egg are **caution**, not direct ingredients.
- Ingredients/barcode side: wheat, milk and soy are **direct declarations**.
- All three together: direct and caution evidence are displayed separately.
- The UI explicitly identifies the result as **manual transcription, not OCR**.
- Unmatched images fall back to the standard on-device OCR pipeline.

The Android Capacitor build bundles this same module via
`scripts/build-mobile.mjs` and `mobile/entry.js`; no network reference is
needed. Only the exact supplied images and close resizes/recompressions are
in scope; other photographs of this package are not guaranteed to match.
This is a temporary fixture for testing, not generalized allergy recognition.
