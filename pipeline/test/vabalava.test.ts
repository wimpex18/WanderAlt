import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blocks, dateOf, collect, extract } from '../sources/vabalava.ts';
import type { Source } from '../types.ts';

const html = readFileSync(new URL('./fixtures/vabalava.html', import.meta.url), 'utf8');
const source = { id: 'vabalava', city: 'tallinn', kind: 'html', url: 'https://vabalava.ee/mangukava/', handle: '@vabalava', label: 'Vaba Lava', curated: true, active: true,
  config: { shape: 'vabalava', venue_name: 'Vaba Lava', days: 400, venue_map: [['black box|salme|suur saal|väike saal|stuudiosaal', 'Vaba Lava'], ['sakala', 'Sakala 3 Teatrimaja']] } } as unknown as Source;
const now = new Date('2026-10-03T09:00:00Z');

test('every block of the programme gives a poster, its own page, a date, a time and a hall', () => {
  const bs = blocks(html);
  assert.ok(bs.length >= 6);
  for (const b of bs) {
    assert.match(b.url, /^https:\/\/vabalava\.ee\/programm\/[a-z0-9-]+\/?$/);
    assert.match(b.date, /^[A-ZÕÄÖÜ] \d{1,2}\.\d{1,2}$/i);
    assert.ok(b.title && b.hall);
    assert.match(b.image ?? '', /^https:\/\/vabalava\.ee\/wp-content\/uploads\//);
  }
  assert.ok(bs.some(b => b.company), 'a producing company is read');
});

test('the year is the one that makes the weekday right', () => {
  assert.equal(dateOf('T 06.10', now), '2026-10-06');
  assert.equal(dateOf('E 19.10', now), '2026-10-19');
  assert.equal(dateOf('P 03.01', now), '2027-01-03');       // a Sunday in 2027, not in 2026
  assert.equal(dateOf('nonsense', now), null);
});

test('only Tallinn halls are collected, with a real time, an own page and a clean ticket link', async () => {
  const items = await collect(source, now, async () => html);
  assert.ok(items.length >= 3);
  const venues = new Set(items.map(i => (i.payload as { venue: string }).venue));
  assert.deepEqual([...venues].sort(), ['Sakala 3 Teatrimaja', 'Vaba Lava'].filter(v => venues.has(v)));
  const halls = items.map(i => (i.payload as { hall: string }).hall.toLowerCase());
  for (const h of halls) assert.doesNotMatch(h, /tartu|kuressaare|narva|ugala|endla|erm/);
  for (const i of items) {
    assert.match(i.url!, /^https:\/\/vabalava\.ee\/programm\//);
    assert.doesNotMatch(String((i.payload as { ticket: string | null }).ticket ?? ''), /fbclid|utm_|gclid/);
  }
});

test('a block becomes a theatre candidate in Tallinn time with its own image and ticket link', async () => {
  const [item] = await collect(source, now, async () => html);
  const [c] = extract(item, source);
  assert.equal(c.engine, 'vabalava');
  assert.equal(c.kind_hint, 'theatre');
  assert.equal(c.has_time, true);
  assert.match(c.starts_at, /^2026-1\d-\d\dT\d\d:\d\d:00\.000Z$/);
  assert.match(c.image_url ?? '', /^https:\/\/vabalava\.ee\//);
  assert.equal(c.url, item.url);
  assert.ok(c.series_key?.startsWith('vabalava:'));
});
