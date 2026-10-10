import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Models, lanes, claudeCost, strictSchema, chunkText, extractEvents, usage, CLAUDE_ROOM, SMALL_ROOM, type Lane } from '../llm.ts';

test('Haiku 5.5 is billed on the cheap card up to 100,000 prompt tokens, cache included, and five times over it', () => {
  const under = claudeCost({ input_tokens: 60_000, output_tokens: 4_000, cache_read_input_tokens: 2_000, cache_creation_input_tokens: 0 });
  assert.equal(under.prompt, 62_000);
  assert.ok(Math.abs(under.usd - (60_000 * 0.10 + 2_000 * 0.01 + 4_000 * 0.50) / 1e6) < 1e-12);
  // The same request a little bigger crosses the line on its cache reads alone.
  const over = claudeCost({ input_tokens: 99_000, output_tokens: 4_000, cache_read_input_tokens: 2_000, cache_creation_input_tokens: 0 });
  assert.ok(Math.abs(over.usd - 5 * (99_000 * 0.10 + 2_000 * 0.01 + 4_000 * 0.50) / 1e6) < 1e-12);
});

test('only keywords structured outputs accept reach Claude, and a nullable enum keeps its values in its own branch', () => {
  // The two shapes the API refused on 9 October: an enum with null under ["string","null"] (english.ts)
  // and maxItems on an array (routes.ts).
  const out = strictSchema({ type: 'object', properties: {
    language: { type: ['string', 'null'], enum: ['et', 'en', null], description: 'ISO 639-1' },
    routes: { type: 'array', maxItems: 3, minItems: 1, items: { type: 'object', properties: { title: { type: 'string', maxLength: 80, pattern: '^.+$' }, n: { type: 'integer', minimum: 1, maximum: 9 } }, required: ['title', 'n'] } },
  }, required: ['language', 'routes'] }) as any;
  assert.deepEqual(out.properties.language, { description: 'ISO 639-1', anyOf: [{ type: 'string', enum: ['et', 'en'] }, { type: 'null' }] });
  assert.equal(out.properties.routes.maxItems, undefined);
  assert.equal(out.properties.routes.minItems, undefined);
  assert.deepEqual(out.properties.routes.items.properties.title, { type: 'string' });
  assert.deepEqual(out.properties.routes.items.properties.n, { type: 'integer' });
  assert.equal(out.properties.routes.items.additionalProperties, false);
  const keys = (x: any): string[] => !x || typeof x !== 'object' ? [] : Array.isArray(x) ? x.flatMap(keys)
    : Object.entries(x).flatMap(([k, v]) => [...(['properties', '$defs'].includes(k) ? [] : [k]), ...(k === 'properties' ? Object.values(v as object).flatMap(keys) : keys(v))]);
  assert.deepEqual([...new Set(keys(out))].filter(k => !['type', 'properties', 'required', 'items', 'enum', 'anyOf', 'description', 'additionalProperties'].includes(k)), []);
});

test('schemas reach structured outputs closed, with "string or null" as anyOf', () => {
  const out = strictSchema({ type: 'object', properties: {
    items: { type: 'array', items: { type: 'object', properties: { end: { type: ['string', 'null'], description: 'when it ends' }, kind: { type: 'string', enum: ['gig'] } }, required: ['end', 'kind'] } },
  }, required: ['items'] }) as any;
  assert.equal(out.additionalProperties, false);
  assert.equal(out.properties.items.items.additionalProperties, false);
  assert.deepEqual(out.properties.items.items.properties.end, { description: 'when it ends', anyOf: [{ type: 'string' }, { type: 'null' }] });
  assert.deepEqual(out.properties.items.items.properties.kind, { type: 'string', enum: ['gig'] });
});

const sse = (text: string, stop = 'end_turn', usage = { input_tokens: 1_200, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 }) => [
  ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null, ...(stop === 'refusal' ? { stop_details: { type: 'refusal', category: 'general_harms', explanation: null } } : {}) }, usage: { output_tokens: 40 } }],
  ['message_stop', { type: 'message_stop' }],
].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');

async function withClaude<T>(reply: (body: any) => string, run: (lane: Lane, sent: any[]) => Promise<T>): Promise<T> {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const sent: any[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    assert.match(String(url), /^https:\/\/api\.anthropic\.com\/v1\/messages/);
    const body = JSON.parse(init!.body!);
    sent.push(body);
    return new Response(reply(body), { headers: { 'content-type': 'text/event-stream' } });
  }) as typeof fetch;
  const before = structuredClone(usage.claude);
  try { return await run(lanes().find(l => l.name === 'claude')!, sent); }
  finally { globalThis.fetch = real; delete process.env.ANTHROPIC_API_KEY; Object.assign(usage.claude, before); }
}

test('the Claude lane comes first, asks Haiku 5.5 for structured JSON at low effort with the instructions cached, and counts its cost', async () => {
  await withClaude(() => sse('{"ok":true}'), async (lane, sent) => {
    assert.equal(lanes()[0].name, 'claude');
    assert.equal(lane.model, 'claude-haiku-5-5');
    assert.equal(lane.room, CLAUDE_ROOM);
    const before = usage.claude.usd;
    assert.equal(await lane.call('System words.', 'User words.', { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }), '{"ok":true}');
    const body = sent[0];
    assert.equal(body.model, 'claude-haiku-5-5');
    assert.equal(body.stream, true);
    assert.equal(body.output_config.effort, 'low');
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.equal(body.output_config.format.schema.additionalProperties, false);
    assert.deepEqual(body.system, [{ type: 'text', text: 'System words.', cache_control: { type: 'ephemeral' } }]);
    // Haiku 5.5 refuses non-default sampling and manual thinking budgets.
    assert.equal(body.temperature, undefined);
    assert.equal(body.thinking, undefined);
    assert.ok(usage.claude.usd - before > 0);
    assert.equal(usage.claude.cacheRead >= 900, true);
  });
});

test('a declined request goes to the next lane without counting against Claude; a spent cap skips Claude', async () => {
  await withClaude(() => sse('', 'refusal'), async (claude) => {
    const asked: string[] = [];
    const free: Lane = { name: 'workers-ai', model: 'w', key: 'k', call: async () => { asked.push('workers-ai'); return '{"ok":true}'; } };
    const m = new Models([claude, free], 10, 1_000_000);
    for (let i = 0; i < 3; i++) assert.equal((await m.ask('s', 'u', {})).engine, 'workers-ai:w');
    assert.equal(asked.length, 3);
    // Three declines in a row, and Claude is still asked first: a refusal is about the text, not the lane.
    assert.equal(m.room, CLAUDE_ROOM);
  });
  const spent: Lane = { name: 'claude', model: 'c', key: 'k', room: CLAUDE_ROOM, spent: () => true, call: async () => { throw new Error('must not be asked'); } };
  const free: Lane = { name: 'workers-ai', model: 'w', key: 'k', call: async () => '{"ok":true}' };
  const m = new Models([spent, free], 10, 1_000_000);
  assert.equal(m.room, SMALL_ROOM);
  assert.equal((await m.ask('s', 'u', {})).engine, 'workers-ai:w');
});

test('a programme page is read whole on Claude and in 5,000-character parts on the free lanes, and again in parts when the whole read fails', async () => {
  const page = Array.from({ length: 60 }, (_, i) => `Line ${i}: ${'x'.repeat(200)}`).join('\n');   // about 12,600 characters
  assert.equal(chunkText(page, CLAUDE_ROOM).length, 1);
  assert.equal(chunkText(page).length, 3);
  const seen: { lane: string; length: number }[] = [];
  const event = '{"events":[{"title":"Show","start":"2099-01-01 19:00","end":null,"venue":"Uus Laine","address":null,"price":null,"url":null,"language":"en","excerpt":"A show.","state":"scheduled"}]}';
  const whole: Lane = { name: 'claude', model: 'c', key: 'k', room: CLAUDE_ROOM, call: async (_s, u) => { seen.push({ lane: 'claude', length: u.length }); return event; } };
  await extractEvents(new Models([whole], 10, 0), { text: page, source: 'test' });
  assert.equal(seen.length, 1);

  seen.length = 0;
  const failing: Lane = { ...whole, call: async (_s, u) => { seen.push({ lane: 'claude', length: u.length }); throw new Error('answer cut off at max_tokens'); } };
  const free: Lane = { name: 'workers-ai', model: 'w', key: 'k', call: async (_s, u) => { seen.push({ lane: 'workers-ai', length: u.length }); return event; } };
  const out = await extractEvents(new Models([failing, free], 20, 1_000_000), { text: page, source: 'test' });
  assert.equal(seen[0].lane, 'claude');
  // Claude's whole-page read fails; the free lane reads it once whole (it is next in line), then the
  // retry in small parts goes to whoever is left.
  assert.ok(seen.filter(s => s.lane === 'workers-ai').some(s => s.length < SMALL_ROOM + 200));
  assert.ok(out.length >= 1);
});
