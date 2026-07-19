/* ============================================================
   WanderAlt — ARIA snapshot regression (npm run aria)
   ------------------------------------------------------------
   The automated complement to the manual VoiceOver pass
   (docs/voiceover-test-checklist.md). axe checks a11y *properties*
   (contrast, names present, roles valid); pixel-diff checks the
   *look*. Neither locks the ACCESSIBILITY TREE a screen reader
   actually walks — the roles, accessible names, nesting and ORDER.
   Playwright's toMatchAriaSnapshot captures exactly that as YAML.

   What this catches that the other gates don't:
     - a nav/dock tab losing its accessible name (the Jul 2026 fix —
       nameless links) — axe wouldn't flag a link that still has SOME
       name; this locks the exact names Today/Discover/Saved/Profile.
     - a heading demoted to a <div>, or headings reordered.
     - a segmented control losing its selected/role semantics.
     - the skip link disappearing; a landmark vanishing.
     - a title that used to be a link becoming plain text.

   DETERMINISM (same recipe as visual.spec.js): Supabase REST/functions
   aborted → static catalog.js fallback; clock frozen; skin pinned. The
   tree is machine-independent (no GPU), so — unlike the visual PNGs —
   there is ONE baseline set (.screenshots/aria-baselines/), no CI split.
   Both widths are captured because the chrome swaps at 768 (mobile dock
   → desktop masthead), which changes the nav subtree.

   A deliberate markup change WILL fail this — re-baseline with
   `npm run aria:update` and commit the .aria.yml in the same PR.
   ============================================================ */

const { test, expect } = require('@playwright/test');

const WIDTHS = [390, 1440];
const FIXED_TIME = new Date('2026-07-16T18:00:00+03:00');

/* Param-less core surfaces. Detail pages (venue/curator) derive an id
   from the static catalog below. */
const PAGES = [
  ['today',           '/index.html'],
  ['discover',        '/discover.html'],
  ['discover-places', '/discover.html?type=places'],
  ['profile',         '/profile.html'],
  ['about',           '/about.html'],
  ['404',             '/404.html'],
];
/* saved.html is deliberately NOT snapshotted: its tree carries volatile
   state (bookmark counts, and the "Past N" seg count computed after the
   post-catalog re-render) that isn't a structural regression signal and
   flaked run-to-run. Its shared chrome + segmented-control + list-row
   pattern is already locked deterministically by profile.html and discover. */

async function harden(page) {
  await page.route('**/rest/v1/**', (r) => r.abort());
  await page.route('**/functions/v1/**', (r) => r.abort());
  await page.route('**/unpkg.com/**', (r) => r.abort());
  await page.route('**/openfreemap.org/**', (r) => r.abort());
  await page.route('**/*.{jpg,jpeg,png,webp,avif,gif}', (r) => r.abort());
  await page.route('**/googleusercontent.com/**', (r) => r.abort());
  await page.route('**/*.wikimedia.org/**', (r) => r.abort());
  await page.route('**/*.wikipedia.org/**', (r) => r.abort());
  await page.route('**/img/wm/**', (r) => r.abort());
  await page.route('**/*.supabase.co/**/storage/**', (r) => r.abort());
  await page.addInitScript(({ fixedMs }) => {
    const OrigDate = Date;
    class FixedDate extends OrigDate {
      constructor(...args) { if (args.length) { super(...args); } else { super(fixedMs); } }
      static now() { return fixedMs; }
    }
    FixedDate.parse = OrigDate.parse; FixedDate.UTC = OrigDate.UTC;
    // eslint-disable-next-line no-global-assign
    window.Date = FixedDate;
    try { localStorage.setItem('wa:city', 'tallinn'); localStorage.setItem('wa:appearance', 'dusk'); } catch (_) {}
  }, { fixedMs: FIXED_TIME.getTime() });
}

async function settle(page) {
  await page.waitForFunction(() => window.__waCatReady === true, null, { timeout: 8000 }).catch(() => {});
  /* Let the post-catalog re-render (saved counts, list swaps) and fonts
     finish so the tree is at steady state before snapshotting. */
  await page.evaluate(() => (document.fonts && document.fonts.ready) || Promise.resolve()).catch(() => {});
  await page.waitForTimeout(800);
}

for (const [name, url] of PAGES) {
  for (const width of WIDTHS) {
    test(`aria ${name} @${width}`, async ({ page }) => {
      await harden(page);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(url, { waitUntil: 'load' });
      await settle(page);
      await expect(page.locator('body')).toMatchAriaSnapshot({ name: `${name}-${width}.aria.yml` });
    });
  }
}

/* Detail pages: derive a real id from the (static, deterministic) catalog,
   then snapshot the tree. These are the pages a visitor reaches from a
   shared link — the same coverage gap the skipped-pages audit closed for axe. */
for (const width of WIDTHS) {
  test(`aria venue @${width}`, async ({ page }) => {
    await harden(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/discover.html', { waitUntil: 'load' });
    await settle(page);
    const pickId = await page.evaluate(() => {
      const cat = (window.WA && (window.WA._catalogAll || window.WA.catalog)) || [];
      return cat[0] && cat[0].id;
    });
    test.skip(!pickId, 'no catalog pick to derive venue id');
    await page.goto(`/venue.html?id=${encodeURIComponent(pickId)}`, { waitUntil: 'load' });
    await settle(page);
    await expect(page.locator('body')).toMatchAriaSnapshot({ name: `venue-${width}.aria.yml` });
  });

  test(`aria curator @${width}`, async ({ page }) => {
    await harden(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/discover.html', { waitUntil: 'load' });
    await settle(page);
    const handle = await page.evaluate(() => {
      const cat = (window.WA && (window.WA._catalogAll || window.WA.catalog)) || [];
      const byH = {}; cat.forEach((e) => { (byH[e.handle] = byH[e.handle] || []).push(e); });
      const multi = Object.keys(byH).find((h) => byH[h].length > 1);
      return multi || (cat[0] && cat[0].handle);
    });
    test.skip(!handle, 'no catalog handle to derive curator');
    await page.goto(`/curator.html?handle=${encodeURIComponent(handle)}`, { waitUntil: 'load' });
    await settle(page);
    await expect(page.locator('body')).toMatchAriaSnapshot({ name: `curator-${width}.aria.yml` });
  });
}
