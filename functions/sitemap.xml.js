/* ============================================================
   /sitemap.xml — the static pages, every picked place and every upcoming listing.
   ------------------------------------------------------------
   The pages that carry the product (a place, a listing) are drawn by JavaScript
   and were absent from the old static sitemap, so a crawler found only five
   pages. This reads the public views, keeps the answer for an hour in
   Cloudflare's cache, and falls back to the static file (`next()`) when
   Supabase does not answer, so the sitemap is never missing.
   ============================================================ */

const SB_BASE = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
/* Public anon key: the same one shipped in supabase.js (RLS allows only SELECT). */
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA';
const SITE = 'https://wanderalt.app';
const PAGES = [['/', 1.0], ['/places.html', 0.9], ['/discover.html', 0.9], ['/map.html', 0.6], ['/about.html', 0.6]];

const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const sb = async (path) => {
  const r = await fetch(`${SB_BASE}/rest/v1/${path}`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

export function sitemap(places, listings) {
  const url = (loc, extra = '', priority) => `  <url><loc>${esc(loc)}</loc>${extra}${priority != null ? `<priority>${priority}</priority>` : ''}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
    ...PAGES.map(([p, pr]) => url(`${SITE}${p}`, '', pr)),
    ...places.map(v => url(`${SITE}/detail?id=${encodeURIComponent(v.id)}`, v.updated_at ? `<lastmod>${esc(String(v.updated_at).slice(0, 10))}</lastmod>` : '', 0.8)),
    ...listings.map(e => url(`${SITE}/detail?id=${encodeURIComponent(e.id)}`, '', 0.5)),
  ].join('\n')}
</urlset>
`;
}

export async function onRequestGet({ request, next, waitUntil }) {
  const key = new Request(`${new URL(request.url).origin}/sitemap.xml?dynamic=1`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [places, listings] = await Promise.all([
      sb('venues?status=eq.active&picked=eq.true&select=id,updated_at&order=id.asc&limit=1000'),
      sb(`picks?archived_at=is.null&day=gte.${today}&select=id&order=id.asc&limit=1000`),
    ]);
    const res = new Response(sitemap(places, listings), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } });
    waitUntil(cache.put(key, res.clone()));
    return res;
  } catch { return next(); }
}
