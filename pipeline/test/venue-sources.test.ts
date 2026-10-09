// Venue programmes added to sources.tallinn.json, checked against trimmed copies of what each
// source served: the configuration itself is read, so a changed id, URL or venue fails here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectPage } from '../sources/text.ts';
import * as fienta from '../sources/fienta.ts';
import { Models } from '../llm.ts';
import { loadSources, read, trustedListing } from '../run.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const sources = loadSources('tallinn');
const byId = (id: string) => sources.find(s => s.id === id)!;

async function withFetch<T>(body: string, run: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;
  try { return await run(); } finally { globalThis.fetch = realFetch; }
}

test('Klubi Tapper: its own programme page reaches the reader with each show\'s date, doors and title', async () => {
  const tapper = byId('tapper');
  assert.equal(tapper.kind, 'html');
  assert.equal(tapper.url, 'https://www.tapper.ee/kava/');
  assert.equal(tapper.curated, false);   // the club also rents itself out: its listings pass the ordinary relevance bar
  assert.equal(tapper.config.venue_name, 'Tapper');
  assert.equal(tapper.config.shape, undefined);                // read by a model, not a structured shape

  const [item] = await withFetch(fixture('tapper.html'), () => collectPage(tapper));
  const text = String(item.payload.text);
  assert.equal(item.external_id, tapper.url);
  assert.match(text, /^L 14\.11:\nShelter Helper 5 \(https:\/\/www\.tapper\.ee\/event\/shelter-helper-5\/\)\nUksed: 17:00/);
  assert.match(text, /T 01\.12:\nMASTER BOOT RECORD \(ITA\), FULCI \(ITA\)/);
  assert.doesNotMatch(text, /KORRALDAJALE|KONTAKT/);         // the site menu and footer sit outside <main>

  // Every show the page lists is at the club, whatever the model calls the place.
  let prompt = '';
  const models = new Models([{ name: 'fixture', model: 'fixture', key: 'fixture', call: async (_s, user) => {
    prompt = user;
    return JSON.stringify({ events: [{ title: 'Shelter Helper 5', start: '2099-11-14 17:00', end: null, venue: 'Klubi Tapper', address: null,
      price: '30€', url: 'https://www.tapper.ee/event/shelter-helper-5/', language: null, excerpt: null, state: 'scheduled' }] });
  } }]);
  const [c] = (await read(item, tapper, models))!;
  assert.match(prompt, /Klubi Tapper \(@tapper\.ee\)/);
  assert.match(prompt, /L 14\.11:/);
  assert.equal(c.venue_name, 'Tapper');
  assert.equal(c.starts_at, '2099-11-14T15:00:00.000Z');
  assert.equal(c.price_min, 30);
});

test('The Krypt\'s own Fienta accounts are trusted; someone renting its stage is not', async () => {
  const market = byId('fienta-tallinn');
  const items = await withFetch(fixture('fienta-krypt.json'), () => fienta.collect(market, new Date('2026-10-09T08:00:00Z')));
  assert.deepEqual(items.map(i => i.external_id), ['301', '302', '303']);
  const trusted = Object.fromEntries(items.map(i => [i.external_id, trustedListing(market, i)]));
  assert.deepEqual(trusted, { 301: true, 302: true, 303: false });   // Sügis Productions, The Krypt / Sügis Productions, anyone else
  const [c] = fienta.extract(items[0]);
  assert.equal(c.venue_name, 'The Krypt Spooky Bar & Stage');
  assert.equal(c.starts_at, '2026-10-16T18:00:00.000Z');              // 21:00 in Tallinn, summer time
  assert.equal(c.address, 'Pärnu maantee 19, 10141 Tallinn');
});
