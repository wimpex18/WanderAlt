/* ============================================================
   WanderAlt — visual audit (npm run audit)
   ------------------------------------------------------------
   The point of this script: a model edits CSS *blind*. This makes the
   render legible to it two ways —
     1. SCREENSHOTS of every public page at 390 / 768 / 1440 into
        .screenshots/audit/ — the agent then READS those PNGs (Claude can
        see images) and critiques them like a human eye (icon scale,
        alignment, density, balance), comparing against the reference
        boards in docs/redesign-jun26/.
     2. A NUMERIC report that turns "the eye notices" into values a model
        can read: the distinct icon (svg) sizes per page (your "icon too
        big / too small" complaint becomes a printed list), plus any
        horizontal overflow. Inconsistent icon scale shows up as >3
        distinct sizes on one page.
   This is NOT a pass/fail gate (that's `npm run verify`). It's a seeing
   aid. Self-boots a static server; writes PNGs; prints the report.
   ============================================================ */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const PORT = 5186;
const BASE = `http://127.0.0.1:${PORT}`;
const WIDTHS = [390, 768, 1440];
const OUT = path.join(__dirname, 'audit');
const PAGES = [
  ['today',          '/index.html'],
  ['discover',       '/discover.html?time=thisweek'],
  ['discover-places','/discover.html?type=places'],
  ['saved',          '/saved.html'],
  ['profile',        '/profile.html'],
  ['about',          '/about.html'],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('npx', ['http-server', '.', '-p', String(PORT), '-c-1', '--silent'], { stdio: 'ignore' });
  await sleep(2000);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
  });

  const report = [];
  for (const [name, url] of PAGES) {
    const row = { page: name, overflow: [], icons: null };
    for (const width of WIDTHS) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.evaluate(() => localStorage.setItem('wa:city', 'tallinn')).catch(() => {});
      await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
      await sleep(1200);
      await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true }).catch(() => {});

      const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (ov > 1) row.overflow.push(`${width}:${ov}px`);

      // Icon-size census at the canonical mobile width only (strictest).
      if (width === 390) {
        row.icons = await page.evaluate(() => {
          const tally = {};
          for (const s of document.querySelectorAll('svg')) {
            const r = s.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) continue;            // hairline/decorative
            if (r.bottom < 0 || r.top > window.innerHeight * 4) continue; // far off-screen
            const key = `${Math.round(r.width)}×${Math.round(r.height)}`;
            tally[key] = (tally[key] || 0) + 1;
          }
          return tally;
        });
      }
      await page.close();
    }
    report.push(row);
  }

  await browser.close();
  server.kill();

  console.log(`\nScreenshots → ${path.relative(process.cwd(), OUT)}/  (read them: <page>-<width>.png at ${WIDTHS.join('/')})\n`);
  console.log('Per-page numeric audit (icon census @390; overflow @all):');
  for (const r of report) {
    const sizes = Object.entries(r.icons || {}).sort((a, b) => b[1] - a[1]);
    const distinct = sizes.length;
    const flag = distinct > 3 ? '  ⚠ >3 distinct icon sizes — likely inconsistent' : '';
    console.log(`\n  ${r.page}`);
    console.log(`    icons: ${sizes.map(([k, n]) => `${k}×${n}`).join('  ') || '(none)'}${flag}`);
    if (r.overflow.length) console.log(`    ⚠ overflow: ${r.overflow.join(' · ')}`);
  }
  console.log('\nNow READ the PNGs and critique like a human eye — do not trust this list alone.');
  console.log('CAVEAT: these are fullPage shots, so position:fixed chrome (topbar, bottom-nav) is');
  console.log('captured at its first-viewport spot and will look like it floats over mid-page content.');
  console.log('That is a screenshot artifact, NOT a layout bug — confirm chrome in a real browser/viewport shot.');

})().catch((e) => { console.error('audit harness error:', e); process.exit(1); });
