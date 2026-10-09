import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// functions/feed.xml.js is a Pages Function module; run its pure parts in a context.
function feed() {
  const context: any = createContext({ Intl, Date, Number, String, encodeURIComponent });
  runInContext(readFileSync(new URL('../../functions/feed.xml.js', import.meta.url), 'utf8').replace(/export (async )?function/g, '$1function'), context);
  return context;
}
const base = { id: 'ev_1', title: 'Laine Club Night: Yung Singh (UK)', venue: 'Uus Laine', neighborhood: 'Kalamaja', kind: 'club',
  quote: 'Club night featuring the UK act Yung Singh.', time: '21:00', starts_at: '2026-10-09T18:00:00Z', flag: null,
  is_free: null, price_min: null, price_max: null, currency: null, created_at: '2026-10-05T10:00:00Z' };

test('the RSS feed states only held facts: time in Tallinn, place, a stated price or none', () => {
  const f = feed();
  assert.equal(f.factsOf(base), 'Fri 9 Oct, 21:00. Uus Laine, Kalamaja.');
  assert.equal(f.factsOf({ ...base, price_min: 10, currency: 'EUR' }), 'Fri 9 Oct, 21:00. Uus Laine, Kalamaja. €10.');
  assert.equal(f.priceOf({ is_free: true }), 'Free');
  assert.equal(f.priceOf({ price_min: 8, price_max: 15, currency: 'EUR' }), '€8–15');
  assert.equal(f.priceOf({ price_min: 9.5, currency: 'EUR' }), '€9.50');
  assert.equal(f.factsOf({ ...base, time: null }), 'Fri 9 Oct, time not listed. Uus Laine, Kalamaja.');
});

test('the RSS feed is well formed, links each listing page and marks called-off shows', () => {
  const f = feed();
  const out: string = f.rss([base, { ...base, id: 'ev_2', title: 'Murdja <live> & "friends"', flag: 'cancelled' }, { ...base, id: 'ev_3', flag: 'sold_out' }], new Date('2026-10-09T15:00:00Z'));
  assert.match(out, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/);
  assert.match(out, /<link>https:\/\/wanderalt.app\/detail\?id=ev_1<\/link>/);
  assert.match(out, /<title>Cancelled: Murdja &lt;live&gt; &amp; &quot;friends&quot;<\/title>/);
  assert.match(out, /<description>Fri 9 Oct, 21:00\. Uus Laine, Kalamaja\. Sold out\. Club night/);
  assert.match(out, /<category>Club night<\/category>/);
  assert.doesNotMatch(out, /<[^>]*<|&(?!amp;|lt;|gt;|quot;|apos;)/);
  assert.equal((out.match(/<item>/g) || []).length, 3);
});
