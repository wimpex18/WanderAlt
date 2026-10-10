/* npm run shots -- <outdir> [--only now,map,...]
   Full-page screenshots of the main pages at 390, 768, 1100 and 1440 px in Day and
   Dusk, on the recorded catalogue at the recording time with the network stubbed
   (tests/e2e/support/env.ts), for proving a style change leaves every pixel alone:
   take a set before and after, then npm run shots:compare -- <before> <after>.

   Each capture waits for lazy pictures, fonts, maps at rest and markup that has
   stopped changing; animations and transitions take no time. Rows that skip
   rendering off screen (content-visibility: auto) are drawn as they look on screen.
   A capture is kept once two in a row match. Chromium renders in software and
   redraws whole tiles (see the launch below), or edges came out a level or two
   apart from run to run. Saved holds two saves. The maps draw no tiles (the stub
   has none), only their background and the page's own layers; that canvas renders
   identically run to run, so it is captured as is, not masked. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { DEAD_PROXY, fixture, prepareContext, settle, startServer } from './support/env.ts';

const args = process.argv.slice(2);
let outdir = '', only: string[] | null = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--only') only = (args[++i] || '').split(',').filter(Boolean);
  else if (!outdir) outdir = args[i];
}
if (!outdir) {
  console.error('Usage: npm run shots -- <outdir> [--only now,map,event,walk,events,places,saved,you,about]');
  process.exit(2);
}

const meta = fixture().meta;
const PAGES: Record<string, string> = {
  now: 'index.html',
  map: 'map.html',
  event: `detail.html?id=${encodeURIComponent(meta.eventId)}`,
  walk: meta.walkHref,
  events: 'discover.html',
  places: 'places.html',
  saved: 'saved.html',
  you: 'profile.html',
  about: 'about.html',
};
const WIDTHS: Record<number, number> = { 390: 844, 768: 1024, 1100: 900, 1440: 900 };
const THEMES = ['day', 'dusk'] as const;
const PORT = Number(process.env.E2E_PORT) || 5392;
const CONCURRENCY = 4;

const names = Object.keys(PAGES).filter(n => !only || only.includes(n));
if (only && names.length !== only.length) {
  console.error(`Unknown page in --only; choose from ${Object.keys(PAGES).join(', ')}`);
  process.exit(2);
}

/* Everything a capture waits for once the catalogue has been drawn. Returns false
   when the page never stopped changing. */
const still = async (page: Page) => {
  const pictures = () => page.evaluate(async () => {
    for (const img of document.images) if (img.loading === 'lazy') img.loading = 'eager';
    await Promise.all([...document.images].map(img => img.complete ? null : new Promise(done => {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    })));
    await Promise.all([...document.images].map(img => img.complete && img.naturalWidth ? img.decode().catch(() => {}) : null));
  });
  await page.waitForLoadState('networkidle');
  await pictures();
  /* The Map page's map has loaded and stopped moving. */
  await page.waitForFunction(() => {
    const tiles = (window as any).WA?.MapTiles;
    const map = tiles?.getMap?.();
    if (!document.querySelector('.map-page') || !map) return true;
    return tiles.isReady() && map.loaded() && !map.isMoving() && map.areTilesLoaded();
  });
  /* A walk's map (from 1024 px) has drawn its legs. */
  await page.waitForFunction(() => {
    const host = document.getElementById('rt-map');
    return !host || host.hidden || host.dataset.mapState === 'ready';
  });
  /* A full-page capture shows rows below the fold, which otherwise keep a placeholder size until scrolled to. */
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (getComputedStyle(el).contentVisibility === 'auto') el.style.contentVisibility = 'visible';
    }
  });
  /* The page has stopped changing: the same height and markup, inline styles and
     so map pins included, for half a second. */
  const steady = await page.evaluate(() => new Promise<boolean>(resolve => {
    const sig = () => {
      const html = document.body.innerHTML;
      let h = 0x811c9dc5;
      for (let i = 0; i < html.length; i++) h = Math.imul(h ^ html.charCodeAt(i), 0x01000193);
      return `${document.documentElement.scrollHeight}:${html.length}:${h}`;
    };
    const start = performance.now();
    let last = sig(), since = start;
    const tick = () => {
      const now = performance.now(), s = sig();
      if (s !== last) { last = s; since = now; }
      if (now - since >= 500) resolve(true);
      else if (now - start > 10_000) resolve(false);
      else setTimeout(tick, 50);
    };
    setTimeout(tick, 50);
  }));
  await pictures();
  await page.evaluate(() => document.fonts.ready.then(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))));
  return steady;
};

const shoot = async (browser: Browser, base: string, name: string, width: number, theme: 'day' | 'dusk') => {
  const context = await browser.newContext({
    viewport: { width, height: WIDTHS[width] }, locale: 'en-GB', timezoneId: 'Europe/Tallinn',
    serviceWorkers: 'block', proxy: DEAD_PROXY, colorScheme: theme === 'dusk' ? 'dark' : 'light',
  });
  const net = await prepareContext(context, { theme, saved: name === 'saved' ? meta.savedIds : undefined });
  /* Animations and transitions run in an instant, as wa.css itself does for reduced motion
     (without matching that query, which also changes a few layouts). A layer caught
     mid-animation kept a sub-pixel offset that smoothed its edges differently run to run. */
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '*, *::before, *::after { animation-duration: .01ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; transition-delay: 0s !important; scroll-behavior: auto !important; }';
      document.head.append(style);
    }, { once: true });
  });
  const errors: string[] = [];
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`${base}/${PAGES[name]}`);
    await settle(page);
    if (!await still(page)) errors.push('the page kept changing for 10 s');
    const file = path.join(outdir, `${name}-${width}-${theme}.png`);
    const capture = () => page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css', timeout: 15_000 });
    let shot = await capture();
    for (let tries = 1; ; tries++) {
      await page.waitForTimeout(200);
      const again = await capture();
      if (again.equals(shot)) break;
      shot = again;
      if (tries === 6) { errors.push('consecutive captures kept differing'); break; }
    }
    fs.writeFileSync(file, shot);
    return [...net.misses.map(m => `not recorded: ${m}`), ...errors].map(e => `${path.basename(file)}: ${e}`);
  } finally {
    await context.close();
  }
};

fs.mkdirSync(outdir, { recursive: true });
const server = await startServer(PORT);
/* Software rendering, WebGL on SwiftShader for the maps, and every tile drawn whole:
   re-drawing only the changed part of a tile left edges smoothed one level apart
   from run to run. */
const browser = await chromium.launch({ args: ['--disable-gpu', '--enable-unsafe-swiftshader', '--disable-partial-raster'] });
const started = Date.now();
const jobs = names.flatMap(n => Object.keys(WIDTHS).flatMap(w => THEMES.map(t => [n, Number(w), t] as const)));
const problems: string[] = [];
try {
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const [name, width, theme] = jobs[next++];
      problems.push(...await shoot(browser, server.base, name, width, theme)
        .catch((error: Error) => [`${name}-${width}-${theme}.png: ${error.message.split('\n')[0]}`]));
    }
  }));
} finally {
  await browser.close();
  server.stop();
}
for (const p of problems) console.warn(p);
console.log(`${jobs.length} screenshots in ${path.resolve(outdir)} (${((Date.now() - started) / 1000).toFixed(1)} s)${problems.length ? `, ${problems.length} problems above` : ''}.`);
process.exitCode = problems.length ? 1 : 0;
