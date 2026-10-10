// An exhibition that opened before today and closes later is still on: the two checks a model-read
// listing needs (sources/still-on.ts) before llm.ts and run.ts call them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../cities.ts';
import { stillOn, keepStarted } from '../sources/still-on.ts';
import { localDay, localToIso } from '../time.ts';

const TZ = CITIES.tallinn.tz;
const tallinnToIso = (local: string) => localToIso(local, TZ);

const now = Date.parse('2026-10-09T09:00:00Z');                  // Friday 9 October, 12:00 in Tallinn
const at = (local: string) => tallinnToIso(local)!;

test('a run that opened before today and closes later is still on', () => {
  assert.equal(stillOn(at('2026-09-26'), at('2026-12-20'), TZ, now), true);                // dates only
  assert.equal(stillOn(at('2026-09-26 18:00'), at('2026-12-20'), TZ, now), true);          // an opening with a time
  assert.equal(stillOn(at('2026-09-26'), at('2026-10-09'), TZ, now), true);                // closes tonight: that whole day
  assert.equal(stillOn(at('2026-09-26'), at('2026-10-08'), TZ, now), false);               // closed yesterday
  assert.equal(stillOn(at('2026-10-02 12:00'), at('2026-10-09 10:00'), TZ, now), false);   // a stated end time passed
});

test('a listing without a later end day is not a run', () => {
  assert.equal(stillOn(at('2026-10-08 19:00'), null, TZ, now), false);
  assert.equal(stillOn(at('2026-10-08 19:00'), at('2026-10-08 23:00'), TZ, now), false);
  assert.equal(stillOn(at('2026-10-08'), at('2026-10-08'), TZ, now), false);
  assert.equal(stillOn(at('2026-10-08'), 'not a date', TZ, now), false);
  assert.equal(stillOn(at('2026-12-20'), at('2026-09-26'), TZ, now), false);               // an end before the start
});

test('after classification only an exhibition that has started is kept', () => {
  const show = { starts_at: at('2026-09-26'), ends_at: at('2026-12-20') };
  assert.equal(keepStarted(show, 'exhibition', TZ, now), true);
  for (const kind of ['film', 'festival', 'market', 'theatre', 'other']) assert.equal(keepStarted(show, kind, TZ, now), false);
  assert.equal(keepStarted({ starts_at: at('2026-09-26'), ends_at: at('2026-10-01') }, 'exhibition', TZ, now), false);
  assert.equal(keepStarted({ starts_at: at('2026-09-26'), ends_at: null }, 'exhibition', TZ, now), false);
});

test('a listing that has not started, or started within six hours, is untouched', () => {
  assert.equal(keepStarted({ starts_at: at('2026-10-10 19:00') }, 'gig', TZ, now), true);
  assert.equal(keepStarted({ starts_at: at('2026-10-09 08:00') }, 'film', TZ, now), true);  // four hours ago
  assert.equal(keepStarted({ starts_at: at('2026-10-09 05:00') }, 'film', TZ, now), false); // seven hours ago
});

test('a model-read gallery page keeps a show that opened earlier and runs on, with its closing day whole', async () => {
  const { Models, extractEvents } = await import('../llm.ts');
  const tallinnDay = (iso: string) => localDay(iso, TZ);
  const day = (offset: number) => tallinnDay(new Date(Date.now() + offset * 86_400_000).toISOString());
  const row = (title: string, start: string, end: string | null) => ({ title, start, end, venue: 'Kogo', address: null, price: null, url: null, language: 'en', excerpt: title, state: 'scheduled' });
  const lane = { name: 'fixture', model: 'm', key: 'k', call: async () => JSON.stringify({ events: [
    row('Running show', day(-7), day(30)),
    row('Last week talk', `${day(-7)} 18:00`, null),
    row('Closed show', day(-30), day(-2)),
  ] }) };
  const out = await extractEvents(new Models([lane], 5), { text: 'programme', source: 'test', city: CITIES.tallinn });
  assert.deepEqual(out.map(c => c.title), ['Running show']);
  // "Until <day>" is that whole day: stored at 23:59 in Tallinn, not at its first minute.
  assert.equal(out[0].ends_at, tallinnToIso(`${day(30)} 23:59`));
});
