import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, type CityProfile, wordsOf } from '../cities.ts';
import { normaliseAddress, isDistrict, areaName, venueName } from '../places.ts';
import { addressKey, core } from '../place-match.ts';
import { programmeWords } from '../place-verification.ts';

// A second city is one profile: nothing in these helpers names Tallinn any more.
const riga: CityProfile = {
  ...CITIES.tallinn, id: 'riga', name: 'Riga', country: 'lv', languages: ['lv', 'en', 'ru'],
  districts: /^(centrs|latgales priekšpilsēta)$/i, districtSuffix: / apkaime$/, areaNames: { 'Vecrīga': 'Old Riga' },
  streets: { drop: ['iela'], short: { bulvāris: 'bulv.' } }, region: /,?\s*Rīga\s*LV-\d{4}\b/gi, postcode: /\bLV-\d{4}\b/g,
  cityWords: ['riga', 'rīga', 'latvia'], bracketPlaces: ['rīgā', 'riga'], legalForms: ['sia'], osm: { area: 'Rīga', adminLevel: 8 },
  portalHosts: /(^|\.)riga\.lv$/i, venueNaming: 'as the place is named in Riga (Latvian or English)',
};

test('a city\'s own address, area and name words are the ones used', () => {
  assert.equal(normaliseAddress('Brīvības iela 36, LV-1011', riga), 'Brīvības 36, Riga');
  assert.equal(addressKey('Brīvības iela 36', riga), 'brivibas 36');
  assert.equal(isDistrict('Centrs', riga), true);
  assert.equal(isDistrict('Kesklinna linnaosa', riga), false);
  assert.equal(areaName({ quarter: 'Vecrīga' }, riga), 'Old Riga');
  assert.equal(venueName('Kaņepes Kultūras centrs (Rīgā)', riga), 'Kaņepes Kultūras centrs');
  assert.equal(core('SIA Gallery Riga', riga), '');
  // Tallinn keeps its own: the defaults are its profile.
  assert.equal(normaliseAddress('Kentmanni tänav 28, 10116 Tallinn'), 'Kentmanni 28, Tallinn');
  assert.equal(venueName('Gin Spot Bar (Tallinnas)'), 'Gin Spot Bar');
});

test('words that belong to a language follow the city\'s languages', () => {
  assert.ok(wordsOf(CITIES.tallinn, 'programme').includes('kava'));
  assert.ok(!wordsOf(riga, 'programme').includes('kava'), 'Estonian words are not read in Riga');
  assert.ok(programmeWords(CITIES.tallinn).test('/et/kava/'));
  assert.ok(!programmeWords(riga).test('/et/kava/'));
  assert.ok(programmeWords(riga).test('/en/events/'));
});
