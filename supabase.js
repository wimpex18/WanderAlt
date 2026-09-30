/* ============================================================
   WanderAlt — Supabase data loader
   ------------------------------------------------------------
   Fetches picks and venues (read-only views over the pipeline's events
   and places) from the Supabase REST API,
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

  window.WA          = window.WA || {};
  window.WA.BASE_URL = BASE;
  window.WA.ANON_KEY = KEY;
  window.WA._catalogAll = window.WA.catalog = [];
  window.WA._venuesAll  = window.WA.venues  = [];
  let redirects = new Map();
  window.WA.canonicalId = (id) => redirects.get(id) || id;

  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  let catalogueCached = false;

  const get = (table, qs, signal, lookup = false) =>
    fetch(`${BASE}/rest/v1/${table}?${qs}`, { headers, ...(signal ? { signal } : {}) })
      .then(r => {
        if (!r.ok) throw new Error(`${table} ${r.status}`);
        const cached = !!r.headers?.get('x-wa-cached-at');
        if (cached) catalogueCached = true;
        return r.json().then(rows => {
          if (lookup && cached && !rows.length) throw new Error('Cached lookup cannot confirm a missing listing');
          return rows;
        });
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
      if (page.length < PAGE) return [...new Map(out.map(r => [r.id, r])).values()];
    }
    console.warn(`[WanderAlt] ${table} paging hit the loop guard — result may be short.`);
    return [...new Map(out.map(r => [r.id, r])).values()];
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
     an event. Events at these venues keep `day` so they pass through. */
  const FOOD_PLACE_KINDS = new Set([
    'bar', 'cafe', 'restaurant', 'food', 'eatery', 'place'
  ]);
  const isPublicPick = (r) => !(FOOD_PLACE_KINDS.has(r.kind) && !r.day);

  /* A venue or area printed in Cyrillic is a source's phrase, not a place's
     name (the pipeline retires those places); it is left out, not shown. */
  const CYRILLIC = /[\u0400-\u04ff]/;
  const toPick = (r) => ({
    id:            r.id,
    city:          r.city,
    title:         r.title,
    venue:         CYRILLIC.test(r.venue || '') ? null : r.venue,
    venueId:       CYRILLIC.test(r.venue || '') ? null : (r.venue_id || null),
    neighborhood:  CYRILLIC.test(r.neighborhood || '') ? null : r.neighborhood,
    kind:          r.kind,
    day:           r.day,
    time:          r.time,
    quote:         r.quote,
    handle:        r.handle,
    imageUrl:      proxifyImage(r.image_url) || null,
    imageAttr:     r.image_attr    || null,
    /* The venue's own logo or photo, for a listing without artwork. */
    venueImageUrl:    proxifyImage(r.venue_image_url) || null,
    venueImageAttr:   r.venue_image_attr || null,
    venueImageSource: r.venue_image_source || null,
    tonight:       r.tonight,
    thisWeek:      r.this_week,
    lat:       r.lat       ?? null,
    lng:       r.lng       ?? null,
    address:   r.address   ?? null,
    permalink: r.source_url || null,   /* the listing's own event or ticket page */
    /* Source-authored facts. description is the venue's own blurb. */
    /* Lists and direct lookups carry a teaser. Originals load on disclosure. */
    description: r.description || r.teaser || null,
    descriptionFull: r.description != null,
    originalTitle: r.original_title || null,
    originalLanguage: r.original_language || null,
    titleLanguage: r.title_language || null,
    originalUrl: r.original_url || null,
    eventLanguages: Array.isArray(r.event_languages) ? r.event_languages : [],
    flag:        r.flag || null,   /* cancelled, postponed, sold_out, few_left: what the source says */
    tags:        Array.isArray(r.tags) ? r.tags : [],
    startsAt:    r.starts_at   || null,
    endsAt:      r.ends_at     || null,
    ticketUrl:   r.ticket_url  || null,
    isFree:      typeof r.is_free === 'boolean' ? r.is_free : null,
    priceMin:    r.price_min   ?? null,
    priceMax:    r.price_max   ?? null,
    currency:    r.currency    || null,
    links:       r.links       || null,
    entities:    r.entities    || null,
    lastSeenAt: r.last_seen_at || null,
    createdAt:  r.created_at   || null,
    isClosed:  false,
  });

  /* ── Venues (Places) ──────────────────────────────────────────
     Places surfaces the kinds a reader walks into for culture: the
     OpenStreetMap catalogue's record shops, bookshops, galleries, thrift
     shops, arts centres, cinemas, clubs, community centres and theatres,
     plus the bars that host listed events. Museums, libraries and the like
     still surface as event venues on picks. Exposed as WA.VENUE_KINDS. */
  const VENUE_KINDS = new Set([
    'record store', 'bookshop', 'gallery', 'club', 'thrift',
    'arts centre', 'cinema', 'community', 'theatre', 'bar',
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
    address:      r.address || null,
    description:  r.description || null,
    website:      r.website || null,
    facebook:     r.facebook || null,
    instagram:    r.instagram || null,
    osmId:        r.osm_id || null,
    /* opening_hours in OSM syntax. WA.Hours parses it; a null must render as
       "hours not filed", never as "closed". */
    openingHours: r.opening_hours || null,
    isClosed:     r.status === 'closed',
    isVerified:   r.status === 'active',
  });

  /* A fast answer (the service worker's cache) can land between two
     deferred scripts, before a page script has added its listener. Hold
     the event until every deferred script has run. */
  let parsed = document.readyState === 'complete';
  if (!parsed) document.addEventListener('DOMContentLoaded', () => { parsed = true; }, { once: true });
  const dispatch = () => {
    const fire = () => document.dispatchEvent(new CustomEvent('wa:catalog-ready'));
    if (parsed) fire(); else document.addEventListener('DOMContentLoaded', fire, { once: true });
  };

  /* The last answer is kept in this browser and drawn at once, so a
     returning visit shows real listings before the network replies. The
     network answer replaces it when it differs. The pipeline runs every
     six hours, so a snapshot last confirmed longer ago than that is not
     trusted. The rows live under SNAP_KEY with a fingerprint of their
     text; the time of the last confirmation is its own small key, so an
     unchanged answer costs one tiny write, not a rewrite of the rows. */
  const SNAP_KEY = 'wa:catalogue:v2';
  const SNAP_AT_KEY = 'wa:catalogue:at';
  const SNAP_MAX_AGE = 6 * 3600 * 1000;
  const fingerprint = (text) => {
    let h = 0x811c9dc5;                               /* FNV-1a, 32 bit */
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return `${text.length}:${(h >>> 0).toString(36)}`;
  };
  const readSnapshot = () => {
    try {
      const s = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null');
      /* A stamp ahead of the clock (a wrong or corrected clock) is not fresh. */
      const age = Date.now() - Number(localStorage.getItem(SNAP_AT_KEY));
      if (s && age >= 0 && age < SNAP_MAX_AGE && s.sig && Array.isArray(s.picks) && Array.isArray(s.venues)) return s;
    } catch (_) { /* unreadable: fetch as usual */ }
    return null;
  };
  const writeSnapshot = (body, sig) => {
    try {
      if (body) localStorage.setItem(SNAP_KEY, `{"sig":"${sig}",${body.slice(1)}`);
      localStorage.setItem(SNAP_AT_KEY, String(Date.now()));
    } catch (_) {
      try { localStorage.removeItem(SNAP_KEY); localStorage.removeItem(SNAP_AT_KEY); } catch (__) { /* storage is off */ }
    }
  };
  try { localStorage.removeItem('wa:catalogue:v1'); } catch (_) { /* storage is off */ }

  /* Turn rows into the catalogue the pages read. */
  const apply = (picks, venues, redirectRows) => {
    if (redirectRows) redirects = new Map(redirectRows.map(r => [r.id, r.canonical_id]));
    /* No venue blurbs yet: places carry no description of their own. */
    window.WA.venueBlurb = () => '';
    if (picks) {
      const all = picks.filter(isPublicPick).map(toPick);
      /* All-cities snapshot for cross-city lookups (e.g. a saved pick from
         another city). Listing pages use the city-filtered slice. */
      if (window.WA.when) window.WA.when.stampAll(all);
      window.WA._catalogAll = all;
      window.WA.catalog     = all.filter(e => e.city === CITY);
    }
    if (venues) {
      const allVenues = venues.filter(r => VENUE_KINDS.has(r.kind) && !CYRILLIC.test(r.name || '')).map(toVenue);
      window.WA._venuesAll = allVenues;
      window.WA.venues     = allVenues.filter(v => v.city === CITY);
    }
  };

  const load = async () => {
    const snap = readSnapshot();
    if (snap) {
      apply(snap.picks, snap.venues, snap.redirects);
      /* Not live yet: Saved must not call anything "no longer listed" on
         the strength of a snapshot. */
      window.WA.DATA_LIVE = false;
      dispatch();
    }

    /* 6-second timeout, then the empty states: long enough for a slow
       phone connection to fetch the list (about 150 KB for a few hundred
       events with teasers), short enough not to hang. */
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 6000);

    /* Fetch ALL active picks across every city. The all-cities catalogue
       is exposed as WA._catalogAll so cross-city links resolve; the
       city-filtered slice is WA.catalog. */
    const [picksResult, venuesResult, redirectsResult] = await Promise.allSettled([
      /* Paged like venues: PostgREST returns at most 1000 rows a request,
         and a busy month can list more upcoming events than that. */
      getAllPages(
        `picks`,
        `archived_at=is.null` +
        `&select=id,city,title,venue,venue_id,neighborhood,kind,day,time,quote,handle,` +
                `image_url,image_attr,venue_image_url,venue_image_attr,venue_image_source,tonight,this_week,` +
                `lat,lng,address,source_url,` +
                /* Lists read a 300-character teaser; originalDescription
                   fetches the bounded original only when opened. */
                `teaser,original_title,original_language,title_language,event_languages,tags,flag,starts_at,ends_at,ticket_url,is_free,price_min,price_max,currency,links,entities,` +
                /* Provenance freshness for the detail page's "read N ago". */
                `last_seen_at,created_at` +
        `&order=starts_at.asc,id.asc`,
        abort.signal
      ),
      /* Places: active alt-culture venues with coordinates. The kind
         whitelist is applied server-side (from VENUE_KINDS) and the request
         is paged, because PostgREST caps a response at 1000 rows. */
      getAllPages(
        `venues`,
        `status=eq.active` +
        `&kind=in.(${[...VENUE_KINDS].map(k => `"${k}"`).join(',')})` +
        `&select=id,city,name,neighborhood,kind,lat,lng,image_url,image_attr,image_source,address,description,website,facebook,instagram,opening_hours,osm_id,status` +
        `&order=name.asc,id.asc`,
        abort.signal
      ),
      getAllPages('catalogue_redirects', 'select=id,canonical_id&order=id.asc', abort.signal),
    ]);

    clearTimeout(timer);
    const picksOk  = picksResult.status === 'fulfilled';
    const venuesOk = venuesResult.status === 'fulfilled' && Array.isArray(venuesResult.value);
    const redirOk  = redirectsResult.status === 'fulfilled';

    if (!picksOk) console.warn('[WanderAlt] picks fetch failed.', picksResult.reason?.message);
    if (!venuesOk) console.warn('[WanderAlt] venues fetch failed.', venuesResult.reason?.message);

    /* Compare with what the snapshot already drew; identical means no
       second render. */
    const body = JSON.stringify({
      picks:  picksOk ? picksResult.value : snap && snap.picks,
      venues: venuesOk ? venuesResult.value : snap && snap.venues,
      redirects: redirOk ? redirectsResult.value : snap && snap.redirects,
    });
    const sig = fingerprint(body);
    const same = !!snap && sig === snap.sig;

    /* Saved's change-watch gates its destructive "no longer listed"
       detection on this: without live data every bookmark looks "gone". */
    window.WA.DATA_LIVE = picksOk && !catalogueCached;
    if (picksOk && venuesOk && !catalogueCached) writeSnapshot(same ? null : body, sig);

    if (snap && !picksOk) return;                     /* offline: keep what is drawn */
    if (same) {                                       /* the snapshot was right */
      /* Nothing to redraw, but pages that drew from it with DATA_LIVE
         false now know the answer is live. */
      document.dispatchEvent(new CustomEvent('wa:data-live'));
      return;
    }
    apply(picksOk ? picksResult.value : null, venuesOk ? venuesResult.value : null, redirOk ? redirectsResult.value : null);
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
    id = window.WA.canonicalId(id);
    if (!redirects.has(id)) {
      try {
        const rows = await get('catalogue_redirects', `id=eq.${encodeURIComponent(id)}&select=canonical_id&limit=1`);
        if (rows?.[0]) { redirects.set(id, rows[0].canonical_id); id = rows[0].canonical_id; }
      } catch (_) { /* the direct row lookup still works */ }
    }
    const q = `id=eq.${encodeURIComponent(id)}&limit=1`;
    let lookupError = null;
    try {
      const picks = await get('picks', `${q}&select=id,city,title,venue,venue_id,neighborhood,kind,day,time,quote,handle,image_url,image_attr,venue_image_url,venue_image_attr,venue_image_source,lat,lng,address,source_url,teaser,original_title,original_language,title_language,event_languages,tags,flag,starts_at,ends_at,ticket_url,is_free,price_min,price_max,currency,last_seen_at,created_at,archived_at`, undefined, true);
      if (picks && picks[0]) {
        return { kind: 'event', e: toPick(picks[0]), archivedAt: picks[0].archived_at || null };
      }
    } catch (error) { lookupError = error; }
    try {
      const venues = await get(
        'venues',
        `${q}&select=id,city,name,neighborhood,kind,lat,lng,image_url,image_attr,image_source,address,description,website,facebook,instagram,opening_hours,osm_id,status`, undefined, true
      );
      if (venues && venues[0]) return { kind: 'place', e: toVenue(venues[0]), archivedAt: null };
    } catch (error) { lookupError = error; }
    /* A failed request is not evidence that a saved listing disappeared. */
    if (lookupError) throw lookupError;
    return null;
  };

  window.WA.byId = byId;

  /* Fetch a bounded source excerpt only when its disclosure is opened. */
  window.WA.originalDescription = async (pick) => {
    if (!pick) return false;
    if (pick.descriptionFull) return true;
    try {
      const rows = await get('picks', `id=eq.${encodeURIComponent(pick.id)}&select=original_excerpt,original_language,original_url&limit=1`);
      const row = rows && rows[0];
      if (!row) throw new Error('Source excerpt unavailable');
      if (row) {
        pick.description = row.original_excerpt || pick.description;
        pick.originalLanguage = row.original_language || null;
        pick.originalUrl = row.original_url || null;
      }
      pick.descriptionFull = true;
      pick.originalLoadFailed = false;
      return true;
    } catch (_) {
      pick.originalLoadFailed = true;
      return false;                 /* reopening can retry */
    }
  };

  load();
})();
