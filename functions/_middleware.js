/* ============================================================
   WanderAlt — Cloudflare Pages middleware: per-pick OG cards
   ------------------------------------------------------------
   Social crawlers don't run JS, so the per-pick Open Graph data that
   venue.js sets at runtime never reaches them — a shared link falls back
   to the generic default card. This edge middleware rewrites the OG meta
   server-side for /venue and /curator requests carrying ?id= / ?handle=.

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

  const isVenue   = p === '/venue'   || p === '/venue.html';
  const isCurator = p === '/curator' || p === '/curator.html';
  if (!isVenue && !isCurator) return next();           // pass through everything else

  const id     = url.searchParams.get('id');
  const handle = url.searchParams.get('handle');
  if (isVenue && !id)       return next();
  if (isCurator && !handle) return next();

  const res = await next();
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;

  try {
    if (isVenue) {
      const rows = await sbGet(
        `picks?id=eq.${encodeURIComponent(id)}&select=title,quote,handle,image_url,city&limit=1`);
      const pick = rows[0];
      if (!pick) return res;                            // unknown id → default OG
      const photo = !!pick.image_url;
      /* City is a lowercase slug in the DB ('tallinn', 'riga', …). */
      const city = pick.city
        ? pick.city.charAt(0).toUpperCase() + pick.city.slice(1)
        : 'Tallinn';
      return rewrite(res, {
        title:       `WanderAlt — ${pick.title} · ${city}`,
        description: pick.quote ? `${pick.quote} — ${pick.handle}` : `A curator's pick — ${pick.handle}`,
        image:       photo
          ? sizedPhoto(pick.image_url, 1200)
          : `${SB_BASE}/functions/v1/og-image?id=${encodeURIComponent(id)}`,
        photo,
      });
    }
    /* curator — no photo, use the branded card */
    const rows = await sbGet(
      `curators?handle=eq.${encodeURIComponent(handle)}&select=name,tagline&limit=1`);
    const c = rows[0];
    /* Only echo the requested handle back when it looks like a real one.
       With no row AND nothing safe to show, leave the default card alone —
       never let an arbitrary query string author the preview. */
    const shown = VALID_HANDLE.test(handle) ? handle : null;
    if (!c && !shown) return res;
    const name = c?.name || shown;
    return rewrite(res, {
      title:       name ? `${name} · WanderAlt` : 'WanderAlt',
      description: c?.tagline
        || (shown ? `Curated picks by ${shown} on WanderAlt.` : 'Curated picks on WanderAlt.'),
      image:       `${SB_BASE}/functions/v1/og-image?handle=${encodeURIComponent(handle)}`,
      photo:       false,
    });
  } catch (_) {
    return res;                                          // fail-open
  }
}
