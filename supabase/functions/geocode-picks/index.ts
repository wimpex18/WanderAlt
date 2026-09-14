import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// geocode-picks
//
// Two responsibilities:
//   * Default mode (batch): backfill picks.lat/lng + picks.address for
//     active picks whose coords or address is still NULL, via Nominatim
//     (OpenStreetMap, free/unauthenticated). Skips locked rows. A bare
//     call sweeps every city on a shared round-robin budget. Runs hourly
//     via the wa-geocode-picks pg_cron job.
//   * action='reverse' mode (per-call): proxy a single reverse-geocode
//     to Nominatim for the admin pin editor, so the browser never hits
//     Nominatim directly.
//
// Placeholder venue names ("Unknown", "null") are skipped outright.
// A venue Nominatim can't find stays unresolved (admin can pin it
// manually) and is skipped for FAIL_COOLDOWN_DAYS.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_NOMINATIM_KM = 4;

// A venue Nominatim can't resolve stays failed for this long before it's
// retried again -- avoids hammering the free Nominatim API forever for a
// venue name it will never match.
const FAIL_COOLDOWN_DAYS = 14;

const CITY_CENTER: Record<string, [number, number]> = {
  tallinn:  [59.4370, 24.7536],
  helsinki: [60.1699, 24.9384],
  riga:     [56.9460, 24.1059],
  vilnius:  [54.6872, 25.2797],
};

const ALL_CITIES = Object.keys(CITY_CENTER);

// Names that are not places. "Various venues" was already skipped; these
// are the rest of what the scrapers actually emit when a listing has no
// venue, and geocoding them is a call spent to learn nothing.
const NON_VENUE = /^(unknown|null|undefined|n\/?a|tba|tbc|-{1,}|\?+)$/i;

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

function distKm(a: [number, number], b: [number, number]): number {
  const R   = 6371;
  const dLa = (b[0] - a[0]) * Math.PI / 180;
  const dLn = (b[1] - a[1]) * Math.PI / 180;
  const la1 = a[0] * Math.PI / 180;
  const la2 = b[0] * Math.PI / 180;
  const h   = Math.sin(dLa/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLn/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Three outcomes, not two: only 'none' (Nominatim answered, no such place)
// stamps geocode_failed_at. A 429 or transport error stamps nothing.
type GeoOutcome =
  | { kind: 'hit'; lat: number; lng: number; address: string | null }
  | { kind: 'none' }
  | { kind: 'error'; status: number | null };

interface NomRow {
  lat: string; lon: string;
  address?: { road?: string; house_number?: string; city?: string; postcode?: string };
  display_name?: string;
}

function parseHit(row: NomRow): GeoOutcome {
  const a = row.address || {};
  const addrParts = [
    [a.road, a.house_number].filter(Boolean).join(' '),
    a.postcode,
    a.city,
  ].filter(Boolean);
  const address = addrParts.length
    ? addrParts.join(', ')
    : (row.display_name?.split(',').slice(0, 3).join(',') || null);
  return { kind: 'hit', lat: parseFloat(row.lat), lng: parseFloat(row.lon), address };
}

async function nominatimQuery(q: string): Promise<GeoOutcome> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'WanderAlt/1.0 (geocode-picks)' } });
    if (!r.ok) return { kind: 'error', status: r.status };
    const rows = await r.json() as NomRow[];
    if (!rows.length) return { kind: 'none' };
    return parseHit(rows[0]);
  } catch { return { kind: 'error', status: null }; }
}

// Venue + city FIRST, and the neighborhood only as a fallback: pick
// neighborhoods are LLM-assigned and often wrong, and Nominatim treats every
// term as a constraint. MAX_NOMINATIM_KM guards against a same-name hit
// elsewhere.
async function nominatimGeocode(
  venue: string, neighborhood: string, city: string,
): Promise<GeoOutcome> {
  const plain = await nominatimQuery([venue, city].filter(Boolean).join(', '));
  if (plain.kind === 'hit' || plain.kind === 'error') return plain;
  if (!neighborhood) return plain;
  // Only reached when the plain query genuinely found nothing, so the extra
  // ~1.1s is spent on misses and never on the happy path.
  await sleep(1100);
  return nominatimQuery([venue, neighborhood, city].filter(Boolean).join(', '));
}

async function nominatimReverse(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent':      'WanderAlt/1.0 (geocode-picks)',
        'Accept-Language': 'en',
      },
    });
    if (!r.ok) return null;
    const row = await r.json() as {
      address?: { road?: string; house_number?: string; postcode?: string; city?: string };
      display_name?: string;
    };
    const a = row.address || {};
    const parts = [
      [a.road, a.house_number].filter(Boolean).join(' '),
      a.postcode, a.city,
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : (row.display_name?.split(',').slice(0, 3).join(',') || null);
  } catch { return null; }
}

// One city's worth of un-geocoded picks, grouped by venue so a venue with
// twelve listings costs one Nominatim call, not twelve.
type Group = {
  venue: string;
  neighborhood: string;
  pick_ids: string[];
  have_coords: { lat: number; lng: number } | null;
};

async function loadGroups(city: string): Promise<Group[]> {
  const failCutoff = new Date(Date.now() - FAIL_COOLDOWN_DAYS * 86400 * 1000).toISOString();
  const picksUrl = `${SUPABASE_URL}/rest/v1/picks` +
    `?city=eq.${encodeURIComponent(city)}` +
    `&archived_at=is.null&coords_locked=eq.false` +
    `&and=(or(lat.is.null,address.is.null),or(geocode_failed_at.is.null,geocode_failed_at.lt.${failCutoff}))` +
    `&select=id,venue,neighborhood,lat,lng,address&order=id.asc`;
  const res = await fetch(picksUrl, { headers: sbHeaders() });
  if (!res.ok) return [];
  const picks = await res.json() as Array<{
    id: string; venue: string; neighborhood: string | null;
    lat: number | null; lng: number | null; address: string | null;
  }>;

  const groups = new Map<string, Group>();
  for (const p of picks) {
    const venue = (p.venue || '').trim();
    if (!venue) continue;
    if (NON_VENUE.test(venue)) continue;
    if (/various|multiple|online|popup|pop-up/i.test(venue)) continue;
    const nhood = (p.neighborhood || '').trim();
    const key   = `${venue.toLowerCase()}|${nhood.toLowerCase()}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        venue, neighborhood: nhood, pick_ids: [],
        have_coords: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null,
      };
      groups.set(key, g);
    }
    g.pick_ids.push(p.id);
  }
  return [...groups.values()];
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
  let body: {
    action?: 'reverse';
    lat?: number; lng?: number;
    city?: string; limit?: number; dry_run?: boolean;
  } = {};
  try { body = await req.json(); } catch { /* no body */ }

  // -- Single-shot reverse-geocode (admin pin editor) ------------
  if (body.action === 'reverse') {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json({ ok: false, error: 'lat and lng required' }, 400);
    }
    const address = await nominatimReverse(lat, lng);
    return json({ ok: true, lat, lng, address, latency_ms: Date.now() - t0 });
  }

  // -- Default: batch backfill -----------------------------------
  // No city given = sweep them all (invoke_wa_fn() posts a fixed empty body).
  const dryRun   = body.dry_run === true;
  const askedFor = body.city ? String(body.city).toLowerCase() : null;
  if (askedFor && !CITY_CENTER[askedFor]) {
    return json({ ok: false, error: `unknown city ${askedFor}` }, 400);
  }
  const cities = askedFor ? [askedFor] : ALL_CITIES;

  // One budget for the whole run, not per city: each group costs a ~1.1s
  // Nominatim pause, and a miss costs two (plain, then neighborhood).
  // Sized to the caller: invoke_wa_fn() posts with a 60s timeout, so the
  // worst case (~44s) finishes before pg_net hangs up. Manual runs can
  // pass a bigger limit.
  const budget = Math.min(body.limit ?? 20, 200);

  const collected: Array<{ city: string; groups: Group[] }> = [];
  for (const city of cities) {
    const groups = await loadGroups(city);
    if (groups.length) collected.push({ city, groups });
  }

  // Round-robin so one busy city cannot starve the others of the budget.
  const queue: Array<{ city: string; group: Group }> = [];
  for (let i = 0; queue.length < budget; i++) {
    let added = false;
    for (const c of collected) {
      if (i < c.groups.length && queue.length < budget) {
        queue.push({ city: c.city, group: c.groups[i] });
        added = true;
      }
    }
    if (!added) break;
  }

  const perCity: Record<string, {
    geocoded: number; addressed: number; failed: number; transient: number;
    nominatim_hits: number; reverse_hits: number;
    groups_processed: number; groups_total: number;
  }> = {};
  for (const c of collected) {
    perCity[c.city] = {
      geocoded: 0, addressed: 0, failed: 0, transient: 0,
      nominatim_hits: 0, reverse_hits: 0,
      groups_processed: 0, groups_total: c.groups.length,
    };
  }

  const results: Array<Record<string, unknown>> = [];

  for (const { city, group: g } of queue) {
    const center = CITY_CENTER[city];
    const stats  = perCity[city];
    stats.groups_processed++;

    await sleep(1100);
    let coords: { lat: number; lng: number } | null = g.have_coords;
    let address: string | null = null;
    let source: 'nominatim' | 'reverse' | null = null;

    if (!coords) {
      const nom = await nominatimGeocode(g.venue, g.neighborhood, city);
      if (nom.kind === 'error') {
        // Rejected or unreachable -- say nothing about this venue. Stamping
        // a failure here is how a rate-limit became a fortnight of silence.
        stats.transient++;
        results.push({ city, venue: g.venue, status: 'transient', http: nom.status });
        continue;
      }
      if (nom.kind === 'hit' && distKm(center, [nom.lat, nom.lng]) <= MAX_NOMINATIM_KM) {
        coords = { lat: nom.lat, lng: nom.lng }; address = nom.address;
        source = 'nominatim'; stats.nominatim_hits++;
      }
    } else {
      address = await nominatimReverse(coords.lat, coords.lng);
      if (address) { source = 'reverse'; stats.reverse_hits++; }
    }

    if (!coords) {
      stats.failed++;
      results.push({ city, venue: g.venue, neighborhood: g.neighborhood, status: 'no_match' });
      if (!dryRun) {
        const idList = g.pick_ids.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',');
        await fetch(`${SUPABASE_URL}/rest/v1/picks?id=in.(${idList})`, {
          method:  'PATCH',
          headers: sbHeaders({ Prefer: 'return=minimal' }),
          body:    JSON.stringify({ geocode_failed_at: new Date().toISOString() }),
        }).catch(() => {});
      }
      continue;
    }

    if (!dryRun) {
      const idList = g.pick_ids.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',');
      const upd: Record<string, unknown> = { lat: coords.lat, lng: coords.lng };
      if (address) upd.address = address;
      if (source && source !== 'reverse') upd.coords_source = source;

      const upRes = await fetch(
        `${SUPABASE_URL}/rest/v1/picks?id=in.(${idList})&coords_locked=eq.false`,
        {
          method:  'PATCH',
          headers: sbHeaders({ Prefer: 'return=minimal' }),
          body:    JSON.stringify(upd),
        }
      );
      if (!upRes.ok) {
        stats.failed++;
        results.push({
          city, venue: g.venue, status: 'patch_failed',
          error: (await upRes.text().catch(() => '')).slice(0, 200),
        });
        continue;
      }
    }

    if (g.have_coords && address) stats.addressed += g.pick_ids.length;
    else                          stats.geocoded  += g.pick_ids.length;

    results.push({
      city, venue: g.venue, neighborhood: g.neighborhood,
      status: 'ok', source, lat: coords.lat, lng: coords.lng,
      address: address || undefined,
      picks_updated: g.pick_ids.length,
    });
  }

  const sum = (k: keyof (typeof perCity)[string]) =>
    Object.values(perCity).reduce((n, c) => n + (c[k] as number), 0);

  return json({
    ok: true,
    cities: cities,
    dry_run: dryRun,
    budget,
    groups_processed: queue.length,
    groups_remaining: sum('groups_total') - sum('groups_processed'),
    picks_geocoded:   sum('geocoded'),
    picks_addressed:  sum('addressed'),
    groups_failed:    sum('failed'),
    // Not stamped, so they come back on the next run rather than sitting
    // out the 14-day cooldown for something that was never their fault.
    groups_transient: sum('transient'),
    nominatim_hits:   sum('nominatim_hits'),
    reverse_hits:     sum('reverse_hits'),
    per_city:         perCity,
    latency_ms:       Date.now() - t0,
    results,
  });
});
