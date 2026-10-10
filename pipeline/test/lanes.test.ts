import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Claude Haiku 5.5 is the one lane, and a lane that fails twice is not asked again this run', async () => {
  const { Models } = await import('../llm.ts');
  const saved = process.env.ANTHROPIC_API_KEY;
  try {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    assert.deepEqual(new Models().available.map(l => `${l.name}:${l.model}`), ['claude:claude-haiku-5-5']);
    delete process.env.ANTHROPIC_API_KEY;
    assert.deepEqual(new Models().available, [], 'without the key there is no lane, and prose waits');
  } finally { if (saved) process.env.ANTHROPIC_API_KEY = saved; }

  let tries = 0;
  const broken = { name: 'claude', model: 'm', key: 'k', call: async () => { tries++; throw new Error('500 overloaded'); } };
  const m = new Models([broken], 10);
  await assert.rejects(m.ask('s', 'u', {}));
  await assert.rejects(m.ask('s', 'u', {}));
  assert.equal(m.ready, false);
  await assert.rejects(m.ask('s', 'u', {}));
  assert.equal(tries, 2);
});
