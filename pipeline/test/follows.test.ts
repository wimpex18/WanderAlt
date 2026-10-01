import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function load() {
  const values = new Map<string, string>();
  const WA: Record<string, any> = { CITY: 'tallinn', BASE_URL: 'https://x.example' };
  const context = createContext({ window: { WA }, localStorage: {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  }, CustomEvent: class { detail: unknown; constructor(_t: string, o: any) { this.detail = o?.detail; } },
  document: { addEventListener: () => {}, dispatchEvent: () => {} } });
  runInContext(readFileSync(new URL('../../follow.js', import.meta.url), 'utf8'), context);
  return { F: WA.Follows, values };
}

test('two venues with one name are told apart by id, and a source is not a venue', () => {
  const { F } = load();
  F.set(F.placeId({ id: 'tallinn-a' }), true, 'Same Name');
  assert.equal(F.matchesEvent({ venueId: 'tallinn-a', venue: 'Same Name' }), true);
  assert.equal(F.matchesEvent({ venueId: 'tallinn-b', venue: 'Same Name' }), false);
  F.set(F.sourceId('@Collective'), true, '@Collective');
  assert.equal(F.matchesEvent({ venueId: 'x', handle: '@collective' }), true);
  assert.equal(F.label('src:collective'), '@Collective');
});

test('bare names saved before ids still match, then migrate once; an ambiguous name stays put', () => {
  const { F } = load();
  F.set('Kino Sõprus', true); F.set('Twin', true); F.set('@sigmundtells', true);
  assert.equal(F.matchesEvent({ venue: 'kino sõprus', venueId: 'tallinn-kino-soprus' }), true);
  const n = F.migrate([
    { id: 'tallinn-kino-soprus', name: 'Kino Sõprus' },
    { id: 'tallinn-twin-1', name: 'Twin' }, { id: 'tallinn-twin-2', name: 'Twin' }]);
  assert.equal(n, 2);
  assert.deepEqual(Array.from(F.keys()).sort(), ['place:tallinn-kino-soprus', 'src:sigmundtells', 'twin']);
  assert.equal(F.migrate([]), 0);
});

test('calendar links per follow carry the id, never a typed name', () => {
  const { F } = load();
  assert.equal(F.feedUrl('place:tallinn-kino-soprus'), 'https://x.example/functions/v1/calendar-feed?city=tallinn&place=tallinn-kino-soprus');
  assert.match(F.feedUrl('src:sigmundtells'), /handle=%40sigmundtells$/);
  assert.equal(F.feedUrl('some name'), '');
});
