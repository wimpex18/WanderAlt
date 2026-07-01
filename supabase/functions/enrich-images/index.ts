/* ============================================================
   enrich-images v8 — populate picks.image_url from venue_images
   table (self-learning DB cache) with Wikidata fallback. Free/
   unauthenticated Wikimedia APIs only — no paid Google key.
   ------------------------------------------------------------
   Flow per pick:
   1. Batch-load venue_images for all venues in the current run.
   2. If found  → write image_url/image_attr to pick, done.
   3. If not    → search Wikidata, validate venue type, pull P18.
   4. If Wikidata hits → write to pick AND cache in venue_images
      (source='wikidata') so every future pick at that venue is
      served from the DB without an API call.

   Scaling to new cities:
   - Add rows to venue_images with the new city name.
   - The Wikidata path works city-agnostically out of the box.
   - No redeploy needed.

   v8 (Jul 2026): this is now the sole picks.image_url filler —
   enrich-pick-images (Google Places, paid) was retired. Two fixes
   that mirror what caused the Places overspend:
     - iterates tallinn/helsinki/riga when no `city` is given, instead
       of silently defaulting to tallinn and leaving other cities'
       picks NULL forever.
     - a pick Wikidata has no image for gets `image_enrich_failed_at`
       stamped so it's skipped for FAIL_COOLDOWN_DAYS instead of
       re-querying Wikidata for the same unmatchable venue every run.
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

function thumbUrl(file: string, width = 600): string {
  const clean = file.replace(/^File:/, '');
  let decoded: string;
  try { decoded = decodeURIComponent(clean.replace(/ /g, '_')); }
  catch { decoded = clean.replace(/ /g, '_'); }
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(decoded)}?width=${width}`;
}

async function searchEntity(q: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&limit=5&format=json`,
      { headers: { 'User-Agent': AGENT } }
    );
    return r.ok ? ((await r.json())?.search?.[0]?.id ?? null) : null;
  } catch { return null; }
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
  knownMap: Map<string, { url: string; attr: string }>
): Promise<{ status: string; url?: string }> {
  const key = pick.venue.toLowerCase().trim();
  if (GENERIC_VENUES.has(key)) return { status: 'skipped_generic_venue' };

  /* 1. DB-backed known-venue lookup (O(1), no network call). */
  const known = knownMap.get(key);
  if (known) {
    await db.from('picks')
      .update({ image_url: known.url, image_attr: known.attr })
      .eq('id', pick.id);
    return { status: 'enriched_known', url: known.url };
  }

  /* 2. Wikidata dynamic search. */
  const cityLabel = city.charAt(0).toUpperCase() + city.slice(1);
  for (const q of [`${pick.venue} ${cityLabel}`, pick.venue]) {
    const entityId = await searchEntity(q);
    if (!entityId || !(await isVenueEntity(entityId))) continue;
    const filename = await getImageFilename(entityId);
    if (!filename) continue;

    const url  = thumbUrl(filename);
    const attr = `Wikimedia Commons — ${filename.replace(/^File:/, '').replace(/_/g, ' ')}`;

    /* Write to pick. */
    await db.from('picks')
      .update({ image_url: url, image_attr: attr })
      .eq('id', pick.id);

    /* Cache in venue_images — next pick at this venue costs 0 API calls. */
    await db.from('venue_images').upsert(
      { city, venue_key: key, image_url: url, image_attr: attr, source: 'wikidata' },
      { onConflict: 'city,venue_key', ignoreDuplicates: true }
    );

    return { status: 'enriched_wikidata', url };
  }

  return { status: 'not_found' };
}

async function enrichCity(city: string, limit: number) {
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
    const r = await enrichPick(pick, city, knownMap);
    results.push({ id: pick.id, venue: pick.venue, ...r });
    if (r.status === 'not_found') failedIds.push(pick.id);
  }

  if (failedIds.length) {
    await db.from('picks')
      .update({ image_enrich_failed_at: new Date().toISOString() })
      .in('id', failedIds);
  }

  const enriched = results.filter(r => r.status.startsWith('enriched')).length;
  const skipped  = results.filter(r => r.status.startsWith('skipped')).length;
  console.log(`[enrich-images] city=${city} enriched=${enriched}/${picks.length} skipped=${skipped}`);

  return { city, ok: true, total: picks.length, enriched, skipped, results };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let city: string | null = null, limit = BATCH;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.city)  city  = String(body.city);
    if (body.limit) limit = Math.min(Number(body.limit), 50);
  } catch (_) { /**/ }

  // When city is omitted, run all live cities in sequence (cron mode).
  // Vilnius stays excluded until it flips from 'coming' to 'live'.
  const cities = city ? [city.toLowerCase()] : ['tallinn', 'helsinki', 'riga'];

  const reports = [];
  for (const c of cities) reports.push(await enrichCity(c, limit));

  return new Response(
    JSON.stringify({ cities: reports }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
