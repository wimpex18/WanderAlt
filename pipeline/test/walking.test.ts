import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { FootRouter, estimateMinutes, lineMetres, streetMinutes } from '../walking.ts';
import type { RouterOptions } from '../walking.ts';
import { candidatesForDay, composeRoutes } from '../routes.ts';
import type { RouteEvent, RoutePlace } from '../routes.ts';
import type { Db } from '../db.ts';
import { UA } from '../util.ts';

// ── The foot router ──────────────────────────────────────────

const A = { lat: 59.44, lng: 24.74 }, B = { lat: 59.443, lng: 24.74 }, C = { lat: 59.44, lng: 24.746 };
const answer = (legs: number[], code = 'Ok') => new Response(JSON.stringify({ code, routes: [{ legs: legs.map(distance => ({ distance })) }] }), { status: 200 });
function router(replies: (() => Response | Promise<Response>)[], o: RouterOptions = {}) {
  const calls: { url: string; init: RequestInit }[] = [], waits: number[] = [];
  let t = 0;
  const r = new FootRouter({
    fetch: (async (url: string, init: RequestInit) => { calls.push({ url, init }); const reply = replies.shift(); if (!reply) throw new Error('no network in tests'); return reply(); }) as typeof fetch,
    wait: async (ms: number) => { waits.push(ms); t += ms; }, clock: () => t, ...o,
  });
  return { r, calls, waits };
}
const quiet = async <T>(f: () => Promise<T>): Promise<T> => {
  const warn = console.warn, log = console.log;
  console.warn = () => {}; console.log = () => {};
  try { return await f(); } finally { console.warn = warn; console.log = log; }
};

test('a walk comes back leg by leg along the streets, asked with our name and no faster than once a second', async () => {
  const { r, calls, waits } = router([() => answer([450, 610]), () => answer([700])]);
  assert.deepEqual(await r.legs([A, B, C]), [450, 610]);
  assert.match(calls[0].url, /^https:\/\/routing\.openstreetmap\.de\/routed-foot\/route\/v1\/foot\/24\.740000,59\.440000;24\.740000,59\.443000;24\.746000,59\.440000\?overview=false&steps=false$/);
  assert.equal((calls[0].init.headers as Record<string, string>)['user-agent'], UA);
  assert.ok(calls[0].init.signal, 'every request has a timeout');
  assert.deepEqual(await r.legs([B, C]), [700]);
  assert.deepEqual(waits, [1100]);
  assert.deepEqual(await r.legs([A, B, C]), [450, 610]);                  // asked once
  assert.equal(calls.length, 2);
  assert.equal(streetMinutes(610), 8);
  assert.equal(estimateMinutes(lineMetres(A, B)), 6);                      // geo.js: 1.28 × 334 m + 40 m at 80 m/min
});

test('a router that fails, refuses or answers nonsense leaves the estimate, and three failures stop asking', async () => {
  const { r, calls } = router([
    () => new Response('busy', { status: 429 }),
    () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); },
    () => answer([], 'NoRoute'),
    () => answer([450]),
  ]);
  await quiet(async () => {
    assert.equal(await r.legs([A, B, C]), null);
    assert.equal(await r.legs([A, C]), null);
    assert.equal(await r.legs([B, C]), null);
    assert.equal(r.open, false);
    assert.equal(await r.legs([C, A]), null);
  });
  assert.equal(calls.length, 3);
  assert.equal(r.failures, 3);
  // A leg shorter than the straight line allows, or many times it, is not believed; the other leg stands.
  const odd = router([() => answer([120, 610]), () => answer([450, 5000])]);
  assert.deepEqual(await odd.r.legs([A, B, C]), [null, 610]);
  assert.deepEqual(await odd.r.legs([C, A, B]), [450, null]);
  assert.equal(await odd.r.legs([A]), null);
});

test('a run asks the router no more than its cap', async () => {
  const { r, calls } = router([() => answer([450]), () => answer([500]), () => answer([550])], { cap: 2 });
  assert.deepEqual(await r.legs([A, B]), [450]);
  assert.deepEqual(await r.legs([B, C]), [500]);
  assert.equal(await r.legs([A, C]), null);
  assert.equal(calls.length, 2);
  assert.equal(new FootRouter().open, true);
});

// ── Composing on the streets' minutes ────────────────────────

const NOW = Date.parse('2026-10-02T11:00:00Z');   // 14:00 in Tallinn
const place = (id: string, kind: string, lat: number, extra: Partial<RoutePlace> = {}): RoutePlace =>
  ({ id, name: id, kind, lat, lng: 24.734, opening_hours: 'Mo-Su 10:00-23:59', pick_note: null, neighborhood: 'Kalamaja', ...extra });
const host = place('host', 'theatre', 59.44);
const shop = place('shop', 'record store', 59.443);
const bar = place('bar', 'bar', 59.437);
const ev = (id: string, hh: string): RouteEvent =>
  ({ id, title: id, title_en: null, kind: 'theatre', starts_at: `2026-10-02T${hh}:00+03:00`, ends_at: null, has_time: true, place_id: 'host', flag: null });
const on = (m: Record<string, number>) => (a: RoutePlace, b: RoutePlace) => m[`${a.id}>${b.id}`] ?? null;
const find = (streets?: (a: RoutePlace, b: RoutePlace) => number | null) =>
  candidatesForDay('2026-10-02', [ev('e1', '19:00')], id => (id === 'host' ? host : undefined), [shop, bar], NOW, streets);

test('a routed leg sets its walk, the walk total and the times after it; an unrouted one keeps the estimate', () => {
  const [model] = find();
  assert.deepEqual(model.stops.map(s => s.walk), [undefined, undefined, undefined]);
  assert.equal(model.walkMin, 12);                                         // two legs of 334 m: 6 + 6
  assert.equal(model.stops[2].minute, 21 * 60 + 20);                       // round5(21:00 + 15 + 6)
  const [routed] = find(on({ 'shop>host': 800, 'host>bar': 900 }));
  assert.deepEqual(routed.stops.map(s => [s.walk, s.metres, s.routed]), [[undefined, undefined, undefined], [10, 800, true], [11, 900, true]]);
  assert.equal(routed.walkMin, 21);
  assert.equal(routed.stops[2].minute, 21 * 60 + 25);                      // round5(21:00 + 15 + 11)
  const [half] = find(on({ 'shop>host': 800 }));
  assert.deepEqual(half.stops.map(s => s.walk), [undefined, 10, undefined]);
  assert.equal(half.walkMin, 16);
});

test("a leg the streets make longer than the walk allows drops that stop, as the estimate would", () => {
  const [c] = find(on({ 'host>bar': 1100 }));                               // 14 minutes after the show: more than twelve
  assert.deepEqual(c.stops.map(s => s.id), ['shop', 'e1']);
  assert.equal(find(on({ 'shop>host': 1300, 'host>bar': 1100 })).length, 0);
});

function fakeDb(): Db {
  return {
    all: async (path: string) => (path.startsWith('events') ? [ev('e1', '19:00')] : [shop, bar]),
    select: async (path: string) => (path.startsWith('places') ? [host] : []),
    upsert: async () => { throw new Error('a dry run writes nothing'); },
    req: async () => { throw new Error('a dry run writes nothing'); },
  } as unknown as Db;
}

test('the pipeline measures the walks it keeps along the streets and composes them again on those minutes', async () => {
  const { r, calls } = router([() => answer([500, 450])]);
  const rows = await quiet(() => composeRoutes(fakeDb(), 'tallinn', null, { dry: true, days: 1, now: NOW, router: r }));
  assert.equal(calls.length, 1);
  assert.deepEqual(rows[0].stops, [
    { type: 'place', id: 'shop', minute: 17 * 60 + 55 },
    { type: 'event', id: 'e1', minute: 19 * 60, walk: 6, metres: 500, routed: true },
    { type: 'place', id: 'bar', minute: 21 * 60 + 20, walk: 6, metres: 450, routed: true },
  ]);
});

test('with the router down the run still stores its walks, on the estimate', async () => {
  const { r } = router([() => { throw new Error('ECONNRESET'); }]);
  const down = await quiet(() => composeRoutes(fakeDb(), 'tallinn', null, { dry: true, days: 1, now: NOW, router: r }));
  const none = await quiet(() => composeRoutes(fakeDb(), 'tallinn', null, { dry: true, days: 1, now: NOW, router: null }));
  assert.equal(down.length, 1);
  assert.deepEqual(down, none);
  assert.ok(down[0].stops.every(s => s.walk === undefined && !s.routed));
});

// ── The page: a stored walk's routed legs, while they match ────

const STOPS = 'place:books:1080,event:gig:1140,place:pub:1320';
const ROW_ID = 'tallinn:2026-10-05:gig';
type Leg = { walk?: number; metres?: number; routed?: boolean };
function page(search = '', legs: [Leg, Leg] = [{ walk: 9, metres: 700, routed: true }, { walk: 7, metres: 560, routed: true }], firstId = 'books') {
  const now = '2026-10-04T08:00:00Z';
  class Clock extends Date { constructor(v?: string | number) { super(v ?? now); } static now() { return Date.parse(now); } }
  const places = [
    { id: 'books', name: 'Books', kind: 'bookshop', openingHours: '24/7', lat: 59.44, lng: 24.74, picked: true },
    { id: 'pub', name: 'Pub', kind: 'bar', openingHours: '24/7', lat: 59.44, lng: 24.746, picked: true },
  ];
  const event = { id: 'gig', title: 'Gig', kind: 'gig', startsAt: '2026-10-05T16:00:00Z', lat: 59.443, lng: 24.74 };
  const rows = [{ id: ROW_ID, day: '2026-10-05', area: '', title: 'Books, a gig, a drink', blurb: null, score: 5, engine: 'rules',
    stops: [{ type: 'place', id: firstId, minute: 1080 }, { type: 'event', id: 'gig', minute: 1140, ...legs[0] }, { type: 'place', id: 'pub', minute: 1320, ...legs[1] }] }];
  const listeners = new Map<string, ((e: unknown) => void)[]>();
  const els: Record<string, { textContent: string; innerHTML: string; children: unknown[] }> = {};
  const document = {
    addEventListener: (type: string, f: (e: unknown) => void) => listeners.set(type, [...(listeners.get(type) ?? []), f]),
    dispatchEvent: (e: { type: string }) => { for (const f of listeners.get(e.type) ?? []) f(e); return true; },
    getElementById: (id: string) => (els[id] ??= { textContent: '', innerHTML: '', children: [] }),
  };
  class CustomEvent { type: string; constructor(type: string) { this.type = type; } }
  const WA: any = {
    CITY: 'tallinn', Icon: () => '', Picto: { kind: () => '' },
    UI: { esc: (x: unknown) => String(x), descriptionOr: (x: unknown) => String(x ?? '') },
    R: { kindLabel: (k: string) => k, areaOf: () => '', isFree: () => false, isOff: () => false, dateShort: (k: string) => k, dayName: (k: string) => k, empty: () => '' },
    canonicalId: (id: string) => (id === 'oldbooks' ? 'books' : id),
    catalog: [event], _venuesAll: places,
    read: async () => ({ ok: true, json: async () => rows }),
  };
  const ctx = createContext({ window: { WA }, document, CustomEvent, location: { search }, history: { replaceState() {} }, URLSearchParams, Date: Clock, Intl });
  // The route page answers to its URL; without one, only the walks themselves are under test.
  for (const file of ['when.js', 'hours.js', 'geo.js', 'route.js', ...(search ? ['route-page.js'] : [])]) runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), ctx);
  const settle = () => new Promise(res => setImmediate(res));
  return { WA, els, open: async () => { document.dispatchEvent({ type: 'wa:catalog-ready' }); await settle(); await settle(); } };
}
const walksOf = (r: { stops: { walk: number | null }[] }) => [...r.stops].map(s => s.walk);   // out of the page's realm

test("a stored walk shows the minutes its legs were routed along the streets, and its totals follow", async () => {
  const { WA } = page();
  await WA.Route.loadStored();
  const [row] = WA.Route.upcoming();
  assert.deepEqual(walksOf(row), [null, 9, 7]);
  assert.equal(row.walkMin, 16);
  assert.equal(row.street, 1260);
  assert.equal(WA.Route.lengthText(row), '4 h, 1.3 km on foot');
  // The same stops shared without the stored walk keep the estimate (1.28 × the line + 40 m at 80 m/min).
  const shared = WA.Route.fromURL(STOPS, '2026-10-05');
  assert.deepEqual(walksOf(shared), [null, 6, 8]);
  assert.equal(shared.walkMin, 14);
  assert.equal(shared.street, null);
  assert.equal(WA.Route.fromParam('place:books:1080', 1, [{}]), null);    // validation is unchanged
});

test('a stored leg that no longer matches keeps the estimate', async () => {
  for (const [legs, want] of [
    [[{ walk: 2, metres: 150, routed: true }, { walk: 7, metres: 560, routed: true }], [null, 6, 7]],      // shorter than the straight line
    [[{ walk: 9, metres: 700, routed: true }, { walk: 40, metres: 3200, routed: true }], [null, 9, 8]],    // far beyond the estimate: a stop moved
    [[{ walk: 9, metres: 700 }, { walk: 7.5, metres: 560, routed: true }], [null, 6, 8]],                   // not marked routed; not whole minutes
  ] as [[Leg, Leg], (number | null)[]][]) {
    const { WA } = page('', legs);
    await WA.Route.loadStored();
    assert.deepEqual(walksOf(WA.Route.upcoming()[0]), want, JSON.stringify(legs));
  }
  // A stop redirected to another record since: the legs that touch it keep the estimate.
  const moved = page('', undefined, 'oldbooks');
  await moved.WA.Route.loadStored();
  assert.deepEqual(walksOf(moved.WA.Route.upcoming()[0]), [null, 6, 7]);
});

test('the route page uses the stored walk named by t= when its stops match, and the estimate otherwise', async () => {
  const named = page(`?s=${encodeURIComponent(STOPS)}&d=2026-10-05&t=${encodeURIComponent(ROW_ID)}`);
  await named.open();
  assert.match(named.els['rt-body'].innerHTML, /9 min walk[\s\S]*7 min walk/);
  assert.match(named.els['rt-sub'].innerHTML, /1\.3 km on foot/);
  const plain = page(`?s=${encodeURIComponent(STOPS)}&d=2026-10-05`);
  await plain.open();
  assert.match(plain.els['rt-body'].innerHTML, /6 min walk[\s\S]*8 min walk/);
  const other = page(`?s=${encodeURIComponent(STOPS.replace('pub:1320', 'pub:1325'))}&d=2026-10-05&t=${encodeURIComponent(ROW_ID)}`);
  await other.open();
  assert.match(other.els['rt-body'].innerHTML, /6 min walk[\s\S]*8 min walk/);
});
