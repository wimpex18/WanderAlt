import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bioAddress, addressDiffers, bioClosure, hoursDiffer, findings, dueForDrift, checkDrift } from '../drift.ts';
import type { Place } from '../places.ts';

const place = (o: Partial<Place>): Place => ({ id: 'tallinn-x', city: 'tallinn', name: 'X', aliases: [], kind: 'taproom', ...o } as Place);
const cfg = { token: 't', businessId: 'b' };

test('address is read from a pin or an Address line, and only when it has a number', () => {
  assert.equal(bioAddress('Restaurant\n📍 Telliskivi 60/2\n🕓 Tue 12-22'), 'Telliskivi 60/2');
  assert.equal(bioAddress('Address: Lai 8, Tallinn'), 'Lai 8, Tallinn');
  assert.equal(bioAddress('📍 Telliskivi Creative City'), null);
  assert.equal(bioAddress('Craft beer since 2013'), null);
});

test('a different street or house number is a difference; a unit letter is not', () => {
  assert.equal(addressDiffers('Telliskivi 60M, Tallinn', 'Pikk 39'), true);
  assert.equal(addressDiffers('Pikk 39/1, Tallinn', 'Pikk 41'), true);
  assert.equal(addressDiffers('Telliskivi 60B, Tallinn', 'Telliskivi 60/2'), false);
  assert.equal(addressDiffers('Pärnu maantee 370, Tallinn', 'Pärnu mnt 370'), false);
  assert.equal(addressDiffers(null, 'Pikk 41'), false);
});

test('closure wording is found on its own line', () => {
  assert.equal(bioClosure('Bar\nWe have moved to Telliskivi 60/2'), 'We have moved to Telliskivi 60/2');
  assert.equal(bioClosure('Oleme kolinud! Uus asukoht Lai 8'), 'Oleme kolinud! Uus asukoht Lai 8');
  assert.equal(bioClosure('Craft beer bar, move your feet'), null);
});

test('hours differ only when the week looks different', () => {
  assert.equal(hoursDiffer('Mo-Fr 10:00-18:00', 'Mo-Fr 10:00-18:00'), false);
  assert.equal(hoursDiffer('Mo-Fr 10:00-18:00', 'Mo-Fr 10:00-18:30'), false);
  assert.equal(hoursDiffer('Mo-Fr 10:00-18:00', 'Tu-Sa 12:00-20:00'), true);
});

test('findings compare against the stored place and leave hours read from the bio itself alone', () => {
  const p = place({ address: 'Telliskivi 60M, Tallinn', opening_hours: 'Mo-Fr 10:00-18:00', hours_source: 'osm' });
  const f = findings(p, 'Tap room\n📍 Pikk 39\n🕓 Tue-Sat 12-20\nWe have moved');
  assert.deepEqual(f.map(x => x.field).sort(), ['address', 'closure', 'hours']);
  assert.deepEqual(findings(place({ opening_hours: 'Tu-Sa 12:00-20:00', hours_source: 'instagram' }), '🕓 Tue-Sat 12-20 | Sun 12-14'), []);
});

test('due: Instagram places not seen in a month, picked first; the check marks them and writes nothing it was not asked', async () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  const ps = [
    place({ id: 'b', instagram: 'https://www.instagram.com/venueb' }),
    place({ id: 'a', instagram: 'https://www.instagram.com/venuea', picked: true }),
    place({ id: 'c', instagram: 'https://www.instagram.com/venuec', facts_checked_at: '2026-09-25T00:00:00Z' }),
    place({ id: 'd' }),
  ];
  assert.deepEqual(dueForDrift(ps, now).map(p => p.id), ['a', 'b']);
  let calls = 0;
  const bios = new Map([['venuea', '📍 Lai 8']]);
  const bio = async () => { calls++; return { kind: 'found' as const, username: 'venueb', biography: 'Permanently closed' }; };
  ps[0].address = 'Pikk 39, Tallinn'; ps[1].address = 'Pikk 39, Tallinn';
  const r = await checkDrift(ps, cfg, 30, { bio, bios, now, log: () => {} });
  assert.equal(calls, 1);
  assert.deepEqual(r.found.map(f => `${f.placeId}:${f.field}`).sort(), ['a:address', 'b:closure']);
  assert.ok(r.looked.every(p => p.facts_checked_at));
});

test('a refused token stops the check', async () => {
  const ps = [place({ id: 'a', instagram: 'https://www.instagram.com/venuea' }), place({ id: 'b', instagram: 'https://www.instagram.com/venueb' })];
  let calls = 0;
  const r = await checkDrift(ps, cfg, 30, { bio: async () => { calls++; return { kind: 'stop' as const, reason: 'code 190' }; }, log: () => {} });
  assert.equal(calls, 1); assert.equal(r.looked.length, 0);
});

test('Estonian and Russian bios are read', () => {
  assert.equal(bioAddress('Адрес: Telliskivi 60/2, Таллин'), 'Telliskivi 60/2, Таллин');
  assert.equal(bioAddress('Aadress: Lai 8'), 'Lai 8');
  assert.equal(addressDiffers('Pikk 39, Tallinn', 'ул. Пикк 41'), true);
  assert.equal(bioClosure('Мы переехали на Telliskivi 60/2'), 'Мы переехали на Telliskivi 60/2');
  assert.equal(bioClosure('Закрыт навсегда'), 'Закрыт навсегда');
  assert.equal(bioClosure('Sulgesime uksed'), 'Sulgesime uksed');
  assert.equal(bioClosure('Meil on uus aadress: Lai 8'), 'Meil on uus aadress: Lai 8');
});
