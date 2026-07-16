/* ============================================================
   Playwright Test config — visual regression only (npm run visual).
   The behavioural gates stay on Puppeteer (verify/e2e/smoke); this
   config exists solely for .screenshots/visual.spec.js, which
   pixel-diffs key pages against committed baselines.
   Re-baseline intentionally with:  npm run visual:update
   ============================================================ */
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.screenshots',
  testMatch: 'visual.spec.js',
  timeout: 60_000,
  fullyParallel: true,
  /* Flat, readable baseline names: .screenshots/visual-baselines/<name>.png */
  snapshotPathTemplate: '{testDir}/visual-baselines/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      /* Small tolerance absorbs font antialiasing drift across machines
         without hiding real layout regressions. */
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:5177',
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'npx http-server . -p 5177 -c-1 --silent',
    port: 5177,
    reuseExistingServer: true,
  },
});
