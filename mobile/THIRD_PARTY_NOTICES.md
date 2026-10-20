# Bundled components

The native app includes Tesseract.js 5.1.1 (Apache-2.0), tesseract.js-core
(Apache-2.0), Capacitor and its Camera plugin (MIT), and Korean, English and
French traineddata from the official @tesseract.js-data 1.0.0 packages.
The language-package metadata declares MIT; the upstream Tesseract model
files are also distributed under Apache-2.0. The build includes the license
texts and package READMEs in `licenses/`.

Sources: https://github.com/naptha/tesseract.js,
https://github.com/naptha/tesseract.js-core, https://github.com/naptha/tessdata,
https://github.com/ionic-team/capacitor, https://github.com/ionic-team/capacitor-plugins.

Android also bundles Google ML Kit Latin and Korean text-recognition artifacts
16.0.1 and their transitive libraries/models from Google's Maven repository.
The app uses their on-device recognition APIs through its own Capacitor bridge.
Google SDK/model usage is subject to https://developers.google.com/ml-kit/terms.
See privacy.html for SDK operational/diagnostic data information. ML Kit word
scores are retained as uncalibrated native scores, never safety probabilities.
