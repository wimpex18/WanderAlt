import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPlace, sameName, type OvertureRow } from '../overture.ts';
import type { Place } from '../places.ts';

const place = (name: string, lat = 59.43426, lng = 24.74419, extra: Partial<Place> = {}): Place =>
  ({ id: 'tallinn-x', city: 'tallinn', name, aliases: [name.toLowerCase()], lat, lng, ...extra }) as Place;
const row = (name: string, o: Partial<OvertureRow> = {}): OvertureRow =>
  ({ name, category: 'bar', website: 'http://phillyjoes.com/', socials: ['https://www.facebook.com/1374561632809092'], lat: 59.43426, lng: 24.74419, status: null, confidence: 0.99, ...o });

test('the same venue: near, cultural, and every distinctive word shared', () => {
  const f = matchPlace(place("Philly Joe's"), [row("Philly Joe's Jazz Club")]);
  assert.equal(f?.website, 'http://phillyjoes.com/');
  assert.equal(f?.facebook, 'https://www.facebook.com/1374561632809092');
});

test('a neighbour, a clinic, a closed venue or a look-alike name is not the venue', () => {
  const p = place('Uus Laine');
  assert.equal(matchPlace(p, [row('Uus Laine Kliinik OÜ', { category: 'outpatient_care_facility' })]), null);   // wrong kind
  assert.equal(matchPlace(p, [row('Uus Laine', { lat: 59.4352 })]), null);                                       // 100 m away
  assert.equal(matchPlace(p, [row('Uus Laine', { status: 'permanently_closed' })]), null);
  assert.equal(matchPlace(p, [row('Vana Laine')]), null);                                                        // another name
  assert.equal(matchPlace(place('Telliskivi Creative City'), [row('Telliskivi Loomelinnak', { category: 'event_venue' })]), null);
  assert.equal(sameName(['hall'], 'Hallikas'), false);
});

test('two records with different sites are no answer; a listing site is not a venue site', () => {
  const p = place('Winkel');
  assert.equal(matchPlace(p, [row('Winkel', { website: 'https://winkel.ee/' }), row('Winkel Bar', { website: 'https://winkelbar.com/' })]), null);
  assert.equal(matchPlace(p, [row('Winkel', { website: 'https://untappd.com/' })])?.website, null);
  const insta = matchPlace(p, [row('Winkel', { website: 'https://www.instagram.com/winkel.ee/', socials: null })]);
  assert.equal(insta?.website, null);
  assert.equal(insta?.instagram, 'https://www.instagram.com/winkel.ee');
});

test('inflected and generic parts do not stop a match', () => {
  assert.equal(matchPlace(place('Kino Artis'), [row('Kino Artis', { category: 'movie_theater' })])?.website, 'http://phillyjoes.com/');
  assert.ok(matchPlace(place('Salme Kultuurikeskuse Vaba Lava black box (3. korrusel)'), [row('Vaba Lava SA', { category: 'theatre_venue' })]));
});
