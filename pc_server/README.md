# Private PC companion pilot

See [Persian Windows instructions](README-fa.md). This separate FastAPI app
processes uploaded images on the user's own PC. It does not change the Pages
or installed app's on-device processing or register a service worker.

```sh
# Existing environment, loopback only; generates a new private pairing link:
python -m pc_server.launch --no-browser
# Install a project-local .venv-pc using the committed requirements:
python -m pc_server.launch --install
# With official cloudflared already installed, temporary external HTTPS:
python -m pc_server.launch --install --share
```

The Windows entry point is `Start-PC-Server.cmd` (Python3.11,64-bit). The pinned
Paddle3.3.1 distribution has a Windows CPython3.11 wheel; this does not prove a
physical Windows installation or camera/tunnel test. No global execution policy,
firewall, router forwarding or certificate-validation change is made. The
launcher refuses an occupied port, binds only127.0.0.1, stops child processes
on Ctrl+C, and does not install a background service. Quick tunnels change URL
and have no production availability guarantee. A PC in sleep/offline cannot
serve requests. No API fee, voucher spend or store publication is automated.

The companion uses `POST /api/jobs` (202 with a random job ID) and authenticated
`GET /api/jobs/{id}` polling. Long inference does not hold a single tunnel HTTP
response open. At most two completed OCR text results remain in PC memory, each
expiring five minutes after completion; there is no result/photo disk archive.
Missing/expired results fail404 and model/decode failures remain503/422.

`POST /api/read` accepts1–3 multipart `images` of one label/menu. The launcher
creates a random bearer token; it is required before reading/parsing the body.
The fragment pairing link is removed from the address bar and the token is
held only in tab session storage. The allergy profile stays in the browser.
Missing configuration fails503; wrong tokens401; busy requests429; oversized
or invalid images413/422; complete OCR failure503. These never become safe
food results. Uploads also have a45-second body-receive deadline.32MiB total body,10MiB/photo and20MP/photo limits apply; decoded
images are EXIF-normalized and bounded to2400px. A single heavy job is admitted.
Disconnecting/aborting the HTTP client does not release the slot or delete an
image still used by the actual worker. Temporary images are removed after the
worker finishes. Normal deletion is not secure erasure; OS errors/crashes may leave files.

Only local Korean/Latin Paddle models are attempted; no unrelated-language or
LLM service is called. Model downloads use the existing official Paddle source.
Raw line scores are preserved separately and word scores remain zero. Shared
browser rules can show selected mentions as potential risks, never verified
absence or complete recipes. This conservative score adaptation can reduce
dish-grouping coverage; it needs measurement rather than borrowed confidence.

The remote mode sends photographs through Cloudflare infrastructure over HTTPS.
It is not a direct end-to-end encrypted device-to-device link. Privacy copy
explicitly differs from the on-device product. No request bodies or bearer
codes are logged by the app; no-store/CSP/no-referrer headers protect the
companion responses. Cloudflare/OS behavior is subject to their own terms.
Keep pairing links secret. No public user registration or cloud-photo archive
is created.

Checks: `python -m unittest tests.test_pc_server -v`,
`node --test --test-isolation=none tests/pc-server.test.mjs`, and
`node tests/pc-browser-smoke.mjs`. They exercise controlled model responses and
the actual companion frontend separately. Actual local-model diagnostic:
`python -m benchmarks.diagnose-pc --dataset path/menu-evidence.jsonl --output NEW-dir`;
then `benchmarks/replay-menu.mjs` for separately labeled saved-word rule scoring.
Retain failures, scores, references and implementation hashes. No training or
release-accuracy claim follows from these tests.
