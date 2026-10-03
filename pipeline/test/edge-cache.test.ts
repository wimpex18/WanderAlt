import { test } from 'node:test';
import assert from 'node:assert/strict';

const file = '../../functions/api/rest/[table].js';
const { onRequestGet } = await import(file) as { onRequestGet: (c: unknown) => Promise<Response> };

function setup(upstream: (u: string, init: RequestInit) => Promise<Response>) {
  const store = new Map<string, Response>();
  (globalThis as any).caches = { default: { match: async (k: Request) => store.get(k.url)?.clone(), put: async (k: Request, r: Response) => { store.set(k.url, r); } } };
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (u: string, init: RequestInit) => { calls.push(String(u)); return upstream(String(u), init); }) as typeof fetch;
  const puts: Promise<unknown>[] = [];
  const get = (path: string, table: string) => onRequestGet({ request: new Request(`https://wanderalt.app/api/rest/${path}`), params: { table }, waitUntil: (p: Promise<unknown>) => puts.push(p) });
  return { calls, get, flush: () => Promise.all(puts), restore: () => { globalThis.fetch = realFetch; } };
}

test('one upstream read per query, then the edge cache answers', async () => {
  const t = setup(async () => new Response('[{"id":"a"}]', { headers: { 'content-type': 'application/json' } }));
  try {
    const a = await t.get('picks?select=id&limit=1000', 'picks'); await t.flush();
    const b = await t.get('picks?select=id&limit=1000', 'picks');
    assert.equal(await a.text(), '[{"id":"a"}]'); assert.equal(await b.text(), '[{"id":"a"}]');
    assert.equal(t.calls.length, 1);
    assert.match(t.calls[0], /\/rest\/v1\/picks\?select=id&limit=1000$/);
    assert.match(a.headers.get('cache-control')!, /s-maxage=300/);
    await t.get('picks?select=id&limit=500', 'picks');
    assert.equal(t.calls.length, 2);
  } finally { t.restore(); }
});

test('only the listed public tables are read, and an upstream failure is never cached', async () => {
  const t = setup(async () => new Response('{"message":"boom"}', { status: 500 }));
  try {
    assert.equal((await t.get('social_tokens?select=*', 'social_tokens')).status, 404);
    assert.equal(t.calls.length, 0);
    const r = await t.get('venues?select=id', 'venues'); await t.flush();
    assert.equal(r.status, 502); assert.equal(r.headers.get('cache-control'), 'no-store');
    await t.get('venues?select=id', 'venues');
    assert.equal(t.calls.length, 2);
  } finally { t.restore(); }
});
