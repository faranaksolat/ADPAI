# ADPAI

Food-allergen label-checking prototype for shopping. The current GitHub Pages entry point is `index.html`, which loads `src/browser.js` and runs Tesseract.js in the browser. Images stay in the browser. Both the page and the experimental PaddleOCR browser adapter use the shared allergen rules in `src/engine.js`.

Version 1.6.0 adds local photo cropping, retained ingredient-panel readings,
one bounded primary OCR enhancement retry for unresolved products, and a
partial ingredient list with plain English/Korean explanations for common
terms. Original names and raw OCR remain visible. Unknown/uncertain terms are
not guessed. See [scope and limitations](docs/ingredient-explanations.md).

`backend/main.py` is a separate FastAPI/PaddleOCR API (`POST /api/analyze`). It also serves the current frontend and its modules, but the frontend does **not** automatically upload to or call this API. `src/app.js` / `src/ocr.js` are an experimental browser PaddleOCR path, not the Pages entry point.

## Safety policy

Outputs are `conflict`, `caution`, or `unverified`. An OCR run, an ingredient heading, or an empty match list cannot prove full label coverage. Automatic negative results are disabled until a separately validated completeness policy exists. Never interpret `unverified` as allergen absence. Positive results refer to recognized label evidence, not laboratory testing.

Low-confidence selected terms remain unresolved evidence. Direct ingredient evidence is not downgraded by an unrelated precautionary statement. ADPAI focuses on selected ingredients, direct allergen declarations, and precautionary cross-contact warnings. Nutrition headings are retained only to keep unrelated label text outside ingredient evidence.

## Develop and test

Use Python 3.11.9 (`.python-version`) and Node.js 22+.

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci
npm test
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
npm run test:browser
```

The rule tests use Node's built-in runner. Install the pinned npm dependencies for native builds. `test:browser` requires Chromium on PATH (or `CHROMIUM_PATH`); it uses controlled OCR responses to exercise the actual page, not model accuracy.

Run the frontend locally with `python -m http.server 8000`. Run the backend separately with:

```bash
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Optional real-model smoke tests (generated labels, not package benchmarks):

```bash
REAL_OCR=1 npm run test:browser
.venv/bin/python scripts/smoke-backend.py
```

These require model downloads; the backend smoke also needs the DejaVu Sans font. Neither test establishes accuracy on food-package photographs.

The backend lazily downloads PaddleOCR models on first analysis. A healthy `/api/health` response only verifies the API, not successful model loading. Restricted cloud machines may need `PADDLE_PDX_CACHE_HOME` and `XDG_CACHE_HOME` pointed at writable directories. Tesseract downloads its runtime from `cdn.jsdelivr.net` and language data from official `@tesseract.js-data` packages on `cdn.jsdelivr.net`; those services must be reachable in the browser.

The API validates profiles, product/photo counts, image decoding, upload size (10 MiB per photo, 40 MiB combined), and pixel count (20 million per image). CPU inference runs outside the async event loop and model access is serialized per process. HTTP 422/413 indicate input errors; HTTP 503 indicates processing was unavailable.

## Shared rules and regression data

Edit `backend/ontology.json` and `shared/non-dairy.json`, then run `npm run generate:ontology`. `npm test` checks the generated browser vocabulary is current. `shared/regressions.json` is run against both JavaScript and Python semantics to prevent silent divergence. Historical `README-v*.txt` and the experimental module version labels do not identify the currently deployed page.

## Accuracy validation still required

The regression suite uses annotated text and controlled OCR. It does not establish accuracy, allergen recall, or latency on real packages. See `benchmarks/README.md` for the required dataset and evaluation protocol. Do not enable reassuring negative results based only on these passing tests.

## Product name and public URL

The product name is **ADPAI**. The live Pages address is `https://faranaksolat.github.io/ADPAI/`; its repository is `faranaksolat/ADPAI`. Browser profile/learning storage keys remain compatible within the same origin; browser storage does not automatically move between GitHub Pages hostnames or into a native app.

## Install on a phone

The website is a PWA: use its installation button/browser menu on Android,
or Safari → Share → Add to Home Screen on iPhone. Its offline cache stores
the application shell, never photos or results; OCR may still require model
and runtime downloads. See [privacy.html](privacy.html).

Capacitor projects in `android/` and `ios/` reuse the current browser analysis
path and include the primary OCR engine/models locally. Build with
`npm run mobile:sync`; then open Android Studio with `npm run mobile:android`
or Xcode with `npm run mobile:ios`. See [mobile/README.md](mobile/README.md)
for prerequisites, debug builds, manual GitHub Actions builds and release
requirements. These projects remain a prototype until real-package accuracy
and physical-device behavior are validated; no store publication is automated.
