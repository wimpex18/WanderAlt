/* Visual review + search-function smoke test for WanderAlt.
   Captures: Briefing, Search (idle + AI match), Map (idle + search + pin),
   Venue detail, Profile.
   Usage: node .screenshots/review.js                               */
const puppeteer = require('puppeteer');
const path = require('path');
const fs   = require('fs');

const BASE = process.env.WA_URL || 'http://localhost:5173';
const OUT  = __dirname;
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

let errors = [];

async function shot(page, name) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log('✓', name);
  return p;
}

async function waitCatalog(page) {
  await page.waitForFunction(() => window.WA?.catalog?.length > 0, { timeout: 12000 });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(`[PAGEERROR] ${e.message}`));
  page.on('console',   m => {
    if (m.type() === 'error') errors.push(`[CONSOLE ERR] ${m.text()}`);
  });
  await page.setViewport(MOBILE);

  /* ── 1. Briefing (index.html) ─────────────────────────────── */
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await waitCatalog(page).catch(() => errors.push('briefing: catalog timeout'));
  await new Promise(r => setTimeout(r, 1500));
  await shot(page, '01-briefing-idle');

  /* Check taste onboarding banner */
  const onboardingVisible = await page.$eval('#taste-onboarding', el =>
    !el.hidden && el.offsetHeight > 0
  ).catch(() => false);
  console.log('  taste-onboarding visible:', onboardingVisible);

  /* ── 2. Search — idle ─────────────────────────────────────── */
  await page.goto(`${BASE}/search.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await waitCatalog(page).catch(() => errors.push('search: catalog timeout'));
  await new Promise(r => setTimeout(r, 800));
  await shot(page, '02-search-idle');

  /* Check curated-only toggle and vote bar elements */
  const curatedToggle = await page.$('#curated-only') !== null;
  console.log('  curated-only toggle present:', curatedToggle);

  /* ── 3. Search — keyword query ────────────────────────────── */
  await page.focus('#q');
  await page.type('#q', 'jazz bar', { delay: 40 });
  await new Promise(r => setTimeout(r, 900));
  await shot(page, '03-search-keyword');

  const resultCount = await page.$$eval('.list-row', els => els.length).catch(() => 0);
  console.log('  keyword results rendered:', resultCount);

  /* ── 4. Search — AI match (Groq/Gemini) ──────────────────── */
  await page.goto(`${BASE}/search.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await waitCatalog(page).catch(() => errors.push('search match: catalog timeout'));
  await new Promise(r => setTimeout(r, 500));

  /* Switch to match mode */
  const matchBtn = await page.$('#match-toggle');
  if (matchBtn) await matchBtn.click();
  await new Promise(r => setTimeout(r, 300));
  await page.focus('#q');
  await page.type('#q', 'somewhere quiet for a drink with good music', { delay: 30 });
  await shot(page, '04-search-match-typing');

  /* Submit and wait for AI response */
  await page.keyboard.press('Enter');
  console.log('  AI match fired — waiting up to 20s…');
  const matchAppeared = await page.waitForFunction(
    () => document.querySelector('.match-hero, .search-hero, .list-row') !== null
       && !document.querySelector('.search-loading, .match-loading'),
    { timeout: 20000 }
  ).then(() => true).catch(() => false);
  await new Promise(r => setTimeout(r, 600));
  await shot(page, '05-search-match-result');

  const heroCard = await page.$('.match-hero, .search-hero');
  console.log('  AI hero card rendered:', !!heroCard);

  if (!matchAppeared) {
    errors.push('AI match: result did not appear within 20s');
    /* Capture what we got anyway */
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
    console.log('  body snippet:', bodyText.replace(/\n+/g,' ').slice(0, 200));
  }

  /* ── 5. Map — idle ────────────────────────────────────────── */
  await page.goto(`${BASE}/map.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await waitCatalog(page).catch(() => errors.push('map: catalog timeout'));
  await new Promise(r => setTimeout(r, 2000));
  await shot(page, '06-map-idle');

  const pinCount = await page.$$eval('.map-pin-new', els => els.length).catch(() => 0);
  console.log('  map pins rendered:', pinCount);

  /* Check search bar is present */
  const searchBar = await page.$('.map-search') !== null;
  console.log('  map search bar present:', searchBar);

  /* ── 6. Map — text search filter ─────────────────────────── */
  await page.focus('#map-search-input');
  await page.type('#map-search-input', 'bar', { delay: 40 });
  await new Promise(r => setTimeout(r, 700));
  await shot(page, '07-map-search-active');

  const countEl = await page.$eval('#map-search-count', el => el.textContent).catch(() => '—');
  console.log('  map search count:', countEl);

  /* ── 7. Map — click a pin to open detail ─────────────────── */
  await page.goto(`${BASE}/map.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await waitCatalog(page).catch(() => errors.push('map pin: catalog timeout'));
  await new Promise(r => setTimeout(r, 2000));
  const firstPin = await page.$('.map-pin-new');
  if (firstPin) {
    await firstPin.click();
    await new Promise(r => setTimeout(r, 700));
    await shot(page, '08-map-pin-detail');
    /* Check "View list" link */
    const viewList = await page.$('.map-detail__more-link--list');
    console.log('  "View list" link present:', !!viewList);
  } else {
    errors.push('map: no .map-pin-new found');
    console.log('  no pins found');
  }

  /* ── 8. Venue detail ─────────────────────────────────────── */
  const firstId = await page.evaluate(() => window.WA?.catalog?.[0]?.id);
  if (firstId) {
    await page.goto(`${BASE}/venue.html?id=${firstId}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await waitCatalog(page).catch(() => {});
    await new Promise(r => setTimeout(r, 1200));
    await shot(page, '09-venue-detail');
    const quoteEl = await page.$('.tonight__quote');
    console.log('  venue quote rendered:', !!quoteEl);
  }

  /* ── 9. Saved page ────────────────────────────────────────── */
  await page.goto(`${BASE}/saved.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await shot(page, '10-saved');

  await browser.close();

  /* ── Summary ──────────────────────────────────────────────── */
  console.log('\n── Summary ─────────────────────────────');
  console.log('Screenshots saved to:', OUT);
  if (errors.length) {
    console.log('ERRORS:');
    errors.forEach(e => console.log(' ✗', e));
  } else {
    console.log('No errors.');
  }
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
