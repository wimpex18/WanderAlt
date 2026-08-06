/* ============================================================
   WanderAlt — Cloudflare Pages middleware: per-pick OG cards
   ------------------------------------------------------------
   Social crawlers don't run JS, so the per-pick Open Graph data that
   detail.js sets at runtime never reaches them — a shared link falls back
   to the generic default card. This edge middleware rewrites the OG meta
   server-side for /detail and /source requests carrying ?id= / ?venue=.

   REPOINTED Aug 2026, because the redesign silently disabled the whole
   file. It matched only /venue and /curator — the two pages 6e deleted —
   so every share since the cutover previewed as the static default in
   detail.html's head: og:title "WanderAlt", og:description empty, no
   photo. Nothing warns you: the middleware fails open by design, so
   "matches nothing" and "working" look identical from the outside.

   The old paths are still matched, but they can no longer do the work on
   their own: _redirects 301s /venue.html → /detail.html, and a 301 is
   not text/html, so the rewrite bails and the crawler follows the
   redirect to the page that actually needs the tags. Matching them costs
   one comparison and covers the day someone drops those redirect rules.

   og:image strategy (June 2026):
   - Picks WITH a venue photo → use the real photo (resized to ~1200px
     wide), the NYT/Airbnb-style preview. Its aspect varies, so the
     declared og:image:width/height metas are removed (crawlers measure).
   - Picks WITHOUT a photo, and curators → the `og-image` Supabase
     function's branded 1200×630 card (declared dims kept).
   Plus a per-item og:title / og:description either way.

   Fail-open: any missing param, fetch failure, or non-HTML response
   passes the original asset straight through — this can never break a
   page, only enrich its link preview. Runs only on the two detail
   routes; every other request returns next() immediately. First Pages
   Function in the repo — no build step, inert under local http-server.
   ============================================================ */

const SB_BASE = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
/* Public anon key — same one shipped in supabase.js (RLS is SELECT-only). */
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA';

/* A curator handle is a Telegram slug: @ plus word characters and dots.
   The value below is reflected into <title> and og:description when no
   curator row matches, so an unvalidated one lets anyone mint a
   wanderalt.app link whose social preview reads whatever they like.
   HTMLRewriter escapes it, so this is preview spoofing rather than XSS —
   but the domain is the whole point of the trick. */
const VALID_HANDLE = /^@?[A-Za-z0-9_.]{1,40}$/;

/* Same trap, same guard, for the venue name ?venue= reflects. Only used
   when no pick row matched, so a real venue always wins over the query
   string. Baltic venue names carry accents, ampersands and apostrophes,
   so this is a shape-and-length check, not an alphabet one. */
const VALID_VENUE = /^[\p{L}\p{N} .,'’&()\/-]{2,60}$/u;

/* 4a's "if the model can only paraphrase the title, print nothing".
   Deliberately a second copy of WA.UI.descriptionOr: this runs on a
   Cloudflare Worker with no access to the page bundle, and a social card
   repeating the title back at the reader is exactly the noise the rule
   exists to stop. Keep the two in step — the list is the same. */
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

/* Right-size a Google-Places (lh3) photo to <width> px; other hosts
   returned unchanged. Matches WA.img in city.js. */
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

  const isPick   = p === '/detail' || p === '/detail.html' ||
                   p === '/venue'  || p === '/venue.html'  ||
                   p === '/place'  || p === '/place.html';
  const isSource = p === '/source' || p === '/source.html' ||
                   p === '/curator' || p === '/curator.html';
  if (!isPick && !isSource) return next();             // pass through everything else

  const id     = url.searchParams.get('id');
  const handle = url.searchParams.get('handle');
  /* source.html is keyed by venue name now; ?handle= is the legacy key
     every curator.html link in the wild still carries. */
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

      /* Provenance replaced personality, so the card reads like the row
         it came from: the sentence when there is a real one, otherwise
         the facts a reader decides on. Never "A curator's pick" — there
         are no curators, and there is no named voice on a pick. */
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

    /* source — a venue or a feed, not a person (3b). No photo; the
       branded card. The page groups picks by venue name, so the card
       counts the same thing the page will show. */
    /* ilike, not eq: the catalogue holds "Von Krahli Teater" AND "Von
       Krahli teater", and source.js groups case-insensitively. eq counted
       2 where the page lists 13, and a preview must not disagree with the
       page it advertises. No wildcards, so it is still an exact match;
       % and _ are escaped so a venue name carrying one cannot widen it. */
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
