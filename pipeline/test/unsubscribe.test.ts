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
    assert.equal(r.status, 200); assert.match(await r.text(), /<form method="post"/); assert.equal(called, false);
    assert.equal((await onRequestGet({ request: req('nope'), env: {} })).status, 400);
  } finally { globalThis.fetch = realFetch; }
});

test('the POST switches both alerts off by token, with the secret kept server side', async () => {
  const realFetch = globalThis.fetch; let seen: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(null, { status: 204 }); }) as typeof fetch;
  try {
    const r = await onRequestPost({ request: req(T, 'POST'), env: { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' } });
    assert.equal(r.status, 200);
    assert.match(seen!.url, new RegExp(`digest_prefs\\?unsubscribe_token=eq\\.${T}$`));
    assert.match(String(seen!.init.body), /"weekly":false,"changes":false/);
    assert.doesNotMatch(await r.text(), /sb_secret_x/);
    assert.equal((await onRequestPost({ request: req(T, 'POST'), env: {} })).status, 503);
    assert.equal((await onRequestPost({ request: req('x', 'POST'), env: { SUPABASE_SERVICE_ROLE_KEY: 'k' } })).status, 400);
  } finally { globalThis.fetch = realFetch; }
});
