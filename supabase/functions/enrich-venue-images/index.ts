/* ============================================================
   enrich-venue-images v4 — a photograph of the place, or its own
   mark, or nothing
   ------------------------------------------------------------
   Fills venues.image_url. Nothing filled it before: every venue photo
   in the database was an Unsplash stock image sprayed across unrelated
   places (one steeple served D3, CatHouse, Ali Baba and Fotografiska),
   written by something no longer in the repo, and therefore never
   corrected either. Those were deleted in Aug 2026 and this replaces
   the mechanism rather than the pictures.

   Four lanes, tried in order, all free and all keyless:

   1. OSM's `wikidata` tag → Wikidata P18 → Wikimedia Commons CDN.
      This is the answer to short names. enrich-images had to guess a
      venue from its label and put Tallinn Town Hall's Christmas market
      on a basement club called Hall; a QID is an identifier, so it
      resolves "D3" exactly as well as "Estonian National Opera".
      ~10% of Tallinn's culture venues carry one.

   2. The venue's own website → og:image.
      ~42% carry a website, and a venue's own share image is a picture
      it chose of itself. This is the widest source available without
      paying anyone.

   3. The same page's schema.org JSON-LD → image.
      Emitted by plenty of CMS themes that skip the OpenGraph tags.

   4. The same page's own mark — the og:image the photo lane refused
      for looking like a logo, or an apple-touch-icon of at least
      120px. Same-origin only.

   v4 was written against a measurement rather than a hunch. Of the
   614 venues on the kinds Places actually draws, 31 had an image --
   5%. Twenty of the failures were fetched and read by hand, and the
   cause was never "the venue has no picture":

     4/20  og:image was THERE and this function threw it away, because
           the filename contained "logo" and the denylist treats that
           as a CMS default.
     5/20  no og:image, but an apple-touch-icon on the venue's own
           domain.
     3/20  no og:image, but schema.org JSON-LD carrying one.
     1/20  og:image present at byte 297,361 of a 570KB document, past
           the 200KB slice below, so it was never seen.
     7/20  genuinely nothing. The mark is the right answer for these.

   So roughly half of "not found" was this function's own doing, and
   the lanes below are the four repairs. The rule they all keep is the
   one that matters: **every source is anchored to the venue's own
   identity** -- its QID, or its own domain -- and nothing is ever
   guessed from a name. That is what stopped Tallinn Town Hall's
   Christmas market appearing on a basement club.

   A logo is not a photograph, and it is admitted deliberately: it is
   the venue's own mark, served from the venue's own host, so it
   cannot be a claim about the WRONG place -- which is the failure
   this file exists to prevent. It is recorded as its own
   `image_source` so the whole set can be found, judged and reversed
   with one query.

   If every lane misses, the venue keeps no photo and the app draws
   the category mark on a 9%-petrol tint, which is the designed answer
   and an honest one. A wrong photograph is worse than none: it is a
   claim about a real place.

   POST body: { city?, limit?, dry_run? }
   dry_run reports what it WOULD write and mutates nothing — worth
   running first after any change to the guards below.
   ============================================================ */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AGENT   = 'WanderAlt/1.0 (+https://wanderalt.app)';
const BATCH   = 25;
const FAIL_COOLDOWN_DAYS = 30;
const FETCH_TIMEOUT_MS   = 8000;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE);

/* ---- Wikimedia ------------------------------------------- */

/* Resolve a Commons filename to a URL on upload.wikimedia.org — the CDN —
   rather than to commons.wikimedia.org/wiki/Special:FilePath, which is the
   MediaWiki APP LAYER and 302s to the same place.

   The redirect form was what this function used to write, and it cost twice:
   the first verification sweep marked a third of the catalogue "transient"
   and every one of those was an `http 429`, and every reader's browser was
   loading venue photos through that same throttled endpoint.

   The imageinfo API gives the CDN URL directly and, unlike deriving the
   sharded path from md5(filename) by hand, it is right about the case that
   breaks the derivation: a file NARROWER than the requested width has no
   /thumb/ rendition at all and must be served as the original. Eesti
   Draamateater is exactly that file. */
async function commonsCdnUrl(file: string, width = 800): Promise<string | null> {
  const clean = String(file).replace(/^File:/, '');
  try {
    const params = new URLSearchParams({
      action: 'query', format: 'json', prop: 'imageinfo',
      iiprop: 'url', iiurlwidth: String(width), titles: 'File:' + clean,
    });
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const pages = (await r.json())?.query?.pages ?? {};
    const info = (Object.values(pages)[0] as { imageinfo?: Array<Record<string, string>> })?.imageinfo?.[0];
    const url = info?.thumburl || info?.url;
    if (!url) return null;
    /* The API appends utm_* for Commons' own analytics. They are no part of
       the image's address and have no business in a URL we store. */
    const u = new URL(url);
    u.search = '';
    return u.toString();
  } catch { return null; }
}

async function imageFromQid(qid: string): Promise<{ url: string; attr: string } | null> {
  try {
    const r = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${qid}&property=P18&format=json`,
      { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!r.ok) return null;
    const file = (await r.json())?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!file) return null;
    const url = await commonsCdnUrl(String(file));
    if (!url) return null;
    return {
      url,
      attr: `Wikimedia Commons — ${String(file).replace(/^File:/, '').replace(/_/g, ' ')}`,
    };
  } catch { return null; }
}

/* ---- og:image -------------------------------------------- */

/* A share image is not automatically a photograph of the place. Themes
   ship defaults, and Kino Sõprus really does serve
   "og-image-placeholder.png" — which would have been written as its
   venue photo without this list.

   A file named literally "og-image" is on the list too, and that is a
   deliberate over-reach: a handful of venues do name a real photograph
   that way and will be refused. The case that decided it was a dry run
   proposing domeeninimi.ee/static/og-image.png as the photo of
   Pärimusteater Loomine — a PARKED DOMAIN's share graphic, which the
   dedup guard could not catch because only one venue points at it. A
   wrong photograph is a claim about a real place; a missing one is a
   category mark. Err toward the mark. */
const NOT_A_PHOTO =
  /(placeholder|default|fallback|no[-_]?image|blank|spacer|dummy|sample|logo|favicon|sprite|banner[-_]?default|og[-_]?image|social[-_]?share|share[-_]?card|preview[-_]?card)/i;

/* `allowMark` runs the same scan with the photo denylist relaxed to the
   terms that mean "no image at all". It exists because the denylist was
   throwing away real finds: 4 of 20 sampled failures had an og:image
   whose filename merely contained "logo" -- muzikumas-logo-crop.png,
   janisroze .../logo.png, kinobize logo-bw.png -- which is the venue's
   own mark on the venue's own host, not a CMS default. The terms kept
   in both modes are the ones that name an ABSENCE (placeholder, blank,
   spacer, dummy, default), and those still buy nothing anywhere. */
const NOT_AN_IMAGE_AT_ALL =
  /(placeholder|fallback|no[-_]?image|blank|spacer|dummy|sample|default)/i;

function pickOgImage(html: string, pageUrl: string, allowMark = false): string | null {
  /* property= and name= both appear in the wild; take the first that
     yields a usable absolute http(s) URL. */
  const metas = html.match(/<meta[^>]+>/gi) ?? [];
  const deny = allowMark ? NOT_AN_IMAGE_AT_ALL : NOT_A_PHOTO;
  for (const tag of metas) {
    if (!/(property|name)\s*=\s*["']og:image(:secure_url|:url)?["']/i.test(tag)) continue;
    const m = tag.match(/content\s*=\s*["']([^"']+)["']/i);
    if (!m) continue;
    const url = absHttp(m[1], pageUrl);
    if (!url) continue;
    let abs: URL;
    try { abs = new URL(url); } catch { continue; }
    /* An SVG share image is a logo essentially always, which the photo
       lane refuses and the mark lane is happy to take. */
    if (/\.svg(\?|$)/i.test(abs.pathname) && !allowMark) continue;
    if (deny.test(abs.pathname)) continue;
    return abs.toString();
  }
  return null;
}

/* schema.org, which many CMS themes emit even when they skip the
   OpenGraph tags. `image` may be a string, an array, or an ImageObject
   with a `url`; all three appear in the wild, so all three are read. */
function pickJsonLdImage(html: string, pageUrl: string): string | null {
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const body = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
    let data: unknown;
    try { data = JSON.parse(body); } catch { continue; }
    const seen = new Set<unknown>();
    const walk = (node: unknown): string | null => {
      if (!node || typeof node !== 'object' || seen.has(node)) return null;
      seen.add(node);
      if (Array.isArray(node)) {
        for (const item of node) { const hit = walk(item); if (hit) return hit; }
        return null;
      }
      const obj = node as Record<string, unknown>;
      for (const key of ['image', 'logo', 'photo']) {
        const v = obj[key];
        const candidate = typeof v === 'string' ? v
          : Array.isArray(v) ? (typeof v[0] === 'string' ? v[0] as string
              : (v[0] as Record<string, unknown> | undefined)?.url as string | undefined)
          : (v as Record<string, unknown> | undefined)?.url as string | undefined;
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      }
      for (const v of Object.values(obj)) { const hit = walk(v); if (hit) return hit; }
      return null;
    };
    const raw = walk(data);
    if (!raw) continue;
    /* The walker returns whatever sat under an `image` key, and that is
       not always a URL: zuzeum.com yielded the bare token "Array",
       which `new URL()` happily resolved to <origin>/Array -- a 404
       stored as a venue photograph. Require something that is actually
       addressed (absolute, protocol-relative or rooted) AND that ends
       in an image extension, before it is allowed to be one. */
    if (!/^(https?:)?\/\//i.test(raw) && !raw.startsWith('/')) continue;
    const abs = absHttp(raw, pageUrl);
    if (!abs) continue;
    let path = '';
    try { path = new URL(abs).pathname; } catch { continue; }
    if (!/\.(jpe?g|png|webp|avif|gif)$/i.test(path)) continue;
    if (NOT_A_PHOTO.test(path)) continue;
    return abs;
  }
  return null;
}

/* The venue's own touch icon. This is a MARK rather than a photograph,
   so it is the last lane and it is recorded separately -- but it is
   served from the venue's own host, which makes it identity-safe in the
   way a name-matched stock photo never was. Same-origin is required for
   exactly that reason: a cross-host icon is somebody else's brand.

   `sizes` is honoured when stated, because a 32x32 favicon in a 181px
   card is a smudge; apple-touch-icon is 180px by convention and passes. */
function pickIcon(html: string, pageUrl: string): string | null {
  const links = html.match(/<link[^>]+>/gi) ?? [];
  const cands: Array<{ url: string; size: number }> = [];
  let pageOrigin = '';
  try { pageOrigin = new URL(pageUrl).origin; } catch { return null; }
  for (const tag of links) {
    const rel = (tag.match(/rel\s*=\s*["']([^"']+)["']/i)?.[1] ?? '').toLowerCase();
    if (!/apple-touch-icon|(^|\s)icon(\s|$)|shortcut icon/.test(rel)) continue;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const abs = absHttp(href, pageUrl);
    if (!abs) continue;
    let u: URL;
    try { u = new URL(abs); } catch { continue; }
    if (/\.svg(\?|$)/i.test(u.pathname)) continue;
    if (u.origin !== pageOrigin) continue;
    /* A .ico is a 16 or 32px browser-tab glyph. In a 181px card it is a
       smudge, which is worse than the category mark it would replace --
       and three of the twenty sampled sites offered exactly that. */
    if (/\.ico(\?|$)/i.test(u.pathname)) continue;
    const sizeAttr = tag.match(/sizes\s*=\s*["'](\d+)/i)?.[1];
    const size = sizeAttr ? Number(sizeAttr) : (/apple-touch-icon/.test(rel) ? 180 : 0);
    /* Unsized `rel=icon` says nothing about how big it is, so it is
       refused rather than gambled on. apple-touch-icon is 180 by
       convention and a stated size speaks for itself. */
    if (size < 120) continue;
    cands.push({ url: abs, size });
  }
  cands.sort((a, b) => b.size - a.size);
  return cands[0]?.url ?? null;
}

function absHttp(raw: string, pageUrl: string): string | null {
  const v = String(raw).trim().replace(/&amp;/g, '&');
  if (!v || v.startsWith('data:')) return null;
  let abs: URL;
  try { abs = new URL(v, pageUrl); } catch { return null; }
  if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return null;
  return abs.toString();
}

type WebHit = { url: string; attr: string; source: 'website' | 'website_jsonld' | 'logo' };

async function imageFromWebsite(site: string): Promise<WebHit | null> {
  try {
    const r = await fetch(site, {
      headers: { 'User-Agent': AGENT, 'Accept': 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) return null;

    /* v3 sliced the response at 200KB on the reasoning that only the
       head is needed. The reasoning was right and the slice was not:
       zuzeum.com carries its og:image at byte 297,361 of 570KB and
       rahvaraamat.ee at 771,059 of 772,353, because both inline the
       whole site's CSS and JSON state ahead of it. The slice was
       discarding the tag it existed to find.

       Cut at </head> when there is one -- that is the boundary the
       200KB was standing in for -- and otherwise take a cap large
       enough for the documents that provoked this. */
    const full = await r.text();
    const headEnd = full.search(/<\/head>/i);
    const html = headEnd > 0 ? full.slice(0, headEnd) : full.slice(0, 1_500_000);
    const pageUrl = r.url || site;

    let host = site;
    try { host = new URL(site).hostname.replace(/^www\./, ''); } catch { /**/ }

    /* A photograph if the site offers one... */
    const og = pickOgImage(html, pageUrl);
    if (og) return { url: og, attr: host, source: 'website' };

    const ld = pickJsonLdImage(html, pageUrl);
    if (ld) return { url: ld, attr: host, source: 'website_jsonld' };

    /* ...then the venue's own mark: the og:image the photo lane just
       refused for looking like a logo, or the touch icon. Both are the
       venue's own file on the venue's own host. */
    const ogMark = pickOgImage(html, pageUrl, true);
    if (ogMark) return { url: ogMark, attr: host, source: 'logo' };

    const icon = pickIcon(html, pageUrl);
    if (icon) return { url: icon, attr: host, source: 'logo' };

    return null;
  } catch { return null; }
}

/* ---- the shared-template guard ---------------------------- */

/* The Unsplash mess was one photo standing in for seven venues. A CMS
   default does exactly the same thing, so an og:image already claimed
   by other venues is refused rather than spread further. Checked
   against what is committed, so it tightens as the run proceeds. */
async function alreadyUsed(url: string, selfId: string): Promise<boolean> {
  const { count } = await db
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .eq('image_url', url)
    .neq('id', selfId);
  return (count ?? 0) > 0;
}

/* One exception, and only for the mark lane. The rule above exists
   because one photograph standing in for seven unrelated venues is the
   Unsplash disaster; a CHAIN's logo standing for its own branches is
   not that -- it is correct. Rahva Raamat, Apollo and Jānis Roze each
   run several shops in this catalogue (janisroze.lv came up three
   times in a 24-row sample), and blanket dedup would give the mark to
   whichever branch was enriched first and stamp the rest as failures.

   Same website host is the test, because that is what makes them the
   same organisation rather than two venues that merely happen to share
   a file. A shared logo across DIFFERENT hosts is still refused, which
   is the CMS-default case the guard was written for. */
async function sameOrgOnly(url: string, selfId: string, selfSite: string): Promise<boolean> {
  const { data } = await db
    .from('venues')
    .select('website')
    .eq('image_url', url)
    .neq('id', selfId);
  if (!data?.length) return true;
  const host = (u: string | null) => {
    try { return new URL(u!).hostname.replace(/^www\./, ''); } catch { return ''; }
  };
  const mine = host(selfSite);
  if (!mine) return false;
  return data.every(r => host((r as { website: string | null }).website) === mine);
}

/* ---- per-venue ------------------------------------------- */

type Venue = { id: string; name: string; city: string; wikidata: string | null; website: string | null };

async function enrichVenue(v: Venue, dryRun: boolean) {
  /* 1. Identifier first — it cannot be wrong about which place it is. */
  if (v.wikidata) {
    const hit = await imageFromQid(v.wikidata);
    if (hit) {
      if (!dryRun) {
        await db.from('venues')
          .update({ image_url: hit.url, image_attr: hit.attr, image_source: 'wikidata' })
          .eq('id', v.id);
      }
      return { name: v.name, status: dryRun ? 'would_enrich_wikidata' : 'enriched_wikidata', url: hit.url };
    }
  }

  /* 2. The venue's own share image. */
  if (v.website) {
    const hit = await imageFromWebsite(v.website);
    if (hit) {
      const shared = await alreadyUsed(hit.url, v.id);
      const allowed = shared && hit.source === 'logo'
        ? await sameOrgOnly(hit.url, v.id, v.website)
        : !shared;
      if (!allowed) {
        return { name: v.name, status: 'rejected_shared_image', url: hit.url };
      }
      if (!dryRun) {
        await db.from('venues')
          .update({ image_url: hit.url, image_attr: hit.attr, image_source: hit.source })
          .eq('id', v.id);
      }
      return {
        name: v.name,
        status: `${dryRun ? 'would_enrich' : 'enriched'}_${hit.source}`,
        url: hit.url,
      };
    }
  }

  return { name: v.name, status: 'not_found' };
}

/* The kinds Places actually draws (VENUE_KINDS in supabase.js). The
   queue is ordered by this and nothing else was doing that job: the
   batch is 25 a city a night, taken from every venue in the table
   without an image -- and the whitelisted kinds are 614 of 2,598, so
   they were getting about a quarter of the slots by chance while
   museums, bars and libraries -- which Places never renders -- took
   the rest.

   That is the arithmetic behind the state this run was written to fix:
   172 whitelisted venues WITH a website had never once been attempted,
   while CLAUDE.md had already noticed the other end of the same fact
   (22 of 26 stored photos were on kinds Places never draws) without
   connecting it to the queue. Enrich what the reader can see first. */
const PLACES_KINDS = [
  'gallery', 'bookshop', 'thrift', 'record store',
  'arts centre', 'community space', 'studio', 'cinema',
];

async function enrichCity(city: string, limit: number, dryRun: boolean) {
  const cutoff = new Date(Date.now() - FAIL_COOLDOWN_DAYS * 86400_000).toISOString();

  const base = () => db
    .from('venues')
    .select('id, name, city, wikidata, website')
    .eq('city', city)
    .is('image_url', null)
    .or(`image_enrich_failed_at.is.null,image_enrich_failed_at.lt.${cutoff}`)
    /* A venue with neither signal has nothing to try; skip it entirely
       rather than spend a round-trip discovering that. */
    .or('wikidata.not.is.null,website.not.is.null');

  /* Whitelisted kinds first, and only then the rest -- two queries
     rather than one, because PostgREST cannot order by "is this value
     in that list" and sorting in JS would only reorder whatever single
     page the limit had already chosen. */
  const { data: first, error } = await base().in('kind', PLACES_KINDS).limit(limit);
  if (error) return { city, ok: false, error: error.message };

  let venues = first ?? [];
  if (venues.length < limit) {
    const { data: rest } = await base()
      .not('kind', 'in', `(${PLACES_KINDS.map(k => `"${k}"`).join(',')})`)
      .limit(limit - venues.length);
    venues = venues.concat(rest ?? []);
  }
  if (!venues?.length) return { city, ok: true, total: 0, enriched: 0, message: 'nothing to enrich' };

  const results = [];
  const failed: string[] = [];
  for (const v of venues as Venue[]) {
    const r = await enrichVenue(v, dryRun);
    results.push(r);
    if (r.status === 'not_found' || r.status === 'rejected_shared_image') failed.push(v.id);
  }

  if (failed.length && !dryRun) {
    await db.from('venues')
      .update({ image_enrich_failed_at: new Date().toISOString() })
      .in('id', failed);
  }

  const enriched = results.filter(r => r.status.includes('enrich')).length;
  console.log(`[enrich-venue-images] ${city} dry_run=${dryRun} ${enriched}/${venues.length}`);
  return { city, ok: true, dry_run: dryRun, total: venues.length, enriched, results };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  let city: string | null = null, limit = BATCH, dryRun = false;
  try {
    const b = await req.json().catch(() => ({}));
    if (b.city) city = String(b.city).toLowerCase();
    if (b.limit) limit = Math.min(Number(b.limit), 100);
    if (b.dry_run === true) dryRun = true;
  } catch (_) { /**/ }

  const cities = city ? [city] : ['tallinn', 'helsinki', 'riga', 'vilnius'];
  const reports = [];
  for (const c of cities) reports.push(await enrichCity(c, limit, dryRun));

  return new Response(JSON.stringify({ dry_run: dryRun, cities: reports }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
