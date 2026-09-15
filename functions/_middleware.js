/* ============================================================
   WanderAlt — Cloudflare Pages middleware: per-pick OG cards
   ------------------------------------------------------------
   Social crawlers don't run JS, so this rewrites the OG meta server-side
   for /detail and /source requests carrying ?id= / ?venue= / ?handle=.

   og:image:
   - Picks WITH a photo → the real photo (~1200px wide); declared
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
   Keep the filler list identical across all four copies. */
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

/* Right-size a Google-hosted photo to <width> px; other hosts returned
   unchanged. Matches WA.img in city.js. */
const sizedPhoto = (url, width) =>
  (url && url.includes('googleusercontent.com'))
    ? url.replace(/=[-a-z0-9]+$/i, `=w${width}`)
    : url;

/* Rewrite the OG/Twitter meta on the streamed HTML. When `photo` is true
   the og:image is a real photo of unknown aspect, so the declared
   width/height metas are stripped. */
const rewrite = (res, { title, description, image, photo }) => {
  let rw = new HTMLRewriter();
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

export async function onRequest(context) {
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

  try {
    if (isPick) {
      const rows = await sbGet(
        `picks?id=eq.${encodeURIComponent(id)}&select=title,description,quote,handle,image_url,city,venue,neighborhood,time&limit=1`);
      const pick = rows[0];
      if (!pick) return res;                            // unknown id → default OG
      const photo = !!pick.image_url;
      /* City is a lowercase slug in the DB ('tallinn', 'riga', …). */
      const city = pick.city
        ? pick.city.charAt(0).toUpperCase() + pick.city.slice(1)
        : 'Tallinn';

      /* The card reads like the row it came from: the sentence when there
         is a real one, otherwise the facts a reader decides on. */
      const said = saysSomething(pick.description, pick.title)
                || saysSomething(pick.quote, pick.title);
      const facts = [pick.venue, pick.neighborhood, pick.time]
        .map(v => (v == null ? '' : String(v).trim()))
        .filter(Boolean);
      if (pick.handle && VALID_HANDLE.test(pick.handle)) facts.push(`via ${pick.handle}`);

      return rewrite(res, {
        title:       `WanderAlt — ${pick.title} · ${city}`,
        description: said || facts.join(' · '),
        image:       photo
          ? sizedPhoto(pick.image_url, 1200)
          : `${SB_BASE}/functions/v1/og-image?id=${encodeURIComponent(id)}`,
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
        byVenue ? `venue=${encodeURIComponent(name)}` : `handle=${encodeURIComponent(handle)}`}`,
      photo:       false,
    });
  } catch (_) {
    return res;                                          // fail-open
  }
}
