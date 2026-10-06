import { test } from 'node:test';
import assert from 'node:assert/strict';

const file = '../../functions/api/unsubscribe.js';
const { onRequestGet, onRequestPost } = await import(file) as { onRequestGet: (c: unknown) => Promise<Response>; onRequestPost: (c: unknown) => Promise<Response> };
const T = '0a1b2c3d-0000-4000-8000-000000000000';
const req = (t: string, method = 'GET') => new Request(`https://wanderalt.app/api/unsubscribe?t=${t}`, { method });

test('opening the link only shows a button, so a mail scanner cannot unsubscribe anyone', async () => {
  const realFetch = globalThis.fetch; let called = false;
  globalThis.fetch = (async () => { called = true; return new Response(null, { status: 204 }); }) as typeof fetch;
  try {
    const r = await onRequestGet({ request: req(T), env: { SUPABASE_SERVICE_ROLE_KEY: 'k' } });
    const html = await r.text();
    assert.equal(r.status, 200); assert.match(html, /<form method="post"/); assert.equal(called, false);
    for (const asset of ['/lang/et.js', '/lang/ru.js', '/lang/uk.js', '/i18n.js']) assert.ok(html.includes(`src="${asset}"`));
    assert.match(html, /Stop email and notifications\?/);
    assert.match(html, /Stop alerts<\/button>/);
    assert.equal((await onRequestGet({ request: req('nope'), env: {} })).status, 400);
  } finally { globalThis.fetch = realFetch; }
});

test('the POST asks the unsubscribe function with the token and holds no secret itself', async () => {
  const realFetch = globalThis.fetch; let seen: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(null, { status: 204 }); }) as typeof fetch;
  try {
    const r = await onRequestPost({ request: req(T, 'POST'), env: {} });
    assert.equal(r.status, 200);
    assert.match(seen!.url, /\/functions\/v1\/unsubscribe$/);
    assert.equal(String(seen!.init.body), JSON.stringify({ t: T }));
    assert.equal(new Headers(seen!.init.headers).get('authorization'), null);
    assert.equal((await onRequestPost({ request: req('x', 'POST'), env: {} })).status, 400);
    globalThis.fetch = (async () => new Response(null, { status: 502 })) as typeof fetch;
    assert.equal((await onRequestPost({ request: req(T, 'POST'), env: {} })).status, 502);
  } finally { globalThis.fetch = realFetch; }
});
