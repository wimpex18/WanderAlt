/* ============================================================
   WanderAlt — pixel-diff visual regression (npm run visual)
   ------------------------------------------------------------
   Catches layout/CSS regressions that structural checks (verify) and
   behaviour checks (e2e) can't see: a shifted rule, a wrong gap, a
   font fallback, a broken tier height. Each key page is screenshotted
   at 390/768/1440 and compared against the committed baseline in
   .screenshots/visual-baselines/.

   DETERMINISM — the whole point, or every run diffs:
   - Supabase REST + functions are aborted → supabase.js falls back to
     the static catalog.js snapshot on every run (storage/image hosts
     stay allowed so real thumbs render).
   - The clock is fixed to Thu 16 Jul 2026, 18:00 Baltic — the date
     line, when.js's tonight/this-week derivation, and any "today"
     logic render identically forever.
   - Animations are disabled by config; the viewport (not fullPage) is
     captured, so lazy-render artifacts can't occur.

   A legitimate design change WILL fail this suite — that's it working.
   Re-baseline deliberately with `npm run visual:update` and commit the
   changed PNGs in the same PR as the CSS change.
   ============================================================ */

const { test, expect } = require('@playwright/test');

const WIDTHS = [390, 768, 1440];
const PAGES = [
  ['today',           '/index.html'],
  ['discover',        '/discover.html'],
  ['discover-week',   '/discover.html?time=thisweek'],
  ['discover-places', '/discover.html?type=places'],
  ['saved',           '/saved.html'],
  ['profile',         '/profile.html'],   /* fresh context = signed-out state */
  ['about',           '/about.html'],
  ['404',             '/404.html'],
];

/* Thursday evening, Baltic summer time — matches the catalog snapshot era. */
const FIXED_TIME = new Date('2026-07-16T18:00:00+03:00');

for (const [name, url] of PAGES) {
  for (const width of WIDTHS) {
    test(`${name} @${width}`, async ({ page }) => {
      await page.route('**/rest/v1/**', (r) => r.abort());
      await page.route('**/functions/v1/**', (r) => r.abort());
      /* Block MapLibre (unpkg) + tiles: the map canvas paints
         nondeterministically in headless (flaked discover-week@1440 by a
         few px) and the basemap can't rasterise here anyway. The map
         column renders as its empty plate — deterministic. */
      await page.route('**/unpkg.com/**', (r) => r.abort());
      await page.route('**/openfreemap.org/**', (r) => r.abort());
      /* Freeze Date via an init shim rather than page.clock: the shim
         pins only "now" and leaves timers/rAF real, so it cannot interact
         with toHaveScreenshot's stabilization or the app's timeouts. */
      await page.addInitScript((fixedMs) => {
        const OrigDate = Date;
        class FixedDate extends OrigDate {
          constructor(...args) { if (args.length) { super(...args); } else { super(fixedMs); } }
          static now() { return fixedMs; }
        }
        FixedDate.parse = OrigDate.parse;
        FixedDate.UTC = OrigDate.UTC;
        // eslint-disable-next-line no-global-assign
        window.Date = FixedDate;
        try {
          localStorage.setItem('wa:city', 'tallinn');
          /* Pin dusk explicitly — theme.js otherwise picks the skin from
             the sun table, and 18:00 July Baltic is daylight. Baselines
             grade the dusk boards (Jul 2026 Dusk Glass). */
          localStorage.setItem('wa:appearance', 'dusk');
        } catch (_) {}
      }, FIXED_TIME.getTime());
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(url, { waitUntil: 'load' });
      /* Static pages (404) never set the flag — short-fuse catch.
         NB Playwright signature: (fn, ARG, options) — options third; passing
         {timeout} second silently becomes the fn's argument and the wait
         runs unbounded (cost us a 60s-per-test hang, Jul 2026). */
      await page.waitForFunction(() => window.__waCatReady === true, null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600);
      await expect(page).toHaveScreenshot(`${name}-${width}.png`);
    });
  }
}
