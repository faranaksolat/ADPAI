# Shopping and restaurant menus

The home screen offers Shopping and Restaurant menu in English/Korean. Both
use the selected avoidance profile, on-device photos and the same pinned OCR
models. Their photos/results remain separate in memory. Switching mode,
profile or photos invalidates results; controls are locked during inference.

Shopping keeps product groups and ingredient/direct/precautionary evidence.
Restaurant menu accepts up to three photos of one menu. It checks only text
printed in the menu, including explicit ingredient names in dish descriptions.
It does not infer recipes from names, food appearance or a learned recipe list.

Menu results use **potential risk** or **unverified**. A name is associated
with an ingredient on an explicit same-line description or nearby rows in the
same column. Multiple separators/prices and distant columns remain unassigned;
restaurant-wide caution text is not assigned to the nearest dish. The source
quote/photo is shown for confirmation. OCR can still misread item boundaries,
negation, names and ingredients. No dish is certified safe, and an incomplete
menu is not a list of foods a person can safely eat.

The menu page prominently says ADPAI may make mistakes, menus can omit
ingredients/cross-contact risks, and restaurant staff must confirm them. This
warning is separate from the footer and is available in both interface languages.
There is no calorie feature, recipe inference or automatic safe/negative output.

## Restaurant food preferences (1.9.0)

Only **Restaurant menu** offers `avoid_pork`, `avoid_beef` and `vegetarian`.
Shopping retains the existing allergen/custom-ingredient profile and behavior.
The separate `adpai_menu_dietary_v1` localStorage key stores menu preferences;
they never become custom allergy terms or change the shopping profile. A menu
can be checked with food preferences alone. Both English and Korean interfaces
explain that vegetarian excludes meat, poultry, fish/seafood and their stocks
and animal derivatives, while allowing milk and eggs. An independently selected
milk/egg allergy still applies. Beef/veal avoidance does not exclude dairy.
These controls do not assess religious identity or halal certification.

`src/dietary.js` observes a finite, reviewed-in-code list of English/Korean
printed terms. Explicit pork/beef terms and derivatives are separated from
uncertain origins such as gelatin, ham, sausage or an unqualified stock. For
vegetarian, explicitly animal gelatin/fat is a conflict, whereas unspecified
stock/rennet/shortening requires staff confirmation. Explicit other-species or
plant stock is not reclassified as pork/beef. Local negative/plant-alternative
wording is respected when confidently read; weak readings, flavour/may-contain
wording and unknown origins remain uncertain. The .58 score cutoff is an OCR
heuristic, **not a calibrated correctness probability**. Duplicate passes never
raise the observed scores and missing confidence stays zero.

Menu items carry `dietary_matches` separately from allergen `matches`. Each
observation retains preference, term, category, kind, actual score and reason.
The UI shows preference conflicts separately from uncertain source/reading.
Ambiguous layout or restaurant-wide warnings remain unassigned to a dish.
Absent evidence, negation or plant wording never produces a safe/suitable dish.
No recipes are inferred for names such as bulgogi or tonkotsu. Aliases, negation
and association can still be missed; hidden stocks and full recipes require
restaurant confirmation. This release does not train OCR or establish real-menu
accuracy. The earlier independently labeled benchmark/pilot is still needed.

Validation covers English/Korean terms, unknown origins, milk/egg allowance,
negation scope, low/invalid scores, separate shopping output, preference-only
analysis, persistence, busy controls and result invalidation in both the Pages
entry point and bundled mobile web UI. Browser smoke images are generated
fixtures; they are not real restaurant images or physical-device validation.

`src/menu.js` evaluates printed menu text; `src/tesseract.js` supplies OCR;
`src/ocr-worker.js` owns the pinned Tesseract5.1.1 worker protocol. Initialization,
model errors and recognition deadlines reject and terminate the worker. This
avoids the library createWorker promise remaining pending after loadLanguage
failure. Changed layouts/language subsets remain one OCR family and cannot
corroborate weak confidence as independent models. Source scores are retained.
Shopping retains its earlier reduced Korean block/English sparse and original
automatic-layout readings. Menus instead read upright Korean/English in detail,
with wide overlapping contrast-normalized columns first and full-page passes
afterward; rotations are a fallback when
upright text remains weak. Dark-background variants invert grayscale polarity.
Individual OCR confidence stays unchanged. Crop boxes map back into the photo;
titles clipped at artificial crop edges stay unassigned. Readings are evaluated
separately, with their actual quotes and family provenance retained.

Menu title/description grouping accepts larger headings without a price or an
ingredients prefix, using the median glyph height rather than a tall outlier.
Separate same-row prices and nearby Korean aliases can stay with a printed
English title. Different columns and conflicting complete titles cannot pool
ingredient evidence. Duplicate readings of compatible names on the same
physical title can share one result; this does not raise confidence. These are
layout heuristics, not proof that an ingredient list or menu is complete.
Positive evidence survives later failed passes; ambiguous reads and budget
failures remain visible. No images are uploaded to the separate Paddle API.

Recheck the real worker protocol and bundled-model smoke tests before upgrading
Tesseract. Unit tests cover recipe non-inference, same-column association,
merged columns, Korean/custom terms, weak reads, missing model responses and
worker cleanup. Browser tests cover both modes, warnings, profile/photo changes,
translations and offline behavior. Generated-menu OCR tests exercise integration;
they do not validate accuracy on real restaurant photographs or physical phones.
A real menu dataset with independent references is still required.
