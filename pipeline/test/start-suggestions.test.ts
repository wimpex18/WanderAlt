import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function suggestions() {
  const WA: any = {};
  runInContext(readFileSync(new URL('../../city.js', import.meta.url), 'utf8'), createContext({
    window: { WA }, localStorage: { getItem: () => null },
    document: { readyState: 'loading', addEventListener: () => {} },
  }));
  return WA;
}

test('live city is available from its first letter and localized aliases, without unsupported cities', () => {
  const suggest = suggestions().startSuggestions;
  for (const query of ['T', 'Ta', 'Tal', ' tallinn ', 'Тал', 'Таллін']) {
    const result = suggest(query);
    assert.equal(result[0].label, 'Tallinn');
    assert.equal(result[0].city, true);
    assert.equal(result[0].lat, 59.4342);
  }
  for (const query of ['', 'He', 'Ri', 'Vil', 'Atlantis']) assert.equal(suggest(query).length, 0);
});

test('venue suggestions are unique, relevant, bounded and backed by coordinates', () => {
  const suggest = suggestions().startSuggestions;
  const venues = [
    { name: 'Other Tallinn', lat: 1, lng: 2 },
    { name: 'Tallinn Records', lat: 59, lng: 24 },
    { name: 'Tallinn Records', lat: 59, lng: 24 },
    { name: 'Tallinn Closed', lat: 59, lng: 24, isClosed: true },
    { name: 'Tallinn Missing', lat: null, lng: 24 },
    { name: 'Tallinn Elsewhere', lat: 60, lng: 25, city: 'helsinki' },
  ];
  const result = suggest('Ta', venues);
  assert.equal(JSON.stringify(result.map((s: any) => s.label)), JSON.stringify(['Tallinn', 'Tallinn Records', 'Other Tallinn']));
  assert.equal(result[1].city, false);
  assert.equal(suggest('Ta', Array.from({ length: 30 }, (_, i) => ({ name: `Tallinn ${i}`, lat: 59, lng: 24 }))).length, 8);
  assert.equal(suggest('poh', [{ name: 'Põhjala', lat: 59, lng: 24 }])[0].label, 'Põhjala');
});

test('position matching is limited to live coverage, including the Riga boundary', () => {
  const WA = suggestions();
  runInContext(readFileSync(new URL('../../geo.js', import.meta.url), 'utf8'), createContext({
    window: { WA }, localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null, removeItem: () => {} },
    document: { dispatchEvent: () => {} }, navigator: {}, CustomEvent: class {},
  }));
  assert.equal(WA.cityForLocation({ lat: 59.437, lng: 24.745 }).id, 'tallinn');
  assert.equal(WA.cityForLocation({ lat: 56.9496, lng: 24.1052 }), null, 'Riga has no live catalogue yet');
  assert.equal(WA.cityForLocation({ lat: 60.1699, lng: 24.9384 }), null);
  assert.equal(WA.cityForLocation(null), null);
});
