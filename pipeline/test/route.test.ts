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
    R: { live: () => events, places: () => places, isOff: () => false, isLive: () => false, areaOf: () => 'Kalamaja', kindLabel: (k: string) => k, isFree: () => false, withinTicketCap: () => true, interests: { matches: () => false } },
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
    [place('shop', 'record store', 59.4430, 24.7340), place('bar', 'bar', 59.4370, 24.7340), place('far', 'bookshop', 59.4700, 24.8000)]);
  const r = Route.compose();
  eq(r.stops.map((s: any) => s.id), ['shop', 'e1', 'bar']);
  eq(r.stops.map((s: any) => s.type), ['place', 'event', 'place']);
  assert.ok(r.stops[0].minute < 19 * 60 && r.stops[2].minute > 19 * 60);
  assert.match(r.title, /^Records, a gig, a (late )?drink$/);
});

test('a place that is shut when you would be there is left out, an unknown one is kept', () => {
  const places = [place('shut', 'record store', 59.4430, 24.7340), place('unsure', 'bookshop', 59.4435, 24.7345, { openingHours: null })];
  const Route = world(17 * 60, [ev('e1', 19 * 60, 59.4400, 24.7340)], places, (p) => (p.id === 'shut' ? 'shut' : 'open'));
  const r = Route.compose();
  eq(r.stops.map((s: any) => s.id), ['unsure', 'e1']);
  assert.equal(r.stops[0].hours, 'unknown');
});

test('only picked places and a listing that has not started can make a route', () => {
  assert.equal(world(17 * 60, [ev('e1', 19 * 60, 59.44, 24.734)], [place('shop', 'record store', 59.4430, 24.7340, { picked: false })]).compose(), null);
  assert.equal(world(17 * 60, [ev('e1', 17 * 60 + 5, 59.44, 24.734)], [place('shop', 'record store', 59.4430, 24.7340)]).compose(), null);
  assert.equal(world(17 * 60, [ev('e1', 19 * 60, 59.44, 24.734)], [place('far', 'record store', 59.5, 24.9)]).compose(), null);
});

test("the listing's own venue is never its own before or after", () => {
  const Route = world(17 * 60, [ev('e1', 19 * 60, 59.4400, 24.7340, { venueId: 'host' })], [place('host', 'bar', 59.4400, 24.7340), place('shop', 'thrift', 59.4430, 24.7340)]);
  eq(Route.compose().stops.map((s: any) => s.id), ['shop', 'e1']);
});

test('a route travels in a URL and comes back the same; bad input is refused', () => {
  const Route = world(17 * 60, [ev('e1', 19 * 60, 59.4400, 24.7340)], [place('shop', 'record store', 59.4430, 24.7340), place('bar', 'bar', 59.4370, 24.7340)]);
  const r = Route.compose();
  const again = Route.fromParam(Route.param(r));
  eq(again.stops.map((s: any) => [s.id, s.minute]), r.stops.map((s: any) => [s.id, s.minute]));
  for (const bad of ['', 'place:shop:1000', 'place:nope:1000,event:e1:1140', 'drop:shop:1,event:e1:2', 'place:shop;x:1000,event:e1:1140']) assert.equal(Route.fromParam(bad), null, bad);
  assert.match(Route.mapsUrl(r), /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&travelmode=walking&destination=[\d.,]+&waypoints=[\d.,%7C]+$/);
});

test('a place before the listing is worth at least half an hour', () => {
  // Now is 18:40, the listing starts at 19:00 and the shop is a 3 minute walk away: no time to browse.
  const Route = world(18 * 60 + 40, [ev('e1', 19 * 60, 59.4400, 24.7340)], [place('shop', 'record store', 59.4430, 24.7340), place('bar', 'bar', 59.4370, 24.7340)]);
  eq(Route.compose().stops.map((s: any) => s.id), ['e1', 'bar']);
});

test('a bar waits until four, a club until nine, and nothing is the same building', () => {
  // The listing ends about 17:00; a bar is fine after four but a club is not.
  const early = world(12 * 60, [ev('e1', 15 * 60, 59.4400, 24.7340)], [place('club', 'club', 59.4370, 24.7340), place('bar', 'bar', 59.4360, 24.7340)]);
  eq(early.compose().stops.map((s: any) => s.id), ['e1', 'bar']);
  const lateNight = world(12 * 60, [ev('e1', 20 * 60, 59.4400, 24.7340)], [place('club', 'club', 59.4370, 24.7340)]);
  eq(lateNight.compose().stops.map((s: any) => s.id), ['e1', 'club']);
  const sameBuilding = world(12 * 60, [ev('e1', 19 * 60, 59.4400, 24.7340)], [place('annex', 'bar', 59.44005, 24.73402)]);
  assert.equal(sameBuilding.compose(), null);
});

test('a walk never proposes a sold-out show; a stated long event end keeps the following stop after it', () => {
  const places = [place('shop', 'record store', 59.443, 24.734), place('bar', 'bar', 59.437, 24.734)];
  assert.equal(world(17 * 60, [ev('full', 19 * 60, 59.44, 24.734, { flag:'sold_out' })], places).compose(), null);
  const Route = world(17 * 60, [ev('long', 18 * 60, 59.44, 24.734, { endsAt:'2026-10-02T19:00:00Z' })], places);
  const route = Route.compose();
  assert.ok(route.stops.find((s: any) => s.id === 'bar').minute >= 22 * 60, 'four-hour event really ends at 22:00');
  assert.equal(Route.lengthText({ stops:[{minute:0},{minute:185}], metres:0 }), '3 h 5 min');
});

test('directions include every stop or are unavailable; invalid coordinates never become a partial route', () => {
  const Route = world(17 * 60, [], []);
  const stops = [{lat:59.44,lng:24.73},{lat:59.45,lng:24.74},{lat:59.46,lng:24.75}];
  assert.match(Route.mapsUrl({stops}), /59.440000,24.730000%7C59.450000,24.740000/);
  for (const bad of [{lat:null,lng:null},{lat:NaN,lng:24},{lat:91,lng:24}]) {
    assert.equal(Route.mapsUrl({stops:[stops[0],bad,stops[2]]}), '');
  }
});
