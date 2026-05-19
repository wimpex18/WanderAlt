/* Smoke-test screenshots for WanderAlt.
   Covers: brand integration (logo, favicon ladder), profile rendering
   with a dummy session, regression baseline (briefing / discover list +
   map / saved / venue / curator), multi-city Tallinn ↔ Riga switching.

   Run via:  node .screenshots/smoke.js  (or: npm run smoke)
   Server must be running at http://localhost:5173.                     */
const puppeteer = require('puppeteer');
const path = require('path');

const BASE = 'http://localhost:5173';
const OUT  = __dirname;

/* A dummy JWT-shaped session that auth.js will happily restore from
   localStorage. The token's `exp` is far future; `iat` is set to a
   week ago so the "joined" suffix renders something readable. */
const dummyJWT = (() => {
  const b64url = (o) => Buffer.from(JSON.stringify(o))
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header  = b64url({ alg: 'none', typ: 'JWT' });
  const now     = Math.floor(Date.now() / 1000);
  const payload = b64url({
    sub:   'smoke-test-user-id',
    email: 'smoke@wanderalt.test',
    iat:   now - 7 * 86400,
    exp:   now + 30 * 86400,
  });
  return `${header}.${payload}.smoke`;
})();

const sessionJson = JSON.stringify({
  access_token: dummyJWT,
  user_id:      'smoke-test-user-id',
  email:        'smoke@wanderalt.test',
  expires_at:   Math.floor(Date.now() / 1000) + 30 * 86400,
});

const VIEWS = [
  { tag: 'mobile',  width: 390,  height: 844,  isMobile: true,  dsf: 2 },
  { tag: 'desktop', width: 1280, height: 900,  isMobile: false, dsf: 1 },
  { tag: 'wide',    width: 1440, height: 900,  isMobile: false, dsf: 1 },
];

/* Each page:
   - name       — output filename suffix
   - url        — relative to BASE
   - waitMs     — extra wait after networkidle0 for async catalog hydration
   - signedIn   — if true, inject the dummy session before navigating
   - city       — 'tallinn' (default) or 'riga' — written to wa:city LS
                  key on the origin before navigating to the target page
   - setup(page)— optional async setup run before screenshotting           */
const PAGES = [
  /* Default Tallinn coverage. */
  { name: 'briefing',         url: '/index.html',                  waitMs: 1800 },
  { name: 'discover-list',    url: '/discover.html',               waitMs: 2200 },
  { name: 'discover-tonight', url: '/discover.html',               waitMs: 2200,
    setup: async (page) => {
      const pill = await page.$('[data-pill="tonight"]');
      if (pill) { await pill.click(); await new Promise(r => setTimeout(r, 800)); }
    } },
  { name: 'saved',            url: '/saved.html',                  waitMs: 1200 },
  { name: 'profile',          url: '/profile.html',                waitMs: 1500, signedIn: true },

  /* The curator page is most-likely-to-break after the May 2026 handle
     normalisation (sigmundtells -> @sigmundtells). Test both an @-handle
     URL and the legacy bare-handle URL to confirm back-compat resolves. */
  { name: 'curator-sigmund',  url: '/curator.html?handle=%40sigmundtells', waitMs: 1500 },
  { name: 'curator-legacy',   url: '/curator.html?handle=sigmundtells',    waitMs: 1500 },

  /* Venue detail — verify a known Tallinn pick id renders. The exact id
     in the static catalog is sigmundtells-2516. */
  { name: 'venue-detail',     url: '/venue.html?id=sigmundtells-2516', waitMs: 1500 },

  /* Riga city switch — confirms ingest output and multi-city catalog. */
  { name: 'riga-briefing',    url: '/index.html',     waitMs: 1800, city: 'riga' },
  { name: 'riga-discover',    url: '/discover.html',  waitMs: 2200, city: 'riga' },

  /* Banner click — clicking .city-banner should open the city
     dropdown (city.js wires the banner click to btn.click()). The
     screenshot captures the dropdown open over the briefing. */
  { name: 'banner-dropdown',  url: '/index.html',     waitMs: 1500,
    setup: async (page) => {
      const banner = await page.$('.city-banner');
      if (banner) { await banner.click(); await new Promise(r => setTimeout(r, 400)); }
      /* Sanity check: assert the dropdown is now in the DOM. */
      const ok = await page.$('.city-dropdown');
      if (!ok) throw new Error('banner click did NOT open the dropdown');
    } },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    /* --ignore-certificate-errors lets MapLibre tile.openfreemap.org +
       fonts.googleapis.com etc. load through the sandbox's broken
       cert chain, so the smoke screenshots show actual map content
       instead of an empty grey canvas. The flag only affects this
       headless run, never the user's real browser. */
    args: ['--no-sandbox', '--disable-setuid-sandbox',
           '--disable-dev-shm-usage', '--ignore-certificate-errors'],
    ignoreHTTPSErrors: true,
  });

  let totalErrors = 0;

  for (const v of VIEWS) {
    for (const p of PAGES) {
      const page = await browser.newPage();
      await page.setViewport({
        width: v.width, height: v.height,
        deviceScaleFactor: v.dsf,
        isMobile: v.isMobile, hasTouch: v.isMobile,
      });

      const consoleMsgs = [];
      page.on('console',   msg => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
      page.on('pageerror', err => consoleMsgs.push(`[PAGEERROR] ${err.message}`));

      /* If we need any localStorage state (session, city), the writes must
         happen on the same origin we'll navigate to next. Hit a cheap page
         first to set up storage, then go to the target. */
      const needsLS = p.signedIn || p.city;
      if (needsLS) {
        await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        if (p.signedIn) {
          await page.evaluate(s => localStorage.setItem('wanderalt:session:v1', s), sessionJson);
        }
        if (p.city) {
          await page.evaluate(c => localStorage.setItem('wa:city', c), p.city);
        }
      }

      await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle0', timeout: 15000 });
      await new Promise(r => setTimeout(r, p.waitMs));
      if (p.setup) await p.setup(page);

      const file = path.join(OUT, `smoke-${v.tag}-${p.name}.png`);
      await page.screenshot({ path: file, fullPage: false });

      /* Filter known noise:
         - sandbox cert blocks (browser refuses Supabase / Google Fonts)
         - 401s from the dummy JWT we inject on signed-in pages
           (real Supabase auth rightly rejects it; not a regression).  */
      const errs = consoleMsgs.filter(m =>
        (m.startsWith('[error]') || m.startsWith('[PAGEERROR]')) &&
        !m.includes('ERR_CERT_AUTHORITY_INVALID') &&
        !/status of (401|403)/.test(m),
      );
      totalErrors += errs.length;
      console.log(`${v.tag}/${p.name} → ${path.relative(process.cwd(), file)}` +
        (errs.length ? `  (${errs.length} real errors)` : ''));
      for (const e of errs.slice(0, 3)) console.log('   ', e);

      await page.close();
    }
  }

  await browser.close();
  console.log(`\n${totalErrors === 0 ? 'OK — no real console errors' : `FAIL — ${totalErrors} real console errors`}`);
  process.exit(totalErrors === 0 ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
