# Ingredient explanations (prototype 1.6.0)

The Pages and bundled native entry points use `src/ingredients.js` and
`src/ingredient-glossary.js`. The separate PaddleOCR API does not produce these
display-only explanations. No external translator or image API is called.

The initial glossary contains 32 common ingredient groups with English and
Korean descriptions. This is a deliberately limited dictionary, not a general
translation model. The original OCR wording stays beside the explanation.
Descriptions explain a common purpose, not health effects, suitability,
source certification, or absence of allergens.

Examples:

| Original term | English description | Korean description |
| --- | --- | --- |
| Citric acid / E330 | Adjusts tartness and acidity. | 신맛과 산도를 조절하는 성분입니다. |
| Lecithin / E322 | Helps fat and water mix; source needs separate confirmation. | 지방과 물이 잘 섞이도록 돕습니다. 원료는 따로 확인해야 합니다. |
| Cocoa butter | Fat from cocoa beans; does not establish whether the product contains milk. | 카카오 열매의 지방입니다. 제품 전체의 우유 함유 여부를 판단할 수 없습니다. |

## Extraction and uncertainty

- Extract after an English, Korean, or French ingredient heading whose OCR
  words have confidence at least 0.65. Other package languages remain
  experimental and may have no extracted ingredient list.
- Preserve nested parentheses/brackets, original words, per-word confidence,
  photo index, OCR family, rotation, and preprocessing variant. Separators
  inside parentheses do not split a compound ingredient.
- Stop before recognised allergen declarations, precautions, nutrition,
  storage, or manufacturer text. Korean suffix precautions are excluded by
  line. This is heuristic extraction and may still omit or include text
  incorrectly; a heading does not prove complete coverage.
- A row containing a word below 0.65 is marked uncertain and receives no
  explanation in the UI. Unknown names stay visible without a fabricated
  translation. Descriptions for recognised subterms of a composite ingredient
  do not explain its remaining words.
- This confidence threshold is a conservative prototype heuristic, not a
  calibrated probability. No complete or safe status follows from it.
- Allergen rules always operate on original OCR evidence, independently of
  dictionary lookups. E322 alone does not establish soy, lactic acid does not
  establish milk, and E500(i) must not be described as E500(ii)/baking soda.
  Hydrolysed milk protein remains explicitly milk-derived in the description.

## OCR changes and how to validate them

Four orientations are still read per photo. The adapter preserves the best
overall reading and up to two credible panel readings rather than discarding
all but the highest average-confidence text. Tesseract line metadata and
horizontal wrap help preserve boundaries. When the product remains unresolved,
the primary model gets at most one enhanced contrast/upscale retry per photo.
Original evidence and model-family identity remain intact. A failed rotation
does not erase other successful readings; failures remain in the result.

The user can explicitly crop around a panel and restore the original photo.
Crop processing stays on device. The crop guidance asks users to retain
allergen/precaution statements and add photos for other sides. Cropping never
establishes completeness. The expanded raw-text section makes OCR mistakes
inspectable; it is not a second verified transcription.

Preserving more readings can increase both useful detections and false
positives, and enhanced OCR adds latency. The real-package protocol in
`benchmarks/README.md` must compare the previous version with this version on
identical frozen images before claiming improvement. Current automated tests
cover controlled OCR and generated labels, not food-package accuracy.

## References and maintenance

Names/code identities were cross-checked against the Open Food Facts additive
taxonomy (accessed 2026-10-17):
https://github.com/openfoodfacts/openfoodfacts-server/blob/main/taxonomies/additives.txt

This is a community reference, not a safety certification. Wording in this
repository is manually written; the taxonomy is not bundled or queried at
runtime. The descriptions have not received independent food-science or
native-Korean editorial review. Before expanding the glossary, review each
entry against applicable food additive specifications and have its language
reviewed. Do not import source/health claims from crowd-sourced synonyms.

Adding an entry requires exact aliases, both language descriptions, source
review, and tests for plausible ambiguity. Do not use fuzzy OCR correction to
silently substitute ingredient identities. Changing a description must never
change allergen decisions.
