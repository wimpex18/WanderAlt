// node --test pipeline/test/   (no dependencies; Node strips the types)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tallinnToIso, toIso, tallinnDay } from '../time.ts';
import * as fienta from '../sources/fienta.ts';
import * as jsonld from '../sources/jsonld.ts';
import { parseTelegram, parseRss } from '../sources/text.ts';
import { Models, parseJson, fallbackEnrichment, type Lane } from '../llm.ts';
import { Places } from '../places.ts';
import { decide, eventId, loadSources } from '../run.ts';
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
  const lane = (name: string, fn: () => Promise<string>): Lane => ({ name, model: 'm', key: 'k', vision: false, call: fn });
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
