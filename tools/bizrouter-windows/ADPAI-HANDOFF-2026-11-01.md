# ADPAI: context for a separate BizRouter-funded coding session

The user wants coding work to use their BizRouter credit rather than the
current ChatGPT conversation allowance. That allowance and this CLI session
are separate. Speak Persian to the user; the product UI and plain ingredient
explanations are English and Korean.

## Current source and publication evidence

- Repository: `faranaksolat/ADPAI`; use the existing checkout, inspect git status
  and preserve user files and local changes. Do not reset or force push.
- Last known published source: `0a317b0663a691e70194c85569910fcb3e52d357`.
- Pages: https://faranaksolat.github.io/ADPAI/ . Version 1.11.1, with separate
  https://faranaksolat.github.io/ADPAI/cosmetics.html experimental preview.
- Pages run https://github.com/faranaksolat/ADPAI/actions/runs/41202960555
  completed successfully for that exact commit. Direct live-site bytes were
  not independently verified from the previous cloud environment due to its
  proxy denial. Do not claim physical-phone validation from that run.
- Last checks: 190 JavaScript tests, 67 Python tests, Pages browser smoke at
  390px and 320px, and mobile-web bundle smoke passed. Browser smoke uses
  controlled OCR, not real-package accuracy evidence.
- Public website updates do not update the installed Android APK. No new APK
  or iOS installer was produced for 1.11.1. No app-store publication authorized.

## Architecture and non-negotiable result boundaries

- Pages path: index.html -> src/browser.js -> src/tesseract.js. Native Android
  food/menu OCR can use ML Kit. Cosmetics uses its own Tesseract path.
- backend/main.py is a separate optional FastAPI/PaddleOCR implementation.
  pc_server/main.py is an authenticated private PC companion with a distinct
  frontend in pc_server/static; the public site does not automatically call it.
- Photos/text remain local in the published on-device app. A remote/API mode
  must have truthful, explicit user consent and server-side credentials before
  uploading any photos. Never put the provider key in static Pages, APK assets,
  source control, screenshots or logs. Do not print credential files/values.
- Keep unknown/incomplete readings unverified. Never certify safety, absence
  of allergens, complete-label coverage or clinical suitability from an empty
  match list, OCR confidence or a model answer.
- Menus use printed information only; do not infer recipes from dish names or
  food photos. Menu options include avoiding pork, beef/veal, and vegetarian
  preferences; these are not halal certification. No calorie feature.
- Cosmetic food-source questions, contact allergy, coconut protein and clinical
  cross-reactivity are different issues. Do not infer coconut or milk protein
  from every similarly named chemical. Keep unknown names visible.

## Recognition/data evidence that must not be embellished

- src/cosmetic-glossary.js contains 332 authored identities and 726 names and
  aliases; incomplete and not independently reviewed by specialists.
- The full cosmetic recognition gate FAILS: on 10 authored development cards,
  50/56 names were available for explanation, only 48/56 passed current OCR
  context rules, and 6 names were missed. No clinical/global accuracy estimate.
- Read docs/COSMETICS-1.11.1-fa.md, docs/WEB-PREVIEW-1.11.1-fa.md and the
  unchanged reports in benchmarks/reports/cosmetics-1.11.1-*.json.
- benchmarks/crawl-cosmetics.py and its Windows launcher collect UNREVIEWED
  photo candidates, original bytes and source/rights metadata. The 21 crawler
  tests are synthetic transport/image/schema checks. A 50-real-product cosmetic
  dataset has NOT been collected or independently transcribed. No neural model
  training was performed. Retailer rights and live-source support are unverified.
- Prior uploaded menus and other raw data stayed ignored in benchmarks/data/
  in the previous cloud workspace. They do not come with a fresh Git clone.
  Ask for an authorized source if actual binary images are needed; never claim
  those images or a connected physical device are present without checking.

## BizRouter integration facts already checked

- BizRouter, Onpod and BizCoder have different roles. The coding session
  uses the configured BizRouter account. Check its current balance and usage
  in the provider console; never assume the balance of another service.
- Official package bizrouter@0.3.12 was inspected from npm, with SHA-512:
  B44gmltoTaDE0iQmo8MGYBHVleqNJEtq6kyC/LWb0MyQrU3j4VOx3DzNRhwXCusGiR1ZlLRCptihguqsuCFEHQ==
- Official docs: https://bizrouter.ai/docs/cli . Its CLI browser login creates
  local device credentials. The separate session is launched via `bizrouter
  codex`, with model_provider=bizrouter, base_url=https://api.bizrouter.ai/v1,
  wire_api=responses and environment key BIZROUTER_API_KEY. No account was
  logged in or paid model call made by the previous assistant.
- The Windows launcher disables BizRouter console-management MCP with
  --no-mcp; it does not disable Codex's normal command approvals/sandbox.
  No permanent Codex provider configuration is rewritten by this wrapper.
- Adding BizRouter models to the APP is still a separate, unfinished task.
  The user's earlier chosen goal is better image reading and English/Korean
  plain ingredient explanations, while the immediate goal is funding CODING
  through BizRouter. Keep these two connections distinct.

## Continuing work

Read the current repository and applicable AGENTS.md instructions first. Check
what tools, credentials, model catalogue, images and services actually exist on
this Windows machine. Do not copy Linux-only cache/tool paths from old notes.
Use a feature branch for new work, meaningful tests, and honest reports of
passed/failed/unrun checks. Keep failing recognition cases; do not lower gates
or fabricate successful API, phone, dataset or deployment results.

When the user asks to resume the app API integration, prepare an optional,
authenticated server-side image-reading path and English/Korean explanations,
with user consent, bounded requests/cost, no automatic retries of paid calls,
no unsupported recipe inference and no auto-safe outputs. Verify actual model
image-input support and provider schema from current official docs/catalogue;
do not guess model availability. Use mocked provider responses until configured
secrets, privacy flow and a concrete test budget allow a real image test.
