import { test } from 'node:test';
import assert from 'node:assert/strict';

const file = '../../functions/sitemap.xml.js';
const mod = await import(file) as { sitemap: (p: unknown[], l: unknown[]) => string; onRequestGet: (c: unknown) => Promise<Response> };

test('the sitemap lists the static pages, picked places and upcoming listings, escaped', () => {
  const xml = mod.sitemap([{ id: 'tallinn-pudel', updated_at: '2026-10-03T12:00:00Z' }, { id: 'a&b' }], [{ id: 'ev_1' }]);
  assert.match(xml, /<loc>https:\/\/wanderalt\.app\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/wanderalt\.app\/places\.html<\/loc>/);
  assert.match(xml, /<loc>https:\/\/wanderalt\.app\/detail\?id=tallinn-pudel<\/loc><lastmod>2026-10-03<\/lastmod>/);
  assert.match(xml, /id=a%26b/);
  assert.match(xml, /detail\?id=ev_1/);
});

test('when Supabase does not answer the static file is served', async () => {
  (globalThis as any).caches = { default: { match: async () => undefined, put: async () => {} } };
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response('down', { status: 500 })) as typeof fetch;
  try {
    const res = await mod.onRequestGet({ request: new Request('https://wanderalt.app/sitemap.xml'), next: async () => new Response('static'), waitUntil() {} });
    assert.equal(await res.text(), 'static');
  } finally { globalThis.fetch = real; }
});
