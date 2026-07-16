/* ============================================================
   WanderAlt — visual audit (npm run audit) · Playwright edition
   ------------------------------------------------------------
   The point of this script: a model edits CSS *blind*. This makes the
   render legible to it two ways —
     1. SCREENSHOTS of every public page (incl. derived venue/curator/
        place param pages) at 390 / 768 / 1440 into .screenshots/audit/.
        NOT fullPage: each page is scroll-HYDRATED first (so lazy /
        content-visibility rows actually paint), then captured as
        VIEWPORT-SIZED SEGMENTS (<page>-<width>-s01.png, s02, …). Every
        segment is exactly what a user sees at that scroll position, so
        the two fullPage artifact classes (fixed chrome floating over
        mid-page content; below-fold rows capturing empty) cannot occur.
        Fixed chrome appearing in EVERY segment is truth, not a bug.
     2. A NUMERIC report per page: distinct icon (svg) sizes @390 (the
        "icon too big / too small" feeling as a printed list — >3
        distinct sizes flags likely inconsistency) plus any horizontal
        overflow at all widths.
   WebGL is enabled (--enable-unsafe-swiftshader); MapLibre initialises
   and DOM markers/clusters render truthfully, but the vector BASEMAP
   still does not rasterise in headless on this machine (probed Jul 2026:
   tiles fetch, swiftshader AND metal backends create contexts, canvas
   never paints). A blank basemap behind correct markers is an
   ENVIRONMENT limitation — check tiles on the Cloudflare PR preview or
   a real browser; wrong/missing MARKERS are a real finding.
   This is NOT a pass/fail gate (that's `npm run verify`). It's a seeing
   aid. Self-boots a static server; writes PNGs; prints the report.
   Engine note: audit runs on Playwright (owner-directed, Jul 2026);
   verify/e2e/smoke stay on Puppeteer — keep it that way.
   ============================================================ */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 5186;
const BASE = `http://127.0.0.1:${PORT}`;
const WIDTHS = [390, 768, 1440];
const MAX_SEGMENTS = 8; // per page×width; truncation is logged, never silent
const OUT = path.join(__dirname, 'audit');

const STATIC_PAGES = [
  ['today',          '/index.html'],
  ['discover',       '/discover.html'],
  ['discover-week',  '/discover.html?time=thisweek'],
  ['discover-places','/discover.html?type=places'],
  ['saved',          '/saved.html'],
  ['profile',        '/profile.html'],
  ['about',          '/about.html'],
  ['search',         '/search.html'],
  ['map',            '/map.html'],
  ['404',            '/404.html'],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); // no stale shots from prior runs
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('npx', ['http-server', '.', '-p', String(PORT), '-c-1', '--silent'], { stdio: 'ignore' });
  await sleep(2000);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  });

  const newPage = async (width) => {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(() => {
      try { localStorage.setItem('wa:city', 'tallinn'); } catch (_) {}
    });
    return context.newPage();
  };

  const nav = async (page, url) => {
    /* 'domcontentloaded', not 'networkidle'/'load': network-idle never fires
       on pages with lingering connections (Supabase, tile CDN) and 'load'
       blocks on every storage thumbnail — both produced 15-25 min runs. The
       real render is gated on wa:catalog-ready (waited below) and each
       segment shot settles 180ms, which covers image pop-in well enough
       for a seeing aid. */
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    /* Detail/list pages render on wa:catalog-ready (supabase.js live fetch
       resolves or times out ~2s); static pages never set the flag — hence
       the short-fuse catch instead of a hard wait. NB Playwright signature:
       (fn, ARG, options) — options third, unlike Puppeteer's (fn, options);
       passing {timeout} second silently waits the 30s default per page. */
    await page.waitForFunction(() => window.__waCatReady === true, null, { timeout: 6000 }).catch(() => {});
    await sleep(600);
  };

  /* Scroll-hydrate: walk to the bottom so IntersectionObserver /
     content-visibility content paints, then return to top. Without this,
     below-fold rows screenshot as empty frames (the Jul 2026 false alarm). */
  const hydrate = async (page) => {
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y <= document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 70));
      }
    });
    await sleep(500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);
  };

  const captureSegments = async (page, name, width) => {
    const { vh, total } = await page.evaluate(() => ({
      vh: window.innerHeight,
      total: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    }));
    const wanted = Math.max(1, Math.ceil(total / vh));
    const n = Math.min(wanted, MAX_SEGMENTS);
    const files = [];
    for (let i = 0; i < n; i += 1) {
      /* Last segment anchors to the true bottom so no past-bottom blank. */
      const y = i === n - 1 ? Math.max(0, total - vh) : i * vh;
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await sleep(180); // sticky chrome + lazy images settle
      const file = `${name}-${width}-s${String(i + 1).padStart(2, '0')}.png`;
      await page.screenshot({ path: path.join(OUT, file) }).catch(() => {});
      files.push(file);
    }
    return { files, truncated: wanted > n ? wanted - n : 0 };
  };

  const auditPage = async (name, url, report) => {
    const row = { page: name, overflow: [], icons: null, segs: {}, truncated: {} };
    for (const width of WIDTHS) {
      const page = await newPage(width);
      await nav(page, url);
      if (name === 'map' || name === 'discover-places') await sleep(2500); // tile render
      await hydrate(page);

      const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (ov > 1) row.overflow.push(`${width}:${ov}px`);

      if (width === 390) {
        row.icons = await page.evaluate(() => {
          const tally = {};
          for (const s of document.querySelectorAll('svg')) {
            const r = s.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) continue;                    // hairline/decorative
            if (r.bottom < 0 || r.top > window.innerHeight * 4) continue; // far off-screen
            const key = `${Math.round(r.width)}×${Math.round(r.height)}`;
            tally[key] = (tally[key] || 0) + 1;
          }
          return tally;
        });
      }

      const { files, truncated } = await captureSegments(page, name, width);
      row.segs[width] = files.length;
      if (truncated) row.truncated[width] = truncated;
      await page.close();
      await page.context().close();
    }
    report.push(row);
  };

  const report = [];
  for (const [name, url] of STATIC_PAGES) await auditPage(name, url, report);

  /* Param pages: derive real ids from whatever catalog actually loads
     (live Supabase or the static fallback), same logic as e2e.js. */
  const probe = await newPage(390);
  await nav(probe, '/discover.html');
  const ids = await probe.evaluate(() => {
    const cat = (window.WA && (window.WA._catalogAll || window.WA.catalog)) || [];
    const ven = (window.WA && (window.WA._venuesAll || window.WA.venues)) || [];
    const byH = {}; cat.forEach((e) => { (byH[e.handle] = byH[e.handle] || []).push(e); });
    const multi = Object.keys(byH).find((h) => byH[h].length > 1);
    const names = new Set(cat.map((p) => (p.venue || '').trim().toLowerCase()));
    const v = ven.find((x) => x.name && names.has(x.name.trim().toLowerCase()));
    return {
      pick: (multi && byH[multi][0].id) || (cat[0] && cat[0].id),
      handle: multi || (cat[0] && cat[0].handle),
      venue: v && v.id,
    };
  });
  await probe.close();
  await probe.context().close();

  const PARAM_PAGES = [
    ids.pick   && ['venue',   `/venue.html?id=${encodeURIComponent(ids.pick)}`],
    ids.handle && ['curator', `/curator.html?handle=${encodeURIComponent(ids.handle)}`],
    ids.venue  && ['place',   `/place.html?id=${encodeURIComponent(ids.venue)}`],
  ].filter(Boolean);
  if (PARAM_PAGES.length < 3) console.log(`⚠ param-page derivation incomplete: ${JSON.stringify(ids)} — skipped the missing ones`);
  for (const [name, url] of PARAM_PAGES) await auditPage(name, url, report);

  await browser.close();
  server.kill();

  console.log(`\nSegments → ${path.relative(process.cwd(), OUT)}/<page>-<width>-sNN.png  (widths ${WIDTHS.join('/')}; each segment = one real viewport, top→bottom)\n`);
  console.log('Per-page numeric audit (icon census @390; overflow @all):');
  for (const r of report) {
    const sizes = Object.entries(r.icons || {}).sort((a, b) => b[1] - a[1]);
    const flag = sizes.length > 3 ? '  ⚠ >3 distinct icon sizes — likely inconsistent' : '';
    console.log(`\n  ${r.page}  (segments ${WIDTHS.map((w) => `${w}:${r.segs[w]}`).join(' · ')})`);
    console.log(`    icons: ${sizes.map(([k, n]) => `${k}×${n}`).join('  ') || '(none)'}${flag}`);
    if (r.overflow.length) console.log(`    ⚠ overflow: ${r.overflow.join(' · ')}`);
    for (const [w, t] of Object.entries(r.truncated)) console.log(`    ⚠ ${w}px: page longer than ${MAX_SEGMENTS} segments — ${t} more not captured (scroll a live page to see the tail)`);
  }
  console.log('\nNow READ the PNGs and critique like a human eye — do not trust this list alone.');
  console.log('Segments are viewport-truth: fixed chrome (topbar/bottom bar) correctly appears in');
  console.log('every segment, and hydrated rows are really rendered. Map caveat: markers/clusters');
  console.log('are truth, but the vector basemap does not rasterise in headless — a blank basemap');
  console.log('is an environment artifact, NOT a bug; verify tiles on the PR preview.');
})().catch((e) => { console.error('audit harness error:', e); process.exit(1); });
