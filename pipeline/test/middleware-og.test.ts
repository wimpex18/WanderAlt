import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// Run the Pages middleware with a fake Supabase and a recording HTMLRewriter.
function load(tables: Record<string, unknown[]>) {
  const set: Record<string, string> = {};
  const appended: string[] = [];
  class Rewriter {
    private handlers: [string, { element: (el: unknown) => void }][] = [];
    on(sel: string, h: { element: (el: unknown) => void }) { this.handlers.push([sel, h]); return this; }
    transform(res: Response) {
      for (const [sel, h] of this.handlers) h.element({ setAttribute: (_: string, v: string) => { set[sel] = v; }, setInnerContent: (v: string) => { set[sel] = v; }, append: (html: string) => { appended.push(html); }, remove() {} });
      return res;
    }
  }
  const fetchFake = async (u: string) => {
    const table = String(u).split('/rest/v1/')[1].split('?')[0];
    return new Response(JSON.stringify(tables[table] ?? []), { headers: { 'content-type': 'application/json' } });
  };
  const context: any = createContext({ Response, Request, URL, URLSearchParams, HTMLRewriter: Rewriter, fetch: fetchFake, encodeURIComponent });
  runInContext(readFileSync(new URL('../../functions/_middleware.js', import.meta.url), 'utf8').replace('export async function onRequest', 'async function onRequest'), context);
  return { set, appended, run: (path: string) => context.onRequest({ request: new Request(`https://wanderalt.app${path}`), next: async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }) }) };
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

const ld = (appended: string[]) => {
  const html = appended.find(a => a.startsWith('<script type="application/ld+json">'))!;
  return { html, data: JSON.parse(html.slice('<script type="application/ld+json">'.length, -'</script>'.length)) };
};

test('a place carries a canonical link and Place structured data, with strangers\' text unable to leave the script', async () => {
  const { appended, run } = load({ picks: [], venues: [{ name: 'Pudel </script><script>alert(1)</script>', kind: 'taproom', city: 'tallinn', address: 'Telliskivi 60a, Tallinn', lat: 59.44, lng: 24.73,
    pick_note: 'Craft beer & more', website: 'https://pudel.ee/', instagram: 'javascript:alert(1)', facebook: null, image_url: null }] });
  await run('/detail?id=tallinn-pudel');
  assert.ok(appended.some(a => a === '<link rel="canonical" href="https://wanderalt.app/detail?id=tallinn-pudel">'));
  const { html, data } = ld(appended);
  assert.equal(html.slice(0, -'</script>'.length).includes('</script>'), false);
  assert.equal(data['@type'], 'BarOrPub');
  assert.equal(data.name, 'Pudel </script><script>alert(1)</script>');
  assert.deepEqual(data.sameAs, ['https://pudel.ee/']);
  assert.equal(data.address.streetAddress, 'Telliskivi 60a');
  assert.equal(data.geo.latitude, 59.44);
});

test('a listing carries Event structured data: dates, place, price and status', async () => {
  const { appended, run } = load({ picks: [{ title: 'Jazz night', city: 'tallinn', venue: 'Philly Joe', address: 'Rataskaevu 8, Tallinn', time: '20:00', day: '2026-10-10',
    starts_at: '2026-10-10T17:00:00+00:00', is_free: false, price_min: 12, currency: 'EUR', flag: 'sold_out', ticket_url: 'https://tickets.example/jazz' }], venues: [] });
  await run('/detail?id=evt-1');
  const { data } = ld(appended);
  assert.equal(data['@type'], 'Event');
  assert.equal(data.startDate, '2026-10-10T17:00:00+00:00');
  assert.equal(data.location.name, 'Philly Joe');
  assert.equal(data.offers.price, 12);
  assert.equal(data.offers.availability, 'https://schema.org/SoldOut');
  const dateOnly = load({ picks: [{ title: 'Market', city: 'tallinn', day: '2026-10-11', starts_at: '2026-10-10T21:00:00+00:00', time: null }], venues: [] });
  await dateOnly.run('/detail?id=evt-2');
  assert.equal(ld(dateOnly.appended).data.startDate, '2026-10-11');
});
