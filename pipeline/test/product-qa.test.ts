import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const publicKey = /const KEY\s*=\s*'([^']+)'/.exec(source('supabase.js'))![1];
const publicOrigin = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
const tick = () => new Promise<void>(r => setImmediate(r));

function worker() {
  const listeners = new Map<string, any>();
  const stored = new Map<string, Response>();
  const cache = {
    match: async (r: Request) => stored.get(r.url)?.clone(),
    put: async (r: Request, response: Response) => { stored.set(r.url, response.clone()); },
  };
  let network: (r: Request) => Promise<Response> = async () => new Response('[]');
  const context = createContext({ self: { addEventListener: (n: string, cb: any) => listeners.set(n, cb) },
    caches: { open: async () => cache, match: cache.match }, location: { origin: 'https://wanderalt.pages.dev' },
    fetch: (r: Request) => network(r), Request, Response, Headers, URL, Date, console });
  runInContext(source('sw.js'), context);
  async function request(path: string, headers: Record<string, string> = {}) {
    let result: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    listeners.get('fetch')({ request: new Request(path, { headers }),
      respondWith: (p: Promise<Response>) => { result = p; }, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    const response = result ? await result : undefined;
    await Promise.all(waits);
    return response;
  }
  return { request, stored, network: (cb: typeof network) => { network = cb; } };
}
const anon = { apikey: publicKey, Authorization: `Bearer ${publicKey}` };

test('service worker bypasses real-length user JWTs and secret API keys', async () => {
  const w = worker(), u = `${publicOrigin}/rest/v1/picks?select=*`;
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'authenticated', sub: 'qa', padding: 'x'.repeat(300) })).toString('base64url')}.signature`;
  assert.equal(await w.request(u, { ...anon, Authorization: `Bearer ${token}` }), undefined);
  assert.equal(await w.request(u, { ...anon, apikey: 'sb_secret_qa' }), undefined);
  assert.equal(await w.request(u, { apikey: 'sb_secret_qa' }), undefined);
  assert.equal(w.stored.size, 0);
});

test('worker only caches exact public catalogue paths on the configured backend', async () => {
  const w = worker();
  for (const path of ['/picks_private', '/bookmarks', '/going']) {
    assert.equal(await w.request(`${publicOrigin}/rest/v1${path}`, anon), undefined);
  }
  assert.equal(await w.request('https://other.example/rest/v1/picks', anon), undefined);
  assert.equal(await w.request(`${publicOrigin}/rest/v1/picks`), undefined);
  assert.equal((await w.request(`${publicOrigin}/rest/v1/catalogue_redirects`, anon))?.status, 200);
  assert.equal(w.stored.size, 1);
});

test('the same-origin edge cache path is kept for offline like the backend path, and only for public tables', async () => {
  const w = worker();
  for (const path of ['/api/rest/social_tokens', '/api/rest/bookmarks', '/api/ask']) assert.equal(await w.request(`https://wanderalt.pages.dev${path}`), undefined);
  assert.equal((await w.request('https://wanderalt.pages.dev/api/rest/picks?select=id'))?.status, 200);
  assert.equal(w.stored.size, 1);
});

test('offline and 503 catalogue responses preserve the last good body and its original timestamp', async () => {
  const w = worker(), u = `${publicOrigin}/rest/v1/picks`;
  await w.request(u, anon);
  const stamp = w.stored.get(u)!.headers.get('x-wa-cached-at');
  assert.ok(stamp);
  w.network(async () => new Response('temporarily unavailable', { status: 503 }));
  const unavailable = await w.request(u, anon);
  assert.equal(await unavailable!.text(), '[]');
  assert.equal(unavailable!.headers.get('x-wa-cached-at'), stamp);
  w.network(async () => { throw new Error('offline'); });
  const offline = await w.request(u, anon);
  assert.equal(offline!.headers.get('x-wa-cached-at'), stamp);
  assert.equal(w.stored.get(u)!.status, 200);
});

test('a failed static revalidation does not poison the cached script', async () => {
  const w = worker(), u = 'https://wanderalt.pages.dev/render.js';
  w.network(async () => new Response('valid script'));
  await w.request(u);
  w.network(async () => new Response('not found', { status: 404 }));
  assert.equal(await (await w.request(u))!.text(), 'valid script');
  assert.equal(await w.stored.get(u)!.text(), 'valid script');
});

function catalogue(fetcher: (u: string) => Promise<any>, values = new Map<string, string>()) {
  const WA: Record<string, any> = {};
  let ready!: () => void;
  const loaded = new Promise<void>(r => { ready = r; });
  const context = createContext({ window: { WA }, location: { hostname: 'localhost' }, console,
    AbortController, setTimeout, clearTimeout, CustomEvent: class { type: string; constructor(type: string) { this.type = type; } },
    localStorage: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) },
    document: { readyState: 'complete', dispatchEvent: (e: any) => { if (e.type === 'wa:catalog-ready') ready(); } }, fetch: fetcher });
  runInContext(source('supabase.js'), context);
  return { WA, loaded, values };
}

test('cached catalogue fallback never becomes live or renews the snapshot confirmation', async () => {
  const oldStamp = String(Date.now() - 3600_000);
  const values = new Map([['wa:catalogue:at', oldStamp], ['wa:catalogue:v2', JSON.stringify({ sig: 'old', picks: [], venues: [], redirects: [] })]]);
  const p = catalogue(async () => new Response('[]', { headers: { 'x-wa-cached-at': oldStamp } }), values);
  await p.loaded; await tick();
  assert.equal(p.WA.DATA_LIVE, false);
  assert.equal(values.get('wa:catalogue:at'), oldStamp);
});

test('a failed direct lookup is retryable; successful empty lookups alone mean not found', async () => {
  let fail = false;
  const p = catalogue(async () => fail ? new Response('', { status: 503 }) : new Response('[]'));
  await p.loaded;
  assert.equal(await p.WA.byId('unknown'), null);
  fail = true;
  await assert.rejects(p.WA.byId('unknown'), /503/);
  fail = false;
  assert.equal(await p.WA.byId('unknown'), null);
});

test('cached empty lookups cannot prove a retained listing is gone', async () => {
  const p = catalogue(async () => new Response('[]', { headers: { 'x-wa-cached-at': String(Date.now() - 3600_000) } }));
  await p.loaded;
  await assert.rejects(p.WA.byId('retained'), /Cached lookup/);
});

test('dated listings use their Tallinn date after a snapshot crosses midnight', () => {
  const now = Date.parse('2026-10-01T00:01:00+03:00');
  class Clock extends Date { constructor(value?: any) { super(value === undefined ? now : value); } static now() { return now; } }
  const WA: Record<string, any> = {};
  const context = createContext({ window: { WA }, Date: Clock, Intl });
  runInContext(source('when.js'), context);
  const old = { startsAt: '2026-09-30T20:00:00+03:00', day: 'Tonight', tonight: true, thisWeek: true };
  assert.equal(WA.when.isTonight(old), false);
  assert.equal(WA.when.matches(old, 'thisweek'), false);
  assert.equal(WA.when.isTonight({ startsAt: '2026-10-01T19:00:00+03:00', tonight: false }), true);
  assert.equal(WA.when.isTonight({ day: 'Tonight' }), true);
});

function saved(byId: (id: string) => Promise<any>) {
  const elements = new Map<string, any>();
  const listeners = new Map<string, any>();
  const WA: Record<string, any> = {
    _catalogAll: [], _venuesAll: [], DATA_LIVE: true, CITY: 'tallinn', byId,
    Bookmarks: { get: () => ({ retained: true }) },
    UI: { esc: (s: unknown) => String(s ?? '') }, Icon: () => '', Geo: { byDateThenSoonest: () => () => 0 },
    when: { hasEnded: () => false },
    R: { empty: ({ title }: any) => title, skelRows: () => '', locateIfGranted: () => {}, sect: ({ title }: any) => title,
      row: (e: any) => e.title, placeRow: (e: any) => `${e.name} ${e.isVerified ? 'verified' : 'Status unverified'}` },
  };
  const context = createContext({ window: { WA, addEventListener: () => {} }, document: {
    readyState: 'complete', addEventListener: (n: string, cb: any) => listeners.set(n, cb),
    getElementById: (id: string) => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); },
  } });
  runInContext(source('saved-page.js'), context);
  listeners.get('wa:catalog-ready')();
  return { elements, listeners };
}

test('Saved resolves unverified venues absent from recommendations without saying they disappeared', async () => {
  const p = saved(async () => ({ kind: 'place', e: { id: 'retained', name: 'Retained venue', isVerified: false } }));
  await tick();
  const body = p.elements.get('saved-body').innerHTML;
  assert.match(body, /Retained venue Status unverified/);
  assert.doesNotMatch(body, /stopped listing|Over since/);
});

test('Saved retains failed lookups with a recovery action instead of a disappearance claim', async () => {
  const p = saved(async () => { throw new Error('offline'); });
  await tick();
  assert.equal(p.elements.get('saved-title').textContent, '1 saved');
  assert.match(p.elements.get('saved-body').innerHTML, /Try again/);
  assert.doesNotMatch(p.elements.get('saved-body').innerHTML, /no longer listed|stopped listing/);
});

test('Saved preserves the title of an archived event', async () => {
  const p = saved(async () => ({ kind: 'event', e: { id: 'retained', title: 'Past gig' }, archivedAt: '2026-09-29T12:00:00Z' }));
  await tick();
  assert.match(p.elements.get('saved-body').innerHTML, /Past gig/);
  assert.match(p.elements.get('saved-body').innerHTML, /no longer in the programme/);
});

test('Pages middleware applies the declared security policy on Function and API responses', async () => {
  const context = createContext({ Response, URL });
  runInContext(source('functions/_middleware.js').replace('export async function onRequest', 'async function onRequest'), context);
  const html = new Response('<html>original</html>', { headers: { 'content-type': 'text/html', 'cache-control': 'no-cache' } });
  const response = await context.onRequest({ request: new Request('https://wanderalt.pages.dev/'), next: async () => html });
  const declared = source('_headers').split('\n').find(s => s.trim().startsWith('Content-Security-Policy:'))!.trim().slice('Content-Security-Policy: '.length);
  assert.equal(response.headers.get('content-security-policy'), declared);
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.equal(await response.text(), '<html>original</html>');
  const api = await context.onRequest({ request: new Request('https://wanderalt.pages.dev/api/ask?q=test'), next: async () => new Response('{}', { status: 503 }) });
  assert.equal(api.status, 503);
  assert.equal(api.headers.get('content-security-policy'), declared);
});

test('an online outage reports stale cached results, retains their age, and retries in place once', async () => {
  const stamp=String(Date.now()-3600_000);
  const picks=[{id:'old',city:'tallinn',title:'Old listing',kind:'gig'}];
  const values=new Map([['wa:catalogue:at',stamp],['wa:catalogue:v2',JSON.stringify({sig:'old',picks,venues:[],redirects:[]})]]);
  let fail=true, calls=0;
  const p=catalogue(async (u) => { calls++; return fail ? new Response('',{status:503}) : Response.json(u.includes('/picks?') ? picks : []); },values);
  await p.WA.refreshCatalogue();
  assert.equal(p.WA.CatalogueStatus.stale,true); assert.equal(p.WA.CatalogueStatus.hasData,true);
  assert.equal(p.WA.CatalogueStatus.cachedAt,Number(stamp)); assert.equal(p.WA.catalog[0].id,'old');
  assert.equal(values.get('wa:catalogue:at'),stamp);
  fail=false; const before=calls;
  const first=p.WA.refreshCatalogue(), second=p.WA.refreshCatalogue(); assert.equal(first,second);
  await first; assert.equal(calls-before,3); assert.equal(p.WA.CatalogueStatus.stale,false); assert.equal(p.WA.DATA_LIVE,true);
  assert.notEqual(values.get('wa:catalogue:at'),stamp);
});

test('a first-load failure and a partial catalogue are never reported live', async () => {
  for (const response of [() => new Response('',{status:503}), (u: string) => u.includes('/venues?') ? new Response('',{status:503}) : Response.json([]), (u: string) => u.includes('/catalogue_redirects?') ? new Response('',{status:503}) : Response.json([]), () => Response.json({error:'malformed'})]) {
    const p=catalogue(async u => response(u)); await p.WA.refreshCatalogue();
    assert.equal(p.WA.CatalogueStatus.stale,true); assert.equal(p.WA.CatalogueStatus.hasData,false); assert.equal(p.WA.DATA_LIVE,false);
  }
});

test('a fresh retry clears the service-worker fallback flag rather than carrying it forever', async () => {
  let cached=true;
  const p=catalogue(async () => new Response('[]',{headers:cached ? {'x-wa-cached-at':String(Date.now()-60000)} : {}}));
  await p.WA.refreshCatalogue(); assert.equal(p.WA.CatalogueStatus.stale,true);
  cached=false; await p.WA.refreshCatalogue(); assert.equal(p.WA.CatalogueStatus.stale,false); assert.equal(p.WA.DATA_LIVE,true);
});
