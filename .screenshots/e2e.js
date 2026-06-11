/* ============================================================
   WanderAlt — functional / E2E sweep (npm run e2e)
   ------------------------------------------------------------
   Complements `npm run verify` (which checks overflow / console
   errors / tap targets on the param-less public pages). This one
   exercises BEHAVIOUR and the param pages verify can't reach:

     · every public page — incl. curator / venue / place (real IDs
       derived from the live catalog) — loads clean + no overflow
       at 390 / 768 / 1440
     · photo-forward cards render on all five pick-list surfaces
       (Discover events · Saved Going+Reading · Curator · venue
       "more from" · place "Events here")
     · the on-device taste nudge cue shows on Discover / Saved /
       Curator when a taste profile exists, and the cue deep-links
       back to the Today taste check (which re-opens from the hash)
     · the card→hero View-Transition tags the clicked photo
     · bookmark toggles persist to WA.Bookmarks

   Self-boots a static server, exits non-zero on any failure.
   Like verify.js it tolerates the sandbox's blocked external
   resources (photo CDNs / tiles / Supabase) — those are filtered
   from the console-error check.
   ============================================================ */

const { spawn } = require('child_process');
const puppeteer = require('puppeteer');

const PORT = 5189;
const BASE = `http://127.0.0.1:${PORT}`;
const WIDTHS = [390, 768, 1440];

const TAP_SELECTORS = [
  '.btn-primary', '.btn-secondary', '.btn-going', '.btn-save',
  '.city-selector', '.nav__item', '.bookmark', '.topbar__brand',
];
const TAP_FLOOR = 43; /* 44 minus 1px sub-pixel tolerance */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Wait for the self-booted server to actually accept connections —
   a fixed sleep raced npx's cold-cache startup on CI (the 2026-06-10
   ERR_CONNECTION_REFUSED failure). Polls up to ~30 s. */
const waitForServer = async (url, timeoutMs = 30_000) => {
  const http = require('http');
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => { res.resume(); resolve(true); });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
    if (ok) return;
    await sleep(300);
  }
  throw new Error(`server at ${url} did not come up within ${timeoutMs}ms`);
};

const isNoise = (t) =>
  /ERR_CERT|googleusercontent|net::ERR|favicon|maplibre|unpkg|openfreemap|tiles|status of (401|403)|Failed to fetch/i.test(t);

(async () => {
  const server = spawn('npx', ['http-server', '.', '-p', String(PORT), '-c-1', '--silent'],
    { stdio: 'ignore' });
  await waitForServer(`${BASE}/index.html`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--ignore-certificate-errors'],
    ignoreHTTPSErrors: true,
  });

  const failures = [];
  const fail = (m) => failures.push(m);
  let checks = 0;
  const did = () => { checks++; };

  const page = await browser.newPage();

  /* NOTE: Supabase is deliberately left untouched — the app always uses it for
     live data, with catalog.js as the offline fallback. This suite is robust to
     EITHER source: it derives entity IDs after wa:catalog-ready and, if a detail
     page renders against a different catalog snapshot than the one an ID came
     from (possible when the sandbox's Supabase is intermittently reachable), it
     re-derives a valid ID from whatever catalog actually loaded on that page and
     retries once. In a stable-network CI both sources are consistent and the
     retry never fires. */

  let errs = [];
  page.on('console',   (m) => { if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => { if (!isNoise(e.message)) errs.push('PAGEERROR: ' + e.message); });

  /* Seed a taste profile + the Tallinn city before every document so the
     taste surfaces are exercised deterministically. */
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('wa:city', 'tallinn');
      localStorage.setItem('wa-taste-prefs', JSON.stringify({ energy: 'quiet', company: 'solo', money: 'free' }));
      localStorage.setItem('wa-taste-onboarded', '1');
    } catch (e) { /* storage blocked */ }
    /* Detail pages render on wa:catalog-ready (fired by supabase.js after its
       live fetch resolves/times out). Record it so the test can wait on it
       deterministically instead of racing a fixed sleep. */
    window.__waCatReady = false;
    document.addEventListener('wa:catalog-ready', () => { window.__waCatReady = true; });
  });

  const nav = async (url) => {
    errs = [];
    try {
      await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle2', timeout: 25000 });
    } catch (e) {
      /* net::ERR_ABORTED is a known headless-Chrome navigation flake
         (observed pre-existing, ~1 in 10 full runs; e2e gates CI, so a
         single transient abort must not fail the build). One retry. */
      if (!String(e).includes('ERR_ABORTED')) throw e;
      await sleep(500);
      await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle2', timeout: 25000 });
    }
    await sleep(800);
  };

  /* Detail pages (curator/venue/place) render on `wa:catalog-ready`, which
     supabase.js fires only after its live fetch resolves/times out (~2s in
     the sandbox) — later than networkidle2. Wait for the actual content
     selector so these checks aren't racing the async render. */
  const navFor = async (url, selector) => {
    await nav(url);
    /* Wait for the catalog-ready render, then for the specific content. */
    await page.waitForFunction(() => window.__waCatReady === true, { timeout: 15000 }).catch(() => {});
    await page.waitForSelector(selector, { timeout: 8000 }).catch(() => {});
  };

  /* Re-derive a valid URL from whatever catalog actually loaded on the current
     page — used to self-heal if a detail page rendered against a different
     catalog snapshot than the ID came from (sandbox intermittent Supabase). */
  const REDERIVE = {
    curator: () => {
      const cat = (window.WA && (window.WA._catalogAll || window.WA.catalog)) || [];
      const byH = {}; cat.forEach((e) => { (byH[e.handle] = byH[e.handle] || []).push(e); });
      const h = Object.keys(byH).find((x) => byH[x].length > 1) || (cat[0] && cat[0].handle);
      return h ? '/curator.html?handle=' + encodeURIComponent(h) : null;
    },
    venue: () => {
      const cat = (window.WA && (window.WA._catalogAll || window.WA.catalog)) || [];
      const byH = {}; cat.forEach((e) => { (byH[e.handle] = byH[e.handle] || []).push(e); });
      const h = Object.keys(byH).find((x) => byH[x].length > 1);
      const id = h ? byH[h][0].id : (cat[0] && cat[0].id);
      return id ? '/venue.html?id=' + encodeURIComponent(id) : null;
    },
    place: () => {
      const cat = (window.WA && (window.WA._catalogAll || window.WA.catalog)) || [];
      const ven = (window.WA && (window.WA._venuesAll || window.WA.venues)) || [];
      const names = new Set(cat.map((p) => (p.venue || '').trim().toLowerCase()));
      const v = ven.find((x) => x.name && names.has(x.name.trim().toLowerCase()));
      return v ? '/place.html?id=' + encodeURIComponent(v.id) : null;
    },
  };

  /* nav to url; if `selector` never appears, re-derive a valid url from the
     loaded catalog (REDERIVE[kind]) and retry once. kind=null skips the retry
     (used for list pages that always render regardless of data source). */
  const navResilient = async (url, selector, kind) => {
    await navFor(url, selector);
    if (await page.$(selector)) return;
    if (!kind || !REDERIVE[kind]) return;
    const alt = await page.evaluate(REDERIVE[kind]);
    if (alt) await navFor(alt, selector);
  };

  /* Derive real IDs from the FINAL catalog. The sandbox's Supabase fetch may
     resolve to live data or time out to the static catalog; deriving before
     wa:catalog-ready risks picking an ID from one state while a detail page
     renders against the other. Wait for the ready signal first. */
  await nav('/discover.html');
  await page.waitForFunction(() => window.__waCatReady === true, { timeout: 15000 }).catch(() => {});
  await sleep(300);
  const ids = await page.evaluate(() => {
    const cat = (window.WA && (window.WA._catalogAll || window.WA.catalog)) || [];
    const ven = (window.WA && (window.WA._venuesAll || window.WA.venues)) || [];
    const byH = {}; cat.forEach((e) => { (byH[e.handle] = byH[e.handle] || []).push(e); });
    const multi = Object.keys(byH).find((h) => byH[h].length > 1);
    const names = new Set(cat.map((p) => (p.venue || '').trim().toLowerCase()));
    const venWithPicks = ven.find((v) => v.name && names.has(v.name.trim().toLowerCase()));
    return {
      /* A pick from the multi-pick curator, so venue.html's "more from
         curator" section (conditional on ≥1 sibling) always renders. */
      pick: (multi && byH[multi][0].id) || (cat[0] && cat[0].id),
      handle: multi,
      venue: venWithPicks && venWithPicks.id,
      undated: cat.filter((e) => !e.day).slice(0, 3).map((e) => e.id),
    };
  });
  if (!ids.pick || !ids.handle || !ids.venue) {
    fail(`SETUP could not derive IDs from catalog: ${JSON.stringify(ids)}`);
  }

  /* 1 · Every public page loads clean + no horizontal overflow @ 3 widths. */
  const PAGES = [
    '/index.html', '/discover.html', '/discover.html?type=places',
    '/saved.html', '/profile.html', '/about.html',
    `/venue.html?id=${encodeURIComponent(ids.pick)}`,
    `/curator.html?handle=${encodeURIComponent(ids.handle)}`,
    `/place.html?id=${encodeURIComponent(ids.venue)}`,
  ];
  for (const w of WIDTHS) {
    await page.setViewport({ width: w, height: 900 });
    for (const u of PAGES) {
      await nav(u);
      did();
      if (errs.length) fail(`CONSOLE ${u} @${w} :: ${errs.slice(0, 2).join(' | ')}`);
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      did();
      if (ov > 1) fail(`OVERFLOW ${u} @${w} :: ${ov}px`);
    }
  }
  await page.setViewport({ width: 390, height: 900 });

  /* 2 · Photo cards on all five pick-list surfaces. */
  const cardCheck = async (url, sel, label, kind) => {
    await navResilient(url, sel, kind);
    const r = await page.evaluate((s) => {
      const ol = document.querySelector(s);
      if (!ol) return { found: false };
      const rows = [...ol.querySelectorAll('.list-row')];
      return {
        found: true, rows: rows.length,
        cards: rows.filter((x) => x.classList.contains('list-row--card')).length,
        thumbs: rows.filter((x) => x.querySelector('.list-row__media .thumb')).length,
      };
    }, sel);
    did();
    if (!r.found || r.rows === 0 || r.cards !== r.rows || r.thumbs !== r.rows) {
      fail(`CARDS ${label} :: ${JSON.stringify(r)}`);
    }
  };
  await cardCheck('/discover.html?type=events&time=thisweek', '#discover-results', 'Discover events', null);
  await cardCheck(`/curator.html?handle=${encodeURIComponent(ids.handle)}`, '#curator-picks-list', 'Curator picks', 'curator');
  await cardCheck(`/venue.html?id=${encodeURIComponent(ids.pick)}`, 'section[aria-labelledby=more-label] .list-rows', 'Venue more', 'venue');
  await cardCheck(`/place.html?id=${encodeURIComponent(ids.venue)}`, 'section[aria-labelledby=here-label] .list-rows', 'Place events', 'place');

  /* 3 · Taste cue (prefs seeded) links back to the Today taste check. */
  const cueCheck = async (url, sel, label, kind) => {
    await navResilient(url, `${sel} a.taste-cue`, kind);
    const href = await page.evaluate((s) => {
      const el = document.querySelector(s);
      const a = el && el.querySelector('a.taste-cue');
      return a && a.getAttribute('href');
    }, sel);
    did();
    if (href !== 'index.html#taste-onboarding') fail(`TASTE cue ${label} :: ${href}`);
  };
  await cueCheck('/discover.html?type=events&time=thisweek', '#discover-results-count', 'Discover', null);
  await cueCheck(`/curator.html?handle=${encodeURIComponent(ids.handle)}`, '#picks-label', 'Curator', 'curator');

  /* Saved Reading cue — seed undated bookmarks first. */
  await nav('/saved.html');
  await page.evaluate((u) => { if (window.WA && window.WA.Bookmarks) u.forEach((id) => window.WA.Bookmarks.set(id, true)); }, ids.undated);
  await cueCheck('/saved.html', '.seg-note--reading', 'Saved Reading', null);

  /* 4 · Taste deep-link re-opens the Today banner for an onboarded reader. */
  await nav('/index.html#taste-onboarding');
  const reopened = await page.evaluate(() => {
    const w = document.getElementById('taste-onboarding');
    return !!(w && getComputedStyle(w).display !== 'none' && !w.hidden);
  });
  did();
  if (!reopened) fail('TASTE reopen Today :: banner not shown from hash');

  /* 5 · Card→hero View-Transition tags the clicked photo. */
  await navFor('/discover.html?type=events&time=thisweek', '#discover-results .list-row--card');
  const vtName = await page.evaluate(() => {
    const card = document.querySelector('#discover-results .list-row--card');
    const thumb = card && card.querySelector('.thumb');
    const a = card && card.querySelector('a[href*="venue.html"]');
    if (!thumb || !a) return 'no-card';
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return thumb.style.viewTransitionName || '(empty)';
  });
  did();
  if (vtName !== 'venue-hero') fail(`VIEWTRANS tag :: ${vtName}`);

  /* 6 · Bookmark toggle persists. */
  await navResilient(`/venue.html?id=${encodeURIComponent(ids.pick)}`, '.bookmark__check', 'venue');
  const bm = await page.evaluate(() => {
    const cb = document.querySelector('.bookmark__check');
    if (!cb) return 'no-checkbox';
    const before = cb.checked; cb.click(); const after = cb.checked;
    const stored = !!(window.WA && window.WA.Bookmarks && window.WA.Bookmarks.get()[cb.dataset.id]);
    return (before !== after && stored === after) ? 'ok' : `before=${before} after=${after} stored=${stored}`;
  });
  did();
  if (bm !== 'ok') fail(`BOOKMARK toggle :: ${bm}`);

  /* 7 · Tap targets ≥44px on the param pages verify skips (incl. the curator
     card bookmark, which verify's selector list doesn't cover). Use the
     resilient nav so the fully-rendered page is what's measured. */
  const tapPages = [
    [`/curator.html?handle=${encodeURIComponent(ids.handle)}`, '#curator-picks-list', 'curator'],
    [`/venue.html?id=${encodeURIComponent(ids.pick)}`, '.bookmark__check', 'venue'],
    [`/place.html?id=${encodeURIComponent(ids.venue)}`, 'section[aria-labelledby=here-label] .list-rows', 'place'],
  ];
  for (const [u, sel, kind] of tapPages) {
    await navResilient(u, sel, kind);
    const small = await page.evaluate((sels, floor) => {
      const out = [];
      document.querySelectorAll(sels.join(',')).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.height < floor || r.width < floor) out.push(`${(el.className || '').toString().split(' ')[0]}:${Math.round(r.width)}x${Math.round(r.height)}`);
      });
      return out;
    }, TAP_SELECTORS, TAP_FLOOR);
    did();
    if (small.length) fail(`TAP ${u} :: ${small.slice(0, 4).join(', ')}`);
  }

  await browser.close();
  server.kill();

  if (failures.length) {
    console.error(`\nE2E FAILED — ${failures.length} of ${checks} checks:`);
    failures.forEach((f) => console.error('  ✗ ' + f));
    process.exit(1);
  }
  console.log(`OK — ${checks} functional/E2E checks passed (pages · cards · taste · view-transition · bookmark · tap targets)`);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
