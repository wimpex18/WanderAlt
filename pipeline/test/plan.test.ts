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
  const context = createContext({ window: { WA, addEventListener: () => {} }, document: { documentElement: { lang: 'en' }, dispatchEvent: () => {} }, localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } }, CustomEvent: class { type: string; init?: any; constructor(type: string, init?: any) { this.type = type; this.init = init; } }, Date, Intl, JSON });
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

test('an event walk never revisits its before-stop, even when it is the only nearby place', () => {
  const shop = place('thrift', 'thrift', 59.4430, 24.7340);
  const event = ev('workshop', 13 * 60, 59.4400, 24.7340, { kind: 'workshop', endsAt: '2026-10-03T16:00:00Z' });
  const plans = plain(world(10 * 60, [event], [shop]).Route.plan({}));
  const route = plans.find((r: any) => r.stops.some((s: any) => s.id === event.id));
  assert.ok(route, 'keep the valid shop and workshop walk');
  assert.deepEqual(route.stops.map((s: any) => s.id), ['thrift', 'workshop']);
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

test('routes from a venue check the actual arrival time and exclude rooms with no hours', () => {
  const home = place('home', 'bookshop', 59.4343, 24.7442);
  const cinema = place('cinema', 'cinema', 59.4350, 24.7442, { openingHours: null });
  const gallery = place('gallery', 'gallery', 59.4351, 24.7443);
  const books = place('books', 'bookshop', 59.4352, 24.7444);
  const w = world(14 * 60, [], [home, cinema, gallery, books], (p, minute) =>
    p.id === 'cinema' ? 'unknown' : p.id === 'gallery' && minute >= 14 * 60 + 50 ? 'shut' : 'open');
  const route = plain(w.Route.fromHere(home));
  assert.deepEqual(route.stops.map((s: any) => s.id), ['home', 'books']);
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

test('the chosen moods and price are remembered, and anything else is refused', () => {
  const { Moods } = world(12 * 60, [], []);
  assert.deepEqual(plain(Moods.pref()), { moods: [], subs: [], cap: null });
  Moods.setPref({ moods: ['look'], cap: 20 });
  assert.equal(Moods.summary(), 'Art & film · up to €20');
  Moods.setPref({ moods: ['browse', 'listen'], subs: ['records', 'jazz', 'film'], cap: 0 });
  assert.deepEqual(plain(Moods.pref()), { moods: ['browse', 'listen'], subs: ['records', 'jazz'], cap: 0 }, 'a sub of a mood not chosen is dropped');
  assert.equal(Moods.summary(), 'Records, Jazz · free');
  Moods.setPref({ moods: ['look', 'listen', 'make'] });
  assert.equal(Moods.summary(), 'Art & film +2 · any price');
  Moods.setPref({ moods: ['nonsense'], cap: 10 });
  assert.deepEqual(plain(Moods.pref()), { moods: [], subs: [], cap: null }, '€10 is no longer offered');
  assert.equal(Moods.summary(), 'Any mood · any price');
  Moods.setPref({ mood: 'join' });
  assert.deepEqual(plain(Moods.pref()), { moods: ['make'], subs: ['alone'], cap: null }, 'an older single mood still reads');
});

test('a choice is any of its moods, and a mood with subs chosen means those subs only', () => {
  const { Moods } = world(12 * 60, [], []);
  const jazz = { kind: 'gig', tags: ['jazz'] }, rock = { kind: 'gig', tags: ['indie'] }, diy = { kind: 'workshop', tags: ['diy'] }, joke = { kind: 'other', tags: ['standup'] };
  const both = { moods: ['listen', 'look'], subs: [] };
  assert.ok(Moods.wantsEvent(both, jazz) && Moods.wantsEvent(both, joke) && !Moods.wantsEvent(both, diy));
  const onlyJazz = { moods: ['listen'], subs: ['jazz'] };
  assert.ok(Moods.wantsEvent(onlyJazz, jazz) && !Moods.wantsEvent(onlyJazz, rock));
  assert.ok(!Moods.wantsEvent({ moods: ['listen'], subs: ['rock'] }, diy), 'a genre sub reads tags on gigs only');
  assert.ok(Moods.wantsEvent({ moods: [], subs: [] }, diy), 'nothing chosen is anything');
  const shop = { kind: 'record store' }, books = { kind: 'bookshop' };
  assert.ok(Moods.wantsPlace({ moods: ['browse'], subs: ['records'] }, shop) && !Moods.wantsPlace({ moods: ['browse'], subs: ['records'] }, books));
});

test('after midnight a walk never sends you to a shop, and an unfiled place waits for its usual hours', () => {
  const unfiled = day().map(p => ({ ...p, openingHours: null }));
  assert.deepEqual(plain(world(6, [], unfiled).Route.plan({})), [], 'no record shop or gallery at ten past midnight');
  const bars = [place('bar1', 'bar', 59.4362, 24.7448, { openingHours: null }), place('beer', 'taproom', 59.4366, 24.7452)];
  const late = plain(world(6, [], [...unfiled, ...bars], (p) => (p.openingHours ? 'open' : 'unknown')).Route.plan({}));
  assert.ok(late.length >= 1, 'a bar and a taproom still make a late walk');
  for (const r of late) for (const s of r.stops) assert.ok(['bar', 'taproom'].includes(s.kind), `${s.kind} at night`);
  assert.ok(plain(world(14 * 60, [], unfiled, () => 'unknown').Route.plan({})).length >= 1, 'by day an unfiled shop can still be tried');
  const cinema = [place('kino', 'cinema', 59.4362, 24.7448, { openingHours: null }), place('books', 'bookshop', 59.4364, 24.7450)];
  for (const r of plain(world(14 * 60, [], cinema, (p) => (p.openingHours ? 'open' : 'unknown')).Route.plan({}))) assert.ok(!r.stops.some((s: any) => s.id === 'kino'), 'a cinema with no hours is no stop on its own');
});
