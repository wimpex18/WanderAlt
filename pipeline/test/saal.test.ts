// Kanuti Gildi SAAL's programme: the fixture is a trimmed copy of https://saal.ee/en/program/ as served
// on 9 October 2026 (the filter, fifteen real rows), read with the live configuration.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rows, categories, collect, extract } from '../sources/saal.ts';
import { loadSources, pageShape } from '../run.ts';
import * as saal from '../sources/saal.ts';

const html = readFileSync(new URL('./fixtures/saal.html', import.meta.url), 'utf8');
const source = loadSources('tallinn').find(s => s.id === 'saal')!;
const tallinn = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Tallinn' }).slice(0, 16);
const early = new Date('2026-08-31T21:00:00Z');     // midnight in Tallinn on 1 September

test('the source is on and read by its own parser', () => {
  assert.equal(source.config.enabled, undefined);
  assert.equal(pageShape(source), saal);
  assert.equal(source.config.venue_id, 'tallinn-kanuti-gildi-saal');
});

test('every row gives a start in UTC, the show\'s own page, its place and prices', () => {
  assert.equal(categories(html).get('12'), 'Performance');
  const rs = rows(html);
  assert.equal(rs.length, 15);
  const girls = rs.find(r => r.title === 'What Are Little Girls Made Of')!;
  assert.equal(girls.start, '2026-09-07T16:30:00.000Z');
  assert.equal(girls.end, '2026-09-07T18:00:00.000Z');
  assert.equal(girls.page, 'https://saal.ee/en/performance/what-are-little-girls-made-of-1957');
  assert.equal(girls.place, 'Kanuti Gildi SAAL');
  assert.deepEqual(girls.prices, ['17 / 22 EUR', 'At the door: 20 / 25 EUR']);
  assert.equal(girls.ticket, 'https://fienta.com/et/tudrukud-189611');
  const residency = rs.find(r => r.title === 'Residency showing')!;
  assert.equal(residency.place, null);                         // the column holds only "Free Admission"
  assert.equal(residency.free, true);
  assert.equal(rs.find(r => r.title === 'SAAL3 vol 5')!.ticket, 'https://fienta.com/et/saal3vol5');   // utm_ dropped
});

test('only Tallinn shows are listed: tours abroad and in Tartu are not', async () => {
  const items = await collect(source, early, async () => html);
  const places = items.map(i => String((i.payload as { place: string | null }).place));
  for (const p of places) assert.doesNotMatch(p, /Riga|Tartu|Ghent/);
  assert.ok(!items.some(i => (i.payload as { title: string }).title === 'CAPRICES'), 'a 2011 row is long past');
  assert.equal(items.length, 10);
  const venues = new Set(items.map(i => extract(i, source)[0].venue_name));
  assert.deepEqual([...venues].sort((a, b) => String(a).localeCompare(String(b))), ['Kanuti Gildi Saal', null, 'Von Krahli Teater'].sort((a, b) => String(a).localeCompare(String(b))));
});

test('a row becomes a candidate in Tallinn time with its hall, prices, ticket and state', async () => {
  const items = await collect(source, early, async () => html);
  const get = (t: string, day?: string) => extract(items.find(i => (i.payload as { title: string }).title === t
    && (!day || tallinn(String((i.payload as { start: string }).start)).startsWith(day)))!, source)[0];

  const drive = get('DRIVE-IN');
  assert.equal(tallinn(drive.starts_at), '2026-09-01 19:00');
  assert.equal(drive.venue_name, null);                        // "Urban space, Tallinn": in town, no one place
  assert.match(drive.description ?? '', /Urban space, Tallinn/);

  const suda = get('SЮDA');
  assert.equal(suda.venue_name, 'Kanuti Gildi Saal');          // one of SAAL's own halls (its floorplans)
  assert.equal(suda.address, 'Pikk 20, Tallinn');
  assert.match(suda.description ?? '', /Püha Vaimu SAAL/);
  assert.equal(suda.flag, 'sold_out');
  assert.equal(suda.ticket_url, null);

  const pantheon = get('Pantheon');
  assert.equal(pantheon.venue_name, 'Von Krahli Teater');
  assert.equal(tallinn(pantheon.starts_at), '2026-10-10 19:00');
  assert.equal(pantheon.price_min, 24);
  assert.equal(pantheon.price_max, 32);
  assert.equal(pantheon.currency, 'EUR');
  assert.equal(pantheon.is_free, false);
  assert.equal(pantheon.kind_hint, 'Theatre');
  assert.equal(pantheon.url, 'https://saal.ee/en/performance/pantheon-1942');
  assert.equal(pantheon.series_key, 'saal:pantheon-1942');

  const residency = get('Residency showing');
  assert.equal(residency.venue_name, 'Kanuti Gildi Saal');     // no place named: SAAL's own
  assert.equal(residency.is_free, true);
  assert.equal(residency.price_min, 0);

  const scrap = get('SCRAPYARD');
  assert.equal(scrap.ticket_url, null);
  assert.equal(scrap.currency, 'EUR');                         // "7 / 10 €"
  assert.match(scrap.description ?? '', /Guest/);
  for (const i of items) {
    const [c] = extract(i, source);
    assert.equal(c.image_url ?? null, null);                   // rows carry no picture
    assert.match(c.url ?? '', /^https:\/\/saal\.ee\/en\/performance\//);
    assert.equal(c.engine, 'saal');
  }
});

test('an empty or changed page gives no items and does not throw', async () => {
  for (const page of ['', '<html><body><div class="programme row"></div></body></html>',
    '<div id="1" type-name="event" start-time="soon"><h3><a href="javascript:alert(1)"><span class="name">X</span></a></h3></div>']) {
    assert.deepEqual(await collect(source, early, async () => page), []);
  }
  assert.deepEqual(extract({ external_id: 'x', payload: {} }, source), []);
});
