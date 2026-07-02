import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// discover-venues  v2 — Overture-backed (July 2026)
// External-search discovery — called only when match-pick returns
// `suggested_more: true` (i.e. fewer than 3 strong DB hits).
//
// v1 called the metered Google Places API (retired after the July
// 2026 uncapped-retry bill). v2 searches the local `places_index`
// table instead — 1,895 alt-culture venues for the four cities,
// extracted from the Overture Maps places theme (open data,
// CDLA-Permissive/Apache-2.0; June 2026 release). Zero external
// calls, zero keys, zero marginal cost.
//
// Strategy:
//   1. Derive candidate venue kinds from the prompt keywords.
//   2. Query `wa_search_places_index` (pg_trgm name/category
//      similarity + kind boost + Overture confidence nudge).
//   3. For each hit, check `venue_details.venue_key`:
//        - already known → high-confidence "known"
//        - new → surface flagged as "new venue suggestion"
//   4. Save each as a pick with `pending_review = true`,
//      `discovery_source = 'overture_index'`,
//      `discovery_query = original prompt`.
//   5. Return hits in match-pick-compatible shape so the frontend
//      renders them with the "pending review" badge.
//
// POST body:
//   { city: 'tallinn'|'helsinki'|'riga'|'vilnius', prompt: string, limit?: number }
//
// Response (matches match-pick shape):
//   { ok, hits: [{ pick, why }], classifier: 'discovery',
//     saved: number, cached: false, latency_ms }
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_CITIES = new Set(['tallinn', 'helsinki', 'riga', 'vilnius']);

// Prompt keywords → places_index kinds. First pass of the search: a hit on
// any keyword adds that kind to the RPC's boost list. Kept deliberately
// literal — the concierge's semantic layer already ran in match-pick.
const KIND_KEYWORDS: Array<[RegExp, string]> = [
  [/vinyl|record|lp\b|dj|crate/i,                'record store'],
  [/book|read|zine|literatur/i,                  'bookshop'],
  [/galler|art\b|exhibit|paint|photo/i,          'gallery'],
  [/club|techno|rave|dance|gig|concert|live music|venue/i, 'club'],
  [/thrift|vintage|second.?hand|flea|kirbu/i,    'thrift'],
  [/arts centre|art center|culture|cultural|studio/i, 'arts centre'],
  [/cinema|film|movie|screening/i,               'cinema'],
  [/community|diy|collective|workshop|maker/i,   'community'],
  [/theatre|theater|stage|perform|comedy|improv/i, 'theatre'],
];

interface IndexPlace {
  id:         string;
  city:       string;
  name:       string;
  kind:       string;
  category:   string;
  lat:        number | null;
  lng:        number | null;
  address:    string | null;
  locality:   string | null;
  website:    string | null;
  facebook:   string | null;
  instagram:  string | null;
  confidence: number | null;
  score:      number;
}

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

const kindsFromPrompt = (prompt: string): string[] => {
  const kinds = new Set<string>();
  for (const [re, kind] of KIND_KEYWORDS) if (re.test(prompt)) kinds.add(kind);
  return [...kinds];
};

async function searchPlacesIndex(prompt: string, city: string, limit: number): Promise<IndexPlace[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/wa_search_places_index`, {
      method:  'POST',
      headers: sbHeaders(),
      body:    JSON.stringify({
        p_city:  city,
        p_q:     prompt,
        p_kinds: kindsFromPrompt(prompt),
        p_limit: Math.min(limit + 3, 10),  // overfetch to allow known-venue merge
      }),
    });
    if (!res.ok) {
      console.error(`wa_search_places_index failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return [];
    }
    return await res.json() as IndexPlace[];
  } catch (e) {
    console.error('wa_search_places_index exception', e);
    return [];
  }
}

// Look up which of the hit names we already curate in venue_details.
// Returns a Map<venue_key, display_name>.
async function fetchKnownVenues(names: string[], city: string): Promise<Map<string, string>> {
  if (!names.length) return new Map();
  const keys = names.map(n => `"${n.toLowerCase().replace(/"/g, '')}"`).join(',');
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/venue_details?city=eq.${encodeURIComponent(city)}` +
    `&venue_key=in.(${keys})&select=venue_key,display_name`,
    { headers: sbHeaders() }
  );
  if (!r.ok) return new Map();
  const rows = await r.json() as Array<{ venue_key: string; display_name: string }>;
  return new Map(rows.map(r => [r.venue_key, r.display_name]));
}

// Persist the index row to venue_details so future picks of the same venue
// reuse lat/lng — idempotent via the (city, venue_key) unique index.
async function upsertVenueDetails(city: string, place: IndexPlace): Promise<void> {
  if (typeof place.lat !== 'number' || typeof place.lng !== 'number') return;
  const body = {
    city,
    venue_key:       place.name.toLowerCase(),
    display_name:    place.name,
    lat:             place.lat,
    lng:             place.lng,
    address:         place.address || null,
    website:         place.website || null,
    source:          'overture_index',
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

  // ---- 1. Search the local Overture index ----
  const places = await searchPlacesIndex(prompt, city, limit);
  if (!places.length) {
    return json({
      ok:         true,
      hits:       [],
      classifier: 'discovery',
      saved:      0,
      empty:      true,
      diagnostic: { places: 0, filtered: 0 },
      cached:     false,
      latency_ms: Date.now() - t0,
    });
  }

  const filtered = places.slice(0, limit);

  // ---- 2. Cross-reference with our curated venues ----
  const known = await fetchKnownVenues(filtered.map(p => p.name), city);

  // ---- 3. Upsert as pending picks ----
  const hits: Array<{ pick: Record<string, unknown>; why: string }> = [];
  let saved = 0;

  for (const place of filtered) {
    const knownAs = known.get(place.name.toLowerCase());
    const name    = knownAs || place.name;
    const slug    = slugify(name);
    const id      = `discovery-${slug}-${place.id.slice(-8)}`;

    const neighborhood = place.locality && place.locality.toLowerCase() !== city
      ? place.locality
      : 'other';

    // Persist the index data to venue_details for future reuse.
    await upsertVenueDetails(city, place);

    const picksRow = {
      id,
      city,
      title:             `${name} — pending review`,
      venue:             name,
      neighborhood,
      kind:              place.kind,
      day:               null,
      time:              null,
      quote:             `Surfaced from the places index for "${prompt}". Not yet vouched for by a curator.`,
      handle:            '@discovery',
      thumb_initials:    inferInitials(name),
      image_url:         null,
      image_attr:        null,
      tonight:           false,
      this_week:         false,
      mood_tags:         [],
      auto_generated:    true,
      source_message_id: null,
      pending_review:    true,
      discovery_source:  'overture_index',
      discovery_query:   prompt,
      valid_until:       new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),  // 30 days
      archived_at:       null,
      lat:               place.lat,
      lng:               place.lng,
      coords_source:     place.lat != null ? 'venue_join' : null,
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
          kind:         place.kind,
          quote:        picksRow.quote,
          handle:       '@discovery',
          day:          null,
          time:         null,
          moodTags:     [],
          thumbInitials: picksRow.thumb_initials,
          imageUrl:     null,
          imageAttr:    null,
          pin:          null,
          lat:          place.lat,
          lng:          place.lng,
          tonight:      false,
          thisWeek:     false,
          pending:      true,
          discoverySource: 'overture_index',
          rating:       null,
          ratingCount:  null,
          knownVenue:   !!knownAs,
          website:      place.website,
          mapsUrl:      `https://maps.google.com/?q=${encodeURIComponent(`${name}, ${city}`)}`,
        },
        why: knownAs
          ? `A venue we already cover, surfaced again by index search — open for review.`
          : `Surfaced from the open places index and not yet curated. Worth a closer look before publishing.`,
      });
    } else {
      console.error(`discovery upsert ${id} failed: ${upsertRes.status} ${(await upsertRes.text()).slice(0, 120)}`);
    }
  }

  // ---- 4. Log the run ----
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
    diagnostic: { places: places.length, filtered: filtered.length },
    cached:     false,
    latency_ms: Date.now() - t0,
  });
});
