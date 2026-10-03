import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// route.js and moods.js are browser scripts: give them a small world and ask for the next few hours.
type P = { id: string; name: string; kind: string; lat: number; lng: number; picked: boolean; openingHours: string | null; pickNote?: string };
const metres = (a: any, b: any) => {
  const r = 6371000, k = Math.PI / 180, dLat = (b.lat - a.lat) * k, dLng = (b.lng - a.lng) * k;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
};
function world(now: number, events: any[], places: P[], open: (p: P, minute: number) => 'open' | 'shut' | 'unknown' = () => 'open') {
  const byId = new Map<string, P>(places.map(p => [p.id, p]));
  const store: Record<string, string> = {};
  const WA: any = {
    CITY: 'tallinn',
    UI: { esc: (s: any) => String(s) },
    Icon: () => '',
    when: { isTonight: () => true },
    Hours: {
      cityNow: () => ({ minutes: now }),
      state: (raw: string, at: Date) => {
        const minute = now + Math.round((at.getTime() - Date.now()) / 60000);
        const p = [...byId.values()].find(x => x.openingHours === raw)!;
        const o = open(p, minute);
        return o === 'unknown' ? { known: false } : { known: true, open: o === 'open' };
      },
      clock: (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
    },
    Geo: {
      startMinutes: (e: any) => e.min ?? null,
      coordsFor: (x: any) => (x && x.lat != null ? { lat: x.lat, lng: x.lng } : null),
      distanceTo: (a: any, from: any) => metres(a, from),
      walkMinutes: (m: number) => (m == null ? null : Math.max(1, Math.round(m / 80))),
      currentLoc: () => null, format: (m: number) => `${Math.round(m)} m`,
    },
    R: { live: () => events, places: () => places, isOff: () => false, isLive: () => false, areaOf: () => 'Old Town', kindLabel: (k: string) => k, isFree: (e: any) => e.isFree === true || e.priceMin === 0, interests: { matches: () => false } },
    venueFor: (e: any) => byId.get(e.venueId) || null,
    _venuesAll: places, catalog: events,
  };
  const context = createContext({ window: { WA }, document: { documentElement: { lang: 'en' }, dispatchEvent: () => {} }, localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } }, CustomEvent: class { type: string; init?: any; constructor(type: string, init?: any) { this.type = type; this.init = init; } }, Date, Intl, JSON });
  runInContext(readFileSync(new URL('../../moods.js', import.meta.url), 'utf8'), context);
  runInContext(readFileSync(new URL('../../route.js', import.meta.url), 'utf8'), context);
  return WA;
}
const plain = (x: any) => JSON.parse(JSON.stringify(x));
const place = (id: string, kind: string, lat: number, lng: number, extra: Partial<P> = {}): P => ({ id, name: id, kind, lat, lng, picked: true, openingHours: `hours-${id}`, ...extra });
const ev = (id: string, min: number, lat: number, lng: number, extra: any = {}) => ({ id, title: id, kind: 'gig', min, lat, lng, startsAt: '2026-10-03T15:00:00Z', ...extra });
// Four picked places a few minutes apart, of different kinds: a daytime walk.
const day = () => [place('books', 'bookshop', 59.4362, 24.7448), place('vinyl', 'record store', 59.4356, 24.7478), place('thrift', 'thrift', 59.4373, 24.7492), place('gallery', 'gallery', 59.4395, 24.7450)];

test('with nothing on soon, the next few hours are a few picked places on foot', () => {
  const { Route } = world(14 * 60, [], day());
  const plans = plain(Route.plan({}));
  assert.ok(plans.length >= 1);
  assert.ok(plans[0].stops.length >= 2 && plans[0].stops.every((s: any) => s.type === 'place'));
  assert.ok(plans[0].stops[0].minute >= 14 * 60 + 10, 'starts after now');
  assert.equal(new Set(plans[0].stops.map((s: any) => s.id)).size, plans[0].stops.length, 'no place twice');
  assert.match(plans[0].title, /^(Records|Books|Thrift|A gallery)(, [a-z ]+){1,2}$/);
});

test('a place that is shut when you would arrive is left out of a walk', () => {
  const { Route } = world(14 * 60, [], day(), (p) => (p.id === 'vinyl' ? 'shut' : 'open'));
  for (const r of plain(Route.plan({}))) assert.ok(!r.stops.some((s: any) => s.id === 'vinyl'));
});

test('a walk needs two picked places a short way apart', () => {
  assert.deepEqual(plain(world(14 * 60, [], [place('only', 'bookshop', 59.4362, 24.7448)]).Route.plan({})), []);
  assert.deepEqual(plain(world(14 * 60, [], [place('a', 'bookshop', 59.4362, 24.7448), place('b', 'thrift', 59.5, 24.9)]).Route.plan({})), []);
});

test('by day a listing that starts soon leads, with a place after it before five', () => {
  const { Route } = world(13 * 60, [ev('film', 14 * 60 + 30, 59.4400, 24.7340, { kind: 'film' })], [...day(), place('hall', 'cinema', 59.4402, 24.7342)]);
  const first = plain(Route.plan({}))[0];
  assert.ok(first.stops.some((s: any) => s.id === 'film'));
});

test('tickets are the cheapest price of each listing; an unknown price is said, never counted as free', () => {
  const places = [place('shop', 'record store', 59.4430, 24.7340), place('bar', 'bar', 59.4370, 24.7340)];
  const known = world(17 * 60, [ev('e1', 19 * 60, 59.4400, 24.7340, { priceMin: 9 })], places).Route;
  const r1 = plain(known.plan({}))[0];
  assert.equal(known.costText(r1), 'tickets from €9');
  const unknown = world(17 * 60, [ev('e1', 19 * 60, 59.4400, 24.7340, { priceMin: null })], places).Route;
  assert.equal(unknown.costText(plain(unknown.plan({}))[0]), 'price not listed');
  const free = world(17 * 60, [ev('e1', 19 * 60, 59.4400, 24.7340, { isFree: true })], places).Route;
  assert.equal(free.costText(plain(free.plan({}))[0]), 'free');
  const half = world(17 * 60, [ev('e1', 19 * 60, 59.4400, 24.7340, { priceMin: 9.5 })], places).Route;
  assert.equal(half.costText(plain(half.plan({}))[0]), 'tickets from €9.50');
});

test('a price limit leaves out a listing above it and keeps one with no price', () => {
  const places = [place('shop', 'record store', 59.4430, 24.7340), place('bar', 'bar', 59.4370, 24.7340)];
  const evs = [ev('dear', 19 * 60, 59.4400, 24.7340, { priceMin: 30 })];
  assert.ok(!plain(world(17 * 60, evs, places).Route.plan({ cap: 10 })).some((r: any) => r.stops.some((s: any) => s.id === 'dear')));
  const unlisted = [ev('maybe', 19 * 60, 59.4400, 24.7340, { priceMin: null })];
  assert.ok(plain(world(17 * 60, unlisted, places).Route.plan({ cap: 10 })).some((r: any) => r.stops.some((s: any) => s.id === 'maybe')));
});

test('a mood keeps only routes that hold a stop of it', () => {
  const { Route } = world(14 * 60, [], day());
  for (const r of plain(Route.plan({ mood: 'browse' }))) assert.ok(r.stops.some((s: any) => ['bookshop', 'record store', 'thrift'].includes(s.kind)));
  for (const r of plain(Route.plan({ mood: 'listen' }))) assert.ok(r.stops.some((s: any) => ['bar', 'club'].includes(s.kind) || s.kind === 'gig'));
});

test('nothing more than eight routes, and no two the same', () => {
  const many = Array.from({ length: 10 }, (_, i) => place(`p${i}`, ['bookshop', 'thrift', 'record store', 'gallery'][i % 4], 59.4362 + i * 0.0004, 24.7448 + (i % 3) * 0.0004));
  const plans = plain(world(14 * 60, [], many).Route.plan({}));
  assert.ok(plans.length <= 8);
  const keys = plans.map((r: any) => r.stops.map((s: any) => s.id).join('>'));
  assert.equal(new Set(keys).size, keys.length);
});

test('after this: picked places close by, one per mood, never the place itself, shut ones left out', () => {
  const home = place('home', 'club', 59.4343, 24.7442);
  const places = [home, place('film', 'cinema', 59.4350, 24.7442), place('books', 'bookshop', 59.4362, 24.7448), place('bar', 'bar', 59.4396, 24.7468), place('shut', 'record store', 59.4344, 24.7443), place('far', 'thrift', 59.46, 24.80)];
  const w = world(14 * 60, [], places, (p) => (p.id === 'shut' ? 'shut' : 'open'));
  const next = plain(w.Route.nextFrom(home, { limit: 3, max: 10 }));
  const ids = next.map((n: any) => n.v.id);
  assert.ok(!ids.includes('home') && !ids.includes('shut') && !ids.includes('far'));
  assert.deepEqual(ids.slice().sort(), ['bar', 'books', 'film']);
  assert.ok(next.every((n: any) => n.w <= 10));
  assert.deepEqual(next.map((n: any) => n.w), next.map((n: any) => n.w).slice().sort((a: number, b: number) => a - b));
  const route = plain(w.Route.fromHere(home));
  assert.equal(route.stops[0].id, 'home');
  assert.ok(route.stops.length >= 2);
});

test('a mood shows only when the city has three behind it, and only at the hours it suits', () => {
  const places = [place('c1', 'club', 59.43, 24.74), place('c2', 'club', 59.431, 24.741), place('c3', 'club', 59.432, 24.742)];
  const clubs = Array.from({ length: 3 }, (_, i) => ({ id: `n${i}`, kind: 'club', title: `n${i}`, lat: 59.43, lng: 24.74 }));
  const noon = world(12 * 60, clubs, places).Moods.available().map((m: any) => m.id);
  assert.ok(!noon.includes('dance'), 'no dance floor at noon');
  const night = world(22 * 60, clubs, places).Moods.available().map((m: any) => m.id);
  assert.ok(night.includes('dance'));
  const thin = world(22 * 60, clubs.slice(0, 2), []).Moods.available().map((m: any) => m.id);
  assert.ok(!thin.includes('dance'), 'two is not enough');
});

test('the chosen mood and price are remembered, and anything else is refused', () => {
  const { Moods } = world(12 * 60, [], []);
  assert.deepEqual(plain(Moods.pref()), { mood: '', cap: null });
  Moods.setPref({ mood: 'look', cap: 10 });
  assert.equal(Moods.summary(), 'Look · up to €10');
  Moods.setPref({ mood: 'nonsense', cap: 7 });
  assert.deepEqual(plain(Moods.pref()), { mood: '', cap: null });
  assert.equal(Moods.summary(), 'Any mood · any price');
  Moods.setPref({ mood: '', cap: 0 });
  assert.equal(Moods.summary(), 'Any mood · free');
});
