ADPAI v2.2.0 — CACHE SAFETY GUARD

This historical version addresses deployment caching:

1. OLD CODE STILL RUNNING
- v2.1 has 7 mandatory OCR families.
- A live result showing 3/9 proves the browser/page is still running v2.0 code.
- v2.2 shows an explicit visible version badge in the header.
- Module URLs include ?v=2.2.0 to force GitHub Pages/browser cache refresh.

Expected live header:
  ADPAI v2.2.0

Expected safety denominator:
  /7
(not /9)

DEPLOY
------
Replace all repository files with this package, then:

  git add .
  git commit -m "Fix cache versioning v2.2"
  git push origin main

After GitHub Pages deploys:
- open the site
- press Ctrl+Shift+R (or Ctrl+F5)
- VERIFY the header visibly says v2.2.0
- only then run the product test

If the header does not say v2.2.0, do not trust the test result: the old app is still loaded.
