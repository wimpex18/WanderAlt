import { test } from 'node:test';
import assert from 'node:assert/strict';

test('a lane with a per-run cap stops at it and the next lane answers; a day-limit 429 ends the lane without waiting', async () => {
  const { Models } = await import('../llm.ts');
  const asked: string[] = [];
  const ok = (name: string) => async () => { asked.push(name); return '{"ok":true}'; };
  const capped = { name: 'openrouter', model: 'm', key: 'k', maxCalls: 2, call: ok('openrouter') };
  const spare = { name: 'workers-ai', model: 'w', key: 'k', call: ok('workers-ai') };
  const m = new Models([capped, spare], 10, 1_000_000);
  for (let i = 0; i < 4; i++) await m.ask('s', 'u', {});
  assert.deepEqual(asked, ['openrouter', 'openrouter', 'workers-ai', 'workers-ai']);

  let tries = 0;
  const daily = { name: 'openrouter', model: 'm', key: 'k', call: async () => { tries++; throw Object.assign(new Error('429 {"error":{"message":"Rate limit exceeded: free-models-per-day"}}'), { status: 429 }); } };
  const m2 = new Models([daily], 10, 1_000_000);
  await assert.rejects(m2.ask('s', 'u', {}));
  assert.equal(tries, 1);                 // no retry, no minute-long wait
  assert.equal(m2.ready, false);
});
