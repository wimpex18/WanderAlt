import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// geocode-picks v4
//
// Two responsibilities:
//   * Default mode (batch): backfill picks.lat/lng + picks.address for
//     active picks whose coords or address is still NULL. Skip locked
//     rows. Runs hourly via the wa-geocode-picks pg_cron job.
//   * action='reverse' mode (per-call): proxy a single reverse-geocode
//     to Nominatim and return the resolved address. Used by the admin
//     pin editor so the browser never hits Nominatim directly (keeps
//     a single User-Agent identity, respects the OSM usage policy,
//     and hides editor IPs).
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PLACES_KEY   = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';

const MAX_NOMINATIM_KM = 4;

const CITY_CENTER: Record<string, [number, number]> = {
  tallinn:  [59.4370, 24.7536],
  helsinki: [60.1699, 24.9384],
  riga:     [56.9460, 24.1059],
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

function distKm(a: [number, number], b: [number, number]): number {
  const R   = 6371;
  const dLa = (b[0] - a[0]) * Math.PI / 180;
  const dLn = (b[1] - a[1]) * Math.PI / 180;
  const la1 = a[0] * Math.PI / 180;
  const la2 = b[0] * Math.PI / 180;
  const h   = Math.sin(dLa/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLn/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface NomHit { lat: number; lng: number; address: string | null; }
async function nominatimGeocode(
  venue: string, neighborhood: string, city: string,
): Promise<NomHit | null> {
  const q = [venue, neighborhood, city].filter(Boolean).join(', ');
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'WanderAlt/1.0 (geocode-picks)' } });
    if (!r.ok) return null;
    const rows = await r.json() as Array<{
      lat: string; lon: string;
      address?: { road?: string; house_number?: string; suburb?: string; city?: string; postcode?: string };
      display_name?: string;
    }>;
    if (!rows.length) return null;
    const a = rows[0].address || {};
    const addrParts = [
      [a.road, a.house_number].filter(Boolean).join(' '),
      a.postcode,
      a.city,
    ].filter(Boolean);
    const address = addrParts.length ? addrParts.join(', ') : (rows[0].display_name?.split(',').slice(0, 3).join(',') || null);
    return { lat: parseFloat(rows[0].lat), lng: parseFloat(rows[0].lon), address };
  } catch { return null; }
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

interface PlaceHit { lat: number; lng: number; address: string | null; place_id: string; }
async function placesGeocode(
  venue: string, neighborhood: string, city: string, centerLat: number, centerLng: number,
): Promise<PlaceHit | null> {
  if (!PLACES_KEY) return null;
  const q = [venue, neighborhood].filter(Boolean).join(', ') + `, ${city}`;
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-Goog-Api-Key':   PLACES_KEY,
        'X-Goog-FieldMask': 'places.id,places.location,places.displayName,places.formattedAddress',
      },
      body: JSON.stringify({
        textQuery:      q,
        languageCode:   'en',
        locationBias:   { circle: { center: { latitude: centerLat, longitude: centerLng }, radius: 10000 } },
        maxResultCount: 1,
      }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const place = d.places?.[0];
    if (!place?.location) return null;
    return {
      lat:      place.location.latitude,
      lng:      place.location.longitude,
      address:  place.formattedAddress ?? null,
      place_id: place.id || '',
    };
  } catch { return null; }
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

  // ── Single-shot reverse-geocode (admin pin editor) ────────────
  if (body.action === 'reverse') {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json({ ok: false, error: 'lat and lng required' }, 400);
    }
    const address = await nominatimReverse(lat, lng);
    return json({ ok: true, lat, lng, address, latency_ms: Date.now() - t0 });
  }

  // ── Default: batch backfill ────────────────────────────────────
  const city    = (body.city ?? 'tallinn').toLowerCase();
  const limit   = Math.min(body.limit ?? 50, 200);
  const dryRun  = body.dry_run === true;
  const center  = CITY_CENTER[city];
  if (!center) return json({ ok: false, error: `unknown city ${city}` }, 400);

  const picksUrl = `${SUPABASE_URL}/rest/v1/picks` +
    `?city=eq.${encodeURIComponent(city)}` +
    `&archived_at=is.null&coords_locked=eq.false` +
    `&or=(lat.is.null,address.is.null)` +
    `&select=id,venue,neighborhood,lat,lng,address&order=id.asc`;
  const picksRes = await fetch(picksUrl, { headers: sbHeaders() });
  if (!picksRes.ok) return json({ ok: false, error: 'picks fetch failed', status: picksRes.status }, 500);
  const picks = await picksRes.json() as Array<{
    id: string; venue: string; neighborhood: string | null;
    lat: number | null; lng: number | null; address: string | null;
  }>;

  type Group = {
    venue: string;
    neighborhood: string;
    pick_ids: string[];
    have_coords: { lat: number; lng: number } | null;
  };
  const groups = new Map<string, Group>();
  for (const p of picks) {
    if (!p.venue) continue;
    if (/various|multiple|online|popup|pop-up/i.test(p.venue)) continue;
    const nhood = (p.neighborhood || '').trim();
    const key   = `${p.venue.toLowerCase()}|${nhood.toLowerCase()}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        venue: p.venue, neighborhood: nhood, pick_ids: [],
        have_coords: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null,
      };
      groups.set(key, g);
    }
    g.pick_ids.push(p.id);
  }

  const todo = [...groups.values()].slice(0, limit);
  let geocoded = 0, addressed = 0, failed = 0, nomHits = 0, placesHits = 0, reverseHits = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const g of todo) {
    await sleep(1100);
    let coords: { lat: number; lng: number } | null = g.have_coords;
    let address: string | null = null;
    let placeId = '';
    let source: 'nominatim' | 'google_places' | 'reverse' | null = null;

    if (!coords) {
      const nom = await nominatimGeocode(g.venue, g.neighborhood, city);
      if (nom && distKm(center, [nom.lat, nom.lng]) <= MAX_NOMINATIM_KM) {
        coords = { lat: nom.lat, lng: nom.lng }; address = nom.address;
        source = 'nominatim'; nomHits++;
      } else {
        const pl = await placesGeocode(g.venue, g.neighborhood, city, center[0], center[1]);
        if (pl) {
          coords = { lat: pl.lat, lng: pl.lng }; address = pl.address;
          placeId = pl.place_id; source = 'google_places'; placesHits++;
        }
      }
    } else {
      address = await nominatimReverse(coords.lat, coords.lng);
      if (address) { source = 'reverse'; reverseHits++; }
    }

    if (!coords) {
      failed++;
      results.push({ venue: g.venue, neighborhood: g.neighborhood, status: 'no_match' });
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
        failed++;
        results.push({
          venue: g.venue, status: 'patch_failed',
          error: (await upRes.text().catch(() => '')).slice(0, 200),
        });
        continue;
      }
    }

    if (g.have_coords && address) addressed += g.pick_ids.length;
    else                          geocoded  += g.pick_ids.length;

    results.push({
      venue: g.venue, neighborhood: g.neighborhood,
      status: 'ok', source, lat: coords.lat, lng: coords.lng,
      address: address || undefined,
      place_id: placeId || undefined,
      picks_updated: g.pick_ids.length,
    });
  }

  return json({
    ok: true,
    city,
    dry_run: dryRun,
    groups_processed: todo.length,
    groups_remaining: Math.max(0, groups.size - todo.length),
    picks_geocoded:   geocoded,
    picks_addressed:  addressed,
    groups_failed:    failed,
    nominatim_hits:   nomHits,
    places_hits:      placesHits,
    reverse_hits:     reverseHits,
    latency_ms:       Date.now() - t0,
    results,
  });
});
