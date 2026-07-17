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
  /* Flat, readable baseline names. Two committed sets: local Macs compare
     against visual-baselines/, CI compares against visual-baselines-ci/ —
     the dusk glass blur composites differently across GPUs (measured
     129–46k px cross-machine on identical pages, Jul 2026), so each
     environment gets its own baselines at full sensitivity instead of one
     set with a uselessly loose budget. Re-baseline CI via the
     update-ci-baselines workflow_dispatch; local via npm run visual:update. */
  snapshotPathTemplate: process.env.CI
    ? '{testDir}/visual-baselines-ci/{arg}{ext}'
    : '{testDir}/visual-baselines/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      /* Absolute pixel budget, NOT a ratio: 2% of a 1440×900 page is
         ~26k pixels — enough to swallow a real change (it hid the About
         badge fix entirely, Jul 2026). 100px absorbs antialiasing drift
         while any visible UI change (a chip is ~1.5k px) still fails. */
      maxDiffPixels: 100,
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
