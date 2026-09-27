// node --test pipeline/test/   (no dependencies; Node strips the types)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tallinnToIso, toIso, tallinnDay } from '../time.ts';
import * as fienta from '../sources/fienta.ts';
import * as jsonld from '../sources/jsonld.ts';
import { parseTelegram, parseRss } from '../sources/text.ts';
import { Models, parseJson, fallbackEnrichment, classifyPlaces, type Lane } from '../llm.ts';
import { Places, normaliseAddress } from '../places.ts';
import { Seen, overlap } from '../dedupe.ts';
import { decide, eventId, loadSources, offTopic } from '../run.ts';
import { htmlToText, httpUrl, nameKey } from '../util.ts';
import type { Source } from '../types.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const source = (over: Partial<Source> = {}): Source =>
  ({ id: 's', city: 'tallinn', kind: 'html', url: 'https://example.ee/', handle: '@s', label: 'S', curated: false, config: {}, ...over });

test('Tallinn wall time becomes UTC across both offsets and the DST edge', () => {
  assert.equal(tallinnToIso('2026-07-01 19:00:00'), '2026-07-01T16:00:00.000Z');   // EEST, +3
  assert.equal(tallinnToIso('2026-12-01 19:00'), '2026-12-01T17:00:00.000Z');      // EET, +2
  assert.equal(tallinnToIso('2026-10-25 12:00'), '2026-10-25T10:00:00.000Z');      // day clocks go back
  assert.equal(tallinnToIso('2026-10-03'), '2026-10-02T21:00:00.000Z');
  assert.equal(tallinnToIso('next friday'), null);
  assert.equal(toIso('2026-10-03T19:00:00+03:00'), '2026-10-03T16:00:00.000Z');
  assert.equal(toIso('2026-10-03T19:00'), '2026-10-03T16:00:00.000Z');
  assert.equal(tallinnDay('2026-10-02T21:30:00.000Z'), '2026-10-03');
});

test('Fienta prices and events parse, and organiser contact details are never kept', async () => {
  assert.deepEqual(fienta.parsePrice('From 10 EUR'), { is_free: false, price_min: 10, price_max: null, currency: 'EUR' });
  assert.deepEqual(fienta.parsePrice('5 - 12 EUR'), { is_free: false, price_min: 5, price_max: 12, currency: 'EUR' });
  assert.equal(fienta.parsePrice('Tasuta').is_free, true);

  const body = fixture('fienta.json');
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;
  try {
    const items = await fienta.collect(source({ kind: 'fienta', url: 'https://fienta.com/api/v1/public/events?country=EE', config: { skip_categories: ['family'] } }),
      new Date('2026-09-27T08:00:00Z'));
    assert.deepEqual(items.map(i => i.external_id), ['101']);      // online, family-only and year-long ones dropped
    assert.equal('organizer_email' in items[0].payload, false);
    const [c] = fienta.extract(items[0]);
    assert.equal(c.starts_at, '2026-10-02T17:00:00.000Z');
    assert.equal(c.has_time, true);
    assert.equal(c.address, 'Telliskivi 60a, 10412 Tallinn');
    assert.equal(c.description, 'Live set.\nDoors at 20:00.');
    assert.equal(fienta.trustedOrganiser(items[0], source({ config: { trusted_organizer_ids: [15] } })), true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('JSON-LD screenings take the film title from the @graph', () => {
  const nodes = jsonld.parseJsonLd(fixture('jsonld.html'));
  const ev = nodes.find(n => n['@type'] === 'ScreeningEvent')!;
  const film = nodes.find(n => n['@id'] === 'https://kino.example/film/x#movie');
  const [c] = jsonld.extract({ external_id: 'e1', url: 'https://kino.example/e1', payload: { ...ev, _work: film } },
    source({ kind: 'jsonld', config: { venue_name: 'Kino Sõprus' } }));
  assert.equal(c.title, 'Primetime');
  assert.equal(c.starts_at, '2026-10-01T16:30:00.000Z');
  assert.equal(c.venue_name, 'Kino Sõprus');
  assert.equal(c.price_min, 8);
  assert.equal(c.series_key, 'jsonld:https://kino.example/film/x#movie');
});

test('Telegram previews and RSS items become raw items', () => {
  const posts = parseTelegram(fixture('telegram.html'), 'https://t.me/s/chan');
  assert.equal(posts.length, 2);
  assert.equal(posts[0].external_id, 'chan/10');
  assert.match(String(posts[0].payload.text), /Rave at Sveta.*\n.*03\.10/s);
  assert.deepEqual(posts[0].payload.photos, ['https://cdn.example/p.jpg']);

  const rss = parseRss('<rss><channel><item><title>Zine fair</title><link>https://x.example/a</link><guid>a1</guid><description><![CDATA[<p>Sat 4 Oct at Kultuurikatel</p>]]></description><pubDate>Fri, 26 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>');
  assert.equal(rss[0].external_id, 'a1');
  assert.equal(rss[0].payload.text, 'Sat 4 Oct at Kultuurikatel');
});

test('model answers parse through fences, and a failing lane falls through to the next', async () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('Sure: {"a":[1]} hope that helps'), { a: [1] });

  let broken = 0;
  const lane = (name: string, fn: () => Promise<string>): Lane => ({ name, model: 'm', key: 'k', call: fn });
  const models = new Models([
    lane('bad', async () => { broken++; throw new Error('503'); }),
    lane('good', async () => '{"ok":true}'),
  ], 10);
  for (let i = 0; i < 3; i++) assert.deepEqual((await models.ask('s', 'u', {})).data, { ok: true });
  assert.equal(broken, 2);                          // skipped after two failures
  assert.equal(new Models([], 10).ready, false);
});

test('decisions: trusted sources publish, others need a fit score', () => {
  const e = (relevance: number) => ({ ...fallbackEnrichment({ title: 'x', starts_at: '', has_time: true, engine: 't' }), relevance });
  assert.equal(decide(e(NaN), true).status, 'published');
  assert.equal(decide(e(NaN), false).status, 'review');
  assert.equal(decide(e(0.2), true).status, 'review');
  assert.equal(decide(e(0.7), false).status, 'published');
  assert.equal(decide(e(0.5), false).status, 'review');
  assert.equal(decide(e(0.1), false).status, 'rejected');
  assert.equal(fallbackEnrichment({ title: 'Screening: Sisters', starts_at: '', has_time: true, engine: 't' }).kind, 'film');
});

test('the same show from two sources gets one id', () => {
  const c = { title: 'Rave at Sveta!', starts_at: '2026-10-03T20:00:00.000Z', has_time: true, venue_name: 'Sveta Baar', engine: 'x' };
  const d = { ...c, title: 'RAVE AT SVETA', venue_name: 'sveta baar' };
  assert.equal(eventId('tallinn', c, null), eventId('tallinn', d, null));
  assert.notEqual(eventId('tallinn', c, null), eventId('tallinn', { ...c, starts_at: '2026-10-04T20:00:00.000Z' }, null));
});

test('places match on any alias and are created once', async () => {
  const places = new Places([{ id: 'tallinn-kino-soprus', city: 'tallinn', name: 'Kino Sõprus', aliases: ['soprus'] }], 'tallinn', 0);
  const c = (venue_name: string) => ({ title: 't', starts_at: '', has_time: true, engine: 'x', venue_name });
  assert.equal((await places.resolve(c('KINO SÕPRUS')))?.id, 'tallinn-kino-soprus');
  assert.equal((await places.resolve(c('Soprus, Vana-Posti 8')))?.id, 'tallinn-kino-soprus');
  const a = await places.resolve(c('Sveta Baar'), false);
  const b = await places.resolve(c('sveta baar'), false);
  assert.equal(a?.id, 'tallinn-sveta-baar');
  assert.equal(a, b);
  assert.equal(places.created.length, 1);
  assert.equal(await places.resolve(c('Online, Zoom')), null);
});

test('helpers: text, URLs, names, and the Tallinn source list', () => {
  assert.equal(htmlToText('<p>A &amp; B</p><p>C<br>D</p>'), 'A & B\nC\nD');
  assert.equal(httpUrl('javascript:alert(1)'), null);
  assert.equal(httpUrl('/e/1', 'https://x.ee/a/'), 'https://x.ee/e/1');
  assert.equal(nameKey('Kultuurikatel „Katel“'), 'kultuurikatel katel');
  const ids = loadSources('tallinn').map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('addresses are reduced to what Nominatim matches', () => {
  assert.equal(normaliseAddress('Kentmanni tänav 28, 10116 Tallinn, Harju maakond'), 'Kentmanni 28, Tallinn');
  assert.equal(normaliseAddress('Telliskivi tänav 60a / 9, 10412 Tallinn'), 'Telliskivi 60a, Tallinn');
  assert.equal(normaliseAddress('Krulli 2b (Kopli 70a), 10412 Tallinn'), 'Krulli 2b, Tallinn');
  assert.equal(normaliseAddress('Pärnu mnt. 139c, 11317 Tallinn'), 'Pärnu mnt 139c, Tallinn');
  assert.equal(normaliseAddress('Narva maantee 13, 10151 Tallinn'), 'Narva mnt 13, Tallinn');
  assert.equal(normaliseAddress('Rävala puiestee 4, 10143 Tallinn'), 'Rävala pst 4, Tallinn');
  assert.equal(normaliseAddress('L.Koidula 21c, 10127 Tallinn'), 'Koidula 21c, Tallinn');
  assert.equal(normaliseAddress('Vana-Posti tn 8, Tallinn'), 'Vana-Posti 8, Tallinn');
  assert.equal(normaliseAddress('CQW3+JC Tallinn, 10415 Tallinn'), '');      // a plus code: use the name instead
});

test('a second source copy of a show joins the first', () => {
  const t = Date.parse('2026-10-01T15:00:00Z');
  const seen = new Seen([{ id: 'ev_a', title: 'Screening at Kai Cinema: "Sisters"', where: 'tallinn-kai', start: t }]);
  assert.ok(overlap('Sisters', 'Screening at Kai Cinema: Sisters') === 1);
  assert.equal(seen.match('Sisters', 'tallinn-kai', t + 10 * 60_000), 'ev_a');
  assert.equal(seen.match('Sisters', 'tallinn-kai', t + 3 * 3600_000), null);     // a later screening
  assert.equal(seen.match('Sisters', 'tallinn-other', t), null);                   // another venue
  assert.equal(seen.match('Case 137', 'tallinn-kai', t), null);                    // another film
});

test('a 429 waits and retries on the same lane without disabling it', async () => {
  let n = 0;
  const lane: Lane = {
    name: 'limited', model: 'm', key: 'k',
    call: async () => {
      n++;
      if (n === 1) throw Object.assign(new Error('429 slow down'), { status: 429, retryAfter: 0.01 });
      return '{"ok":true}';
    },
  };
  const models = new Models([lane], 10);
  assert.deepEqual((await models.ask('s', 'u', {})).data, { ok: true });
  assert.equal(n, 2);
  assert.equal(models.ready, true);
});

test('JSON-LD collection keeps only screenings inside the horizon', async () => {
  const html = `<script type="application/ld+json">{"@graph":[
    {"@type":"ScreeningEvent","@id":"https://k.example/a#s","startDate":"2026-10-01T19:00:00+03:00","location":{"@id":"https://k.example/#v"}},
    {"@type":"ScreeningEvent","@id":"https://k.example/b#s","startDate":"2027-03-01T19:00:00+02:00"},
    {"@type":"MovieTheater","@id":"https://k.example/#v","name":"Suur saal"}]}</script>`;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(html, { status: 200 })) as typeof fetch;
  try {
    const items = await jsonld.collect(source({ kind: 'jsonld', url: 'https://k.example/', config: { days: 30, venue_name: 'Kino' } }), new Date('2026-09-27T00:00:00Z'));
    assert.deepEqual(items.map(i => i.external_id), ['https://k.example/a#s']);
    assert.equal(items[0].url, 'https://k.example/a');
    assert.equal((items[0].payload.location as { name: string }).name, 'Suur saal');
    const [c] = jsonld.extract({ ...items[0], payload: { ...items[0].payload, name: 'A film' } }, source({ config: { venue_name: 'Kino' } }));
    assert.equal(c.venue_name, 'Kino');          // the venue, not the hall
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('venue kinds from the model keep only listed kinds', async () => {
  const lane: Lane = { name: 'fake', model: 'm', key: 'k',
    call: async () => '{"items":[{"i":0,"kind":"club"},{"i":1,"kind":"spaceship"},{"i":2,"kind":"other"}]}' };
  const kinds = await classifyPlaces(new Models([lane], 5), [
    { name: 'Sveta Baar', events: ['Techno night'] }, { name: 'X', events: [] }, { name: 'Y', events: [] },
  ]);
  assert.deepEqual(kinds, ['club', null, null]);
});

import * as wordpress from '../sources/wordpress.ts';
import { placeFromOsm, socialUrl, commonsUrl, fromHomepage, handleFits } from '../venues.ts';
import { createHash } from 'node:crypto';
const md5dir = (f: string) => { const h = createHash('md5').update(f).digest('hex'); return `${h[0]}/${h.slice(0, 2)}`; };

test('WordPress ACF events: date-only and timed', () => {
  const src = source({ kind: 'wordpress', config: { venue_name: 'Kultuurikatel' } });
  const [a] = wordpress.extract({ external_id: '1', payload: { title: 'HU? &amp; EIK', link: 'https://k.example/e/1', acf: { event_date: '20261128', event_payment_link: 'https://www.piletilevi.ee/x', event_price: '15 €' } } }, src);
  assert.equal(a.title, 'HU? & EIK');
  assert.equal(a.has_time, false);
  assert.equal(a.starts_at, '2026-11-27T22:00:00.000Z');
  assert.equal(a.ticket_url, 'https://www.piletilevi.ee/x');
  assert.equal(a.price_min, 15);
  assert.equal(a.venue_name, 'Kultuurikatel');
  const [b] = wordpress.extract({ external_id: '2', payload: { title: 'Gig', acf: { event_date: '20261003', add_time: true, event_start_time: '19:30', event_end_time: '22:00' } } }, src);
  assert.equal(b.starts_at, '2026-10-03T16:30:00.000Z');
  assert.equal(b.ends_at, '2026-10-03T19:00:00.000Z');
});

test('OpenStreetMap venues become places with identity and links', () => {
  const p = placeFromOsm({ type: 'node', id: 42, lat: 59.43, lon: 24.73, tags: {
    shop: 'music', name: 'Biit', 'addr:street': 'Telliskivi', 'addr:housenumber': '60a',
    'contact:instagram': 'biit.records', website: 'https://biit.example', wikidata: 'Q123' } }, 'tallinn')!;
  assert.equal(p.kind, 'record store');
  assert.equal(p.osm_id, 'node/42');
  assert.equal(p.address, 'Telliskivi 60a, Tallinn');
  assert.equal(p.instagram, 'https://www.instagram.com/biit.records');
  assert.equal(p.wikidata_id, 'Q123');
  assert.equal(placeFromOsm({ type: 'node', id: 1, tags: { amenity: 'bank', name: 'Bank' } }, 'tallinn'), null);
  assert.equal(placeFromOsm({ type: 'node', id: 2, tags: { shop: 'books', name: 'Old', disused: 'yes' } }, 'tallinn'), null);
});

test('links and photos only from sources that identify the venue', () => {
  assert.equal(socialUrl('facebook.com', 'https://www.facebook.com/sharer/sharer.php?u=x'), null);
  assert.equal(socialUrl('instagram.com', '@sveta.baar'), 'https://www.instagram.com/sveta.baar');
  assert.equal(commonsUrl('Von Krahl theatre.jpg'), 'https://upload.wikimedia.org/wikipedia/commons/' +
    md5dir('Von_Krahl_theatre.jpg') + '/Von_Krahl_theatre.jpg');
  assert.equal(handleFits('https://www.facebook.com/IceCafeEesti', 'Apollo Kino', 'https://www.apollokino.ee/'), false);
  assert.equal(handleFits('https://www.instagram.com/a.galerii', 'A-Galerii', 'https://www.agalerii.ee/'), true);
  const page = `<a href="https://www.instagram.com/raamatukoi">IG</a><a href="https://www.facebook.com/sponsorbrand">x</a>
    <meta property="og:image" content="/og.png"><meta name="description" content="Books &amp; more">`;
  const d = fromHomepage(page, 'https://www.raamatukoi.ee/', 'Raamatukoi');
  assert.equal(d.instagram, 'https://www.instagram.com/raamatukoi');
  assert.equal(d.facebook, null);
  assert.equal(d.image_url, 'https://www.raamatukoi.ee/og.png');
  assert.equal(d.description, 'Books & more');
  assert.deepEqual(fromHomepage('<p>See domeen on müügil</p><meta property="og:image" content="x.png">', 'https://ibiza.example/'), {});
});

test('a catalogue venue fills gaps in the place events already created', () => {
  const places = new Places([{ id: 'tallinn-kino-soprus', city: 'tallinn', name: 'Kino Sõprus', aliases: ['kino soprus'], website: 'https://kinosoprus.ee' }], 'tallinn', 0);
  const merged = places.merge({ id: 'tallinn-kino-soprus', city: 'tallinn', name: 'Kino Sõprus', aliases: ['kino soprus', 'soprus'], kind: 'cinema', osm_id: 'node/1', website: 'https://other.example' });
  assert.equal(merged.kind, 'cinema');
  assert.equal(merged.website, 'https://kinosoprus.ee');          // kept, not overwritten
  assert.equal(places.updated.length, 1);
  places.merge({ id: 'tallinn-biit', city: 'tallinn', name: 'Biit', aliases: ['biit'], kind: 'record store' });
  assert.equal(places.created.length, 1);
});

test('conferences and trade fairs are rejected by rule', () => {
  assert.equal(offTopic('NORDIC-BALTIC SECURITY SUMMIT 2026')?.status, 'rejected');
  assert.equal(offTopic('HEALTH PROMOTION CONFERENCE 2026')?.note, 'rule: conference');
  assert.equal(offTopic('Armenian Products Expo')?.status, 'rejected');
  assert.equal(offTopic('HU? / EIK'), null);
  assert.equal(offTopic('Tallinn Vegan Fair 2026'), null);
});

test('one venue under two names is merged, neighbours are not', () => {
  const places = new Places([
    { id: 'tallinn-von-krahl', city: 'tallinn', name: 'Von Krahl', aliases: ['von krahl'], lat: 59.43819, lng: 24.72864, osm_id: 'node/1', kind: 'theatre' },
    { id: 'tallinn-von-krahli-teater', city: 'tallinn', name: 'Von Krahli Teater', aliases: ['von krahli teater'], lat: 59.43822, lng: 24.72870 },
    { id: 'tallinn-fotografiska', city: 'tallinn', name: 'Fotografiska Tallinn', aliases: ['fotografiska tallinn'], lat: 59.43835, lng: 24.72846 },
  ], 'tallinn', 0);
  const d = places.duplicates();
  assert.equal(d.length, 1);
  assert.equal(d[0].keep.id, 'tallinn-von-krahl');
  places.absorb(d[0].keep, d[0].drop);
  assert.ok(d[0].keep.aliases.includes('von krahli teater'));
});

test('areas are the asum a visitor knows', async () => {
  const { areaName, isDistrict } = await import('../places.ts');
  assert.equal(areaName({ quarter: 'Kalamaja', suburb: 'Põhja-Tallinna linnaosa' }), 'Kalamaja');
  assert.equal(areaName({ neighbourhood: 'All-linn', quarter: 'Vanalinn' }), 'Old Town');
  assert.equal(isDistrict('Põhja-Tallinna'), true);
  assert.equal(isDistrict('Kalamaja'), false);
});

test('the Telegram digest escapes listing text and links every event', async () => {
  const { compose } = await import('../digest.ts');
  const text = compose([{ id: 'ev_1', title: 'Noise <b>& co</b>', venue: 'Sveta', neighborhood: 'Telliskivi', kind: 'gig',
    time: '21:00', starts_at: '2026-10-02T18:00:00Z', is_free: false, price_min: 8, currency: 'EUR' }], new Date('2026-10-02T14:00:00Z'))!;
  assert.match(text, /Noise &lt;b&gt;&amp; co&lt;\/b&gt;/);
  assert.match(text, /detail\.html\?id=ev_1/);
  assert.match(text, /from 8 €/);
  assert.equal(compose([], new Date()), null);
});
