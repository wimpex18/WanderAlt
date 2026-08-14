/* ============================================================
   enrich-pick-images v5 — the event's own picture, or nothing
   ------------------------------------------------------------
   Fills picks.image_url.

   v4 and everything before it resolved a photo by sending the VENUE
   NAME to Google Places `places:searchText` and taking whatever came
   back. That is the guessing this repo bans: it is how a Christmas
   market ended up on a basement club called Hall, and it is the exact
   mechanism `enrich-venue-images` was written to replace. It also
   billed ~$0.039 a venue against a Google account whose billing has
   since been deleted. The evidence that it had stopped working at all:
   of 41 live picks holding an image, 40 have `image_source` NULL —
   legacy rows — and one came from a venue borrow. Nothing traceable to
   Google, while 285 picks sat stamped as failed. There is also no cron
   for this function, so it was not even running.

   So the name search is gone, and both lanes below are anchored to the
   EVENT rather than to a string that resembles one.

   1. The source's own API, by event id.
      334 of 367 live source_urls are `tapahtumat.hel.fi` — Helsinki's
      Linkedevents portal — and the permalink carries the event id, so
      `api.hel.fi/linkedevents/v1/event/<id>/` returns that event's own
      filed image. 40 of 40 sampled events had one. This is the widest
      single source of event pictures available to us and it costs
      nothing.

      Those images are licensed `event_only`, which permits use in
      connection with that event and nothing else. That is precisely
      what a pick is, and it is why such an image must never be copied
      onto a venue or outlive the listing: picks are archived, the URL
      goes with them, and `image_source` records the lane so the whole
      set can be found in one query.

   2. The listing page's own og:image or schema.org JSON-LD.
      For every other source, the pick's `source_url` IS the event's
      page, so its share image is the event's own — identity-safe in
      the way a name search never was.

   No third lane. There is deliberately no icon or logo fallback here,
   unlike enrich-venue-images: a same-origin icon on an aggregator is
   the TICKETING PLATFORM's brand, not the event's and not even the
   venue's, so it would put Fienta's logo on somebody's gig.

   If both miss, the pick keeps no image and the row draws its category
   mark, which is the designed answer. A wrong picture is worse than
   none.

   POST body: { city?, limit?, dry_run? }
   ============================================================ */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AGENT   = 'WanderAlt/1.0 (+https://wanderalt.app)';
const BATCH   = 40;
const FAIL_COOLDOWN_DAYS = 14;
const FETCH_TIMEOUT_MS   = 8000;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE);

/* Same denylist as the venue lane: a share image is not automatically a
   picture of anything. Themes ship defaults and parked domains ship
   graphics, and one of those written onto a real event is a claim we
   cannot support. */
const NOT_A_PHOTO =
  /(placeholder|default|fallback|no[-_]?image|blank|spacer|dummy|sample|logo|favicon|sprite|banner[-_]?default|og[-_]?image|social[-_]?share|share[-_]?card|preview[-_]?card)/i;

function absHttp(raw: string, pageUrl: string): string | null {
  const v = String(raw).trim().replace(/&amp;/g, '&');
  if (!v || v.startsWith('data:')) return null;
  let abs: URL;
  try { abs = new URL(v, pageUrl); } catch { return null; }
  if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return null;
  return abs.toString();
}

/* ---- lane 1: Linkedevents by event id --------------------- */

/* The permalink is https://tapahtumat.hel.fi/en/<id> and the id itself
   contains a colon (`lippupiste:21462567`), which is why this reads the
   last path segment rather than splitting on ':'. */
function linkedEventsId(sourceUrl: string): string | null {
  try {
    const u = new URL(sourceUrl);
    if (!/(^|\.)tapahtumat\.hel\.fi$/i.test(u.hostname)) return null;
    const seg = u.pathname.split('/').filter(Boolean).pop();
    return seg && seg.includes(':') ? decodeURIComponent(seg) : null;
  } catch { return null; }
}

async function imageFromLinkedEvents(id: string): Promise<{ url: string; attr: string } | null> {
  try {
    const r = await fetch(
      `https://api.hel.fi/linkedevents/v1/event/${encodeURIComponent(id)}/`,
      { headers: { 'User-Agent': AGENT, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!r.ok) return null;
    const data = await r.json() as { images?: Array<Record<string, unknown>> };
    const img = (data.images ?? [])[0];
    const raw = typeof img?.url === 'string' ? img.url : '';
    if (!raw) return null;
    const url = absHttp(raw, 'https://api.hel.fi/');
    if (!url) return null;
    let path = '';
    try { path = new URL(url).pathname; } catch { return null; }
    if (NOT_A_PHOTO.test(path)) return null;

    /* Credit the photographer when the feed names one; otherwise the
       portal, which is where the picture came from. Never blank: the
       row prints whatever this says, and an uncredited photograph is a
       claim about provenance too. */
    const who = typeof img?.photographer_name === 'string' && img.photographer_name.trim()
      ? img.photographer_name.trim()
      : 'tapahtumat.hel.fi';
    return { url, attr: who };
  } catch { return null; }
}

/* ---- lane 2: the listing page ----------------------------- */

function pickOgImage(html: string, pageUrl: string): string | null {
  const metas = html.match(/<meta[^>]+>/gi) ?? [];
  for (const tag of metas) {
    if (!/(property|name)\s*=\s*["'](og:image(:secure_url|:url)?|twitter:image)["']/i.test(tag)) continue;
    const m = tag.match(/content\s*=\s*["']([^"']+)["']/i);
    if (!m) continue;
    const url = absHttp(m[1], pageUrl);
    if (!url) continue;
    let abs: URL;
    try { abs = new URL(url); } catch { continue; }
    if (/\.svg(\?|$)/i.test(abs.pathname)) continue;
    if (NOT_A_PHOTO.test(abs.pathname)) continue;
    return abs.toString();
  }
  return null;
}

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
      const v = obj['image'];
      const candidate = typeof v === 'string' ? v
        : Array.isArray(v) ? (typeof v[0] === 'string' ? v[0] as string
            : (v[0] as Record<string, unknown> | undefined)?.url as string | undefined)
        : (v as Record<string, unknown> | undefined)?.url as string | undefined;
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      for (const nested of Object.values(obj)) { const hit = walk(nested); if (hit) return hit; }
      return null;
    };
    const raw = walk(data);
    if (!raw) continue;
    /* Same guard the venue lane needed: the walker returns whatever sat
       under `image`, and a bare token resolves to <origin>/token, which
       is a 404 stored as a photograph. */
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

async function imageFromPage(sourceUrl: string): Promise<{ url: string; attr: string } | null> {
  try {
    const r = await fetch(sourceUrl, {
      headers: { 'User-Agent': AGENT, 'Accept': 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) return null;
    if (!(r.headers.get('content-type') ?? '').includes('text/html')) return null;
    /* Cut at </head>, not at an arbitrary byte count -- the venue lane
       lost real finds to a 200KB slice on sites that inline their CSS
       ahead of the meta tags. */
    const full = await r.text();
    const headEnd = full.search(/<\/head>/i);
    const html = headEnd > 0 ? full.slice(0, headEnd) : full.slice(0, 1_500_000);
    const pageUrl = r.url || sourceUrl;

    const url = pickOgImage(html, pageUrl) || pickJsonLdImage(html, pageUrl);
    if (!url) return null;
    let host = sourceUrl;
    try { host = new URL(sourceUrl).hostname.replace(/^www\./, ''); } catch { /**/ }
    return { url, attr: host };
  } catch { return null; }
}

/* ---- the shared-image guard ------------------------------- */

/* One picture standing in for many listings is the failure this whole
   family of functions exists to prevent -- but it is only a failure
   when the listings are UNRELATED. A theatre run is one show on twelve
   dates and shares one image correctly, and Linkedevents returns that
   image per event id, so the API lane is exempt: it cannot be wrong
   about which event it fetched.

   The page lane is not exempt. There, a repeat means a site template or
   an aggregator's default card, which is exactly the thing to refuse. */
async function alreadyUsedByPage(url: string, selfId: string): Promise<boolean> {
  const { count } = await db
    .from('picks')
    .select('id', { count: 'exact', head: true })
    .eq('image_url', url)
    .neq('id', selfId);
  return (count ?? 0) > 0;
}

/* ---- per-pick --------------------------------------------- */

type Pick = { id: string; title: string; city: string; source_url: string | null };

async function enrichPick(p: Pick, dryRun: boolean) {
  const src = p.source_url ?? '';

  const leId = src ? linkedEventsId(src) : null;
  if (leId) {
    const hit = await imageFromLinkedEvents(leId);
    if (hit) {
      if (!dryRun) {
        await db.from('picks')
          .update({ image_url: hit.url, image_attr: hit.attr, image_source: 'linkedevents' })
          .eq('id', p.id);
      }
      return { title: p.title, status: dryRun ? 'would_enrich_linkedevents' : 'enriched_linkedevents', url: hit.url };
    }
  }

  if (src) {
    const hit = await imageFromPage(src);
    if (hit) {
      if (await alreadyUsedByPage(hit.url, p.id)) {
        return { title: p.title, status: 'rejected_shared_image', url: hit.url };
      }
      if (!dryRun) {
        await db.from('picks')
          .update({ image_url: hit.url, image_attr: hit.attr, image_source: 'source_page' })
          .eq('id', p.id);
      }
      return { title: p.title, status: dryRun ? 'would_enrich_source_page' : 'enriched_source_page', url: hit.url };
    }
  }

  return { title: p.title, status: 'not_found' };
}

async function enrichCity(city: string, limit: number, dryRun: boolean) {
  const cutoff = new Date(Date.now() - FAIL_COOLDOWN_DAYS * 86400_000).toISOString();

  const { data: picks, error } = await db
    .from('picks')
    .select('id, title, city, source_url')
    .eq('city', city)
    .is('image_url', null)
    .is('archived_at', null)
    .not('source_url', 'is', null)
    .or(`image_enrich_failed_at.is.null,image_enrich_failed_at.lt.${cutoff}`)
    .limit(limit);

  if (error) return { city, ok: false, error: error.message };
  if (!picks?.length) return { city, ok: true, total: 0, enriched: 0, message: 'nothing to enrich' };

  const results = [];
  const failed: string[] = [];
  for (const p of picks as Pick[]) {
    const r = await enrichPick(p, dryRun);
    results.push(r);
    if (r.status === 'not_found' || r.status === 'rejected_shared_image') failed.push(p.id);
  }

  if (failed.length && !dryRun) {
    await db.from('picks')
      .update({ image_enrich_failed_at: new Date().toISOString() })
      .in('id', failed);
  }

  const enriched = results.filter(r => r.status.includes('enrich')).length;
  console.log(`[enrich-pick-images] ${city} dry_run=${dryRun} ${enriched}/${picks.length}`);
  return { city, ok: true, dry_run: dryRun, total: picks.length, enriched, results: results.slice(0, 40) };
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
