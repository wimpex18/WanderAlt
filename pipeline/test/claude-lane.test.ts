import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../cities.ts';
import { Models, claudeLane, claudeCost, strictSchema, chunkText, extractEvents, transcribePoster, usage, CLAUDE_ROOM, SMALL_ROOM, type Lane } from '../llm.ts';

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
  try { return await run(claudeLane(), sent); }
  finally { globalThis.fetch = real; delete process.env.ANTHROPIC_API_KEY; Object.assign(usage.claude, before); }
}

test('the Claude lane asks Haiku 5.5 for structured JSON at low effort with the instructions cached, and counts its cost', async () => {
  await withClaude(() => sse('{"ok":true}'), async (lane, sent) => {
    assert.equal(new Models().available[0].name, 'claude');
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

test('a declined request leaves that text unread without counting against the lane; a spent cap stops it', async () => {
  await withClaude(() => sse('', 'refusal'), async (claude) => {
    const m = new Models([claude], 10);
    for (let i = 0; i < 3; i++) await assert.rejects(m.ask('s', 'u', {}), /declined/);
    // Three declines in a row, and Claude is still asked: a refusal is about the text, not the lane.
    assert.equal(m.ready, true);
    assert.equal(m.room, CLAUDE_ROOM);
  });
  const spent: Lane = { name: 'claude', model: 'c', key: 'k', room: CLAUDE_ROOM, spent: () => true, call: async () => { throw new Error('must not be asked'); } };
  const m = new Models([spent], 10);
  assert.equal(m.ready, false);
  await assert.rejects(m.ask('s', 'u', {}));
});

test('a programme page is read whole, and again in 5,000-character parts when the whole read fails', async () => {
  const page = Array.from({ length: 60 }, (_, i) => `Line ${i}: ${'x'.repeat(200)}`).join('\n');   // about 12,600 characters
  assert.equal(chunkText(page, CLAUDE_ROOM).length, 1);
  assert.equal(chunkText(page).length, 3);
  const seen: number[] = [];
  const event = '{"events":[{"title":"Show","start":"2099-01-01 19:00","end":null,"venue":"Uus Laine","address":null,"price":null,"url":null,"language":"en","excerpt":"A show.","state":"scheduled"}]}';
  const whole: Lane = { name: 'claude', model: 'c', key: 'k', room: CLAUDE_ROOM, call: async (_s, u) => { seen.push(u.length); return event; } };
  await extractEvents(new Models([whole], 10), { text: page, source: 'test', city: CITIES.tallinn });
  assert.equal(seen.length, 1);

  seen.length = 0;
  // A whole-page answer cut off at max_tokens: the page is read again in small parts.
  const cut: Lane = { ...whole, call: async (_s, u) => { seen.push(u.length); if (u.length > SMALL_ROOM + 200) throw new Error('answer cut off at max_tokens'); return event; } };
  const out = await extractEvents(new Models([cut], 20), { text: page, source: 'test', city: CITIES.tallinn });
  assert.ok(seen[0] > SMALL_ROOM + 200);
  assert.ok(seen.slice(1).length >= 3 && seen.slice(1).every(n => n < SMALL_ROOM + 200));
  assert.ok(out.length >= 1);
});

test('a poster is read by Haiku 5.5 from the image, at low effort, on the run\'s Claude budget', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const sent: any[] = [];
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    if (String(url).startsWith('https://cdn.example/')) return new Response(png, { headers: { 'content-type': 'image/png' } });
    assert.match(String(url), /^https:\/\/api\.anthropic\.com\/v1\/messages/);
    sent.push(JSON.parse(init!.body!));
    return new Response(JSON.stringify({ id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: 'BRUNO\nL 24.10 kell 20\nUus Laine' }], usage: { input_tokens: 1_600, output_tokens: 30 } }), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const before = structuredClone(usage.claude);
  try {
    assert.equal(await transcribePoster('https://cdn.example/poster.png'), 'BRUNO\nL 24.10 kell 20\nUus Laine');
    const body = sent[0];
    assert.equal(body.model, 'claude-haiku-5-5');
    assert.equal(body.output_config.effort, 'low');
    assert.equal(body.messages[0].content[0].type, 'image');
    assert.equal(body.messages[0].content[0].source.media_type, 'image/png');
    assert.equal(body.messages[0].content[0].source.data, png.toString('base64'));
    assert.equal(usage.claude.requests, before.requests + 1);
    assert.equal(await transcribePoster('https://cdn.example/not-an-image.txt'.replace('cdn.example', 'elsewhere.example')), null);
  } finally {
    globalThis.fetch = real; Object.assign(usage.claude, before);
    if (saved) process.env.ANTHROPIC_API_KEY = saved; else delete process.env.ANTHROPIC_API_KEY;
  }
});

test('web search finds pages, cited ones first, never the guide itself, and each search counts against the budget', async () => {
  const { searchWeb, HAIKU } = await import('../llm.ts');
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const sent: any[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    assert.match(String(url), /^https:\/\/api\.anthropic\.com\/v1\/messages/);
    sent.push(JSON.parse(init!.body!));
    return new Response(JSON.stringify({ id: 'msg_3', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', stop_sequence: null,
      content: [
        { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'Jazzliit Philly Joe 16 October' } },
        { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [
          { type: 'web_search_result', url: 'https://piletikeskus.ee/et/e/vt9s8h', title: 'Liina Tralla', encrypted_content: 'x', page_age: null },
          { type: 'web_search_result', url: 'https://www.phillyjoes.com/programme', title: 'Programme', encrypted_content: 'y', page_age: null },
        ] },
        { type: 'text', text: 'It is on 16 October at 20:00.', citations: [{ type: 'web_search_result_location', url: 'https://www.phillyjoes.com/programme', title: 'Programme', encrypted_index: 'z', cited_text: 'Oct 16 8:00 PM 20:00' }] },
      ],
      usage: { input_tokens: 20_000, output_tokens: 900, server_tool_use: { web_search_requests: 2 } } }), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const before = structuredClone(usage.claude);
  try {
    const found = await searchWeb('Find the show', { city: CITIES.tallinn, maxUses: 2, blocked: ['instagram.com'] });
    assert.deepEqual(found.map(f => f.url), ['https://www.phillyjoes.com/programme', 'https://piletikeskus.ee/et/e/vt9s8h']);
    assert.equal(found[0].cited, 'Oct 16 8:00 PM 20:00');
    const tool = sent[0].tools[0];
    assert.equal(tool.type, 'web_search_20250305');
    assert.equal(tool.max_uses, 2);
    assert.deepEqual(tool.blocked_domains, ['wanderalt.app', 'instagram.com']);
    assert.equal(tool.user_location.country, undefined, 'the search tool refuses EE');
    assert.match(sent[0].system, /The current date is \d{4}-\d{2}-\d{2}/);
    assert.equal(usage.claude.searches - before.searches, 2);
    const tokens = (20_000 * HAIKU.input + 900 * HAIKU.output) / 1e6;
    assert.ok(Math.abs(usage.claude.usd - before.usd - (tokens + 2 * HAIKU.search)) < 1e-9);
  } finally {
    globalThis.fetch = real; Object.assign(usage.claude, before);
    if (saved) process.env.ANTHROPIC_API_KEY = saved; else delete process.env.ANTHROPIC_API_KEY;
  }
});
