/* WanderAlt verification harness — the per-PR structural checks, automated.
   ------------------------------------------------------------------------
   "LLMs automate what you can verify" (Karpathy). This turns the manual
   sweep we run on every change into one repeatable command:

     npm run verify

   It self-boots a static server, then for every public page at 3 widths
   (390 / 768 / 1440) asserts:
     1. No horizontal overflow (scrollWidth <= innerWidth).
     2. No real console / page errors (same noise filter as smoke.js —
        sandbox cert blocks + dummy-JWT 401/403 are ignored).
     3. Interactive controls meet the 44px Apple-HIG tap-target floor
        (only the selectors we committed to 44 in docs/layout-audit-2026-06;
        chips ~32px, inline links, and the admin desktop tool are exempt
        and not checked).

   Exits non-zero on any failure so it can gate CI / pre-push. Perf
   (Lighthouse) stays a separate, slower command: npm run lighthouse.       */

const { spawn } = require('child_process');
const puppeteer = require('puppeteer');

const PORT = 5179;
const BASE = `http://127.0.0.1:${PORT}`;
const WIDTHS = [390, 768, 1440];

/* Public, touch-facing pages. Admin is a desktop mouse tool (density-
   appropriate, exempt from the 44px floor) so it's intentionally omitted. */
const PAGES = [
  '/index.html',
  '/discover.html?time=thisweek',
  '/discover.html?type=places',
  '/saved.html',
  '/profile.html',
  '/about.html',
  '/curator.html?handle=%40sigmundtells',
  '/404.html',
];

/* Controls we committed to a 44px hit area (docs/layout-audit-2026-06).
   Checked only when present + visible. NOT listed (correctly exempt):
   chips (.chip/.mood-chip/.venue-mood ~32px, Material chip spec) and inline
   text links (.list-row__map, .colophon a, .handle — WCAG inline exception). */
const TAP_SELECTORS = [
  '.btn-primary', '.btn-secondary', '.btn-going', '.btn-save',
  '.seg-tab', '.discover-scope__btn', '.nav__item',
  '.city-selector', '.auth-btn', '.topbar__about', '.discover-view-fab',
  '.venue-social__link', '.auth-panel__submit', '.auth-panel__close',
  '.profile-toggle', '.topbar__brand', '.surprise-btn',
  '.map-zoom-btn', '.map-locate-fab',
];
const TAP_FLOOR = 43; /* 44 minus 1px sub-pixel tolerance */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = spawn('npx', ['http-server', '.', '-p', String(PORT), '-c-1', '--silent'],
    { stdio: 'ignore' });
  await sleep(2000);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--ignore-certificate-errors'],
    ignoreHTTPSErrors: true,
  });

  const failures = [];

  for (const url of PAGES) {
    for (const width of WIDTHS) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });

      const consoleMsgs = [];
      page.on('console',   (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
      page.on('pageerror', (e) => consoleMsgs.push(`[PAGEERROR] ${e.message}`));

      await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.evaluate(() => localStorage.setItem('wa:city', 'tallinn'));
      await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle2', timeout: 25000 });
      await sleep(1500);

      const where = `${url.split('?')[0]} @${width}`;

      /* 1. overflow */
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) {
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        failures.push(`OVERFLOW  ${where}  (scrollWidth ${sw} > ${width})`);
      }

      /* 2. errors (filtered, same as smoke.js) */
      const errs = consoleMsgs.filter((m) =>
        (m.startsWith('[error]') || m.startsWith('[PAGEERROR]')) &&
        !m.includes('ERR_CERT_AUTHORITY_INVALID') &&
        !/status of (401|403)/.test(m) &&
        !m.includes('Failed to fetch'));
      for (const e of errs.slice(0, 2)) failures.push(`ERROR     ${where}  ${e}`);

      /* 3. tap-target floor */
      const small = await page.evaluate((sels, floor) => {
        const out = [];
        for (const sel of sels) {
          for (const el of document.querySelectorAll(sel)) {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const visible = r.width > 0 && r.height > 0 &&
              cs.display !== 'none' && cs.visibility !== 'hidden';
            if (visible && r.height < floor) {
              out.push(`${sel} (${Math.round(r.height)}px)`);
            }
          }
        }
        return [...new Set(out)];
      }, TAP_SELECTORS, TAP_FLOOR);
      for (const s of small) failures.push(`TAPTARGET ${where}  ${s}`);

      await page.close();
    }
  }

  await browser.close();
  server.kill();

  const checks = PAGES.length * WIDTHS.length;
  if (failures.length === 0) {
    console.log(`OK — ${checks} page/width checks passed (overflow, errors, 44px tap targets)`);
    process.exit(0);
  } else {
    console.log(`FAIL — ${failures.length} issue(s) across ${checks} checks:\n`);
    for (const f of failures) console.log('  ' + f);
    process.exit(1);
  }
})().catch((err) => { console.error(err); process.exit(1); });
