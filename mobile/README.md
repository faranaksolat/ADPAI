# ADPAI on phones

The public PWA is https://faranaksolat.github.io/ADPAI/. Android users can use
**Install ADPAI** when offered, or the browser's Install/Add to Home screen
menu. On iPhone/iPad use Safari → Share → Add to Home Screen. Installation
does not improve OCR accuracy. The website caches its application shell, not
photographs or results. Offline OCR is not guaranteed on the website.

## Native app projects

`android/` and `ios/` are Capacitor 8 projects, app name ADPAI and provisional
application identifier `io.github.faranaksolat.adpai`. Confirm availability
when registering the app in the stores, before a first release. The app uses
the **same** `src/browser.js`, `src/tesseract.js` and `src/engine.js` as Pages,
bundled by `mobile/entry.js`. It does not call the optional FastAPI service.
No account, API key, analytics or photo upload is needed to run it.

The native camera and gallery actions run only after tapping a button. Camera
photos are not deliberately saved to the gallery. An abandoned/denied action
leaves no analysis result. Changing photos clears old results. Input controls
are locked during inference. At most 3 photos belong to one product.

`npm run build:mobile` creates ignored `dist/` from a public-file allowlist;
backend files, `.env` and `.git` are excluded. It bundles the pinned Tesseract
5.1.1 runtime, worker, WASM variants, and official Korean/English/French 1.0.0
language data. These primary assets can run without a network download.
Primary traineddata is stored uncompressed with `gzip:false`, because Android
AAPT automatically unpacks `.gz` assets and removes the suffix. Always run
`python scripts/verify-apk.py` after building to verify packaged filenames
and bytes against `dist/`; compiling alone does not validate model loading.
Fallback languages still download from jsDelivr if they are needed and not
cached. The app does not register the PWA service worker or fetch remote app
updates; rebuild and install a new binary to update its rules/code.

## Local build and checks

Node 22+ is required. Use the committed npm lockfile:

```bash
npm ci
npm test
npm run build:mobile
npx cap sync
npm run test:browser
npm run test:mobile-web
MOBILE_WEB=1 REAL_OCR=1 node tests/browser-smoke.mjs
```

The browser checks require Chromium (`CHROMIUM_PATH` can override its path).
The last check blocks external HTTPS and runs the bundled OCR on a generated
ingredient label. It verifies local assets, worker loading and inference;
it is **not** evidence of accuracy on real packages or a native-device test.
The other browser tests use controlled OCR and cover `/ADPAI/` paths, offline
shell, fail-closed output, stale results, camera cancellation and permission
errors through a test bridge. Native device permissions/lifecycle still need
physical-device testing.

Android requires a full **JDK 21** (a JRE alone is insufficient), Android SDK
platform 36/build-tools 35.0.0 (the AGP 8.13 default), and a compatible Android Studio. Set
`ANDROID_HOME` and `JAVA_HOME` to your installations. From the repository root:

```bash
npm run build:android:debug
# Output: android/app/build/outputs/apk/debug/app-debug.apk
npm run mobile:android
```

The APK is a debug build for internal testing, not a Play Store release.
Use Android Studio's signed bundle workflow for a release `.aab`; store the
keystore/passwords securely outside Git and use Play App Signing. Debug
keystores are not stable release keys. Android backup and cleartext traffic
are disabled. Minimum supported Android version is 7 (API 24).

iOS requires macOS, Xcode 26+ and iOS 15+. The generated project uses Swift
Package Manager; no CocoaPods installation is required.

```bash
npm run mobile:ios
# Or a build for the simulator without release signing:
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO build
```

For an iPhone/TestFlight build, choose your Apple development team in Xcode,
configure signing/provisioning and Archive → Distribute App. A simulator
`.app` cannot be installed on an iPhone. Apple and Google developer accounts,
store registration, release signing and a review are separate requirements.
No store publication occurs from these scripts.

## GitHub test builds

Open repository **Actions → Mobile test builds → Run workflow** and select
Android, iOS or both. The workflow is manual, uses read-only repository
permissions and uploads a debug APK and/or an unsigned simulator app as
14-day artifacts. Download them from the completed workflow run. It never
uploads to Google Play, TestFlight or the App Store. Native transitive
dependencies and the runner's Xcode/SDK still need a successful native build;
the presence of this workflow alone is not a passing build result.

The hosted runner generates a fresh debug signing key on each run. A later
test APK can therefore fail to update an earlier installation with
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`. Do not silently uninstall: uninstalling
removes the saved local allergy profile. For ongoing testing, arrange a
stable private test signing key, or explicitly choose a clean reinstall and
re-enter the profile. Never commit signing keys or passwords to the repository.

## Before public release

- Complete the real-package benchmark in `benchmarks/README.md`, including
  direct allergen recall, precautionary recall, missed-positive/abstention
  rates and p50/p95 latency on representative phones. Text regression tests
  and generated labels do not satisfy this release gate.
- Test on physical Android/iOS devices: camera/gallery, denied and limited
  permissions, rotation/EXIF, small text, 3-photo products, backgrounding,
  memory pressure, interruptions, failed model downloads and app upgrades.
  Android can destroy an activity while the camera is open; verify recovery
  and require a fresh scan when state is lost. iOS/Android temporary camera
  files and backups follow OS/provider rules.
- Keep `conflict`, `caution` and `unverified`. No match or unavailable OCR
  must never become an allergen-free/safe claim. Wrapping this prototype in
  an app does not fix the recognition failures observed on real labels.
- Prepare accurate store screenshots/descriptions, the published
  `privacy.html` URL, support information, store privacy declarations and
  permission explanations. Review these against the final binary and any
  later SDK/backend changes. Bump Android `versionCode` and iOS
  `CURRENT_PROJECT_VERSION` for every store upload.

`scripts/generate-icons.py` regenerates the simple ADPAI lettermark for the
web and native projects (Pillow + DejaVu Sans). Keep release versions in the
HTML/import graph, service-worker cache, package manifest, mobile build
script and native version names aligned when changing application code.
