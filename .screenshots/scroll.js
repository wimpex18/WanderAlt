/* ============================================================
   WanderAlt — below-the-fold + map-default audit (npm run scroll)
   ------------------------------------------------------------
   Complements smoke.js (which shoots the top viewport of each
   page). This one captures what smoke can't see:

     · a FULL-PAGE screenshot of every public page at 1440px
       (scroll-desktop-<tag>-full.png) — list tails, colophons,
       digest blocks, "more from" sections
     · a viewport shot scrolled to the very bottom
       (scroll-desktop-<tag>-bottom.png) — sticky-chrome and
       FAB behaviour at end of content
     · the map's DEFAULT framing on Discover (no filters): zoom,
       center per city, printed as JSON + a pane screenshot —
       catches water-dominated fit and missing CITY_BOUNDS
       entries (a city absent from map-tiles.js silently frames
       Tallinn)

   Server must be running at :5173 (npm start). Findings from the
   first run: ROADMAP.md § F-9…F-13.
   ============================================================ */

const puppeteer = require('puppeteer');

const BASE = 'http://localhost:5173';
const OUT  = __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  ['briefing',        '/index.html'],
  ['discover-events', '/discover.html?time=thisweek'],
  ['discover-places', '/discover.html?type=places'],
  ['saved',           '/saved.html'],
  ['about',           '/about.html'],
  ['curator',         '/curator.html?handle=%40sigmundtells'],
];

/* Cities whose Discover map default framing gets probed. Vilnius is
   included on purpose: it has no CITY_BOUNDS entry yet (F-9) and
   must stop silently framing Tallinn. */
const MAP_CITIES = ['tallinn', 'riga', 'helsinki', 'vilnius'];

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--ignore-certificate-errors'],
  });

  const newPage = async (city) => {
    const p = await browser.newPage();
    await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await p.evaluate((c) => localStorage.setItem('wa:city', c), city);
    return p;
  };

  /* venue page needs a real id — take the first catalog entry */
  const seed = await newPage('tallinn');
  await sleep(1200);
  const pickId = await seed.evaluate(() =>
    (window.WA && WA.catalog && WA.catalog[0]) ? WA.catalog[0].id : null);
  await seed.close();
  const pages = pickId
    ? [...PAGES, ['venue', `/venue.html?id=${encodeURIComponent(pickId)}`]]
    : PAGES;

  for (const [tag, url] of pages) {
    const p = await newPage('tallinn');
    await p.goto(`${BASE}${url}`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await sleep(2000);
    await p.screenshot({ path: `${OUT}/scroll-desktop-${tag}-full.png`, fullPage: true });
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await sleep(900);
    await p.screenshot({ path: `${OUT}/scroll-desktop-${tag}-bottom.png` });
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    console.log(`${tag}: scrollHeight=${h}`);
    await p.close();
  }

  /* ── Map default framing per city (Discover, no filters) ── */
  for (const city of MAP_CITIES) {
    const p = await newPage(city);
    await p.goto(`${BASE}/discover.html`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await sleep(4000);
    const state = await p.evaluate(() => {
      try {
        if (!(window.WA && WA.MapTiles && WA.MapTiles.isReady())) {
          return { ready: false, maplibre: typeof window.maplibregl };
        }
        const m = WA.MapTiles.getMap();
        const c = m.getCenter();
        return { ready: true, zoom: +m.getZoom().toFixed(2),
                 lng: +c.lng.toFixed(4), lat: +c.lat.toFixed(4) };
      } catch (e) { return { err: String(e) }; }
    });
    console.log(`map default (${city}):`, JSON.stringify(state));
    const pane = await p.$('#discover-map, .discover-map, #map');
    await (pane || p).screenshot({ path: `${OUT}/scroll-map-default-${city}.png` });
    await p.close();
  }

  await browser.close();
  console.log('\nDone — review scroll-desktop-*-{full,bottom}.png + scroll-map-default-*.png');
})().catch((err) => { console.error(err); process.exit(1); });
