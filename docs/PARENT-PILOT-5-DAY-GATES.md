# ADPAI parent B2C pilot — five-day acceptance gates

**Status:** Development branch, not a safety-validated product. No new cloud OCR connection is active.

## Launch scope
1. English/Korean package ingredient labels only.
2. Visible original photo, OCR transcript, editable text field and a second check on the user's corrected text.
3. Explicit separation of direct declarations (e.g. `밀, 대두 함유`) and cross-contact warnings (e.g. `우유, 계란 혼입가능`).
4. Unknown, truncated, blurry, unreadable, weak-confidence or incomplete labels may **never** produce a safe/not-present conclusion.
5. Menu B2B, cosmetics, federated learning, health inference, child account profiles and individualized medical claims are outside the parent pilot release gate.
6. Existing local OCR remains the default. A cloud fallback is **not live** and must be opt-in only after a backend proxy, provider account, contractual data handling, consent, spend caps, and benchmarking are implemented and reviewed.

## Evidence and quality gate
- Create an independently transcribed test set from real products photographed with permission. Include legible, slightly blurred, and unreadable photos; English and Korean; direct ingredients, direct allergen declarations and precautionary warnings.
- No clinical or shopping safety decisions should depend solely on this pilot. Families must read printed original labels and verify uncertain cases with the manufacturer.
- Record product-level and phrase-level misses separately, including every selected allergen omitted from OCR. Do not count overlapping crops of the same photo as independent evidence.
- Red-team negative/free-from wording, `밀` vs `밀크`, `함유` vs `혼입가능`, nutrition-table spillover, truncated declaration, and conflicting OCR variants.
- Document every missed direct allergen and every direct-vs-cross-contact mix-up; block claims of validated allergen screening while unresolved.
- Ensure results and corrected transcriptions never silently persist or upload, and never send the allergy profile to an OCR service.
- Confirm EN/KO keyboard and mobile touch tests, consent accessibility, offline behavior, full repo unit/browser tests, and screenshot-based review on actual mobile devices.

## Five-day implementation target
- Day 1: make conservative original-photo + editable-text review available in the real B2C page.
- Day 2: compare local recognition against independent Korean-capable OCR candidates on a human-transcribed benchmark.
- Day 3: integrate only the winning provider behind a secure minimal server with explicit opt-in and no direct browser API key **if credentials, privacy and data handling are approved**. Otherwise preserve the existing private local-only experience.
- Day 4: fix evidence mapping, add test/re-take messages and independent negatives with safety-first abstention.
- Day 5: integrate/QA on phone browsers, accessibility and pilot participant reporting. Public release conditional on passing test gates.

## Pilot recruitment wording
`ADPAI is an experimental label-reading assistant. It is not a food safety or medical guarantee. Check original labels and ask manufacturers about missing or unclear ingredients.`

## Current implementation
The user-corrected transcript is explicitly labeled as **user-entered, unverified-completeness evidence**. It can identify selected ingredients and precautionary terms; an empty match always remains `unverified`. It does not restore missing portions of a label or verify that the whole product is safe.
