import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// discover-venues  v1
// External AI-augmented discovery — called only when match-pick
// returns `suggested_more: true` (i.e. fewer than 3 strong DB hits).
//
// Strategy:
//   1. Call Google Places (New) searchText scoped to the city.
//   2. Reject chains, fast food, hotels, tourist traps.
//   3. For each strong result, check `venue_details.google_place_id`:
//        - If we already have this venue → high-confidence "known"
//        - If not → still surface, but flag as "new venue suggestion"
//   4. Save each as a pick with `pending_review = true`,
//      `discovery_source = 'google_places'`,
//      `discovery_query = original prompt`.
//   5. Return hits in match-pick-compatible shape so the frontend can
//      render them with a clear "pending review" badge.
//
// POST body:
//   { city: 'tallinn'|'helsinki'|'riga', prompt: string, limit?: number }
//
// Response (matches match-pick shape):
//   { ok, hits: [{ pick, why }], classifier: 'discovery',
//     saved: number, cached: false, latency_ms }
// ============================================================

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PLACES_KEY    = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';

const ALLOWED_CITIES = new Set(['tallinn', 'helsinki', 'riga']);

// City centre coords used as a search bias (~5 km radius)
const CITY_COORDS: Record<string, [number, number]> = {
  tallinn:  [59.4370, 24.7536],
  helsinki: [60.1699, 24.9384],
  riga:     [56.9460, 24.1059],
};

// Place types we never want surfaced from Google Places —
// WanderAlt is curated alternative culture, not tourist guidebook
const REJECT_TYPES = new Set([
  'lodging', 'hotel', 'motel', 'hostel',
  'fast_food_restaurant', 'meal_takeaway',
  'gas_station', 'atm', 'bank', 'pharmacy',
  'shopping_mall', 'supermarket', 'convenience_store',
  'gym', 'spa', 'beauty_salon', 'hair_care',
  'car_dealer', 'car_rental', 'car_repair', 'car_wash', 'parking',
  'real_estate_agency', 'insurance_agency', 'lawyer', 'accounting',
  'embassy', 'local_government_office',
  'tourist_attraction',  // too generic — WanderAlt picks specific things
]);

// Best-effort mapping from a Google place's primary type to our `kind`
const TYPE_TO_KIND: Record<string, string> = {
  bar:                  'bar',
  night_club:           'club',
  cafe:                 'place',
  restaurant:           'place',
  art_gallery:          'gallery',
  museum:               'museum',
  performing_arts_theater: 'theatre',
  movie_theater:        'cinema',
  library:              'library',
  book_store:           'bookshop',
  music_store:          'record store',
  thrift_store:         'thrift',
  community_center:     'arts centre',
  cultural_center:      'arts centre',
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
      'Content-Type':'application/json',
      'Access-Control-Allow-Origin':'*',
    },
  });

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const inferInitials = (s: string): string => {
  const words = s.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

interface GooglePlace {
  id:              string;
  displayName?:    { text: string };
  formattedAddress?: string;
  location?:       { latitude: number; longitude: number };
  primaryType?:    string;
  types?:          string[];
  businessStatus?: string;
  photos?:         Array<{ name: string }>;
  websiteUri?:     string;
  rating?:         number;
  userRatingCount?: number;
}

async function searchGooglePlaces(prompt: string, city: string, limit: number): Promise<GooglePlace[]> {
  if (!PLACES_KEY) return [];
  const [lat, lng] = CITY_COORDS[city] ?? [0, 0];
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Goog-Api-Key':  PLACES_KEY,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.primaryType',
          'places.types',
          'places.businessStatus',
          'places.photos',
          'places.websiteUri',
          'places.rating',
          'places.userRatingCount',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery:    `${prompt} in ${city}`,
        languageCode: 'en',
        locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 5000.0 } },
        maxResultCount: Math.min(limit + 3, 10),  // overfetch to allow filtering
      }),
    });
    if (!res.ok) {
      console.error(`places.searchText failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return [];
    }
    const data = await res.json();
    return data?.places ?? [];
  } catch (e) {
    console.error('places.searchText exception', e);
    return [];
  }
}

async function resolvePhoto(photoName: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true`,
      { headers: { 'X-Goog-Api-Key': PLACES_KEY } }
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j?.photoUri ?? null;
  } catch { return null; }
}

// Look up which Google Place IDs we already have in venue_details.
// Returns a Map<placeId, venue_key> so we can wire `venue` to the curated name.
async function fetchKnownVenues(placeIds: string[], city: string): Promise<Map<string, { display_name: string }>> {
  if (!placeIds.length) return new Map();
  const idList = placeIds.map(id => `"${id}"`).join(',');
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/venue_details?city=eq.${encodeURIComponent(city)}` +
    `&google_place_id=in.(${idList})&select=google_place_id,display_name`,
    { headers: sbHeaders() }
  );
  if (!r.ok) return new Map();
  const rows = await r.json() as Array<{ google_place_id: string; display_name: string }>;
  return new Map(rows.map(r => [r.google_place_id, { display_name: r.display_name }]));
}

interface DiscoveryRow {
  place:    GooglePlace;
  kind:     string;
  knownAs?: string;  // curated venue name if already in DB
}

// Map (neighborhood, lat, lng) → (world_x, world_y) via the SQL helper that
// knows the artistic Tallinn SVG layout. Returns null on RPC failure so the
// pick still saves without coords rather than blocking the discovery flow.
async function worldCoords(
  neighborhood: string,
  lat: number | null,
  lng: number | null,
  seed: string,
): Promise<{ world_x: number; world_y: number } | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/wa_pick_world_coords`, {
      method:  'POST',
      headers: sbHeaders(),
      body:    JSON.stringify({ neighborhood, lat, lng, seed }),
    });
    if (!r.ok) return null;
    const rows = await r.json();
    const row  = Array.isArray(rows) ? rows[0] : rows;
    if (!row || typeof row.world_x !== 'number') return null;
    return { world_x: row.world_x, world_y: row.world_y };
  } catch { return null; }
}

// Persist the Google Places enrichment to venue_details so future picks of
// the same venue (Telegram, admin, etc.) can reuse the lat/lng — no second
// Places API call needed. Idempotent via the (city, venue_key) unique index.
async function upsertVenueDetails(
  city: string,
  name: string,
  place: GooglePlace,
): Promise<void> {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;

  const body = {
    city,
    venue_key:       name.toLowerCase(),
    display_name:    name,
    google_place_id: place.id,
    lat,
    lng,
    address:         place.formattedAddress || null,
    website:         place.websiteUri || null,
    business_status: place.businessStatus || null,
    is_closed:       place.businessStatus === 'CLOSED_PERMANENTLY',
    source:          'google_places',
    enriched_at:     new Date().toISOString(),
  };
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/venue_details?on_conflict=city,venue_key`,
      {
        method:  'POST',
        headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body:    JSON.stringify(body),
      },
    );
  } catch (_) { /* best-effort */ }
}

function filterAndClassify(places: GooglePlace[]): DiscoveryRow[] {
  const out: DiscoveryRow[] = [];
  for (const place of places) {
    if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') continue;
    const types = new Set(place.types ?? []);
    // Reject obvious non-cultural categories
    if ([...types].some(t => REJECT_TYPES.has(t))) continue;
    if (!place.displayName?.text) continue;

    // Pick a kind from the type list, default to 'place'
    let kind = 'place';
    for (const t of [place.primaryType ?? '', ...types]) {
      if (TYPE_TO_KIND[t]) { kind = TYPE_TO_KIND[t]; break; }
    }
    out.push({ place, kind });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
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
  let body: { city?: string; prompt?: string; limit?: number } = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: 'invalid JSON' }, 400); }

  const city   = body.city && ALLOWED_CITIES.has(body.city) ? body.city : 'tallinn';
  const prompt = (body.prompt || '').trim().slice(0, 200);
  const limit  = Math.min(body.limit ?? 5, 5);

  if (!prompt) return json({ ok: false, error: 'prompt required' }, 400);
  if (!PLACES_KEY) return json({
    ok: false,
    error: 'GOOGLE_PLACES_API_KEY not configured',
  }, 503);

  // ---- 1. Search Google Places ----
  const places = await searchGooglePlaces(prompt, city, limit);
  if (!places.length) {
    return json({
      ok:         true,
      hits:       [],
      classifier: 'discovery',
      saved:      0,
      empty:      true,
      diagnostic: { places: 0, filtered: 0, rejected_types: [] as string[] },
      cached:     false,
      latency_ms: Date.now() - t0,
    });
  }

  // ---- 2. Filter + classify ----
  const filtered      = filterAndClassify(places).slice(0, limit);
  const rejectedTypes = places
    .filter(p => !filtered.some(f => f.place.id === p.id))
    .map(p => p.primaryType || '(no primary type)');

  // ---- 3. Cross-reference with our venues ----
  const placeIds = filtered.map(r => r.place.id).filter(Boolean);
  const known    = await fetchKnownVenues(placeIds, city);
  for (const row of filtered) {
    const k = known.get(row.place.id);
    if (k) row.knownAs = k.display_name;
  }

  // ---- 4. Upsert as pending picks ----
  const hits: Array<{ pick: Record<string, unknown>; why: string }> = [];
  let saved = 0;

  for (const row of filtered) {
    const place = row.place;
    const name  = row.knownAs || place.displayName?.text || 'Unknown';
    const slug  = slugify(name);
    const id    = `discovery-${slug}-${place.id.slice(-8)}`;

    // Resolve a photo (best-effort)
    let imageUrl: string | null = null;
    if (place.photos?.[0]?.name) {
      imageUrl = await resolvePhoto(place.photos[0].name);
    }

    // Address → neighborhood (rough — just grab the first comma-stripped part if
    // formattedAddress starts with a street, otherwise leave blank for admin)
    const addressParts = (place.formattedAddress || '').split(',').map(s => s.trim()).filter(Boolean);
    const neighborhood = addressParts.length >= 2 ? addressParts[addressParts.length - 2] : 'other';

    // Compute illustrated-map coordinates so the pick has a pin position the
    // moment an editor approves it.
    const lat = place.location?.latitude  ?? null;
    const lng = place.location?.longitude ?? null;
    const wc  = await worldCoords(neighborhood, lat, lng, id);

    // Persist Google's data to venue_details for future reuse.
    await upsertVenueDetails(city, name, place);

    const picksRow = {
      id,
      city,
      title:             `${name} — pending review`,
      venue:             name,
      neighborhood,
      kind:              row.kind,
      day:               null,
      time:              null,
      quote:             `Surfaced by external search for "${prompt}". Not yet vouched for by a curator.`,
      handle:            '@discovery',
      thumb_initials:    inferInitials(name),
      image_url:         imageUrl,
      image_attr:        'Google Places',
      tonight:           false,
      this_week:         false,
      mood_tags:         [],
      auto_generated:    true,
      source_message_id: null,
      pending_review:    true,
      discovery_source:  'google_places',
      discovery_query:   prompt,
      valid_until:       new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),  // 30 days
      archived_at:       null,
      world_x:           wc?.world_x ?? null,
      world_y:           wc?.world_y ?? null,
    };

    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/picks`, {
      method:  'POST',
      headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body:    JSON.stringify(picksRow),
    });
    if (upsertRes.ok) {
      saved++;
      hits.push({
        pick: {
          id,
          title:        picksRow.title,
          venue:        name,
          neighborhood,
          kind:         row.kind,
          quote:        picksRow.quote,
          handle:       '@discovery',
          day:          null,
          time:         null,
          moodTags:     [],
          thumbInitials: picksRow.thumb_initials,
          imageUrl,
          imageAttr:    'Google Places',
          pin:          null,
          world_x:      wc?.world_x ?? null,
          world_y:      wc?.world_y ?? null,
          tonight:      false,
          thisWeek:     false,
          pending:      true,
          discoverySource: 'google_places',
          rating:       place.rating ?? null,
          ratingCount:  place.userRatingCount ?? null,
          knownVenue:   !!row.knownAs,
          mapsUrl:      `https://www.google.com/maps/place/?q=place_id:${place.id}`,
        },
        why: row.knownAs
          ? `A venue we already cover, surfaced again by external search — open for review.`
          : `Surfaced by external search and not yet curated. Worth a closer look before publishing.`,
      });
    } else {
      console.error(`discovery upsert ${id} failed: ${upsertRes.status} ${(await upsertRes.text()).slice(0, 120)}`);
    }
  }

  // ---- 5. Log the run ----
  await fetch(`${SUPABASE_URL}/rest/v1/ingest_log`, {
    method:  'POST',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      fn:          'discover-venues',
      status:      'ok',
      inserted:    saved,
      rejected:    places.length - saved,
      error:       null,
      detail:      { prompt, city, places: places.length, filtered: filtered.length, saved },
      finished_at: new Date().toISOString(),
    }),
  }).catch(() => {});

  return json({
    ok:         true,
    hits,
    classifier: 'discovery',
    saved,
    empty:      hits.length === 0,
    diagnostic: { places: places.length, filtered: filtered.length, rejected_types: rejectedTypes },
    cached:     false,
    latency_ms: Date.now() - t0,
  });
});
