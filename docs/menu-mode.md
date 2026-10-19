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

`src/menu.js` evaluates printed menu text; `src/tesseract.js` supplies OCR;
`src/ocr-worker.js` owns the pinned Tesseract5.1.1 worker protocol. Initialization,
model errors and recognition deadlines reject and terminate the worker. This
avoids the library createWorker promise remaining pending after loadLanguage
failure. Changed layouts/language subsets remain one OCR family and cannot
corroborate weak confidence as independent models. Source scores are retained.
Reduced Korean block and English sparse readings supplement the original
automatic-layout reading. Positive evidence survives later failed passes;
ambiguous reads and budget failures remain visible.

Recheck the real worker protocol and bundled-model smoke tests before upgrading
Tesseract. Unit tests cover recipe non-inference, same-column association,
merged columns, Korean/custom terms, weak reads, missing model responses and
worker cleanup. Browser tests cover both modes, warnings, profile/photo changes,
translations and offline behavior. Generated-menu OCR tests exercise integration;
they do not validate accuracy on real restaurant photographs or physical phones.
A real menu dataset with independent references is still required.
