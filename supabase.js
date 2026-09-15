/* ============================================================
   WanderAlt — Supabase data loader
   ------------------------------------------------------------
   Fetches picks, venues and venue details from the Supabase REST API,
   converts them to the window.WA.catalog shape,
   then dispatches 'wa:catalog-ready' so page scripts can render.

   On network failure or timeout (2 s) the lists stay empty and the
   event is still dispatched, so pages render their empty states.

   Load order in every HTML file:
     city.js → supabase.js → bookmark.js → [page script]
                                            (all defer)

   The anon key is intentionally public; RLS allows only SELECT.
   ============================================================ */
(() => {
  const BASE = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
  const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA';
  /* city.js runs first (document order) and sets window.WA.CITY. */
  const CITY = (window.WA && window.WA.CITY) || 'tallinn';

  /* Expose for auth.js and bookmark.js to use. */
  window.WA          = window.WA || {};
  window.WA.BASE_URL = BASE;
  window.WA.ANON_KEY = KEY;
  window.WA._catalogAll = window.WA.catalog = [];
  window.WA._venuesAll  = window.WA.venues  = [];

  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  /* GET /rest/v1/{table}?{qs} → parsed JSON or throws */
  const get = (table, qs, signal) =>
    fetch(`${BASE}/rest/v1/${table}?${qs}`, { headers, ...(signal ? { signal } : {}) })
      .then(r => {
        if (!r.ok) throw new Error(`${table} ${r.status}`);
        return r.json();
      });

  /* Same as get(), but walks PostgREST's 1000-row ceiling with
     offset/limit until a short page comes back. The 2000-row loop cap is
     a runaway guard and logs when it trips. */
  const PAGE = 1000;
  const getAllPages = async (table, qs, signal) => {
    const out = [];
    for (let offset = 0; offset < 20000; offset += PAGE) {
      const page = await get(table, `${qs}&offset=${offset}&limit=${PAGE}`, signal);
      if (!Array.isArray(page)) break;
      out.push(...page);
      if (page.length < PAGE) return out;
    }
    console.warn(`[WanderAlt] ${table} paging hit the loop guard — result may be short.`);
    return out;
  };

  /* Route Wikimedia thumbnails through the Pages Function at
     functions/img/wm (/img/wm/*) so Wikipedia sets no third-party cookie. No-op on
     localhost, where the Worker is not wired. */
  const proxifyImage = (url) => {
    if (!url || typeof url !== 'string') return url;
    if (!/wikimedia\.org|wikipedia\.org/i.test(url))    return url;
    if (location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1' ||
        location.hostname === '')                       return url;
    return '/img/wm/' + encodeURIComponent(url);
  };

  /* Editorial filter for the public catalog.
     WanderAlt is alternative culture + events, not a restaurant guide.
     Hide rows whose kind is a place to eat or hang out (bar, cafe,
     restaurant, food, eatery, place) with no day attached: a place, not
     an event. Events at these venues keep `day` so they pass through.
     admin.js fetches `picks` directly and bypasses this filter. */
  const FOOD_PLACE_KINDS = new Set([
    'bar', 'cafe', 'restaurant', 'food', 'eatery', 'place'
  ]);
  const isPublicPick = (r) => !(FOOD_PLACE_KINDS.has(r.kind) && !r.day);

  /* Convert a Postgres picks row → catalog entry shape */
  const toPick = (r) => ({
    id:            r.id,
    city:          r.city,
    title:         r.title,
    venue:         r.venue,
    venueId:       r.venue_id || null,
    neighborhood:  r.neighborhood,
    kind:          r.kind,
    day:           r.day,
    time:          r.time,
    quote:         r.quote,
    handle:        r.handle,
    imageUrl:      proxifyImage(r.image_url) || null,
    imageAttr:     r.image_attr    || null,
    tonight:       r.tonight,
    thisWeek:      r.this_week,
    lat:       r.lat       ?? null,
    lng:       r.lng       ?? null,
    address:   r.address   ?? null,
    coordsSource: r.coords_source ?? null,
    coordsLocked: !!r.coords_locked,
    permalink: r.source_url || null,   /* the listing's own event or ticket page */
    /* Source-authored facts. description is the venue's own blurb. */
    description: r.description || null,
    startsAt:    r.starts_at   || null,
    endsAt:      r.ends_at     || null,
    ticketUrl:   r.ticket_url  || null,
    isFree:      typeof r.is_free === 'boolean' ? r.is_free : null,
    priceMin:    r.price_min   ?? null,
    priceMax:    r.price_max   ?? null,
    currency:    r.currency    || null,
    links:       r.links       || null,
    entities:    r.entities    || null,
    /* Provenance freshness: the detail page prints "read N ago". */
    lastSeenAt: r.last_seen_at || null,
    createdAt:  r.created_at   || null,
    /* isClosed is hydrated below by joining against venue_details. */
    isClosed:  false,
  });

  /* ── Venues (Places) ──────────────────────────────────────────
     Places surfaces only the underground-leaning kinds. Generic bars,
     museums, theatres and libraries are intentionally excluded (they
     still surface as event venues on picks). Exposed as WA.VENUE_KINDS. */
  const VENUE_KINDS = new Set([
    'record store', 'bookshop', 'gallery', 'club',
    'thrift', 'arts centre', 'cinema', 'community',
  ]);
  window.WA.VENUE_KINDS = [...VENUE_KINDS];

  /* The venue behind a pick: picks.venue_id when it is set, otherwise the
     same city and case-insensitive name. */
  const nameKey = (city, name) => `${String(city || '').toLowerCase()}|${String(name || '').toLowerCase().trim()}`;
  window.WA.venueFor = (pick) => {
    if (!pick) return null;
    const venues = window.WA._venuesAll || [];
    if (pick.venueId) {
      const byId = venues.find(v => v.id === pick.venueId);
      if (byId) return byId;
    }
    if (!pick.venue) return null;
    const k = nameKey(pick.city, pick.venue);
    return venues.find(v => nameKey(v.city, v.name) === k) || null;
  };

  const toVenue = (r) => ({
    id:           r.id,
    city:         r.city,
    name:         r.name,
    neighborhood: r.neighborhood || '',
    kind:         r.kind,
    lat:          r.lat ?? null,
    lng:          r.lng ?? null,
    imageUrl:     proxifyImage(r.image_url) || null,
    imageAttr:    r.image_attr || null,
    /* Which mechanism wrote the picture. `logo` means the venue's own mark
       rather than a photograph (small, so surfaces must not stretch it). */
    imageSource:  r.image_source || null,
    website:      r.website || null,
    facebook:     r.facebook || null,
    instagram:    r.instagram || null,
    /* opening_hours in OSM syntax. WA.Hours parses it; a null must render as
       "hours not filed", never as "closed". */
    openingHours: r.opening_hours || null,
  });

  const dispatch = () =>
    document.dispatchEvent(new CustomEvent('wa:catalog-ready'));

  const load = async () => {
    /* 2-second timeout so a slow network renders the empty states */
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 2000);

    /* Fetch ALL active picks across every city. The all-cities catalogue
       is exposed as WA._catalogAll so cross-city links resolve; the
       city-filtered slice is WA.catalog. */
    const [picksResult, vdResult, venuesResult] = await Promise.allSettled([
      get(
        `picks`,
        `archived_at=is.null` +
        `&select=id,city,title,venue,venue_id,neighborhood,kind,day,time,quote,handle,` +
                `image_url,image_attr,tonight,this_week,` +
                `lat,lng,address,coords_source,coords_locked,` +
                /* Facts the sources stated about themselves. */
                `description,starts_at,ends_at,ticket_url,is_free,price_min,price_max,currency,links,entities,` +
                /* Provenance freshness for the detail page's "read N ago". */
                `last_seen_at,created_at` +
        `&order=sort_order.asc,created_at.asc`,
        abort.signal
      ),
      /* short_desc is the venue blurb the source page prints when present. */
      get(
        `venue_details`,
        `select=venue_key,is_closed,business_status,short_desc`,
        abort.signal
      ),
      /* Places: active alt-culture venues with coordinates. The kind
         whitelist is applied server-side (from VENUE_KINDS) and the request
         is paged, because PostgREST caps a response at 1000 rows. */
      getAllPages(
        `venues`,
        `status=eq.active` +
        `&kind=in.(${[...VENUE_KINDS].map(k => `"${k}"`).join(',')})` +
        `&select=id,city,name,neighborhood,kind,lat,lng,image_url,image_attr,image_source,website,facebook,instagram,opening_hours` +
        `&order=name.asc`,
        abort.signal
      ),
    ]);

    clearTimeout(timer);

    /* Build a closure map keyed on lower(venue_key) for the merge below,
       and the venue blurbs the source page prints when it has one. */
    const closedSet = new Set();
    const blurbs = new Map();
    if (vdResult.status === 'fulfilled' && Array.isArray(vdResult.value)) {
      for (const v of vdResult.value) {
        const key = v.venue_key ? String(v.venue_key).toLowerCase().trim() : '';
        if (v.is_closed || v.business_status === 'CLOSED_PERMANENTLY' || v.business_status === 'CLOSED_TEMPORARILY') {
          if (key) closedSet.add(key);
        }
        if (key && v.short_desc) blurbs.set(key, v.short_desc);
      }
    }
    window.WA = window.WA || {};
    window.WA.venueBlurb = (name) => blurbs.get(String(name || '').toLowerCase().trim()) || '';

    window.WA = window.WA || {};

    if (picksResult.status === 'fulfilled') {
      const all = picksResult.value.filter(isPublicPick).map(r => {
        const p = toPick(r);
        if (r.venue && closedSet.has(String(r.venue).toLowerCase().trim())) {
          p.isClosed = true;
        }
        return p;
      });
      /* All-cities snapshot for cross-city lookups (e.g. a saved pick from
         another city). Listing pages use the city-filtered slice. */
      if (window.WA.when) window.WA.when.stampAll(all);
      window.WA._catalogAll = all;
      window.WA.catalog     = all.filter(e => e.city === CITY);
      /* Saved's change-watch gates its destructive "no longer listed"
         detection on this: without live data every bookmark looks "gone". */
      window.WA.DATA_LIVE = true;
    } else {
      console.warn('[WanderAlt] picks fetch failed.', picksResult.reason?.message);
      window.WA.DATA_LIVE = false;
    }

  /* ── An event with no photo borrows its venue's ──────────────
     Only ever downward, from the place to the event held there, and the
     attribution travels relabelled so the reader knows it shows the
     venue, not the night. Runs once here so every surface agrees. */
  const borrowVenuePhotos = () => {
    const picks  = window.WA._catalogAll || [];
    const venues = window.WA._venuesAll  || [];
    if (!picks.length || !venues.length) return;

    let borrowed = 0;
    for (const p of picks) {
      if (p.imageUrl) continue;
      const v = window.WA.venueFor(p);
      if (!v || !v.imageUrl) continue;
      p.imageUrl   = v.imageUrl;
      p.imageAttr  = v.imageAttr ? `${v.imageAttr} — the venue, not the event` : 'The venue, not the event';
      p.imageIsVenue = true;
      borrowed++;
    }
    if (borrowed) console.info(`[WanderAlt] ${borrowed} picks borrowed their venue's photo.`);
  };

    if (venuesResult.status === 'fulfilled' && Array.isArray(venuesResult.value)) {
      const allVenues = venuesResult.value
        .filter(r => VENUE_KINDS.has(r.kind))
        .map(toVenue);
      window.WA._venuesAll = allVenues;
      window.WA.venues     = allVenues.filter(v => v.city === CITY);
    } else {
      console.warn('[WanderAlt] venues fetch failed.', venuesResult.reason?.message);
    }

    borrowVenuePhotos();
    dispatch();
  };

  /* ── Look one row up by id, when the loaded set does not have it ──
     The loaded set is narrower than the database: picks exclude archived
     rows and venues are filtered to VENUE_KINDS. Ask the database before
     saying a row is gone.

     Returns { kind: 'event' | 'place', e, archivedAt } or null when the
     row genuinely does not exist. */
  const byId = async (id) => {
    if (!id) return null;
    const q = `id=eq.${encodeURIComponent(id)}&limit=1`;
    try {
      const picks = await get('picks', `${q}&select=*`);
      if (picks && picks[0]) {
        return { kind: 'event', e: toPick(picks[0]), archivedAt: picks[0].archived_at || null };
      }
    } catch (_) { /* fall through to venues */ }
    try {
      const venues = await get(
        'venues',
        `${q}&select=id,city,name,neighborhood,kind,lat,lng,image_url,image_attr,image_source,website,facebook,instagram,opening_hours`
      );
      if (venues && venues[0]) return { kind: 'place', e: toVenue(venues[0]), archivedAt: null };
    } catch (_) { /* nothing more to try */ }
    return null;
  };

  window.WA.byId = byId;

  load();
})();
