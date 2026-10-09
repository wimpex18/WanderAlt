/* ============================================================
   /api/rest/<table>?<PostgREST query> — the public reads, cached at the edge.
   ------------------------------------------------------------
   Every page used to read Supabase's REST API straight from the visitor's
   browser: about 770 KB gzipped for the listings on each cold load, none of it
   cached, all of it counted against the free plan's monthly egress. This
   Function asks Supabase once per few minutes per distinct query and keeps the
   answer in Cloudflare's cache, so Supabase sees one request per query per
   TTL and Cloudflare's bandwidth, which is free, serves the rest.

   Only GET, only a fixed list of public views and tables (the ones the anon
   key can already read), and nothing about the caller is forwarded: it is the
   same public data and the same anon key the page ships. If this Function
   fails the page reads Supabase directly (supabase.js `read`).
   ============================================================ */

const SB_BASE = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
/* Public anon key: the same one shipped in supabase.js (RLS allows only SELECT). */
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA';

/* Seconds a stored answer is served without asking Supabase again. */
/* event_sources: when a source last listed an event (the event page's "Checked" line); the anon key
   reads only its public columns, and only for published events. */
const TTL = { picks: 300, venues: 300, venue_details: 300, routes: 600, catalogue_redirects: 3600, event_sources: 300 };

const json = (body, status, cache) =>
  new Response(body, { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache } });

export async function onRequestGet({ request, params, waitUntil }) {
  const table = String(params.table || '');
  if (!Object.prototype.hasOwnProperty.call(TTL, table)) return json('{"error":"unknown table"}', 404, 'no-store');
  const url = new URL(request.url);
  if (url.search.length > 2000) return json('{"error":"query too long"}', 414, 'no-store');

  const key = new Request(`${url.origin}/api/rest/${table}${url.search}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;

  let upstream;
  try {
    upstream = await fetch(`${SB_BASE}/rest/v1/${table}${url.search}`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, accept: 'application/json' } });
  } catch { return json('{"error":"upstream"}', 502, 'no-store'); }
  if (!upstream.ok) return json(JSON.stringify({ error: 'upstream', status: upstream.status }), upstream.status >= 500 ? 502 : upstream.status, 'no-store');

  const ttl = TTL[table];
  const res = json(await upstream.text(), 200, `public, max-age=60, s-maxage=${ttl}`);
  waitUntil(cache.put(key, res.clone()));
  return res;
}
