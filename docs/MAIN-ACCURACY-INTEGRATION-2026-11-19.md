# Main baseline reliability integration — 19 Nov 2026

The barcode-first B2C workflow is integrated with the existing shared allergy evidence engine and optional pork/beef/vegetarian rules. Community product data remain explicitly unverified; physical Korean package labels take priority only after two independent reviewers verify a label. A missing match **never means safe**.

Current first-party verified product records: **0**. Public-web product candidates: **10 research leads, not verified**. The earlier 16/39 development hits in 16 photos were not independently double-reviewed and do not establish real-world accuracy. This integration does not solve Korean OCR recall on its own.

Quality checks: `npm ci && npm test`, `node scripts/audit-korean-catalog.mjs`, `npm run build:mobile`, `npm run test:browser`, `BARCODE_CAMERA_SIM=1 node tests/browser-smoke.mjs`. Validate 100 physical products with adjudicated references before publishing recall/precision claims. APK release and hosting are separate tasks, not an effect of updating GitHub main.
