import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// enrich-pick-images v2
//
// For each active pick whose image_url is NULL, find a photo via
// Google Places API (Text Search + Photo media) and store it on
// picks.image_url. Groups by (venue, neighborhood) so the same
// venue's photo is reused across multiple picks.
//
// v2 (May 2026): when no body / no `city` is supplied, iterate all
// cities. The previous version silently defaulted to 'tallinn',
// which meant the cron only ever enriched Tallinn picks — Riga and
// Helsinki picks accumulated NULL image_urls forever.
//
// Two Places API calls per unique venue:
//   1. places:searchText  — returns photo references
//   2. {photo.name}/media — resolves to a stable CDN URL
//
// Cost: ~$0.039 per unique venue (within free tier credit).
//
// v3 (Jun 2026): optional `heal` mode. We store Google's *resolved*
// photo URI (the ephemeral lh3.googleusercontent.com/place-photos/…
// link), which Google expires/revokes for a small minority of photos
// over time — they start returning 403 and the venue card shows its
// initials placeholder. heal mode HEAD-checks existing Google image
// URLs, nulls only the ones that no longer resolve, and the normal
// refill loop then fetches a fresh photoUri for just those. This is
// broken-only and self-contained (no storage bucket, no new function);
// almost all stored URLs keep working, so heal touches very few rows.
//
// POST body: { city?: string, limit?: number, dry_run?: boolean,
//              heal?: boolean, heal_limit?: number }
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PLACES_KEY   = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';

const CITY_CENTER: Record<string, [number, number]> = {
  tallinn:  [59.4370, 24.7536],
  helsinki: [60.1699, 24.9384],
  riga:     [56.9460, 24.1059],
  vilnius:  [54.6872, 25.2797],
};

const sbHeaders = (extra: Record<string, string> = {}) => ({
  apikey:        SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type':'application/json',
  ...extra,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchPlacePhoto(
  venue: string, neighborhood: string, city: string,
  centerLat: number, centerLng: number,
): Promise<string | null> {
  if (!PLACES_KEY) return null;
  const q = [venue, neighborhood].filter(Boolean).join(', ') + `, ${city}`;
  try {
    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method:  'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-Goog-Api-Key':   PLACES_KEY,
        'X-Goog-FieldMask': 'places.id,places.photos,places.displayName',
      },
      body: JSON.stringify({
        textQuery:      q,
        languageCode:   'en',
        locationBias:   { circle: { center: { latitude: centerLat, longitude: centerLng }, radius: 10000 } },
        maxResultCount: 1,
      }),
    });
    if (!searchRes.ok) return null;
    const sd      = await searchRes.json();
    const place   = sd.places?.[0];
    const photoNm = place?.photos?.[0]?.name;
    if (!photoNm) return null;

    const mediaRes = await fetch(
      `https://places.googleapis.com/v1/${photoNm}/media?maxWidthPx=800&skipHttpRedirect=true`,
      { headers: { 'X-Goog-Api-Key': PLACES_KEY } }
    );
    if (!mediaRes.ok) return null;
    const md = await mediaRes.json();
    return md?.photoUri ?? null;
  } catch { return null; }
}

// Returns true if the stored photo URL no longer resolves (expired/
// revoked by Google). Network errors are treated as "still valid" so a
// transient blip never wipes a good URL.
async function isDeadPhotoUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    // 403/404/410 = Google has dropped this resolved photo URI.
    return res.status === 403 || res.status === 404 || res.status === 410;
  } catch {
    return false;
  }
}

// heal: find active picks whose stored Google photo URL has gone dead
// and null those (only) so the refill loop re-fetches a fresh URI.
async function healCity(city: string, healLimit: number, dryRun: boolean) {
  const url = `${SUPABASE_URL}/rest/v1/picks` +
    `?city=eq.${encodeURIComponent(city)}` +
    `&archived_at=is.null&image_url=like.*googleusercontent.com*` +
    `&select=id,image_url&order=id.asc`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) return { checked: 0, dead: 0, nulled: 0, error: 'fetch failed', status: res.status };
  const rows = await res.json() as Array<{ id: string; image_url: string }>;

  // De-dupe by URL — many picks share one venue photo, so we HEAD each
  // distinct URL once.
  const byUrl = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.image_url) continue;
    const ids = byUrl.get(r.image_url) ?? [];
    ids.push(r.id);
    byUrl.set(r.image_url, ids);
  }
  const distinct = [...byUrl.keys()].slice(0, healLimit);

  // HEAD-check in small concurrent batches to stay within the wall clock.
  const dead: string[] = [];
  const BATCH = 20;
  for (let i = 0; i < distinct.length; i += BATCH) {
    const slice = distinct.slice(i, i + BATCH);
    const flags = await Promise.all(slice.map(isDeadPhotoUrl));
    slice.forEach((u, j) => { if (flags[j]) dead.push(u); });
  }

  const deadIds = dead.flatMap(u => byUrl.get(u) ?? []);
  let nulled = 0;
  if (deadIds.length && !dryRun) {
    const idList = deadIds.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',');
    const upRes = await fetch(
      `${SUPABASE_URL}/rest/v1/picks?id=in.(${idList})`,
      {
        method:  'PATCH',
        headers: sbHeaders({ Prefer: 'return=minimal' }),
        body:    JSON.stringify({ image_url: null }),
      }
    );
    if (upRes.ok) nulled = deadIds.length;
  }

  return {
    checked:    distinct.length,
    dead_urls:  dead.length,
    nulled:     dryRun ? 0 : nulled,
    dead_picks: deadIds.length,
  };
}

async function enrichCity(city: string, limit: number, dryRun: boolean) {
  const center = CITY_CENTER[city];
  if (!center) return { city, ok: false, error: `unknown city ${city}` };

  const picksUrl = `${SUPABASE_URL}/rest/v1/picks` +
    `?city=eq.${encodeURIComponent(city)}` +
    `&archived_at=is.null&image_url=is.null` +
    `&select=id,venue,neighborhood&order=id.asc`;
  const picksRes = await fetch(picksUrl, { headers: sbHeaders() });
  if (!picksRes.ok) return { city, ok: false, error: 'picks fetch failed', status: picksRes.status };
  const picks = await picksRes.json() as Array<{ id: string; venue: string; neighborhood: string | null }>;

  type Group = { venue: string; neighborhood: string; pick_ids: string[] };
  const groups = new Map<string, Group>();
  for (const p of picks) {
    if (!p.venue) continue;
    if (/various|multiple|online|popup|pop-up/i.test(p.venue)) continue;
    const nhood = (p.neighborhood || '').trim();
    const key   = `${p.venue.toLowerCase()}|${nhood.toLowerCase()}`;
    let g = groups.get(key);
    if (!g) { g = { venue: p.venue, neighborhood: nhood, pick_ids: [] }; groups.set(key, g); }
    g.pick_ids.push(p.id);
  }

  const todo = [...groups.values()].slice(0, limit);
  let updated = 0, failed = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const g of todo) {
    await sleep(300);
    const photoUri = await fetchPlacePhoto(g.venue, g.neighborhood, city, center[0], center[1]);
    if (!photoUri) {
      failed++;
      results.push({ venue: g.venue, status: 'no_photo' });
      continue;
    }

    if (!dryRun) {
      const idList = g.pick_ids.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',');
      const upRes = await fetch(
        `${SUPABASE_URL}/rest/v1/picks?id=in.(${idList})&image_url=is.null`,
        {
          method:  'PATCH',
          headers: sbHeaders({ Prefer: 'return=minimal' }),
          body:    JSON.stringify({ image_url: photoUri }),
        }
      );
      if (!upRes.ok) {
        failed++;
        results.push({
          venue: g.venue, status: 'patch_failed',
          error: (await upRes.text().catch(() => '')).slice(0, 200),
        });
        continue;
      }
    }

    updated += g.pick_ids.length;
    results.push({ venue: g.venue, status: 'ok', image_url: photoUri, picks_updated: g.pick_ids.length });
  }

  return {
    city, ok: true,
    groups_processed: todo.length,
    groups_remaining: Math.max(0, groups.size - todo.length),
    picks_updated:    updated,
    groups_failed:    failed,
    results,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
      },
    });
  }
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const t0 = Date.now();
  let body: { city?: string; limit?: number; dry_run?: boolean; heal?: boolean; heal_limit?: number } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const limit     = Math.min(body.limit ?? 30, 100);
  const dryRun    = body.dry_run === true;
  const heal      = body.heal === true;
  const healLimit = Math.min(body.heal_limit ?? 400, 1000);

  // When city is omitted, run all cities in sequence (cron mode).
  // Vilnius is excluded until the city flips from 'coming' to 'live'.
  const cities = body.city
    ? [body.city.toLowerCase()]
    : ['tallinn', 'helsinki', 'riga'];

  const reports: Array<Record<string, unknown>> = [];
  for (const c of cities) {
    // heal first: null any dead Google URLs so enrichCity refills them.
    const healReport = heal ? await healCity(c, healLimit, dryRun) : undefined;
    const enrichReport = await enrichCity(c, limit, dryRun);
    reports.push(heal ? { ...enrichReport, heal: healReport } : enrichReport);
  }

  return json({
    ok: true,
    dry_run: dryRun,
    heal,
    cities: reports,
    latency_ms: Date.now() - t0,
  });
});
