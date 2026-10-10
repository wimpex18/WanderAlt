import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaName, isDistrict } from '../places.ts';
import { Models } from '../llm.ts';

test('areas are the asum a visitor knows', () => {
  assert.equal(areaName({ quarter: 'Kalamaja', suburb: 'Põhja-Tallinna linnaosa' }), 'Kalamaja');
  assert.equal(areaName({ neighbourhood: 'All-linn', quarter: 'Vanalinn' }), 'Old Town');
  assert.equal(areaName({ suburb: 'Kristiine linnaosa' }), 'Kristiine');
  assert.equal(isDistrict('Põhja-Tallinna'), true);
  assert.equal(isDistrict(null), true);
  assert.equal(isDistrict('Kalamaja'), false);
});

test('a classification batch that is cut off is read again in halves', async () => {
  const asked: number[] = [];
  const lane = {
    name: 'test', model: 'm', key: 'k',
    call: async (_s: string, user: string) => {
      const items = JSON.parse(user) as { i: number }[];
      asked.push(items.length);
      if (items.length > 2) throw new Error('answer cut off at max_tokens');
      return JSON.stringify({ items: items.map(x => ({ i: x.i, kind: 'gig', tags: ['jazz'], relevance: 0.8 })) });
    },
  };
  const { classify } = await import('../llm.ts');
  const cands = Array.from({ length: 4 }, (_, i) => ({ title: `Show ${i}`, description: null, starts_at: '2026-10-01T18:00:00Z', has_time: true, engine: 't' })) as never[];
  const out = await classify(new Models([lane], 20), cands, 4);
  assert.deepEqual(asked, [4, 2, 2]);
  assert.ok(out.every(e => e.relevance === 0.8 && e.kind === 'gig'));
});

test('a Cyrillic venue is never a place', async () => {
  const { latinOnly } = await import('../llm.ts');
  const { Places } = await import('../places.ts');
  const { retireForeignScriptPlaces } = await import('../maintenance.ts');
  assert.equal(latinOnly('Нымме'), null);
  assert.equal(latinOnly(' Kanuti Gildi SAAL '), 'Kanuti Gildi SAAL');
  assert.equal(latinOnly(null), null);
  const places = new Places([], 'tallinn', 0);
  assert.equal(await places.resolve({ venue_name: 'театр «Эстония»' } as never, false), null);
  const calls: string[] = [];
  const db = {
    patch: async (path: string) => { calls.push(`PATCH ${path}`); },
    req: async (method: string, path: string) => { calls.push(`${method} ${path}`); },
  };
  const kept = await retireForeignScriptPlaces(db as never, [
    { id: 'tallinn--4', city: 'tallinn', name: 'Нымме', aliases: [], lat: null } as never,
    { id: 'tallinn-nomme', city: 'tallinn', name: 'Nõmme Kultuurikeskus', aliases: [], lat: 59.3 } as never,
  ]);
  assert.deepEqual(kept.map(p => p.id), ['tallinn-nomme']);
  assert.deepEqual(calls, ['PATCH events?place_id=eq.tallinn--4', 'DELETE places?id=eq.tallinn--4']);
});
