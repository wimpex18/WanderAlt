/* ============================================================
   enrich-images v11 — populate picks.image_url from venue_images
   table (self-learning DB cache) with Wikidata fallback. Free/
   unauthenticated Wikimedia APIs only — no paid Google key.
   ------------------------------------------------------------
   Flow per pick:
   1. Batch-load venue_images for all venues in the current run.
   2. If found  → write image_url/image_attr to pick, done.
   3. If not    → search Wikidata, validate NAME, TYPE and CITY, pull P18.
   4. If Wikidata hits → write to pick AND cache in venue_images
      (source='wikidata') so every future pick at that venue is
      served from the DB without an API call.

   v9 (Jul 2026): optional `dry_run` — reports what it WOULD write and
   mutates nothing. Worth using after any change to the gates below.

   v10 (Aug 2026): the matcher had one gate where it needed three, and
   the missing two are why a basement techno club called Hall was
   illustrated with the Old Town Christmas market. searchEntity() took
   `search[0]` from a FUZZY prefix/alias endpoint — something always
   comes back — and the only validation was P31 against a type list
   containing Q41176 "building", which almost any address satisfies. A
   wrong hit was then cached into venue_images and served forever. Now
   every candidate must clear labelMatches(), isVenueEntity() and
   isInCity(); a name that reduces to nothing distinctive ("Hall", "D3")
   is refused rather than guessed at, and a city missing from CITY_QID
   matches nothing rather than anything.

   v11 (Aug 2026): two things.
   • Writes upload.wikimedia.org CDN URLs. The old Special:FilePath form
     is the MediaWiki app layer — it 302s and is rate-limited, which is
     what made the first verification sweep report a third of the
     catalogue as unverifiable (every one an http 429). All stored URLs
     were migrated off it; this function writes into picks nightly, so
     leaving the old builder here would have undone that within a day.
   • Runs behind verify_jwt. It WRITES to the catalogue and had been
     reachable by anyone on the internet. Its cron moved to
     invoke_wa_fn first — that order matters, the reverse 401s in
     silence and cron.job_run_details still says "succeeded".
   Also sets image_source, so image_health can attribute what it wrote.
   ============================================================ */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AGENT            = 'WanderAlt/1.0 (cultural events guide)';
const BATCH            = 10;
const FAIL_COOLDOWN_DAYS = 14;

const VENUE_TYPES = new Set([
  'Q41176','Q811979','Q1060829','Q41253','Q860861','Q207694','Q7075',
  'Q2065736','Q7843791','Q24354','Q570116','Q1228895','Q14350','Q11707',
  'Q15206070','Q2087490','Q679765','Q1153859','Q44782','Q33506',
  'Q483242','Q163740','Q4830453','Q6881511',
]);

const GENERIC_VENUES = new Set(['various venues','various','tba','tbd','']);

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE);

/* v11: resolve to upload.wikimedia.org, the CDN, rather than to
   commons.wikimedia.org/wiki/Special:FilePath — the MediaWiki app layer,
   which 302s and is rate-limited. Aug 2026 migrated all 57 stored URLs off
   that form; this function writes into picks nightly, so leaving it here
   would have quietly re-introduced the throttled URLs and undone the
   migration within a day. Same resolver as enrich-venue-images. */
async function thumbUrl(file: string, width = 600): Promise<string | null> {
  const clean = String(file).replace(/^File:/, '');
  try {
    const params = new URLSearchParams({
      action: 'query', format: 'json', prop: 'imageinfo',
      iiprop: 'url', iiurlwidth: String(width), titles: 'File:' + clean,
    });
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`,
      { headers: { 'User-Agent': AGENT } });
    if (!r.ok) return null;
    const pages = (await r.json())?.query?.pages ?? {};
    const info = (Object.values(pages)[0] as any)?.imageinfo?.[0];
    const url = info?.thumburl || info?.url;
    if (!url) return null;
    /* utm_* is Commons' own analytics, not part of the image's address. */
    const u = new URL(url);
    u.search = '';
    return u.toString();
  } catch { return null; }
}

/* Normalised for comparison: case, punctuation and the words that make
   a venue name a venue name all dropped, so "Kino Sõprus" matches
   "Sõprus" but "Hall" does not match "Tallinn Town Hall". */
const NOISE = /\b(bar|baar|club|klubi|kino|cinema|teater|theatre|gallery|galerii|museum|muuseum|centre|center|keskus|saal|hall|pub|cafe|kohvik|restoran|restaurant)\b/g;
const normName = (s: string) =>
  s.toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/* Returns candidates rather than "the first one". Taking search[0]
   blindly is what put Tallinn Town Hall's Christmas market on a
   basement techno club called Hall: wbsearchentities is a fuzzy
   prefix/alias match, so SOMETHING always comes back, and every
   downstream check then validated the wrong entity. */
async function searchEntities(q: string): Promise<Array<{ id: string; label: string }>> {
  try {
    const r = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&limit=8&format=json`,
      { headers: { 'User-Agent': AGENT } }
    );
    if (!r.ok) return [];
    return ((await r.json())?.search ?? [])
      .map((s: any) => ({ id: s?.id, label: String(s?.label ?? '') }))
      .filter((s: any) => s.id);
  } catch { return []; }
}

/* The entity's label must actually be the venue we asked about. A
   Wikidata label may be longer ("Kanuti Gildi SAAL" vs "Kanuti Gildi
   saal") but it must contain the venue's distinctive words, and a
   venue name that reduces to nothing distinctive — "Hall", "Club" —
   is unmatchable by name alone and must not be guessed at. */
function labelMatches(venue: string, label: string): boolean {
  const v = normName(venue);
  const l = normName(label);
  if (!v || v.length < 3) return false;      /* nothing distinctive left */
  return l === v || l.includes(v) || v.includes(l);
}

/* And it must be in the right city. P131 (administrative territory)
   walked one level, compared against the city's own entity. Without
   this, a correctly-typed venue of the same name in another country
   passes every other check. */
const CITY_QID: Record<string, string> = {
  tallinn: 'Q1770', helsinki: 'Q1757', riga: 'Q1773', vilnius: 'Q216',
};

async function isInCity(id: string, city: string): Promise<boolean> {
  const want = CITY_QID[city];
  if (!want) return false;
  try {
    const r = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${id}&property=P131&format=json`,
      { headers: { 'User-Agent': AGENT } }
    );
    if (!r.ok) return false;
    const claims = (await r.json())?.claims?.P131 ?? [];
    return claims.some((c: any) => c?.mainsnak?.datavalue?.value?.id === want);
  } catch { return false; }
}

async function isVenueEntity(id: string): Promise<boolean> {
  try {
    const r = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${id}&property=P31&format=json`,
      { headers: { 'User-Agent': AGENT } }
    );
    if (!r.ok) return false;
    const claims = (await r.json())?.claims?.P31 ?? [];
    return claims.some((c: any) => VENUE_TYPES.has(c?.mainsnak?.datavalue?.value?.id));
  } catch { return false; }
}

async function getImageFilename(id: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${id}&property=P18&format=json`,
      { headers: { 'User-Agent': AGENT } }
    );
    return r.ok ? ((await r.json())?.claims?.P18?.[0]?.mainsnak?.datavalue?.value ?? null) : null;
  } catch { return null; }
}

async function enrichPick(
  pick: { id: string; venue: string; title: string },
  city: string,
  knownMap: Map<string, { url: string; attr: string }>,
  dryRun: boolean
): Promise<{ status: string; url?: string; attr?: string }> {
  const key = pick.venue.toLowerCase().trim();
  if (GENERIC_VENUES.has(key)) return { status: 'skipped_generic_venue' };

  /* 1. DB-backed known-venue lookup (O(1), no network call). */
  const known = knownMap.get(key);
  if (known) {
    if (!dryRun) {
      await db.from('picks')
        .update({ image_url: known.url, image_attr: known.attr, image_source: 'venue_images' })
        .eq('id', pick.id);
    }
    return { status: dryRun ? 'would_enrich_known' : 'enriched_known', url: known.url, attr: known.attr };
  }

  /* 2. Wikidata dynamic search — now with three gates, not one. */
  const cityLabel = city.charAt(0).toUpperCase() + city.slice(1);
  const seen = new Set<string>();
  for (const q of [`${pick.venue} ${cityLabel}`, pick.venue]) {
    for (const cand of await searchEntities(q)) {
      if (seen.has(cand.id)) continue;
      seen.add(cand.id);

      if (!labelMatches(pick.venue, cand.label)) continue;
      if (!(await isVenueEntity(cand.id)))       continue;
      if (!(await isInCity(cand.id, city)))      continue;

      const filename = await getImageFilename(cand.id);
      if (!filename) continue;

      const url = await thumbUrl(filename);
      if (!url) continue;
      const attr = `Wikimedia Commons — ${filename.replace(/^File:/, '').replace(/_/g, ' ')}`;

      if (!dryRun) {
        /* Write to pick. */
        await db.from('picks')
          .update({ image_url: url, image_attr: attr, image_source: 'wikidata' })
          .eq('id', pick.id);

        /* Cache in venue_images — next pick at this venue costs 0 API
           calls. This cache is also why a bad match used to be
           permanent: one wrong hit was written here and then served
           forever. The three gates above are what keep it clean. */
        await db.from('venue_images').upsert(
          { city, venue_key: key, image_url: url, image_attr: attr, source: 'wikidata' },
          { onConflict: 'city,venue_key', ignoreDuplicates: true }
        );
      }

      return { status: dryRun ? 'would_enrich_wikidata' : 'enriched_wikidata', url, attr };
    }
  }

  return { status: 'not_found' };
}

async function enrichCity(city: string, limit: number, dryRun: boolean) {
  const failCutoff = new Date(Date.now() - FAIL_COOLDOWN_DAYS * 86400 * 1000).toISOString();

  /* Fetch picks that still need images, skipping recent no-match failures. */
  const { data: picks, error } = await db
    .from('picks')
    .select('id, venue, title')
    .eq('city', city)
    .is('archived_at', null)
    .or('image_url.is.null,image_url.eq.')
    .or(`image_enrich_failed_at.is.null,image_enrich_failed_at.lt.${failCutoff}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error)        return { city, ok: false, error: error.message };
  if (!picks?.length) return { city, ok: true, enriched: 0, message: 'All picks already have images.' };

  /* Batch-fetch venue_images for all venues in this run (single DB round-trip). */
  const venueKeys = [...new Set(picks.map(p => p.venue.toLowerCase().trim()))];
  const { data: rows } = await db
    .from('venue_images')
    .select('venue_key, image_url, image_attr')
    .eq('city', city)
    .in('venue_key', venueKeys);

  const knownMap = new Map<string, { url: string; attr: string }>(
    (rows ?? []).map(r => [r.venue_key, { url: r.image_url, attr: r.image_attr }])
  );

  const results: Array<{ id: string; venue: string; status: string; url?: string }> = [];
  const failedIds: string[] = [];
  for (const pick of picks) {
    const r = await enrichPick(pick, city, knownMap, dryRun);
    results.push({ id: pick.id, venue: pick.venue, ...r });
    if (r.status === 'not_found') failedIds.push(pick.id);
  }

  /* Stamp the cooldown only on real runs — a dry run must not mutate. */
  if (failedIds.length && !dryRun) {
    await db.from('picks')
      .update({ image_enrich_failed_at: new Date().toISOString() })
      .in('id', failedIds);
  }

  const enriched = results.filter(r => r.status.startsWith('enriched') || r.status.startsWith('would_enrich')).length;
  const skipped  = results.filter(r => r.status.startsWith('skipped')).length;
  console.log(`[enrich-images] city=${city} dry_run=${dryRun} matched=${enriched}/${picks.length} skipped=${skipped}`);

  return { city, ok: true, dry_run: dryRun, total: picks.length, enriched, skipped, results };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let city: string | null = null, limit = BATCH, dryRun = false;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.city)  city  = String(body.city);
    if (body.limit) limit = Math.min(Number(body.limit), 50);
    if (body.dry_run === true) dryRun = true;
  } catch (_) { /**/ }

  // When city is omitted, run all live cities in sequence (cron mode).
  // Vilnius stays excluded until it flips from 'coming' to 'live'.
  const cities = city ? [city.toLowerCase()] : ['tallinn', 'helsinki', 'riga'];

  const reports = [];
  for (const c of cities) reports.push(await enrichCity(c, limit, dryRun));

  return new Response(
    JSON.stringify({ dry_run: dryRun, cities: reports }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
