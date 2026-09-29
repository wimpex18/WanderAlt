import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaName, isDistrict } from '../places.ts';
import { lanes, Models } from '../llm.ts';

test('areas are the asum a visitor knows', () => {
  assert.equal(areaName({ quarter: 'Kalamaja', suburb: 'Põhja-Tallinna linnaosa' }), 'Kalamaja');
  assert.equal(areaName({ neighbourhood: 'All-linn', quarter: 'Vanalinn' }), 'Old Town');
  assert.equal(areaName({ suburb: 'Kristiine linnaosa' }), 'Kristiine');
  assert.equal(isDistrict('Põhja-Tallinna'), true);
  assert.equal(isDistrict(null), true);
  assert.equal(isDistrict('Kalamaja'), false);
});

test('OpenRouter is asked with at most three free models', async () => {
  process.env.OPENROUTER_API_KEY = 'test';
  const sent: { models?: string[] }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    sent.push(JSON.parse(init!.body!));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
  }) as typeof fetch;
  try {
    const lane = lanes().find(l => l.name === 'openrouter')!;
    await lane.call('s', 'u', {});
    assert.ok(sent[0].models!.length <= 3);
    assert.equal(new Set(sent[0].models).size, sent[0].models!.length);
    assert.ok(sent[0].models!.every(m => m.endsWith(':free')));
  } finally { globalThis.fetch = real; delete process.env.OPENROUTER_API_KEY; }
});

test('a run\'s Workers AI budget can be lowered after construction', () => {
  const m = new Models([], 10, 1500);
  m.neuronBudget = 0;
  assert.equal(m.neuronBudget, 0);
});
