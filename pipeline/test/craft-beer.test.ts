import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeFromOsm } from '../venues.ts';
import sources from '../sources.tallinn.json' with { type: 'json' };

const pub = { type: 'node', id: 2408088880, lat: 59.4389, lon: 24.7284, tags: { amenity: 'pub', name: 'Põhja Konn', opening_hours: 'Su-Th 14:00-24:00' } };

test('a pub is only a taproom when the city lists it', () => {
  assert.equal(placeFromOsm(pub, 'tallinn'), null);
  const p = placeFromOsm(pub, 'tallinn', new Set(['node/2408088880']));
  assert.equal(p?.kind, 'taproom');
  assert.equal(p?.id, 'tallinn-pohja-konn');
  assert.equal(p?.hours_source, 'osm');
});

test('the Tallinn osm source lists unique node references', () => {
  const osm = (sources as { id: string; config: { craft_beer?: string[] } }[]).find(s => s.id === 'osm-tallinn')!;
  const list = osm.config.craft_beer ?? [];
  assert.ok(list.length >= 3, 'the Drink mood needs three places');
  assert.equal(new Set(list).size, list.length);
  assert.ok(list.every(r => /^(node|way|relation)\/\d+$/.test(r)));
});
