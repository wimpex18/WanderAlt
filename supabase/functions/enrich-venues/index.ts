import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ---------------------------------------------------------------------------
// enrich-venues v7
// Enriches venue_details rows from Wikidata + Nominatim.
// Mirrors found images into venue_images AND propagates to picks.image_url.
// Sets is_closed=true and archives picks when Wikidata P576 is present.
//
// Image sources tried in order per venue:
//   1. Wikidata P18 → Wikimedia Commons thumbnail (?width=800)
//   2. Google Places API photo (requires GOOGLE_PLACES_API_KEY env var)
//   3. Venue website og:image (scraped from Wikidata P856 website URL)
//
// POST body: { city: string, limit?: number, venue_key?: string }
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CITY_QID: Record<string, string> = {
  tallinn: 'Q1770',
  riga:    'Q1773',
  vilnius: 'Q1249',
  helsinki:'Q1757',
};

const CITY_COORDS: Record<string, [number, number]> = {
  tallinn: [59.4370, 24.7536],
  riga:    [56.9460, 24.1059],
  vilnius: [54.6872, 25.2797],
  helsinki:[60.1699, 24.9384],
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Supabase REST helpers
// ---------------------------------------------------------------------------
const headers = (extra: Record<string, string> = {}) => ({
  apikey:        SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type':'application/json',
  ...extra,
});

async function dbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  return r.json();
}

async function dbUpsert(table: string, row: Record<string, unknown>, onConflict: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: `resolution=merge-duplicates,return=minimal` }),
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const msg = await r.text();
    console.error(`upsert ${table} failed: ${msg}`);
  }
  return r;
}

// Propagate image URL to any picks at this venue that still have image_url = null
async function updatePicksImageUrl(city: string, venueName: string, imageUrl: string): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/picks?city=eq.${encodeURIComponent(city)}` +
    `&venue=ilike.${encodeURIComponent(venueName)}&image_url=is.null`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ image_url: imageUrl }),
    }
  );
}

// ---------------------------------------------------------------------------
// Wikidata helpers
// ---------------------------------------------------------------------------

async function wdSearch(label: string): Promise<string | null> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities` +
    `&search=${encodeURIComponent(label)}&language=en&type=item&limit=5&format=json`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'WanderAlt/1.0 (enrichment bot)' } });
    const j = await r.json();
    return j.search?.[0]?.id ?? null;
  } catch { return null; }
}

async function wdVerifyCity(qid: string, cityQid: string): Promise<boolean> {
  const sparql = `ASK { wd:${qid} wdt:P131+ wd:${cityQid} }`;
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'WanderAlt/1.0', Accept: 'application/json' } });
    const j = await r.json();
    return j.boolean === true;
  } catch { return false; }
}

interface WdClaims {
  website:    string | null;
  imageFile:  string | null;
  lat:        number | null;
  lng:        number | null;
  shortDesc:  string | null;
  isClosed:   boolean;
}

async function wdGetClaims(qid: string): Promise<WdClaims> {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities` +
    `&ids=${qid}&props=claims|descriptions&languages=en&format=json`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'WanderAlt/1.0' } });
    const j = await r.json();
    const entity = j.entities?.[qid];
    if (!entity || entity.missing) return { website: null, imageFile: null, lat: null, lng: null, shortDesc: null, isClosed: false };

    const claims    = entity.claims ?? {};
    const website   = claims.P856?.[0]?.mainsnak?.datavalue?.value ?? null;
    const imgFile   = claims.P18?.[0]?.mainsnak?.datavalue?.value ?? null;
    const coord     = claims.P625?.[0]?.mainsnak?.datavalue?.value ?? null;
    const shortDesc = entity.descriptions?.en?.value ?? null;
    const isClosed  = !!(claims.P576?.[0]?.mainsnak?.datavalue);

    return {
      website:   typeof website === 'string' ? website.trim() : null,
      imageFile: typeof imgFile === 'string' ? imgFile.trim() : null,
      lat:       coord ? coord.latitude  : null,
      lng:       coord ? coord.longitude : null,
      shortDesc: shortDesc ?? null,
      isClosed,
    };
  } catch { return { website: null, imageFile: null, lat: null, lng: null, shortDesc: null, isClosed: false }; }
}

// Wikimedia Commons thumbnail — sized via ?width= parameter on Special:FilePath
function wikimediaThumbUrl(filename: string, width = 800): string {
  const clean = filename.replace(/ /g, '_');
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}?width=${width}`;
}

// ---------------------------------------------------------------------------
// Nominatim fallback
// ---------------------------------------------------------------------------
async function nominatimLookup(venueName: string, city: string): Promise<{ address: string | null; lat: number | null; lng: number | null }> {
  const q = `${venueName}, ${city}`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'WanderAlt/1.0' } });
    const j = await r.json();
    if (!j.length) return { address: null, lat: null, lng: null };
    const hit = j[0];
    const parts = [hit.address?.road, hit.address?.house_number].filter(Boolean);
    const address = parts.length ? parts.join(' ') : hit.display_name?.split(',')[0] ?? null;
    return { address, lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
  } catch { return { address: null, lat: null, lng: null }; }
}

// ---------------------------------------------------------------------------
// Image source 2: Google Places API
// Returns the final CDN URL after following the photo redirect.
// Only runs when GOOGLE_PLACES_API_KEY is set.
// ---------------------------------------------------------------------------
async function fetchGooglePlacePhoto(name: string, lat: number, lng: number): Promise<string | null> {
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) return null;
  try {
    const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(name)}&inputtype=textquery` +
      `&locationbias=circle:5000@${lat},${lng}` +
      `&fields=photos&key=${key}`;
    const findData = await (await fetch(findUrl)).json();
    const ref = findData.candidates?.[0]?.photos?.[0]?.photo_reference;
    if (!ref) return null;

    // Follow redirect to get the stable CDN URL (lh3.googleusercontent.com/places/...)
    const photoRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${key}`,
      { redirect: 'follow' }
    );
    return photoRes.ok ? photoRes.url : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Image source 3: venue website og:image
// Fetches the venue's own website and extracts the og:image meta tag.
// ---------------------------------------------------------------------------
async function fetchOgImage(websiteUrl: string): Promise<string | null> {
  try {
    const r = await fetch(websiteUrl, {
      headers: { 'User-Agent': 'WanderAlt/1.0 (enrichment bot)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const html = await r.text();

    // Match both attribute orderings
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!m?.[1]) return null;

    const raw = m[1].trim();
    // Resolve relative URLs
    if (raw.startsWith('http')) return raw;
    try {
      return new URL(raw, websiteUrl).href;
    } catch { return null; }
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });

  let body: { city?: string; limit?: number; venue_key?: string } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const city      = (body.city ?? 'tallinn').toLowerCase();
  const cityQid   = CITY_QID[city];
  const limitN    = Math.min(body.limit ?? 30, 100);
  const targetKey = body.venue_key ? body.venue_key.toLowerCase() : null;

  if (!cityQid) {
    return new Response(JSON.stringify({ error: `Unknown city: ${city}` }), { status: 400 });
  }

  let venues: Array<{ name: string; key: string }>;

  if (targetKey) {
    const rows = await dbGet(`picks?city=eq.${encodeURIComponent(city)}&venue=ilike.${encodeURIComponent(targetKey.replace(/ /g, '*'))}&select=venue&limit=5`);
    const name = Array.isArray(rows) && rows.length ? rows[0].venue : targetKey;
    venues = [{ name, key: targetKey }];
  } else {
    const picksRows = await dbGet(
      `picks?city=eq.${encodeURIComponent(city)}&archived_at=is.null&select=venue&order=venue.asc`
    );
    if (!Array.isArray(picksRows)) {
      return new Response(JSON.stringify({ error: 'Failed to load picks' }), { status: 500 });
    }
    const seen = new Set<string>();
    const all: Array<{ name: string; key: string }> = [];
    for (const row of picksRows) {
      if (!row.venue) continue;
      const k = row.venue.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      all.push({ name: row.venue, key: k });
    }
    const lockedRows = await dbGet(`venue_details?city=eq.${encodeURIComponent(city)}&manual_lock=eq.true&select=venue_key`);
    const locked = new Set(Array.isArray(lockedRows) ? lockedRows.map((r: { venue_key: string }) => r.venue_key) : []);
    venues = all.filter(v => !locked.has(v.key)).slice(0, limitN);
  }

  const [cityLat, cityLng] = CITY_COORDS[city] ?? [0, 0];
  const results: Array<{ venue_key: string; status: string; closed?: boolean; wikidata_id?: string; source?: string; image_source?: string }> = [];

  for (const venue of venues) {
    await sleep(300);
    const { name, key } = venue;
    let wikidataId: string | null = null;
    let claims: WdClaims = { website: null, imageFile: null, lat: null, lng: null, shortDesc: null, isClosed: false };
    let source = 'nominatim';

    const qid = await wdSearch(name);
    if (qid) {
      await sleep(200);
      const inCity = await wdVerifyCity(qid, cityQid);
      if (inCity) {
        await sleep(200);
        claims = await wdGetClaims(qid);
        wikidataId = qid;
        source = 'wikidata';
      }
    }

    let address: string | null = null;
    let lat = claims.lat;
    let lng = claims.lng;

    if (!lat || !lng) {
      await sleep(200);
      const nom = await nominatimLookup(name, city);
      if (nom.lat) { lat = nom.lat; lng = nom.lng; }
      address = nom.address;
      if (source !== 'wikidata') source = 'nominatim';
    }

    const row: Record<string, unknown> = {
      city,
      venue_key:    key,
      display_name: name,
      source,
      enriched_at:  new Date().toISOString(),
    };
    if (wikidataId)       row.wikidata_id  = wikidataId;
    if (claims.website)   row.website      = claims.website;
    if (claims.shortDesc) row.short_desc   = claims.shortDesc;
    if (lat)              row.lat          = lat;
    if (lng)              row.lng          = lng;
    if (address)          row.address      = address;
    if (claims.isClosed)  row.is_closed    = true;

    await dbUpsert('venue_details', row, 'city,venue_key');

    if (claims.isClosed) {
      const archiveRes = await fetch(
        `${SUPABASE_URL}/rest/v1/picks?city=eq.${encodeURIComponent(city)}&archived_at=is.null&venue=eq.${encodeURIComponent(name)}`,
        {
          method: 'PATCH',
          headers: headers({ Prefer: 'return=minimal' }),
          body: JSON.stringify({ archived_at: new Date().toISOString() }),
        }
      );
      if (archiveRes.ok) console.log(`archived picks for permanently closed venue: ${key}`);
    }

    // ── Image enrichment ────────────────────────────────────────────
    // Check whether this venue already has an image in venue_images.
    const existingImg = await dbGet(
      `venue_images?city=eq.${encodeURIComponent(city)}&venue_key=eq.${encodeURIComponent(key)}&select=image_url&limit=1`
    );
    let imageUrl: string | null = Array.isArray(existingImg) && existingImg.length
      ? existingImg[0].image_url
      : null;
    let imageSource = imageUrl ? 'existing' : null;

    if (!imageUrl) {
      // Source 1: Wikidata P18 → Wikimedia Commons thumbnail
      if (claims.imageFile) {
        imageUrl = wikimediaThumbUrl(claims.imageFile);
        await dbUpsert('venue_images', {
          city, venue_key: key, image_url: imageUrl, source: 'wikidata',
        }, 'city,venue_key');
        imageSource = 'wikidata';
        await sleep(100);
      }

      // Source 2: Google Places API (only if GOOGLE_PLACES_API_KEY is set)
      if (!imageUrl) {
        const placePhoto = await fetchGooglePlacePhoto(name, cityLat, cityLng);
        if (placePhoto) {
          imageUrl = placePhoto;
          await dbUpsert('venue_images', {
            city, venue_key: key, image_url: imageUrl, source: 'google_places',
          }, 'city,venue_key');
          imageSource = 'google_places';
          await sleep(200);
        }
      }

      // Source 3: Venue website og:image (scraped from Wikidata P856)
      if (!imageUrl && claims.website) {
        const ogImg = await fetchOgImage(claims.website);
        if (ogImg) {
          imageUrl = ogImg;
          await dbUpsert('venue_images', {
            city, venue_key: key, image_url: imageUrl, source: 'og_image',
          }, 'city,venue_key');
          imageSource = 'og_image';
        }
      }
    }

    // Propagate to picks.image_url for any pick at this venue still missing one
    if (imageUrl) {
      await updatePicksImageUrl(city, name, imageUrl);
    }

    results.push({
      venue_key:    key,
      status:       'ok',
      closed:       claims.isClosed || undefined,
      wikidata_id:  wikidataId ?? undefined,
      source,
      image_source: imageSource ?? undefined,
    });
    console.log(`enriched: ${key} — source=${source} wikidata=${wikidataId ?? 'none'} closed=${claims.isClosed} image=${imageSource ?? 'none'}`);
  }

  return new Response(JSON.stringify({
    city,
    processed: results.length,
    results,
  }), { headers: { 'Content-Type': 'application/json' } });
});
