import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// route.js is a browser script: give it a small world and ask for an evening.
type P = { id: string; name: string; kind: string; lat: number; lng: number; picked: boolean; openingHours: string | null; pickNote?: string };
function world(now: number, events: any[], places: P[], open: (p: P, minute: number) => 'open' | 'shut' | 'unknown' = () => 'open') {
  const metres = (a: any, b: any) => {
    const r = 6371000, k = Math.PI / 180, dLat = (b.lat - a.lat) * k, dLng = (b.lng - a.lng) * k;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLng / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(x));
  };
  const byId = new Map<string, P>(places.map(p => [p.id, p]));
  let askedMinute = 0;
  const WA: any = {
    UI: { esc: (s: any) => String(s) },
    Icon: () => '',
    when: { isTonight: () => true },
    Hours: {
      cityNow: () => ({ minutes: now }),
      // `state(raw, at)`: ask the fixture about the minute the route is being tried at.
      state: (raw: string, at: Date) => { askedMinute = now + Math.round((at.getTime() - Date.now()) / 60000); const p = [...byId.values()].find(x => x.openingHours === raw)!; const o = open(p, askedMinute); return o === 'unknown' ? { known: false } : { known: true, open: o === 'open' }; },
      clock: (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
    },
    Geo: {
      startMinutes: (e: any) => e.min ?? null,
      coordsFor: (x: any) => (x && x.lat != null ? { lat: x.lat, lng: x.lng } : null),
      distanceTo: (a: any, from: any) => metres(a, from),
      walkMinutes: (m: number) => (m == null ? null : Math.max(1, Math.round(m / 80))),
      currentLoc: () => null, format: (m: number) => `${Math.round(m)} m`,
    },
    R: { live: () => events, places: () => places, isOff: () => false, isLive: () => false, areaOf: () => 'Kalamaja', kindLabel: (k: string) => k, isFree: () => false, interests: { matches: () => false } },
    venueFor: (e: any) => byId.get(e.venueId) || null,
    _venuesAll: places, catalog: events,
  };
  const context = createContext({ window: { WA }, Date, Intl });
  runInContext(readFileSync(new URL('../../route.js', import.meta.url), 'utf8'), context);
  return WA.Route;
}
const plain = (x: any) => JSON.parse(JSON.stringify(x));
const eq = (a: any, b: any) => assert.deepEqual(plain(a), plain(b));
const place = (id: string, kind: string, lat: number, lng: number, extra: Partial<P> = {}): P => ({ id, name: id, kind, lat, lng, picked: true, openingHours: 'x', ...extra });
const ev = (id: string, min: number, lat: number, lng: number, extra: any = {}) => ({ id, title: id, kind: 'gig', min, lat, lng, startsAt: '2026-10-02T15:00:00Z', ...extra });

test('an evening is a picked place before a timed listing and a bar after it, in that order', () => {
  const Route = world(17 * 60, [ev('e1', 19 * 60, 59.4400, 24.7340)],
    [place('shop', 'record store', 59.4402, 24.7334), place('bar', 'bar', 59.4406, 24.7340), place('far', 'bookshop', 59.4700, 24.8000)]);
  const r = Route.compose();
  eq(r.stops.map((s: any) => s.id), ['shop', 'e1', 'bar']);
  eq(r.stops.map((s: any) => s.type), ['place', 'event', 'place']);
  assert.ok(r.stops[0].minute < 19 * 60 && r.stops[2].minute > 19 * 60);
  assert.match(r.title, /^Records, a gig, a (late )?drink$/);
});

test('a place that is shut when you would be there is left out, an unknown one is kept', () => {
  const places = [place('shut', 'record store', 59.4402, 24.7334), place('unsure', 'bookshop', 59.4401, 24.7336, { openingHours: null })];
  const Route = world(17 * 60, [ev('e1', 19 * 60, 59.4400, 24.7340)], places, (p) => (p.id === 'shut' ? 'shut' : 'open'));
  const r = Route.compose();
  eq(r.stops.map((s: any) => s.id), ['unsure', 'e1']);
  assert.equal(r.stops[0].hours, 'unknown');
});

test('only picked places and a listing that has not started can make a route', () => {
  assert.equal(world(17 * 60, [ev('e1', 19 * 60, 59.44, 24.734)], [place('shop', 'record store', 59.4402, 24.7334, { picked: false })]).compose(), null);
  assert.equal(world(17 * 60, [ev('e1', 17 * 60 + 5, 59.44, 24.734)], [place('shop', 'record store', 59.4402, 24.7334)]).compose(), null);
  assert.equal(world(17 * 60, [ev('e1', 19 * 60, 59.44, 24.734)], [place('far', 'record store', 59.5, 24.9)]).compose(), null);
});

test("the listing's own venue is never its own before or after", () => {
  const Route = world(17 * 60, [ev('e1', 19 * 60, 59.4400, 24.7340, { venueId: 'host' })], [place('host', 'bar', 59.4400, 24.7340), place('shop', 'thrift', 59.4401, 24.7336)]);
  eq(Route.compose().stops.map((s: any) => s.id), ['shop', 'e1']);
});

test('a route travels in a URL and comes back the same; bad input is refused', () => {
  const Route = world(17 * 60, [ev('e1', 19 * 60, 59.4400, 24.7340)], [place('shop', 'record store', 59.4402, 24.7334), place('bar', 'bar', 59.4406, 24.7340)]);
  const r = Route.compose();
  const again = Route.fromParam(Route.param(r));
  eq(again.stops.map((s: any) => [s.id, s.minute]), r.stops.map((s: any) => [s.id, s.minute]));
  for (const bad of ['', 'place:shop:1000', 'place:nope:1000,event:e1:1140', 'drop:shop:1,event:e1:2', 'place:shop;x:1000,event:e1:1140']) assert.equal(Route.fromParam(bad), null, bad);
  assert.match(Route.mapsUrl(r), /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&travelmode=walking&destination=[\d.,]+&waypoints=[\d.,%7C]+$/);
});
