/* Smoke-test screenshots for WanderAlt — covers the brand integration
   (new logo proportions, favicon ladder), profile page rendering with a
   dummy session, plus the regression baseline (briefing / discover list +
   map / saved / venue).

   Run via:  node .screenshots/smoke.js
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
];

const PAGES = [
  { name: 'briefing',         url: '/index.html',     waitMs: 1800, signedIn: false },
  { name: 'discover-list',    url: '/discover.html',  waitMs: 2200, signedIn: false },
  { name: 'discover-tonight', url: '/discover.html',  waitMs: 2200, signedIn: false,
    setup: async (page) => {
      const pill = await page.$('[data-pill="tonight"]');
      if (pill) { await pill.click(); await new Promise(r => setTimeout(r, 800)); }
    } },
  { name: 'saved',            url: '/saved.html',     waitMs: 1200, signedIn: false },
  { name: 'profile',          url: '/profile.html',   waitMs: 1500, signedIn: true  },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  let errors = 0;

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

      /* Inject the dummy session before profile loads so the auth gate
         passes. Must happen on the same origin we'll navigate to. */
      if (p.signedIn) {
        await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.evaluate(s => localStorage.setItem('wanderalt:session:v1', s), sessionJson);
      }

      await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle0', timeout: 15000 });
      await new Promise(r => setTimeout(r, p.waitMs));
      if (p.setup) await p.setup(page);

      const file = path.join(OUT, `smoke-${v.tag}-${p.name}.png`);
      await page.screenshot({ path: file, fullPage: false });

      /* Console error summary for the page. */
      const errs = consoleMsgs.filter(m => m.startsWith('[error]') || m.startsWith('[PAGEERROR]'));
      errors += errs.length;
      console.log(`${v.tag}/${p.name} → ${path.relative(process.cwd(), file)}` +
        (errs.length ? `  (${errs.length} console errors)` : ''));
      for (const e of errs.slice(0, 3)) console.log('   ', e);

      await page.close();
    }
  }

  await browser.close();
  console.log(`\n${errors === 0 ? 'OK — no console errors' : `WARN — ${errors} console errors across all pages`}`);
})().catch(err => { console.error(err); process.exit(1); });
