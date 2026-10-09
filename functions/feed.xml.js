/* ============================================================
   /feed.xml — the week's listings as RSS, for feed readers and newsletters.
   ------------------------------------------------------------
   The next eight days of published listings, soonest first, each with only
   what we hold: its time in Tallinn, venue and area, a stated price or free
   entry, the summary, and a link to its page (which links its source). A
   cancelled or postponed show says so in its title. Reads the public view
   with the anon key (RLS shows only published rows), keeps the answer for an
   hour in Cloudflare's cache, and answers 503 when Supabase does not, so a
   reader keeps its last copy rather than an empty feed.
   ============================================================ */

const SB_BASE = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
/* Public anon key: the same one shipped in supabase.js (RLS allows only SELECT). */
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA';
const SITE = 'https://wanderalt.app';
const DAYS = 8;

const xml = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]))
  // Characters XML 1.0 cannot carry at all.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
const KIND = { gig: 'Gig', club: 'Club night', film: 'Film', exhibition: 'Exhibition', talk: 'Talk', theatre: 'Stage', workshop: 'Workshop', market: 'Market', festival: 'Festival', other: 'Other' };
const FLAG = { cancelled: 'Cancelled', postponed: 'Postponed', sold_out: 'Sold out' };

const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tallinn', weekday: 'short', day: 'numeric', month: 'short' });
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const money = (n, cur) => `${cur === 'EUR' || !cur ? '€' : `${cur} `}${Number(n) % 1 === 0 ? Number(n) : Number(n).toFixed(2)}`;

/* "Free", "€12", "€8–15", or '' when no price was stated (never guessed). */
export function priceOf(e) {
  if (e.is_free) return 'Free';
  if (e.price_min == null) return '';
  return e.price_max != null && Number(e.price_max) !== Number(e.price_min)
    ? `${money(e.price_min, e.currency)}–${money(e.price_max, e.currency).replace(/^\D+/, '')}`
    : money(e.price_min, e.currency);
}

/* One line of facts: "Fri 9 Oct, 21:00. Uus Laine, Kalamaja. €10." A date-only listing has no clock. */
export function factsOf(e) {
  const start = new Date(e.starts_at);
  const when = e.time ? `${day.format(start)}, ${clock.format(start)}` : `${day.format(start)}, time not listed`;
  const where = [e.venue, e.neighborhood].filter(Boolean).join(', ');
  return [when, where, priceOf(e)].filter(Boolean).map(s => `${s}.`).join(' ');
}

export function rss(listings, now = new Date()) {
  const items = listings.map((e) => {
    const flag = FLAG[e.flag] && e.flag !== 'sold_out' ? `${FLAG[e.flag]}: ` : '';
    const kind = KIND[e.kind] || '';
    const description = [factsOf(e), e.flag === 'sold_out' ? 'Sold out.' : '', e.quote || ''].filter(Boolean).join(' ');
    return `    <item>
      <title>${xml(flag + e.title)}</title>
      <link>${xml(`${SITE}/detail?id=${encodeURIComponent(e.id)}`)}</link>
      <guid isPermaLink="false">${xml(e.id)}</guid>
      ${e.created_at ? `<pubDate>${new Date(e.created_at).toUTCString()}</pubDate>` : ''}
      ${kind ? `<category>${xml(kind)}</category>` : ''}
      <description>${xml(description)}</description>
    </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>WanderAlt: Tallinn this week</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Independent gigs, club nights, arthouse film, contemporary art and dance, talks and markets in Tallinn for the next ${DAYS} days. Times, places and prices only as the sources state them.</description>
    <language>en</language>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
    <ttl>60</ttl>
${items}
  </channel>
</rss>
`;
}

export async function onRequestGet({ request, waitUntil }) {
  const key = new Request(`${new URL(request.url).origin}/feed.xml?v=1`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const now = new Date();
    const from = new Date(now.getTime() - 6 * 3600e3).toISOString(), to = new Date(now.getTime() + DAYS * 86400e3).toISOString();
    const r = await fetch(`${SB_BASE}/rest/v1/picks?city=eq.tallinn&archived_at=is.null&starts_at=gte.${from}&starts_at=lt.${to}` +
      '&select=id,title,venue,neighborhood,kind,quote,time,starts_at,flag,is_free,price_min,price_max,currency,created_at&order=starts_at.asc,id.asc&limit=400',
      { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } });
    if (!r.ok) throw new Error(String(r.status));
    const res = new Response(rss(await r.json(), now), {
      headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=900, s-maxage=3600' },
    });
    waitUntil(cache.put(key, res.clone()));
    return res;
  } catch {
    return new Response('The feed is unavailable for a moment. Try again shortly.', { status: 503, headers: { 'retry-after': '600', 'content-type': 'text/plain; charset=utf-8' } });
  }
}
