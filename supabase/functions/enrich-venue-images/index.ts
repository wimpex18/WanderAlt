/* ============================================================
   enrich-venue-images — a photograph of the place, or its own mark,
   or nothing
   ------------------------------------------------------------
   Fills venues.image_url. Four lanes, tried in order, all free and
   keyless, and every one anchored to the venue's own identity — its QID
   or its own domain. Nothing is ever guessed from a name.

   1. OSM's `wikidata` tag → Wikidata P18 → Wikimedia Commons CDN.
      A QID resolves "D3" exactly as well as "Estonian National Opera".

   2. The venue's own website → og:image.

   3. The same page's schema.org JSON-LD → image.

   4. The same page's own mark — the og:image the photo lane refused
      for looking like a logo, or an apple-touch-icon of at least
      120px. Same-origin only. Recorded as its own `image_source`
      ('logo') so the set can be found and reversed with one query.

   If every lane misses, the venue keeps no photo and the app draws the
   category mark. A wrong photograph is worse than none.

   POST body: { city?, limit?, dry_run? }
   dry_run reports what it WOULD write and mutates nothing.
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

/* Resolve a Commons filename to a URL on upload.wikimedia.org (the CDN),
   never Special:FilePath (the MediaWiki app layer: 302s, rate-limited).
   The imageinfo API is used rather than deriving the md5 path, because a
   file NARROWER than the requested width has no /thumb/ rendition and
   must be served as the original. */
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

/* A share image is not automatically a photograph of the place: themes
   ship defaults (e.g. "og-image-placeholder.png") and parked domains ship
   share graphics. A file named literally "og-image" is refused too, a
   deliberate over-reach: err toward the category mark. */
const NOT_A_PHOTO =
  /(placeholder|default|fallback|no[-_]?image|blank|spacer|dummy|sample|logo|favicon|sprite|banner[-_]?default|og[-_]?image|social[-_]?share|share[-_]?card|preview[-_]?card)/i;

/* `allowMark` runs the same scan with the photo denylist relaxed to the
   terms that name an ABSENCE (placeholder, blank, spacer, dummy,
   default). A filename containing "logo" on the venue's own host is the
   venue's own mark, not a CMS default. */
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
    /* The walker returns whatever sat under an `image` key, which is not
       always a URL (a bare token resolves to <origin>/token, a 404).
       Require something addressed AND ending in an image extension. */
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
    /* A .ico is a 16 or 32px tab glyph — worse than the category mark. */
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

    /* Cut at </head> when there is one, otherwise take a large cap: some
       sites inline their whole CSS and JSON state ahead of the meta tags. */
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

/* An og:image already claimed by other venues is refused rather than
   spread further (one photo standing in for many venues is the failure
   this guards). Checked against what is committed, so it tightens as the
   run proceeds. */
async function alreadyUsed(url: string, selfId: string): Promise<boolean> {
  const { count } = await db
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .eq('image_url', url)
    .neq('id', selfId);
  return (count ?? 0) > 0;
}

/* One exception, for the mark lane only: a chain's logo standing for its
   own branches is correct. Same website host is the test; a shared logo
   across different hosts is still refused. */
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

/* The kinds Places actually draws (VENUE_KINDS in supabase.js) are
   enriched first, so the nightly batch goes to what the reader sees. */
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

  /* Whitelisted kinds first, then the rest — two queries, because
     PostgREST cannot order by list membership. */
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
