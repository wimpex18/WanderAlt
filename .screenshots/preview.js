/* ============================================================
   preview.js — screenshot a LIVE deploy (Cloudflare Pages preview
   or production) instead of a local server.
   ------------------------------------------------------------
   Why this exists: the local dev server / sandbox can't always
   fetch the third-party assets that ship in production — most
   notably the Google Places CDN photos in `.thumb__img`
   (they render as empty boxes locally). The Cloudflare branch
   preview URL that the Pages bot posts on every PR DOES serve the
   real thing, so this script points a headless Chrome at it and
   captures the true rendering (real photos + petrol duotone).

   Two gotchas this script handles (both cost an afternoon to find):
     1. Chrome defaults to QUIC / HTTP3 for *.pages.dev and the
        sandbox blocks UDP, so navigation fails with
        ERR_QUIC_PROTOCOL_ERROR. --disable-quic forces TCP.
     2. Cloudflare advertises Encrypted Client Hello; Chrome then
        rejects the cert with ERR_ECH_FALLBACK_CERTIFICATE_INVALID.
        Disabling the ECH / DNS-HTTPS-record features fixes it.
   curl works without these because it doesn't speak QUIC/ECH by
   default — but Chrome does, hence the flags.

   Usage:
     node .screenshots/preview.js <base-url> [city] [page ...]

   Examples:
     # whole default set on a branch preview
     node .screenshots/preview.js https://claude-xyz.wanderalt.pages.dev

     # one page, one city
     node .screenshots/preview.js https://claude-xyz.wanderalt.pages.dev vilnius index.html

   Output: .screenshots/live-<page>-<city>-{fold,full}.png
   ============================================================ */
const puppeteer = require('puppeteer');
const path = require('path');

const BASE  = (process.argv[2] || '').replace(/\/+$/, '');
const CITY  = process.argv[3] || 'tallinn';
const PAGES = process.argv.slice(4);
const OUT   = __dirname;

if (!BASE) {
  console.error('Usage: node .screenshots/preview.js <base-url> [city] [page ...]');
  console.error('  <base-url>  e.g. https://claude-xyz.wanderalt.pages.dev (the Cloudflare branch preview)');
  process.exit(1);
}

/* Default page set — the editorial surfaces worth a visual check.
   Discover is loaded with a filter active so the results list (and its
   real photos) render rather than the empty-until-filtered gate. */
const DEFAULT_PAGES = [
  'index.html',
  'discover.html?time=thisweek',
  'saved.html',
];
const targets = PAGES.length ? PAGES : DEFAULT_PAGES;

/* The flags that make a live *.pages.dev reachable from a headless
   Chrome in this environment (see header comment). */
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-quic',
  '--ignore-certificate-errors',
  '--disable-features=EncryptedClientHello,UseDnsHttpsSvcb,UseDnsHttpsSvcbAlpn',
];

const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: LAUNCH_ARGS });
  let failures = 0;

  for (const target of targets) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument((c) => localStorage.setItem('wa:city', c), CITY);

    const url = `${BASE}/${target}`;
    const tag = `${slug(target)}-${CITY}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      /* Give live data (supabase.js) + image CDNs a beat to paint. */
      await new Promise((r) => setTimeout(r, 4000));

      const meta = await page.evaluate(() => {
        /* Venue photos are now <img class="thumb__img"> over an initials tile
           (June 2026); a broken Google URL is removed by ui-helpers.js, so a
           surviving img with naturalWidth > 0 means a photo actually painted. */
        const imgs   = [...document.querySelectorAll('.thumb__img')];
        const loaded = imgs.filter((el) => el.complete && el.naturalWidth > 0).length;
        return { thumbs: imgs.length, withBg: loaded };
      });

      await page.screenshot({ path: path.join(OUT, `live-${tag}-fold.png`) });
      await page.screenshot({ path: path.join(OUT, `live-${tag}-full.png`), fullPage: true });
      console.log(`✓ ${target} → live-${tag}-{fold,full}.png  (photos: ${meta.withBg}/${meta.thumbs})`);
    } catch (e) {
      failures++;
      console.error(`✗ ${target}: ${e.message}`);
    }
    await page.close();
  }

  await browser.close();
  if (failures) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
