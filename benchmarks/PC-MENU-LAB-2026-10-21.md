# Private PC server and menu review packets — 21 October 2026 (Seoul)

The Windows-startable **private PC companion is implemented**, with a separate
English/Korean page, paired upload API, background jobs and an optional temporary
Cloudflare HTTPS tunnel. It has not been installed on the user's Windows PC or
tested through an external tunnel/physical phone. No paid AI API, grant balance,
LLM model, fine-tuning or store publication is connected. The shipped1.7.0 Pages
and APK paths remain unchanged; they do not automatically upload to this service.

See [Persian setup](../pc_server/README-fa.md),
[API/grant conditions](../pc_server/API-BUDGET-fa.md) and
[machine-readable evidence](reports/pc-menu-lab-2026-10-21.json).

## Implemented boundaries

`Start-PC-Server.cmd` → Python3.11 → `pc_server.launch` creates a project-local
virtual environment from pinned requirements, binds only127.0.0.1, generates a
random private pairing code and optionally starts an installed official
cloudflared quick tunnel. No router/firewall/global execution-policy/TLS bypass
is performed. Temporary URLs and an always-on personal PC are a test arrangement,
not stable production hosting. The launcher never publishes an occupied port's
unrelated service. No cloud AI API account/key is required.

The companion uploads only photographs; selected allergy terms stay in the
browser. `POST /api/jobs` returns202, then authenticated polling retrieves the
result, avoiding a single long inference response through a relay. The synchronous
`/api/read` remains for diagnostics. Authentication happens before body parsing.
One heavy job,32MiB/body,10MiB/photo,3photos,20MP/image and45-second upload limits
apply. Photos are EXIF-normalized/bounded to2400px. Aborting a browser does not
release a running worker's slot or delete its image underneath decoding/OCR.
Temporary files are removed after actual work; OS errors/crashes can leave files.
At most two completed OCR text results remain in PC memory, expiring after5min.

No-store/CSP/no-referrer headers, DOM text rendering and no cross-origin API
permission protect this separate companion. The tunnel routes photographs through
Cloudflare infrastructure under its terms; it is not direct end-to-end device
encryption. Its privacy page discloses this difference from on-device processing.
Pairing codes never appear in a URL query, static app file or repository.

Only local Korean/Latin Paddle models run, with2 CPU threads. Actual line scores
and line boxes are retained; word scores stay zero. A clear heading cannot lend
its score to each damaged ingredient. Shared browser rules can show selected
mentions as potential risks or unassigned evidence; they cannot certify food
safety or a complete recipe. This conservative adaptation can lose layout recall.

## Validation performed

- **123 JavaScript tests /46 Python tests passed**, zero failures/skips in the JS
  suite. New tests cover authentication before parsing, streamed/oversized/slow
  uploads, invalid images, busy rejection, model failure, cancellation during a
  real running worker, temporary-file cleanup errors, private polling/expiry and
  refusal to promote line scores into word confidence.
- The actual frontend passed controlled browser tests: pairing fragment removed,
  no external requests, EN/KO, profile/photo changes, menu warnings, failed-server
  stale-result prevention and disconnect. The actual launcher started/stopped a
  loopback service, served its page/assets, rejected unauthenticated requests and
  released its port on Linux. The Windows CPython3.11 Paddle wheel exists; this
  does not establish an actual Windows install.
- Actual final background-job API → local Paddle read an authored label containing
  MILK. In-process submission returned202 in29.9ms and completion took17.1s on
  this Linux machine. Source hashes were checked. This is a generated regression,
  not real-package accuracy or camera/tunnel/Windows latency.
- **The actual browser → actual local HTTP job API → actual Paddle → potential
  milk warning path also passed**, with the real server's response headers. It
  used an authored label and loopback, no external relay or physical device.
  Owned test servers were stopped afterwards.

## Real-menu diagnostic

The unchanged frozen development pilot has3 historical bilingual photos from2
Seoul venues,38 partial titles and20 known printed-evidence dish/allergen pairs.
Manifest SHA256:
`dd2882d3c4d2e2a3bb7780ee66a384964d18d4c8df272c0726f050cb2c10c5d1`.
References are partial **model-visual**, zero independent humans, no holdout;
they were already used in development. The scorer/reference was not revised.

The two-thread recognizer ran on all3 original captures through a frozen
synchronous PC API snapshot. Saved-word replay through unchanged shared menu
rules found **9/20 known pairs,11 misses,0 reassuring safe outputs**,3/3 returned
text. Actual line confidence remained separate and word scores zero. API request
times were53.2/47.0/56.8seconds; not phone/Windows/relay latency. CER/WER, precision
and false-positive rate remain null. Extra associations require independent review.
This is insufficient recognition and is not a validated accuracy gain over the
browser's earlier8/20 diagnosis on this tiny repeatedly tuned pilot.

The async job layer was added after that frozen request-level run. The current
recognizer/decoder and shared menu-rule bytes match the frozen recognizer/rules;
final async transport was checked with actual generated-label and browser tests.
Do not call the three-menu measurements full final camera/relay validation.
The first default-thread API run is retained as a historical source version.
Its hash checks show it finished before subsequent edits; it is not the final
source and was not an invalid run. A preliminary commentary statement calling
it invalid was corrected after inspecting the recorded hashes.

## New collection and independent review preparation

Five bounded public Commons metadata searches were saved. Using those cached
results,7 additional licensed originals were downloaded. Visual screening found
**3 bilingual printed menus and4 prepared-food photos**; the latter are excluded.
The3 new menu pages' country/venue source confirmation is blocked, so they are
**not counted as newly verified Korean restaurant menus**. Further source-page/
search access returned403, including supported escalation. No relay/mirror or
repeated denied retrieval was used. The initial collector report printed a legacy
default query list although this download reused cache; original report is retained
and a separate interpretation records that no new searches ran during collection.
The collector's current cache mode now reports this accurately and is tested.

`export-menu-review.py` prepared6 unique menu images (the previous3 plus3 new
location-unconfirmed candidates), original rights/hashes, a viewer and **two
separate blank worksheets**. No prior OCR/model transcript, inferred ingredient
or allergen label is copied into reference fields. A/B are packet names, not
human reviewers. Country, venue/edition groups, languages, transcript, boxes,
ingredient association and review identity remain unfilled. They intentionally
fail benchmark-reference validation. Completed human reviews, adjudicated
references, train/test records and trained models are all **zero**.30menus/15venues
and300captures/100venues remain targets, not achieved counts.

Model metadata access for a proposed local Qwen VLM was blocked with proxy403,
including supported escalation. No model was downloaded/run, no LLM comparison
or training is claimed. Continue the independently reviewed, venue-separated
[dataset/model protocol](MENU-DATASET-PROTOCOL.md) before choosing fine-tuning or
a paid image API. The user selected local/no-API-cost work; later grant use remains
conditional on eligible package terms, image support and a reviewable cost cap.

## Reproduce

```sh
node scripts/generate-ontology.mjs --check
node --test --test-isolation=none tests/*.test.mjs
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
node tests/pc-browser-smoke.mjs
python -m pc_server.smoke --output benchmarks/results/NEW-generated
python -m benchmarks.diagnose-pc --dataset path/menu-evidence.jsonl --output NEW-results
node benchmarks/replay-menu.mjs --dataset path/menu-evidence.jsonl \
  --predictions NEW-results/predictions.jsonl --output NEW-replay
```

Use a new output directory each time, the archived licensed originals and pinned
model/cache hashes. Do not change frozen source/models/references during a run.
Real HTTP browser mode uses `PC_SERVER_URL=http://127.0.0.1:PORT/` with a deliberately
nonproduction fixture pairing code on a loopback-only server; see the smoke test.
Never distribute a live pairing code. No source images or outputs are added to
the shipped mobile assets or automatically published as a GitHub dataset.
