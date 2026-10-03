import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// Run the Pages middleware with a fake Supabase and a recording HTMLRewriter.
function load(tables: Record<string, unknown[]>) {
  const set: Record<string, string> = {};
  class Rewriter {
    private handlers: [string, { element: (el: unknown) => void }][] = [];
    on(sel: string, h: { element: (el: unknown) => void }) { this.handlers.push([sel, h]); return this; }
    transform(res: Response) {
      for (const [sel, h] of this.handlers) h.element({ setAttribute: (_: string, v: string) => { set[sel] = v; }, setInnerContent: (v: string) => { set[sel] = v; }, remove() {} });
      return res;
    }
  }
  const fetchFake = async (u: string) => {
    const table = String(u).split('/rest/v1/')[1].split('?')[0];
    return new Response(JSON.stringify(tables[table] ?? []), { headers: { 'content-type': 'application/json' } });
  };
  const context: any = createContext({ Response, Request, URL, URLSearchParams, HTMLRewriter: Rewriter, fetch: fetchFake, encodeURIComponent });
  runInContext(readFileSync(new URL('../../functions/_middleware.js', import.meta.url), 'utf8').replace('export async function onRequest', 'async function onRequest'), context);
  return { set, run: (path: string) => context.onRequest({ request: new Request(`https://wanderalt.app${path}`), next: async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }) }) };
}

test('a shared Guide place gets its own preview, built from the row', async () => {
  const { set, run } = load({ picks: [], venues: [{ name: 'Pudel', kind: 'taproom', city: 'tallinn', neighborhood: 'Kalamaja', pick_note: 'Estonia first craft beer bar.', image_url: null }] });
  await run('/detail?id=tallinn-pudel');
  assert.equal(set['meta[property="og:title"]'], 'Pudel · WanderAlt');
  assert.equal(set['meta[property="og:description"]'], 'Estonia first craft beer bar.');
});

test('an unknown id keeps the default preview, and a listing still wins over a place', async () => {
  const unknown = load({ picks: [], venues: [] });
  await unknown.run('/detail?id=nothing');
  assert.equal(unknown.set['meta[property="og:title"]'], undefined);
  const listing = load({ picks: [{ title: 'Jazz night', city: 'tallinn', venue: 'Philly Joe', time: '20:00' }], venues: [{ name: 'Wrong' }] });
  await listing.run('/detail?id=evt-1');
  assert.match(listing.set['meta[property="og:title"]'], /Jazz night/);
});
