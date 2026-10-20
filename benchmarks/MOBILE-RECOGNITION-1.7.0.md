# ADPAI 1.7.0: interface and recognition development

The mobile interface is redesigned and several recognition failures are fixed.
**Recognition quality remains inadequate for relying on allergen absence.**
No model was trained, no LLM service was connected and no store publication was
performed. See the [machine-readable results](reports/mobile-recognition-1.7.0.json)
and [dataset/model-comparison protocol](MENU-DATASET-PROTOCOL.md).

## What changed

- `assets/app.css`, `index.html`, `src/browser.js`: responsive green/ivory home,
  Shopping/Menu cards, clearer profile/photo steps and results, English/Korean
  copy and larger touch controls. Technical OCR details are expandable. Original
  ingredient names remain available alongside simpler reviewed explanations.
  Uncertain selected mentions and the safety warning remain visible.
- `src/tesseract.js`: a terminated worker is recreated for a later photo/product;
  a difficult first image no longer disables the rest of a batch. Native failures
  or text without usable native scores fall back to the existing local reader
  per product, retaining earlier evidence/errors. No confidence is invented.
- `src/menu-ocr.js`, `src/menu-image.js`: bounded English overview, wide
  overlapping contrast crops, then Korean/English detail passes. Preserve useful
  earlier text when later passes time out. Raw word coordinates/scores remain
  attached to their actual readings; crops/rotations are not independent votes.
- `src/menu.js`, `src/engine.js`: detached/thousands-price and bilingual-row
  grouping; explicit printed ingredient names can produce warnings. Shared
  evidence matching avoids repeated package-coverage work in every menu block.
  No hidden recipe/ingredient inference or automatic safety negatives is added.
- `android/.../AdpaiTextPlugin.java`, `NativeTextReader.java`, `src/native-ocr.js`,
  `mobile/entry.js`: bundled ML Kit Korean/Latin recognition through a local,
  bounded Capacitor bridge. Actual uncalibrated word scores are retained, missing
  scores stay zero, and both scripts remain one family. Pages and iOS retain
  Tesseract. This integration needs physical-device/runtime validation; a build
  does not establish its real-image accuracy. Privacy and third-party notices
  disclose the Google SDK's operational/diagnostic data terms.

## Real-menu development results, including unsuccessful runs

All runs use the same frozen three historical bilingual photographs from two
Korean venues: 38 known titles and 20 known positive dish/allergen pairs. References
are partial model-visual readings, **zero independent human reviewers**, no held-out
test. Manifest SHA-256:
`dd2882d3c4d2e2a3bb7780ee66a384964d18d4c8df272c0726f050cb2c10c5d1`.
References/scoring were not revised after seeing these predictions. We tuned on
these images, so the resulting fraction is not a general accuracy estimate.

| Browser run | Known pairs found | Missed | Captures with no text | Reassuring safe outputs |
| --- | ---: | ---: | ---: | ---: |
| Earlier 1.6.4 diagnosis | 3/20 | 17 | 0 | 0 |
| 1.7.0 r1 | 1/20 | 19 | 1 | 0 |
| r2, wider columns | 2/20 | 18 | 1 | 0 |
| r3, smaller overview | 6/20 | 14 | 1 | 0 |
| r4, English overview first, background VM load | 2/20 | 18 | 1 | 0 |
| Same r4 source, software VMs paused/stopped | **8/20** | **12** | **0** | **0** |

The isolated run returned text for all three captures but still contains internal
pass deadlines. Desktop returned-call p50 was 78.0 seconds and p95 86.0 seconds;
these are not phone/camera/download measurements and are still slow. The workload
changed between runs, so this is not a controlled prior-version speed/accuracy
A/B. CPU-sensitive timeouts are a material remaining defect. Keep every failed
and partial capture in the denominator; an abstention is still a detection miss.

Final-source saved-word replay reproduces 8 found/12 missed/0 safe. This reruns
the current menu rules on r4-isolated words, **not OCR again**. Later source
changes concern native fallback and restarting a terminated worker before the
next photo; those branches were not exercised in the one-photo browser run.
Raw predictions, source snapshots and hashes for all five runs are retained in
the local review archive. OCR CER/WER, precision and false-positive rate remain
unmeasured: full independent transcripts/negative labels are absent. Additional
associations require review and are not automatically counted as true positives.
The original Naver screenshot's file bytes were unavailable here and it was not
tested; the authored white-on-blue menu check is a separate synthetic regression.

## Android and validation limits

The Android bridge, debug app and optional corpus instrumentation helper are
built locally; see the machine report for the exact final build/test results.
Software-only API30/API35 emulator attempts did not reach usable framework boot;
**zero native real-image inferences were measured**. This is an environment
limitation, not a measured app-inference failure. No physical phone camera,
permissions, backgrounding, memory or bridge lifecycle was validated here.
No native iOS build was run on Linux; an iPhone-installable package requires
macOS/Xcode signing. The shared iOS interface is updated, not an iPhone binary.

The shared decoder prepared 19 diagnostic images (16 labels +3 menus) and all
prepared hashes were independently checked. First-run cleanup failed after files
were written; after fixing cleanup, the three-menu preparation completed. Neither
preparation nor compiling an instrumentation APK is an inference test.

The JavaScript and Python suites validate rules/control flow, and controlled
browser runs validate the actual UI/module paths. A first final generated-model
smoke failed at the shopping conflict assertion while Gradle was running; it
returned unverified. All attempts and the resource-isolated rerun outcome are
recorded in the machine report. Do not describe these generated images as real
food-package accuracy or native-device validation.

## Reproduce

```bash
npm ci
node scripts/generate-ontology.mjs --check
node --test --test-isolation=none tests/*.test.mjs
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npm run build:mobile
MOBILE_WEB=1 node tests/browser-smoke.mjs
MOBILE_WEB=1 REAL_OCR=1 MENU_CARD_OCR=1 node tests/browser-smoke.mjs
node benchmarks/diagnose-menu.mjs \
  --dataset benchmarks/data/korea-real-menu-pilot-2026-10-19-v1/menu-evidence.jsonl \
  --output benchmarks/results/NEW-menu-run
node benchmarks/replay-menu.mjs \
  --dataset benchmarks/data/korea-real-menu-pilot-2026-10-19-v1/menu-evidence.jsonl \
  --predictions benchmarks/results/SAVED-run/predictions.jsonl \
  --output benchmarks/results/NEW-rule-replay
```

Use the licensed local review archive to restore ignored original images and
raw diagnostic directories. Run heavy inference without unrelated VM/build load,
record hardware and deadlines, and retain unsuccessful runs. For native testing,
build `:app:assembleDebug :app:assembleDebugAndroidTest`, then use
`prepare-native-corpus.mjs` and `run-native-corpus.py --help` with an explicitly
selected booted test device. This is an engine diagnostic; exercise the actual
camera/Capacitor/UI separately. Do not uninstall a user's app/profile to fix a
test-key mismatch automatically.

The next accuracy task is the independently reviewed, venue-separated comparison
in [MENU-DATASET-PROTOCOL.md](MENU-DATASET-PROTOCOL.md), followed by physical-phone
tests and error-driven tuning. LLMs can help with visible text/layout and simple
explanations; unsupported ingredient guesses and reassuring negatives remain
forbidden. Train only if reviewed training data and measured error patterns
justify it. Keep the [quality gates](QUALITY-GATES.md) closed meanwhile.
