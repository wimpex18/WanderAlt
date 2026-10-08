import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidatesForDay, shortlist, finalise, cleanText, ruleTitle, modelBrief, clockText } from '../routes.ts';
import type { RouteEvent, RoutePlace } from '../routes.ts';

const NOW = Date.parse('2026-10-02T11:00:00Z');   // 14:00 in Tallinn
const place = (id: string, kind: string, lat: number, extra: Partial<RoutePlace> = {}): RoutePlace =>
  ({ id, name: id, kind, lat, lng: 24.734, opening_hours: 'Mo-Su 10:00-23:00', pick_note: null, neighborhood: 'Kalamaja', ...extra });
const host = place('host', 'theatre', 59.44);
const shop = place('shop', 'record store', 59.443);
const bar = place('bar', 'bar', 59.437);
const ev = (id: string, hh: string, extra: Partial<RouteEvent> = {}): RouteEvent =>
  ({ id, title: id, title_en: null, kind: 'theatre', starts_at: `2026-10-02T${hh}:00+03:00`, ends_at: null, has_time: true, place_id: 'host', flag: null, ...extra });
const find = (events: RouteEvent[], picked: RoutePlace[]) => candidatesForDay('2026-10-02', events, id => (id === 'host' ? host : undefined), picked, NOW);

test('a picked place before and a bar after make an evening around one listing', () => {
  const [c] = find([ev('e1', '19:00')], [shop, bar]);
  assert.deepEqual(c.stops.map(s => `${s.type}:${s.id}`), ['place:shop', 'event:e1', 'place:bar']);
  assert.ok(c.stops[0].minute + 30 <= c.stops[1].minute);
  assert.equal(c.area, 'Kalamaja');
});

test('shut places, cancelled listings, undated listings and past starts make nothing', () => {
  assert.equal(find([ev('e1', '19:00')], [{ ...shop, opening_hours: 'Mo-Su 10:00-12:00' }, { ...bar, opening_hours: 'Mo-Su 10:00-12:00' }]).length, 0);
  assert.equal(find([ev('e1', '19:00', { flag: 'cancelled' })], [shop, bar]).length, 0);
  assert.equal(find([ev('e1', '19:00', { flag: 'sold_out' })], [shop, bar]).length, 0);
  assert.equal(find([ev('e1', '19:00', { has_time: false })], [shop, bar]).length, 0);
  assert.equal(find([ev('e1', '14:10')], [shop, bar]).length, 0);
  assert.equal(find([ev('e1', '19:00', { kind: 'market' })], [shop, bar]).length, 0);
});

test('pipeline walks honour a stated event end, including events longer than three hours', () => {
  const [route] = find([ev('long', '18:00', {ends_at:'2026-10-02T22:00:00+03:00'})], [shop,bar]);
  assert.ok(route.stops.find(s => s.id === 'bar')!.minute >= 22 * 60);
});

test('unfiled hours keep a place in; the shortlist never leans on one place more than twice', () => {
  const [c] = find([ev('e1', '19:00')], [{ ...shop, opening_hours: null }]);
  assert.deepEqual(c.stops.map(s => s.id), ['shop', 'e1']);
  const many = [1, 2, 3, 4].map(i => ({ id: `d:e${i}`, day: 'd', area: '', score: 5 - i, walkMin: 5, stops: [{ type: 'place' as const, id: 'shop', minute: 1000 }, { type: 'event' as const, id: `e${i}`, minute: 1100 }] }));
  assert.deepEqual(shortlist(many).map(c => c.id), ['d:e1', 'd:e2']);
});

test("a model can only choose real routes, and its words must keep the house voice", () => {
  const cands = [1, 2, 3].map(i => ({ id: `d:e${i}`, day: 'd', area: 'Kalamaja', score: 5 - i, walkMin: 5, stops: [{ type: 'place' as const, id: `p${i}`, minute: 1000 }, { type: 'event' as const, id: `e${i}`, minute: 1100 }] }));
  const title = (c: { id: string }) => `rule ${c.id}`;
  const rows = finalise('d', 'tallinn', cands, { routes: [
    { id: 'invented', title: 'Nope', blurb: 'Nope' },
    { id: 'd:e2', title: 'Records, then a play', blurb: 'The shop is a short walk from the theatre.' },
    { id: 'd:e2', title: 'Duplicate', blurb: 'Again' },
    { id: 'd:e3', title: 'Great night out!', blurb: 'Discover the best vibes in town.' },
  ] }, title, 'model');
  assert.deepEqual(rows.map(r => r.id), ['tallinn:d:e2', 'tallinn:d:e3', 'tallinn:d:e1']);
  assert.equal(rows[0].title, 'Records, then a play');
  assert.equal(rows[0].blurb, 'The shop is a short walk from the theatre.');
  assert.equal(rows[1].title, 'rule d:e3');          // an exclamation mark is not our voice
  assert.equal(rows[1].blurb, null);                  // neither is "discover" or "vibes"
  assert.equal(rows[2].engine, 'rules');
  const early = finalise('d', 'tallinn', cands, { routes: [{ id: 'd:e1', title: 'Records, a play, a late bar', blurb: 'A short walk.' }] }, title, 'model', 1);
  assert.equal(early[0].title, 'rule d:e1');          // the last stop is before nine, so nothing here is late
  assert.equal(finalise('d', 'tallinn', cands, null, title, 'model').length, 3);
  assert.equal(finalise('d', 'tallinn', cands, 'garbage', title, 'model', 2).length, 2);
});

test('text from a model is cut to what we would print', () => {
  assert.equal(cleanText('  Two   stops ', 20), 'Two stops');
  for (const bad of ['', 'ab', 'x'.repeat(61), 'Visit @terminal', 'See https://x.example', '<b>hi</b>', 'Discover Tallinn']) assert.equal(cleanText(bad, 60), null, bad);
  assert.equal(clockText(24 * 60 + 20), '00:20');
});

test('the rule title reads like the one in the page, and the brief carries only what we hold', () => {
  const [c] = find([ev('e1', '19:00')], [shop, bar]);
  const kinds = new Map<string, string | null>([['place:shop', 'record store'], ['event:e1', 'theatre'], ['place:bar', 'bar']]);
  assert.match(ruleTitle(c, kinds), /^Records, a stage, a (late )?drink$/);
  const brief = JSON.parse(modelBrief('2026-10-02', [c], { label: s => s.id, kind: s => kinds.get(`${s.type}:${s.id}`) ?? null, note: () => null }));
  assert.deepEqual(Object.keys(brief), ['day', 'candidates']);
  assert.deepEqual(Object.keys(brief.candidates[0].stops[0]), ['time', 'type', 'name', 'kind', 'note']);
});
