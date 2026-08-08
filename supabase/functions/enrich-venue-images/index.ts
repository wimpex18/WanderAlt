/* ============================================================
   enrich-venue-images v1 — a photograph of the place, or nothing
   ------------------------------------------------------------
   Fills venues.image_url. Nothing filled it before: every venue photo
   in the database was an Unsplash stock image sprayed across unrelated
   places (one steeple served D3, CatHouse, Ali Baba and Fotografiska),
   written by something no longer in the repo, and therefore never
   corrected either. Those were deleted in Aug 2026 and this replaces
   the mechanism rather than the pictures.

   Two sources, tried in order, both free and keyless:

   1. OSM's `wikidata` tag → Wikidata P18 → Wikimedia Commons.
      This is the answer to short names. enrich-images had to guess a
      venue from its label and put Tallinn Town Hall's Christmas market
      on a basement club called Hall; a QID is an identifier, so it
      resolves "D3" exactly as well as "Estonian National Opera".
      ~10% of Tallinn's culture venues carry one.

   2. The venue's own website → og:image.
      ~42% carry a website, and a venue's own share image is a picture
      it chose of itself. This is the widest source available without
      paying anyone.

   Neither is allowed to guess. If both miss, the venue keeps no photo
   and the app draws the category mark on a 9%-petrol tint, which is
   the designed answer and an honest one. A wrong photograph is worse
   than none: it is a claim about a real place.

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

function thumbUrl(file: string, width = 800): string {
  const clean = file.replace(/^File:/, '');
  let decoded: string;
  try { decoded = decodeURIComponent(clean.replace(/ /g, '_')); }
  catch { decoded = clean.replace(/ /g, '_'); }
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(decoded)}?width=${width}`;
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
    return {
      url:  thumbUrl(String(file)),
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

function pickOgImage(html: string, pageUrl: string): string | null {
  /* property= and name= both appear in the wild; take the first that
     yields a usable absolute http(s) URL. */
  const metas = html.match(/<meta[^>]+>/gi) ?? [];
  for (const tag of metas) {
    if (!/(property|name)\s*=\s*["']og:image(:secure_url|:url)?["']/i.test(tag)) continue;
    const m = tag.match(/content\s*=\s*["']([^"']+)["']/i);
    if (!m) continue;
    let raw = m[1].trim().replace(/&amp;/g, '&');
    if (!raw || raw.startsWith('data:')) continue;
    let abs: URL;
    try { abs = new URL(raw, pageUrl); } catch { continue; }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    /* SVG share images are logos, essentially always. */
    if (/\.svg(\?|$)/i.test(abs.pathname)) continue;
    if (NOT_A_PHOTO.test(abs.pathname)) continue;
    return abs.toString();
  }
  return null;
}

async function imageFromWebsite(site: string): Promise<{ url: string; attr: string } | null> {
  try {
    const r = await fetch(site, {
      headers: { 'User-Agent': AGENT, 'Accept': 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) return null;
    /* Only the head is needed and some venue sites are enormous. */
    const html = (await r.text()).slice(0, 200_000);
    const url = pickOgImage(html, r.url || site);
    if (!url) return null;
    let host = site;
    try { host = new URL(site).hostname.replace(/^www\./, ''); } catch { /**/ }
    return { url, attr: `${host}` };
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

/* ---- per-venue ------------------------------------------- */

type Venue = { id: string; name: string; city: string; wikidata: string | null; website: string | null };

async function enrichVenue(v: Venue, dryRun: boolean) {
  /* 1. Identifier first — it cannot be wrong about which place it is. */
  if (v.wikidata) {
    const hit = await imageFromQid(v.wikidata);
    if (hit) {
      if (!dryRun) {
        await db.from('venues')
          .update({ image_url: hit.url, image_attr: hit.attr })
          .eq('id', v.id);
      }
      return { name: v.name, status: dryRun ? 'would_enrich_wikidata' : 'enriched_wikidata', url: hit.url };
    }
  }

  /* 2. The venue's own share image. */
  if (v.website) {
    const hit = await imageFromWebsite(v.website);
    if (hit) {
      if (await alreadyUsed(hit.url, v.id)) {
        return { name: v.name, status: 'rejected_shared_image', url: hit.url };
      }
      if (!dryRun) {
        await db.from('venues')
          .update({ image_url: hit.url, image_attr: hit.attr })
          .eq('id', v.id);
      }
      return { name: v.name, status: dryRun ? 'would_enrich_website' : 'enriched_website', url: hit.url };
    }
  }

  return { name: v.name, status: 'not_found' };
}

async function enrichCity(city: string, limit: number, dryRun: boolean) {
  const cutoff = new Date(Date.now() - FAIL_COOLDOWN_DAYS * 86400_000).toISOString();

  const { data: venues, error } = await db
    .from('venues')
    .select('id, name, city, wikidata, website')
    .eq('city', city)
    .is('image_url', null)
    .or(`image_enrich_failed_at.is.null,image_enrich_failed_at.lt.${cutoff}`)
    /* A venue with neither signal has nothing to try; skip it entirely
       rather than spend a round-trip discovering that. */
    .or('wikidata.not.is.null,website.not.is.null')
    .limit(limit);

  if (error) return { city, ok: false, error: error.message };
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
