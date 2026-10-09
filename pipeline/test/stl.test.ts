// Sõltumatu Tantsu Lava's schedule: the fixture is a trimmed copy of https://www.stl.ee/ajakava as served
// on 9 October 2026 (its __NEXT_DATA__ with thirteen real nodes), read with the live configuration.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shows, wall, collect, extract } from '../sources/stl.ts';
import { loadSources, pageShape } from '../run.ts';
import * as stl from '../sources/stl.ts';

const html = readFileSync(new URL('./fixtures/stl.html', import.meta.url), 'utf8');
const live = loadSources('tallinn').find(s => s.id === 'stl')!;
const source = { ...live, config: { ...live.config, days: 200 } };   // the fixture reaches into April 2027
const now = new Date('2026-10-09T06:00:00Z');
const tallinn = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Tallinn' }).slice(0, 16);
const titled = async (re: RegExp) => (await collect(source, now, async () => html)).filter(i => re.test(String(i.payload.title))).map(i => extract(i, source)[0]);

test('the source names the venue as it names itself, with our place id', () => {
  assert.equal(live.kind, 'html');
  assert.equal(live.url, 'https://www.stl.ee/ajakava');
  assert.equal(live.handle, '@soltumatutantsulava');
  assert.equal(live.config.venue_name, 'Sõltumatu Tantsu Lava');
  assert.equal(live.config.venue_id, 'tallinn-soltumatu-tantsu-lava-stl');
  assert.equal(pageShape(live), stl);
});

test('dates and times as the page writes them', () => {
  assert.deepEqual(wall('05.11.2026', '19:00'), { day: '2026-11-05', time: '19:00' });
  assert.deepEqual(wall('26.03.2024', '13.15'), { day: '2024-03-26', time: '13:15' });
  assert.deepEqual(wall('24.11.2026', '9:30'), { day: '2026-11-24', time: '09:30' });
  assert.deepEqual(wall('31.12.2026', null), { day: '2026-12-31', time: null });
  assert.equal(wall(null, '19:00'), null);
  assert.equal(wall('2026-11-05', '19:00'), null);
});

test('only Tallinn shows, open to the public, are listed', async () => {
  const items = await collect(source, now, async () => html);
  const where = items.map(i => `${i.payload.venue} | ${i.payload.hall ?? ''}`);
  for (const w of where) assert.doesNotMatch(w, /Haapsalu|Rapla|Tartu|kooligrupp/i);
  const titles = new Set(items.map(i => String(i.payload.title)));
  assert.ok(!titles.has('Sõltumatu Tantsu Raamat'), 'a book order is not an event');
  assert.ok(!titles.has('2+2=22'), 'performances for school groups are not listed');
  assert.ok(titles.has('Mis sul viga on?'));
});

test('an occurrence becomes a candidate in Tallinn time with its own page and ticket', async () => {
  const [first] = await titled(/^Mis sul viga on\?$/);
  assert.equal(tallinn(first.starts_at), '2026-11-11 13:00');
  assert.equal(first.has_time, true);
  assert.equal(first.venue_name, 'Sõltumatu Tantsu Lava');
  assert.equal(first.address, 'Telliskivi 60a/9, Tallinn');
  assert.equal(first.url, 'https://www.stl.ee/lavastused/zuga-uhendatud-tantsijate-uuslavastus/');
  assert.match(first.ticket_url ?? '', /^https:\/\/fienta\.com\//);
  assert.equal(first.series_key, 'stl:zuga-uhendatud-tantsijate-uuslavastus');
  assert.equal(first.kind_hint, 'dance');
  assert.equal(first.image_url ?? null, null);                 // the schedule carries no pictures
  assert.equal(first.description, 'Zuga Ühendatud Tantsijad');
  assert.equal(first.engine, 'stl');
});

test('partner stages in Tallinn keep their own place; a night past midnight ends the next day', async () => {
  const [paavli] = await titled(/^STF 2026: Ayano Yokoyama/);
  assert.equal(paavli.venue_name, 'Paavli Kultuurivabrik');
  assert.equal(tallinn(paavli.starts_at), '2026-10-09 21:00');
  assert.equal(tallinn(paavli.ends_at!), '2026-10-10 04:00');
  const unearth = await titled(/^STF 2026: Unearth$/);
  assert.ok(unearth.length >= 3);
  for (const u of unearth) assert.equal(u.venue_name, 'Kai Art Center');
  const [climb] = await titled(/^Kõrguse kutse$/);
  assert.equal(climb.venue_name, 'Ronimisministeerium');      // the page's own words: "Ronimisministeerium (Suur-Paala 39, Tallinn)"
  assert.equal(climb.address, 'Suur-Paala 39, Tallinn');
  const [spa] = await titled(/^STF 2026: Femme Physique$/);
  assert.equal(spa.venue_name, null);                          // in Tallinn, no place of ours to name
  assert.match(spa.description ?? '', /Meriton/);
  const [cafe] = await titled(/^STF 2026: Koreokohvik$/);
  assert.equal(cafe.venue_name, 'Von Krahli Teater');
  assert.match(cafe.description ?? '', /Von Krahli kohvik/);
  assert.equal(cafe.ticket_url, null);
  const [cosmo] = await titled(/^COSMODOLPHINS$/);
  assert.equal(cosmo.venue_name, 'Südalinna Teater');
  assert.equal(tallinn(cosmo.ends_at!), '2026-10-27 21:00');
});

test('a node marked free is free; a past occurrence is read but not collected', async () => {
  const free = shows(html, source).find(s => s.show.free)!;
  assert.equal(free.show.title, 'MODINA esitlus: Tehisintellekti ja publiku osaluse kasutus tantsukunstis');
  const [c] = extract({ external_id: 'x', url: free.url, payload: { ...free.show } }, source);
  assert.equal(c.is_free, true);
  assert.equal(c.price_min, 0);
  assert.equal(c.venue_name, 'Sõltumatu Tantsu Lava');         // "STL kontor, Telliskivi 60a/3, 3. korrus"
  assert.equal(tallinn(c.starts_at), '2026-01-17 16:00');
  const items = await collect(source, now, async () => html);
  assert.ok(!items.some(i => i.payload.title === free.show.title));
});

test('an empty or changed page gives no items and does not throw', async () => {
  for (const page of ['', '<html><body>Ajakava</body></html>', '<script id="__NEXT_DATA__" type="application/json">{"props":</script>',
    '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"events":{"productions":{"nodes":[{"title":"X","slug":"x","events":{"events":[{"date":"soon"}]}}]}}}}}</script>']) {
    assert.deepEqual(await collect(source, now, async () => page), []);
  }
  assert.deepEqual(extract({ external_id: 'x', payload: {} }, source), []);
});
