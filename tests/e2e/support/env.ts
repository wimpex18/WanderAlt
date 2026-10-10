/* The browser world the end-to-end tests and the screenshot tool share: recorded
   Supabase answers, a stub for every other outside request, a frozen clock and
   no opening animation. Nothing here reaches the network unless it is recording.

   Run from the repository root (npm scripts and `npx playwright test` do). */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { BrowserContext, Page, Route } from '@playwright/test';

export const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, 'manifest.webmanifest'))) {
  throw new Error(`Run the end-to-end tools from the repository root, not ${ROOT}`);
}
export const FIXTURE_FILE = path.join(ROOT, 'tests/e2e/fixtures/supabase.json');
export const SUPABASE_HOST = 'aqnsmmbrspkbfcvougeh.supabase.co';

/* Anything the page asks for that no route below answers goes to this proxy,
   which is not there: the request fails loudly instead of reaching the network.
   The local server is left out of it. */
export const DEAD_PROXY = { server: 'http://127.0.0.1:9', bypass: 'localhost,127.0.0.1,[::1]' };

export type Recorded = { status: number; body: unknown };
export type Meta = {
  eventId: string;       /* a timed event later on the recording day */
  eventTitle: string;
  walkHref: string;      /* Now's walk card at the recording time */
  savedIds: string[];    /* two timed events that night, for a non-empty Saved */
  searchQuery: string;   /* a venue name the local search finds */
  counts: { today: number; tomorrow: number; weekend: number };   /* events per date, all moods */
  mood: { label: string; count: number };                         /* a mood that narrows today's events */
};
export type Fixture = { recordedAt: string; meta: Meta; responses: Record<string, Recorded> };

let cached: Fixture | null = null;
export const fixture = (): Fixture => {
  if (!cached) {
    if (!fs.existsSync(FIXTURE_FILE)) throw new Error(`No ${path.relative(ROOT, FIXTURE_FILE)}: run npm run e2e:record`);
    cached = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8')) as Fixture;
  }
  return cached;
};

/* A 4×3 neutral grey PNG stands in for every outside picture. */
const PICTURE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQI12OYNqkHjhhwcgCPNhRxOCx8rgAAAABJRU5ErkJggg==', 'base64');
/* OpenFreeMap answers with no features: the map draws its background and the page's own layers. */
const TILEJSON = JSON.stringify({ tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/e2e/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14 });
const CORS = { 'access-control-allow-origin': '*' };

const restKey = (url: URL) => url.pathname + url.search;
const isLocal = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

export type Network = {
  misses: string[];                  /* Supabase reads the fixture does not hold */
  recorded: Map<string, Recorded>;   /* filled only when recording */
};

export type Setup = {
  record?: boolean;                  /* read Supabase live and keep the answers */
  at?: number;                       /* the frozen time, default the recording time */
  theme?: 'day' | 'dusk';            /* the stored appearance; unset means Auto */
  saved?: string[];                  /* listing ids saved on this device */
};

export async function prepareContext(context: BrowserContext, setup: Setup = {}): Promise<Network> {
  const netState: Network = { misses: [], recorded: new Map() };
  const at = setup.at ?? Date.parse(fixture().recordedAt);
  await context.clock.setFixedTime(new Date(at));
  await context.addInitScript(({ theme, saved }) => {
    try {
      /* "Opened moments ago": brand-reveal.js skips its cover. */
      localStorage.setItem('wa:opened', '9999999999999');
      if (theme) localStorage.setItem('wa:appearance', theme);
      if (saved && saved.length && !localStorage.getItem('wanderalt:bookmarks:v1:sync:guest')) {
        const data = Object.fromEntries(saved.map(id => [id, true]));
        localStorage.setItem('wanderalt:bookmarks:v1:sync:guest', JSON.stringify({ data, pending: {} }));
      }
    } catch { /* storage off: the page still renders */ }
  }, { theme: setup.theme ?? null, saved: setup.saved ?? null });

  const answer = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === SUPABASE_HOST && url.pathname.startsWith('/rest/v1/')) {
      const key = restKey(url);
      if (request.method() !== 'GET') {
        netState.misses.push(`${request.method()} ${key}`);
        return route.fulfill({ status: 405, headers: CORS, contentType: 'application/json', body: '{"message":"not in the e2e fixture"}' });
      }
      if (setup.record) {
        const response = await route.fetch();
        const text = await response.text();
        let body: unknown;
        try { body = JSON.parse(text); } catch { body = text; }
        netState.recorded.set(key, { status: response.status(), body });
        return route.fulfill({ status: response.status(), headers: CORS, contentType: 'application/json', body: text });
      }
      const hit = fixture().responses[key];
      if (!hit) {
        netState.misses.push(`GET ${key}`);
        return route.fulfill({ status: 503, headers: CORS, contentType: 'application/json', body: '{"message":"not in the e2e fixture"}' });
      }
      return route.fulfill({ status: hit.status, headers: CORS, contentType: 'application/json', body: JSON.stringify(hit.body) });
    }
    if (url.hostname === 'tiles.openfreemap.org') {
      if (url.pathname === '/planet') return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: TILEJSON });
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
    }
    if (request.resourceType() === 'image') return route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: PICTURE });
    return route.fulfill({ status: 204, headers: CORS, body: '' });
  };
  await context.route(url => !isLocal(url), route => answer(route).catch((error: Error) => {
    /* A page that closed mid-request is not a failure; anything else is reported. */
    if (!/closed|disposed|destroyed/i.test(error.message)) netState.misses.push(`ERROR ${route.request().url()}: ${error.message}`);
    return route.abort().catch(() => {});
  }));
  return netState;
}

/* The catalogue has answered and been drawn, fonts are in, two frames have passed. */
export async function settle(page: Page) {
  await page.waitForFunction(() => {
    const W = (window as any).WA;
    return document.readyState === 'complete' && (!W || !W.refreshCatalogue || (W.CatalogueStatus && W.CatalogueStatus.loading === false));
  });
  await page.evaluate(() => document.fonts.ready.then(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))));
}

/* What sticks out past the right edge of the page, if anything. */
export async function overflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement, width = root.clientWidth;
    if (root.scrollWidth <= width) return null;
    const out: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.right > width + 0.5 && out.length < 8) {
        out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${[...el.classList].map(c => '.' + c).join('')} (right edge ${Math.round(box.right)})`);
      }
    }
    return { scrollWidth: root.scrollWidth, clientWidth: width, offenders: out };
  });
}

/* The repository's own static server on a port of our choosing, for the scripts
   (the test runner starts its own through playwright.config.ts). A port already
   in use fails: it could be another checkout being served. */
export async function startServer(port: number) {
  const busy = await new Promise<boolean>(resolve => {
    const probe = net.createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(port, '0.0.0.0');
  });
  if (busy) throw new Error(`Port ${port} is in use; set E2E_PORT to a free one`);
  const child = spawn(process.execPath, ['.scripts/dev-server.js', '--port', String(port)], { cwd: ROOT, stdio: 'ignore' });
  /* The server goes with this process, however it ends. */
  const stop = () => { if (child.exitCode == null) child.kill('SIGTERM'); };
  process.once('exit', stop);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { stop(); process.exit(130); });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${base}/manifest.webmanifest`)).ok) break; } catch { /* not up yet */ }
    if (i === 100) { stop(); throw new Error('The dev server did not start'); }
    await new Promise(r => setTimeout(r, 150));
  }
  return { base, stop };
}
