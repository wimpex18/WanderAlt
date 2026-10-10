// Paavli Kultuurivabrik and Von Krahl ship their programme as Next.js flight data; the fixtures are
// trimmed copies of what each page served on 9 October 2026, read with the live configuration.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flightText, flightRows, deref, shows, collect, extract } from '../sources/nextflight.ts';
import { loadSources, read, pageShape } from '../run.ts';
import * as nextflight from '../sources/nextflight.ts';
import { Models } from '../llm.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const byId = (id: string) => loadSources('tallinn').find(s => s.id === id)!;
const now = new Date('2026-10-09T09:00:00Z');
const tallinn = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Tallinn' }).slice(0, 16);

test('flight rows: text rows count UTF-8 bytes across pushes, references follow paths', () => {
  const rows = flightRows(flightText(fixture('paavli.html')));
  const text = rows.get('23');
  assert.equal(typeof text, 'string');
  assert.match(String(text), /𝑨𝒀𝑨𝑵𝑶/);                          // a multi-byte text row ends where its length says
  assert.ok(Array.isArray(rows.get('6')));                       // a JSON row pushed in two halves
  assert.equal(rows.has('4'), false);                            // a module row is not data
  assert.equal(deref('$23', rows), text);
  assert.equal(deref('$undefined', rows), undefined);
  assert.equal(deref('$6:props:isEvent', rows), true);
  assert.equal(deref('$$5 entry', rows), '$5 entry');
});

test('Paavli: the venue\'s own events with Tallinn times, its own anchor and ticket, no signed Facebook artwork', async () => {
  const paavli = byId('paavli');
  assert.equal(paavli.kind, 'html');
  assert.equal(paavli.config.enabled, undefined);
  assert.equal(pageShape(paavli), nextflight);
  const items = await collect(paavli, now, async () => fixture('paavli.html'));
  assert.deepEqual(items.map(i => i.payload.title), ['STF 2026: Ayano Yokoyama & 34423 + inklingroom & Paavli takeover', 'Paavli․Live: Brushy One String (JM)',
    'Paavli House of Horrors', 'BUTTERCUPS HALLOWEEN', '(SOLD OUT) Katarsis Unplugged | Tallinn']);   // Tartu Punch is at the Tartu song festival grounds
  assert.equal(items[0].external_id, 'data:923802290770315');    // the Facebook event: a moved start is the same item
  const [stf, brushy, horrors] = items.map(i => extract(i, paavli)[0]);
  assert.equal(stf.starts_at, '2026-10-09T17:00:00.000Z');
  assert.equal(tallinn(stf.starts_at), '2026-10-09 20:00');
  assert.equal(tallinn(stf.ends_at!), '2026-10-10 04:00');
  assert.equal(stf.has_time, true);
  assert.equal(tallinn(horrors.starts_at), '2026-10-30 22:00');   // winter time, +02:00
  assert.equal(brushy.ends_at, null);
  assert.equal(stf.venue_name, 'Paavli Kultuurivabrik');
  assert.equal(stf.url, 'https://www.kultuurivabrik.ee/en/events#923802290770315');
  assert.equal(stf.ticket_url, 'https://fienta.com/et/s/stf-2026-inklingroom-paavli-takeover-aisha-deivi-ayano-yokoyama-34423-tab');
  for (const i of items) assert.equal(extract(i, paavli)[0].image_url, null);   // covers are expiring fbcdn.net addresses
  // ...kept in the raw item only to be copied (event-art.ts), since the source asks for it.
  assert.equal(paavli.config.copy_covers, true);
  assert.ok(items.some(i => /(^|\.)fbcdn\.net$/.test(new URL(String(i.payload.cover)).hostname)));
  assert.match(stf.description ?? '', /^AYANO YOKOYAMA & 34423 LIVE/);   // styled letters read as plain ones
  assert.equal(stf.engine, 'nextflight');
});

test('Von Krahl: its own events and its Fienta calendar, one row per show, Tallinn only, posters from its CMS', async () => {
  const vk = byId('vonkrahl');
  assert.equal(vk.config.venue_name, 'Von Krahli Teater');
  assert.equal(vk.config.venue_id, 'tallinn-von-krahli-teater');
  assert.equal(vk.handle, '@vonkrahliteater');
  const items = await collect(vk, now, async () => fixture('vonkrahl.html'));
  const cands = items.map(i => extract(i, vk)[0]);
  const titles = cands.map(c => c.title);
  assert.ok(!titles.some(t => /Õpetajate teatripäev/.test(t)), 'a day at Rahvusteater Vanemuine in Tartu is not listed');
  assert.ok(!titles.some(t => /Bush Bush Hartshorn/.test(t)), 'a workshop at elektron.art is not at the theatre');
  assert.ok(!titles.includes('Öömaaeg'), 'May 2027 is past the horizon');
  assert.equal(titles.filter(t => /ANTONIO TENSURO/.test(t)).length, 1, 'a show in both lists is one row');
  for (const c of cands) assert.equal(c.venue_name, 'Von Krahli Teater');

  const ghosts = cands.find(c => /Ghosts of Rosegarden/.test(c.title))!;
  assert.equal(tallinn(ghosts.starts_at), '2026-10-16 20:00');   // stored in UTC
  assert.equal(ghosts.url, 'https://vonkrahl.ee/sundmused/stf-2026-ghosts-of-rosegarden');
  assert.equal(ghosts.kind_hint, 'tantsulavastus');
  assert.equal(ghosts.image_url, null);

  const quiz = cands.find(c => /Arhivoor/.test(c.title))!;
  assert.match(quiz.description ?? '', /^Von Krahli baar/);     // the bar in the theatre's house, named as the hall
  assert.equal(quiz.ticket_url, 'https://arhilusefond.ee/arhivoor/');   // fbclid dropped

  const pantheon = cands.filter(c => c.title.startsWith('Pantheon'));
  assert.equal(pantheon.length, 3);
  assert.equal(tallinn(pantheon[0].starts_at), '2026-10-10 19:00');   // a Fienta wall time
  assert.equal(tallinn(pantheon[0].ends_at!), '2026-10-10 20:40');
  for (const p of pantheon) {
    assert.equal(p.url, 'https://vonkrahl.ee/lavastused/pantheon');
    assert.equal(p.image_url, 'https://strapi.vonkrahl.ee/uploads/large_Mart_Kangro_Pantheon_Kodukale_e8cbf77bdb.jpg');   // the second and third follow a reference
    assert.equal(p.series_key, 'vonkrahl:pantheon');
  }
  assert.equal(items.find(i => i.url === 'https://vonkrahl.ee/lavastused/pantheon')!.external_id,
    'fientaEvents:https://fienta.com/pantheon-27-jaanuar-esietendus-191539');   // each date has its own ticket page
  const sold = cands.find(c => c.title === 'Ma tahan uskuda')!;
  assert.equal(sold.flag, 'sold_out');
  const concert = cands.find(c => /ANTONIO/.test(c.title))!;
  assert.equal(concert.url, 'https://vonkrahl.ee/sundmused/antonio-tensuro-and-tonu-tubli-trio-von-krahl');
});

test('an id the page gives to several dates also takes the start', () => {
  const page = '<script>self.__next_f.push([1,"5:{\\"list\\":[{\\"id\\":\\"p\\",\\"title\\":\\"A\\",\\"start\\":\\"2026-11-01 19:00\\"},'
    + '{\\"id\\":\\"p\\",\\"title\\":\\"A\\",\\"start\\":\\"2026-11-02 19:00\\"},{\\"id\\":\\"q\\",\\"title\\":\\"B\\",\\"start\\":\\"2026-11-03 19:00\\"}]}\\n"])</script>';
  const s = { ...byId('vonkrahl'), config: { venue_name: 'X', records: [{ list: 'list', id: 'id', title: 'title', start: 'start' }] } };
  assert.deepEqual(shows(page, s).map(o => o.key), ['list:p|2026-11-01T17:00:00.000Z', 'list:p|2026-11-02T17:00:00.000Z', 'list:q']);
});

test('a shaped page is read without a model', async () => {
  const vk = byId('vonkrahl');
  const [item] = await collect(vk, now, async () => fixture('vonkrahl.html'));
  const out = await read(item, vk, new Models([]));
  assert.ok(out && out.length === 1);
});

test('an empty, changed or broken page gives no items and does not throw', async () => {
  for (const id of ['paavli', 'vonkrahl']) {
    const s = byId(id);
    for (const page of ['', '<html><body><main>Coming soon</main></body></html>',
      '<script>self.__next_f.push([1,"6:{\\"data\\":[{\\"title\\":\\"x\\"}"])</script>',
      '<script>self.__next_f.push([1,"23:Tffff,short"])</script><script>self.__next_f.push([1,"6:[\\"$\\",\\"$L1\\",null,{\\"data\\":[{\\"id\\":1,\\"title\\":\\"No date\\",\\"date\\":\\"soon\\"}]}]\\n"])</script>']) {
      assert.deepEqual(await collect(s, now, async () => page), []);
    }
  }
  assert.deepEqual(extract({ external_id: 'x', payload: {} }, byId('paavli')), []);
});
