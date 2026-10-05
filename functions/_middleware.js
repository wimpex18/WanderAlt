/* ============================================================
   WanderAlt — Cloudflare Pages middleware: per-pick OG cards
   ------------------------------------------------------------
   Social crawlers don't run JS, so this rewrites the OG meta server-side
   for /detail and /source requests carrying ?id= / ?venue= / ?handle=.

   og:image:
   - Picks WITH a photo → the real photo; declared
     og:image:width/height are removed because the aspect varies.
   - Picks WITHOUT a photo, and sources → the `og-image` function's
     branded 1200×630 card.

   Fail-open: any missing param, fetch failure, or non-HTML response
   passes the original asset through, so "matches nothing" and
   "working" look identical from outside. Inert under the local dev
   server.
   ============================================================ */

const SB_BASE = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
/* Public anon key — same one shipped in supabase.js (RLS is SELECT-only). */
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA';

/* A handle is @ plus word characters and dots. The value
   is reflected into <title> and og:description when no row matches, so
   an unvalidated one would let anyone author a wanderalt.app preview. */
const VALID_HANDLE = /^@?[A-Za-z0-9_.]{1,40}$/;

/* Same trap, same guard, for the venue name ?venue= reflects. Only used
   when no pick row matched, so a real venue always wins over the query
   string. Baltic venue names carry accents, ampersands and apostrophes,
   so this is a shape-and-length check, not an alphabet one. */
const VALID_VENUE = /^[\p{L}\p{N} .,'’&()\/-]{2,60}$/u;

/* A second copy of WA.UI.descriptionOr (a Worker has no access to the
   page bundle): a description that only restates the title is dropped.
   Keep the filler list identical across all three copies. */
const FILLER = new Set(['the','and','with','for','from','out','you','your','its','are','was','this','that','into','all','new','one','two','live','event','events','show','shows','night','nights','music','party','concert','set','series','performs','presents','featuring','join','come','experience','enjoy','celebrate','discover','more','than','their','his','her']);

const contentWords = (s) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !FILLER.has(w));

const saysSomething = (text, title) => {
  const s = String(text == null ? '' : text).trim();
  if (!s) return '';
  if (s.length < 12 || /^(tba|tbc|n\/a|none|null|-|—)$/i.test(s)) return '';
  const t = new Set(contentWords(title));
  return contentWords(s.slice(0, 300)).some(w => !t.has(w)) ? s : '';
};

const sbGet = async (path) => {
  const r = await fetch(`${SB_BASE}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
  });
  return r.ok ? r.json() : [];
};

/* JSON-LD for crawlers. The values come from rows strangers wrote, so the text is made unable to close
   the script element or start a comment, and only http(s) addresses are kept. */
const ldText = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const httpUrl = (v) => { try { const u = new URL(String(v)); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined; } catch { return undefined; } };
const SITE = 'https://wanderalt.app';
const PLACE_TYPE = { 'record store': 'Store', bookshop: 'BookStore', thrift: 'Store', gallery: 'ArtGallery', museum: 'Museum', cinema: 'MovieTheater',
  theatre: 'PerformingArtsTheater', bar: 'BarOrPub', taproom: 'BarOrPub', club: 'NightClub' };
const placeLd = (v, id) => ({
  '@context': 'https://schema.org', '@type': PLACE_TYPE[String(v.kind || '').toLowerCase()] || 'LocalBusiness',
  name: v.name, url: `${SITE}/detail?id=${encodeURIComponent(id)}`,
  description: v.pick_note || undefined, image: httpUrl(v.image_url),
  address: v.address ? { '@type': 'PostalAddress', streetAddress: String(v.address).replace(/,\s*Tallinn$/i, ''), addressLocality: 'Tallinn', addressCountry: 'EE' } : undefined,
  geo: Number.isFinite(v.lat) && Number.isFinite(v.lng) ? { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lng } : undefined,
  sameAs: [v.website, v.instagram, v.facebook].map(httpUrl).filter(Boolean),
});
const eventLd = (e, id) => ({
  '@context': 'https://schema.org', '@type': 'Event', name: e.title, url: `${SITE}/detail?id=${encodeURIComponent(id)}`,
  startDate: e.time && e.starts_at ? e.starts_at : (e.day || undefined),
  endDate: e.ends_at || undefined,
  eventStatus: e.flag === 'cancelled' ? 'https://schema.org/EventCancelled' : e.flag === 'postponed' ? 'https://schema.org/EventPostponed' : 'https://schema.org/EventScheduled',
  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  location: e.venue ? { '@type': 'Place', name: e.venue, address: e.address ? { '@type': 'PostalAddress', streetAddress: String(e.address).replace(/,\s*Tallinn$/i, ''), addressLocality: 'Tallinn', addressCountry: 'EE' } : undefined } : undefined,
  image: httpUrl(e.image_url), description: e.quote || undefined,
  offers: e.is_free === true || Number.isFinite(e.price_min)
    ? { '@type': 'Offer', price: e.is_free === true ? 0 : e.price_min, priceCurrency: e.currency || 'EUR', url: httpUrl(e.ticket_url),
        availability: e.flag === 'sold_out' ? 'https://schema.org/SoldOut' : undefined } : undefined,
});

/* Rewrite the OG/Twitter meta on the streamed HTML. When `photo` is true
   the og:image is a real photo of unknown aspect, so the declared
   width/height metas are stripped. */
const rewrite = (res, { title, description, image, photo, canonical, jsonld }) => {
  let rw = new HTMLRewriter();
  if (canonical) {
    rw = rw.on('link[rel="canonical"]', { element(el) { el.remove(); } });
    rw = rw.on('head', { element(el) { el.append(`<link rel="canonical" href="${canonical.replace(/"/g, '%22')}">`, { html: true }); } });
  }
  if (jsonld) rw = rw.on('head', { element(el) { el.append(`<script type="application/ld+json">${ldText(jsonld)}</script>`, { html: true }); } });
  const set = (sel, val) => { rw = rw.on(sel, { element(el) { el.setAttribute('content', val); } }); };
  if (title) {
    set('meta[property="og:title"]', title);
    rw = rw.on('title', { element(el) { el.setInnerContent(title); } });
  }
  if (description) {
    set('meta[property="og:description"]', description);
    set('meta[name="description"]', description);
    set('meta[name="twitter:description"]', description);
  }
  if (image) {
    set('meta[property="og:image"]', image);
    set('meta[name="twitter:image"]', image);
  }
  if (photo) {
    rw = rw.on('meta[property="og:image:width"]',  { element(el) { el.remove(); } });
    rw = rw.on('meta[property="og:image:height"]', { element(el) { el.remove(); } });
  }
  return rw.transform(res);
};

/* _headers only covers static responses. This middleware runs on every
   route, including rewritten social previews and API responses. */
export async function onRequest(context) {
  /* _redirects excludes routes handled by Functions. Keep the primary
     domain rules here so the all-page middleware honors them. */
  const url = new URL(context.request.url);
  const alias = ['www.wanderalt.app', 'wanderalt.com', 'www.wanderalt.com'].includes(url.hostname);
  if (alias) { url.protocol = 'https:'; url.hostname = 'wanderalt.app'; url.port = ''; }
  const response = alias ? Response.redirect(url.href, 301) : await pageResponse(context);
  const secured = new Response(response.body, response);
  const headers = secured.headers;
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://tiles.openfreemap.org; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'");
  return secured;
}

async function pageResponse(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const p = url.pathname;

  const isPick   = p === '/detail' || p === '/detail.html';
  const isSource = p === '/source' || p === '/source.html';
  if (!isPick && !isSource) return next();             // pass through everything else

  const id     = url.searchParams.get('id');
  const handle = url.searchParams.get('handle');
  /* source.html is keyed by venue name; ?handle= is also accepted. */
  const venue  = url.searchParams.get('venue');
  if (isPick && !id) return next();
  if (isSource && !venue && !handle) return next();

  const res = await next();
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  /* A shared link may carry the sender's language (share.js): the card then uses our own words
     in it (pipeline/localize.ts), falling back to the English. */
  const lang = ['et', 'ru', 'uk'].includes(url.searchParams.get('lang')) ? url.searchParams.get('lang') : '';

  try {
    if (isPick) {
      const rows = await sbGet(
        `picks?id=eq.${encodeURIComponent(id)}&select=title,quote,handle,image_url,city,venue,neighborhood,time,day,starts_at,ends_at,address,ticket_url,is_free,price_min,currency,flag${lang ? `,title_${lang},quote_${lang}` : ''}&limit=1`);
      const pick = rows[0];
      if (pick && lang) { pick.title = pick[`title_${lang}`] || pick.title; pick.quote = pick[`quote_${lang}`] || pick.quote; }
      if (!pick) {
        /* Not a listing: a place of the Guide shares the same address shape (detail?id=<place id>).
           Everything shown comes from the row, never from the query string. */
        const [place] = await sbGet(
          `venues?id=eq.${encodeURIComponent(id)}&status=eq.active&select=name,kind,city,neighborhood,pick_note,image_url,address,lat,lng,website,instagram,facebook${lang ? `,pick_note_${lang}` : ''}&limit=1`);
        if (!place || !place.name) return res;         // unknown id → default OG
        if (lang) place.pick_note = place[`pick_note_${lang}`] || place.pick_note;
        const kind = String(place.kind || '').replace(/^./, c => c.toUpperCase());
        const where = [kind, place.neighborhood].map(v => (v == null ? '' : String(v).trim())).filter(Boolean).join(' · ');
        return rewrite(res, {
          title:       `${place.name} · WanderAlt`,
          canonical:   `${SITE}/detail?id=${encodeURIComponent(id)}`,
          jsonld:      placeLd(place, id),
          description: (place.pick_note && String(place.pick_note).trim()) || where,
          image:       place.image_url || '',
          photo:       !!place.image_url,
        });
      }
      const photo = !!pick.image_url;
      /* City is a lowercase slug in the DB ('tallinn'). */
      const city = pick.city
        ? pick.city.charAt(0).toUpperCase() + pick.city.slice(1)
        : 'Tallinn';

      /* The card reads like the row it came from: the sentence when there
         is a real one, otherwise the facts a reader decides on. */
      const said = saysSomething(pick.quote, pick.title);
      const facts = [pick.venue, pick.neighborhood, pick.time]
        .map(v => (v == null ? '' : String(v).trim()))
        .filter(Boolean);
      if (pick.handle && VALID_HANDLE.test(pick.handle)) facts.push(`via ${pick.handle}`);

      return rewrite(res, {
        title:       `WanderAlt — ${pick.title} · ${city}`,
        canonical:   `${SITE}/detail?id=${encodeURIComponent(id)}`,
        jsonld:      eventLd(pick, id),
        description: said || facts.join(' · '),
        image:       photo
          ? pick.image_url
          : `${SB_BASE}/functions/v1/og-image?id=${encodeURIComponent(id)}&v=english-guide`,
        photo,
      });
    }

    /* source — a venue or a feed. No photo; the branded card, counting the
       same picks the page groups by venue name. */
    /* ilike, not eq: venue names vary in case and source.js groups
       case-insensitively. No wildcards; % and _ are escaped so it stays an
       exact match. */
    const ilike = (v) => encodeURIComponent(String(v).replace(/[%_]/g, '\\$&'));
    const byVenue = !!venue;
    const q = byVenue
      ? `picks?venue=ilike.${ilike(venue)}&archived_at=is.null&select=venue,neighborhood&limit=200`
      : `picks?handle=ilike.${ilike(handle)}&archived_at=is.null&select=venue,neighborhood&limit=200`;
    const picks = await sbGet(q);

    /* Only echo a requested value back when it looks like a real one.
       With no rows AND nothing safe to show, leave the default card
       alone — never let an arbitrary query string author the preview. */
    const shownHandle = handle && VALID_HANDLE.test(handle) ? handle : null;
    const name = byVenue
      ? (picks[0]?.venue || (VALID_VENUE.test(venue) ? venue : null))
      : (picks[0]?.venue || shownHandle);
    if (!name) return res;

    const area = picks.find(p => p.neighborhood)?.neighborhood || '';
    const n = picks.length;
    const listed = n
      ? `${n} listed right now${area ? ` · ${area}` : ''}`
      : 'Nothing listed right now.';

    return rewrite(res, {
      title:       `${name} · WanderAlt`,
      description: `Everything we read from ${name}. ${listed}`,
      image:       `${SB_BASE}/functions/v1/og-image?${
        byVenue ? `venue=${encodeURIComponent(name)}` : `handle=${encodeURIComponent(handle)}`}&v=route-w`,
      photo:       false,
    });
  } catch (_) {
    return res;                                          // fail-open
  }
}
