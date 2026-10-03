import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Db } from '../db.ts';
import { Places, type Place } from '../places.ts';
import { comparePlaces, duplicatePlaces, pairKey } from '../place-match.ts';
import { checkPlaces, duePlaces, identityQuery, livenessPatch } from '../place-liveness.ts';
import { closureReason, overpass } from '../osm.ts';
import { duplicateEvents, Seen, type StoredEvent } from '../dedupe.ts';

const place = (id: string, over: Partial<Place> = {}): Place => ({
  id, city: 'tallinn', name: 'CatHouse', aliases: ['cathouse'], lat: 59.43385, lng: 24.76219,
  status: 'active', kind: 'club', ...over,
});
const event = (id: string, over: Partial<StoredEvent> = {}): StoredEvent => ({
  id, title: 'Murdja', place_id: 'salme', starts_at: '2026-09-29T16:00:00Z',
  first_seen_at: '2026-09-28T12:00:00Z', status: 'published', has_time: true, ...over,
});

test('same OSM id and retained alternate ids join; conflicting coordinates go to review', () => {
  const a = place('a', { osm_id: 'node/1' });
  assert.equal(comparePlaces(a, place('b', { name: 'Other spelling', osm_ids: ['node/1'] }))?.action, 'merge');
  assert.equal(comparePlaces(a, place('b', { osm_id: 'node/1', lat: 59.44 }))?.action, 'review');
  assert.equal(comparePlaces(a, place('b', { osm_id: 'node/1', status: 'hidden' }))?.action, 'review');
  assert.equal(comparePlaces(a, place('b', { city: 'tartu', osm_id: 'node/1' })), null);
});

test('CatHouse variants join at 4 m despite separate OSM ids; branches and neighbouring galleries do not', () => {
  assert.equal(comparePlaces(place('a', { osm_id: 'node/1' }), place('b', { name: 'CatHouse Club', aliases: [], osm_id: 'node/2', lat: 59.433883 }))?.action, 'merge');
  assert.equal(comparePlaces(place('a'), place('b', { lat: 59.45 })), null);
  assert.equal(comparePlaces(place('a', { name: 'A-Galerii', aliases: [], kind: 'gallery' }),
    place('b', { name: 'Hobusepea Galerii', aliases: [], kind: 'gallery' })), null);
  assert.equal(comparePlaces(place('a', { name: 'Cinema Hall 1', aliases: [] }),
    place('b', { name: 'Cinema Hall 2', aliases: [] }))?.action, 'review');
  assert.equal(comparePlaces(place('a', { address: 'Telliskivi 60a/1' }),
    place('b', { address: 'Telliskivi 60a/8' }))?.action, 'review');
});

test('legal suffixes and address evidence work without coordinates; ambiguous names stay reviewable', () => {
  const a = place('a', { name: 'Eesti Tantsuagentuur', aliases: [], address: 'Hobujaama tänav 12, Tallinn', lat: null, lng: null });
  const b = place('b', { name: 'Eesti Tantsuagentuur SA', aliases: [], address: 'Hobujaama 12, Tallinn', lat: null, lng: null });
  assert.equal(comparePlaces(a, b)?.action, 'merge');
  assert.equal(comparePlaces(a, { ...b, address: null }), null);
  assert.equal(comparePlaces(a, { ...b, status: 'hidden' })?.action, 'review');
});

test('canonical choice is stable and an undone/separate match stays separate', () => {
  const a = place('a', { created_at: '2026-09-27' }), b = place('b', { name: 'CatHouse Club', created_at: '2026-09-28' });
  assert.deepEqual(duplicatePlaces([b, a]), duplicatePlaces([a, b]));
  assert.equal(duplicatePlaces([a, b], new Set([pairKey(a.id, b.id)])).length, 0);
});

test('the store retains name collisions, locates the right branch and avoids creating ambiguous copies', async () => {
  const a = place('a'), b = place('b', { lat: 59.45 });
  const store = new Places([a, b], 'tallinn', 0);
  assert.equal(store.all().length, 2);
  const candidate = { title: 'Show', starts_at: '2026-10-01', has_time: true, engine: 'test', venue_name: 'CatHouse' };
  assert.equal((await store.resolve({ ...candidate, lat: b.lat, lng: b.lng }, false))?.id, 'b');
  assert.equal(await store.resolve(candidate, false), null);
  assert.equal(store.created.length, 0);
});

test('new event spellings are folded by coordinates before creating another venue; manual hidden venues stay hidden', async () => {
  const a = place('a', { website: 'https://cathouse.ee/' });
  const store = new Places([a], 'tallinn', 0);
  const p = await store.resolve({ title: 'Show', starts_at: '2026-10-01', has_time: true, engine: 'test', venue_name: 'CatHouse Club', lat: a.lat, lng: a.lng }, false);
  assert.equal(p?.id, 'a');
  assert.equal(store.created.length, 0);
  const hidden = place('h', { status: 'hidden', address: 'Tartu mnt 17' });
  const other = new Places([hidden], 'tallinn', 0);
  assert.equal((await other.resolve({ title: 'Show', starts_at: '2026-10-01', has_time: true, engine: 'test', venue_name: 'CatHouse', address: 'Tartu maantee 17, Tallinn' }, false))?.status, 'hidden');
});

test('lifecycle checks cover closed/disused/removed venues without inferring closure from opening hours', () => {
  assert.equal(closureReason({ 'disused:tourism': 'gallery' }, 'gallery'), 'disused:tourism=gallery');
  assert.equal(closureReason({ 'abandoned:amenity': 'nightclub' }, 'club'), 'abandoned:amenity=nightclub');
  assert.equal(closureReason({ closed: 'yes' }), 'closed=yes');
  assert.equal(closureReason({ 'disused:shop': 'no' }, 'bookshop'), null);
  assert.equal(closureReason({ 'disused:building': 'yes', shop: 'books' }, 'bookshop'), null);
  assert.equal(closureReason({ opening_hours: 'off' }), null);
});

test('missing or renamed OSM objects do not imply closure; OSM presence never reopens a closed venue', () => {
  const p = place('a', { osm_id: 'node/1' });
  const now = '2026-09-28T12:00:00Z';
  const closed = { type: 'node', id: 1, tags: { name: 'CatHouse', 'disused:amenity': 'nightclub' } };
  const live = { type: 'node', id: 1, tags: { name: 'CatHouse', amenity: 'nightclub' } };
  const shut = livenessPatch(p, [closed], now);
  assert.equal(shut.status, 'closed');
  assert.equal(shut.osm_closed_by_check, true);
  const reappeared = livenessPatch({ ...p, ...shut }, [live], now);
  assert.equal(reappeared.osm_state, 'present');
  assert.equal(reappeared.status, undefined);
  assert.equal(livenessPatch({ ...p, status: 'closed' }, [live], now).status, undefined);
  assert.equal(livenessPatch({ ...p, status: 'hidden' }, [live], now).status, undefined);
  assert.equal(livenessPatch({ ...p, osm_auto_close: false }, [closed], now).status, undefined);
  const missing = livenessPatch(p, [], now);
  assert.equal(missing.osm_state, 'missing');
  assert.equal(missing.status, undefined);
  assert.equal(missing.osm_missing_count, 1);
  assert.equal(livenessPatch(p, [{ ...live, tags: { name: 'New Business', shop: 'clothes' } }], now).osm_state, 'review');
  assert.equal(livenessPatch({ ...p, osm_ids: ['node/1', 'node/2'] }, [closed, { ...live, id: 2 }], now).osm_state, 'present');
  assert.equal(livenessPatch({ ...p, osm_ids: ['node/1', 'node/2'] }, [closed], now).status, undefined);
});

test('closed venue aliases and OSM imports preserve closure; conflicting merges require review', async () => {
  const closed = place('closed', { osm_id: 'node/1', status: 'closed', verification_state: 'closed' });
  const active = place('active', { osm_id: 'node/1' });
  assert.equal(comparePlaces(closed, active)?.action, 'review');
  assert.equal(comparePlaces(closed, { ...active, osm_id: 'node/2', name: 'CatHouse Club' })?.action, 'review');
  const store = new Places([closed], 'tallinn', 0);
  const resolved = await store.resolve({ title: 'Show', starts_at: '2026-10-01', has_time: true, engine: 'test', venue_name: 'CatHouse', lat: closed.lat, lng: closed.lng }, false);
  assert.equal(resolved?.id, 'closed');
  assert.equal(resolved?.status, 'closed');
  assert.equal(resolved?.verification_state, 'closed');
  assert.equal(store.created.length, 0);
});

test('one weekly identity batch covers nodes/ways/relations, validates ids and never checks merged rows', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');
  const rows = Array.from({ length: 70 }, (_, i) => place(`p${i}`, { osm_id: `node/${i + 1}` }));
  assert.equal(duePlaces(rows, now).length, 50);
  assert.equal(duePlaces([place('a', { osm_id: 'node/1', osm_checked_at: '2026-09-27T12:00:00Z' })], now).length, 0);
  assert.equal(duePlaces([place('a', { osm_id: 'node/1', merged_into: 'b' })], now).length, 0);
  const q = identityQuery([place('a', { osm_id: 'node/1', osm_ids: ['node/1', 'way/2', 'relation/3', 'node/1);out;'] })]);
  assert.match(q, /node\(id:1\);way\(id:2\);relation\(id:3\)/);
  assert.equal(q.includes('out;'), false);
});

test('Overpass 429 stops after one call and never writes a closure; partial 200 replies are rejected', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = (async () => { calls++; return new Response('', { status: 429 }); }) as typeof fetch;
    await assert.rejects(checkPlaces([place('a', { osm_id: 'node/1' })]), /429/);
    assert.equal(calls, 1);
    globalThis.fetch = (async () => new Response(JSON.stringify({ elements: [], remark: 'runtime error: timed out', osm3s: { timestamp_osm_base: new Date().toISOString() } }))) as typeof fetch;
    await assert.rejects(overpass('query'), /incomplete/);
  } finally { globalThis.fetch = original; }
});

test('pipeline reads past PostgREST row ceilings and refuses unordered pagination', async () => {
  const original = globalThis.fetch;
  const rows = Array.from({ length: 1100 }, (_, id) => ({ id }));
  try {
    globalThis.fetch = (async (url: string) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      return new Response(JSON.stringify(rows.slice(offset, offset + 500)));
    }) as typeof fetch;
    assert.equal((await new Db('test').all('events?order=id.asc')).length, 1100);
    await assert.rejects(new Db('test').all('events?select=id'), /stable order/);
  } finally { globalThis.fetch = original; }
});

test('stored copies join after venue canonicalisation; different screenings, dates and unlocated events remain separate', () => {
  const a = event('a'), b = event('b');
  assert.equal(duplicateEvents([b, a])[0].canonical.id, 'a');
  assert.equal(duplicateEvents([a, b], new Set(['a|b'])).length, 0);
  assert.equal(duplicateEvents([a, event('b', { starts_at: '2026-09-29T19:00:00Z' })]).length, 0);
  assert.equal(duplicateEvents([a, event('b', { starts_at: '2026-09-30T16:00:00Z' })]).length, 0);
  assert.equal(duplicateEvents([a, event('b', { has_time: false })]).length, 0);
  assert.equal(duplicateEvents([a, event('b', { place_id: null })]).length, 0);
  const seen = new Seen([{ id: 'later', title: 'Murdja', where: 'salme', start: 20_000 }, { id: 'near', title: 'Murdja', where: 'salme', start: 10_000 }]);
  assert.equal(seen.match('Murdja', 'salme', 11_000), 'near');
});

test('screening boilerplate cannot merge different films in the same room', () => {
  const start = Date.parse('2026-10-02T15:00:00Z');
  const seen = new Seen([{ id: 'nightborn', title: 'Screening at Kai Cinema: Nightborn', where: 'kai', start }]);
  assert.equal(seen.match('Screening at Kai Cinema: Sisters', 'kai', start), null);
  assert.equal(seen.match('Special screening at Kai Cinema: Nightborn', 'kai', start), 'nightborn');
  assert.equal(seen.match('Nightborn', 'kai', start), 'nightborn');
  const et = new Seen([{ id: 'oolaps', title: 'Linastus Kai kinos: Öölaps', where: 'kai', start }]);
  assert.equal(et.match('Linastus Kai kinos: Sinu nimi', 'kai', start), null);
  assert.equal(et.match('Öölaps', 'kai', start), 'oolaps');
});

test('one room filed as a bar and as a jazz club joins, and the picked row is the one that stays', () => {
  const bar = place('philly', { name: "Philly Joe's", aliases: ["philly joe's"], kind: 'bar', address: 'Vabaduse väljak 10', lat: 59.4342453, lng: 24.7443919, created_at: '2026-09-27' });
  const club = place('philly-jazz', { name: "Philly Joe's Jazz Club", aliases: [], kind: 'club', address: 'Vabaduse väljak 10, 10146 Tallinn', lat: 59.434303, lng: 24.7441568, created_at: '2026-09-28', picked: true });
  assert.equal(comparePlaces(bar, club)?.action, 'merge');
  const [dup] = duplicatePlaces([bar, club]);
  assert.equal(dup.canonical.id, 'philly-jazz', 'the pick is kept');
  assert.equal(dup.duplicate.id, 'philly');
  // a club and a record shop at one address are still different places
  assert.equal(comparePlaces(bar, place('shop', { name: "Philly Joe's Records", kind: 'record store', address: 'Vabaduse väljak 10', lat: 59.4342, lng: 24.7443 }))?.action === 'merge', false);
});
