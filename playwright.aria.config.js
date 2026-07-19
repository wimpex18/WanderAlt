/* ============================================================
   Playwright config — ARIA snapshot regression (npm run aria).
   Separate from playwright.config.js (visual) on purpose: the
   accessibility tree is machine-independent (no GPU compositing),
   so it needs ONE committed baseline set — not the per-environment
   local/CI split the visual PNGs require. Re-baseline with
   `npm run aria:update`.
   ============================================================ */
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.screenshots',
  testMatch: 'aria.spec.js',
  timeout: 60_000,
  fullyParallel: true,
  snapshotPathTemplate: '{testDir}/aria-baselines/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:5178',
    deviceScaleFactor: 1,
    /* The app cancels every entrance/View-Transition under
       prefers-reduced-motion (Dusk Glass law). Rendering reduced kills the
       @starting-style fade-in that otherwise left the wordmark mid-animation
       (accessible text "" one run, "WanderAlt" the next) — the tree settles
       immediately and identically every run. */
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'npx http-server . -p 5178 -c-1 --silent',
    port: 5178,
    reuseExistingServer: true,
  },
});
