/* ============================================================
   WanderAlt — Supabase data loader
   ------------------------------------------------------------
   Fetches picks and past entries from the Supabase REST API,
   converts them to the window.WA.catalog / window.WA.past shape,
   then dispatches 'wa:catalog-ready' so page scripts can render.

   On network failure or timeout (2 s) the static catalog.js
   data is kept as a fallback and the event is still dispatched,
   so pages always render — just from the bundled snapshot.

   Load order in every HTML file:
     catalog.js → supabase.js → bookmark.js → [page script]
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

  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  /* GET /rest/v1/{table}?{qs} → parsed JSON or throws */
  const get = (table, qs, signal) =>
    fetch(`${BASE}/rest/v1/${table}?${qs}`, { headers, ...(signal ? { signal } : {}) })
      .then(r => {
        if (!r.ok) throw new Error(`${table} ${r.status}`);
        return r.json();
      });

  /* Convert a Postgres picks row → catalog entry shape */
  const toPick = (r) => ({
    id:            r.id,
    city:          r.city,
    title:         r.title,
    venue:         r.venue,
    neighborhood:  r.neighborhood,
    kind:          r.kind,
    day:           r.day,
    time:          r.time,
    quote:         r.quote,
    handle:        r.handle,
    thumbInitials: r.thumb_initials || (r.venue ? r.venue.slice(0, 2).toUpperCase() : '??'),
    imageUrl:      r.image_url     || null,
    imageAttr:     r.image_attr    || null,
    tonight:       r.tonight,
    thisWeek:      r.this_week,
    moodTags:      r.mood_tags || [],
    pin: r.pin_num != null ? {
      num:     r.pin_num,
      left:    r.pin_left,
      top:     r.pin_top,
      eyebrow: r.pin_eyebrow
    } : null,
    lat:       r.lat       ?? null,
    lng:       r.lng       ?? null,
    address:   r.address   ?? null,
    coordsSource: r.coords_source ?? null,
    coordsLocked: !!r.coords_locked,
    permalink: null,            /* sourced from staging_messages via separate join — TODO */
    /* isClosed is hydrated below by joining against venue_details. */
    isClosed:  false,
  });

  const dispatch = () =>
    document.dispatchEvent(new CustomEvent('wa:catalog-ready'));

  const load = async () => {
    /* 2-second timeout so a slow network falls back to catalog.js */
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 2000);

    /* Fetch ALL active picks across every city (not just the current
       one). Roughly ~200 rows total — well under any per-request size
       cap and the same order of magnitude as the static catalog. The
       all-cities catalog is exposed as WA._catalogAll so cross-city
       venue/curator URLs resolve (e.g. a Tallinn user clicking a
       bookmarked Riga pick), and the city-filtered slice is exposed
       as WA.catalog (the listing pages keep showing only the active
       city). past + venue_details follow the same all-cities pattern. */
    const [picksResult, pastResult, vdResult] = await Promise.allSettled([
      get(
        `picks`,
        `archived_at=is.null` +
        `&select=id,city,title,venue,neighborhood,kind,day,time,quote,handle,` +
                `thumb_initials,image_url,image_attr,tonight,this_week,mood_tags,` +
                `pin_num,pin_left,pin_top,pin_eyebrow,lat,lng,address,coords_source,coords_locked` +
        `&order=sort_order.asc,created_at.asc`,
        abort.signal
      ),
      get(`past`, `order=created_at.asc`, abort.signal),
      get(
        `venue_details`,
        `or=(is_closed.eq.true,business_status.in.("CLOSED_PERMANENTLY","CLOSED_TEMPORARILY"))` +
        `&select=venue_key,is_closed,business_status`,
        abort.signal
      ),
    ]);

    clearTimeout(timer);

    /* Build a closure map keyed on lower(venue_key) for the merge below. */
    const closedSet = new Set();
    if (vdResult.status === 'fulfilled' && Array.isArray(vdResult.value)) {
      for (const v of vdResult.value) {
        if (v.is_closed || v.business_status === 'CLOSED_PERMANENTLY' || v.business_status === 'CLOSED_TEMPORARILY') {
          if (v.venue_key) closedSet.add(String(v.venue_key).toLowerCase().trim());
        }
      }
    }

    window.WA = window.WA || {};

    if (picksResult.status === 'fulfilled') {
      const all = picksResult.value.map(r => {
        const p = toPick(r);
        if (r.venue && closedSet.has(String(r.venue).toLowerCase().trim())) {
          p.isClosed = true;
        }
        return p;
      });
      /* All-cities snapshot for cross-city lookups (venue.html?id=… of
         a pick from another city, curator profile for a Riga curator
         while CITY=tallinn, etc.). The listing pages keep using the
         city-filtered slice. */
      window.WA._catalogAll = all;
      window.WA.catalog     = all.filter(e => e.city === CITY);
    } else {
      /* Keep static catalog.js snapshot; log so devtools shows the reason. */
      console.warn('[WanderAlt] picks fetch failed — using static catalog.', picksResult.reason?.message);
    }

    if (pastResult.status === 'fulfilled') {
      const allPast = pastResult.value.map(r => ({ id: r.id, title: r.title, date: r.date, city: r.city }));
      window.WA._pastAll = allPast;
      window.WA.past     = allPast.filter(e => !e.city || e.city === CITY);
    } else {
      window.WA.past = [];  /* past table is optional — silently empty if absent */
    }

    dispatch();
  };

  load();
})();
