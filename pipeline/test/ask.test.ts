import { test } from 'node:test';
import assert from 'node:assert/strict';

// A Pages Function is plain JS outside the typed pipeline: load it by path.
const file = '../../functions/api/ask.js';
const { onRequestGet } = await import(file) as { onRequestGet: (c: unknown) => Promise<Response> };

const call = (headers: Record<string, string>) =>
  onRequestGet({ request: new Request('https://wanderalt.app/api/ask?q=free+jazz+tonight', { headers }), env: {}, waitUntil() {} });

test('cross-site browser requests are rejected', async () => {
  assert.equal((await call({})).status, 403);                                             // no origin hint
  assert.equal((await call({ 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await call({ referer: 'https://evil.example/page' })).status, 403);
  assert.equal((await call({ referer: 'http://wanderalt.app/page' })).status, 403);
  assert.equal((await call({ 'sec-fetch-site': 'same-origin' })).status, 503);          // allowed; no model bound in the test
  assert.equal((await call({ referer: 'https://wanderalt.app/index.html' })).status, 503);
});
