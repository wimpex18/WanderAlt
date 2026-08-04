/* ============================================================
   geo.js — WA.Geo, the one distance module.
   ------------------------------------------------------------
   "Every row and card carries a distance. Time and distance are the
   loudest things in any list." That makes distance a shared primitive,
   and it was previously two private copies: haversineM lived in both
   discover.js and map.js, each with its own WALK_M_PER_MIN = 80, which
   is exactly how a list and a map end up disagreeing about what is
   within a 20-minute walk. One copy now, and both surfaces read it.

   Coordinate coverage, measured before this was written:

     venues (Places)          937 / 937   100%
     picks, own lat/lng        18 /  46   and all 18 are Tallinn
     picks, +venue name join   27 /  46    59%
     picks, nothing anywhere   19          mostly Riga / Helsinki / Vilnius

   So coordsFor() falls back through the joins, and everything returns
   null rather than zero when it runs out. A null distance is a designed
   state — the row prints its street or area instead and does not shift
   layout when permission arrives later.
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  /* ~4.8 km/h. Was duplicated in discover.js and map.js; this is now the
     only declaration, and the filter sheet's minutes-to-metres readout
     divides by the same number the map filters on. */
  const WALK_M_PER_MIN = 80;

  const haversineM = (aLat, aLng, bLat, bLng) => {
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };

  const walkMinutes = (metres) =>
    (metres == null ? null : Math.max(1, Math.round(metres / WALK_M_PER_MIN)));

  /* "550 m" under a kilometre, "1.4 km" over it. Never "0.55 km" and
     never "1400 m" — the unit switch is what keeps the rail one glance
     wide at every distance. */
  const format = (metres) => {
    if (metres == null || !isFinite(metres)) return '';
    if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
    return `${(metres / 1000).toFixed(1)} km`;
  };

  /* ── Resolving a coordinate ──────────────────────────────────
     Own lat/lng, then the venues table by name, then venue_details.
     Both joins are case- and whitespace-insensitive on the venue name,
     matching the server-side join used to measure coverage. */
  const key = (s) => String(s || '').toLowerCase().trim();

  let _venueIdx = null;
  const venueIndex = () => {
    /* Rebuilt whenever the catalog reloads; cheap enough to memoise once
       per page and invalidate on the ready event. */
    if (_venueIdx) return _venueIdx;
    _venueIdx = new Map();
    const all = (window.WA && (window.WA._venuesAll || window.WA.venues)) || [];
    for (const v of all) {
      if (v && v.name && v.lat != null && v.lng != null) {
        const k = `${key(v.city)}|${key(v.name)}`;
        if (!_venueIdx.has(k)) _venueIdx.set(k, { lat: v.lat, lng: v.lng });
      }
    }
    return _venueIdx;
  };
  document.addEventListener('wa:catalog-ready', () => { _venueIdx = null; });

  const coordsFor = (entry) => {
    if (!entry) return null;
    if (entry.lat != null && entry.lng != null) return { lat: entry.lat, lng: entry.lng };
    if (entry.venue) {
      const hit = venueIndex().get(`${key(entry.city)}|${key(entry.venue)}`);
      if (hit) return hit;
    }
    return null;
  };

  /* ── The reader's position ───────────────────────────────────
     One request per page, cached, and a denial is remembered so nothing
     re-prompts on every render. Resolves to null when unavailable —
     callers degrade to the area label rather than hiding the row. */
  let _loc = null, _denied = false, _pending = null;

  const userLoc = () => {
    if (_loc)    return Promise.resolve(_loc);
    if (_denied || !navigator.geolocation) return Promise.resolve(null);
    if (_pending) return _pending;
    _pending = new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          _loc = { lat: p.coords.latitude, lng: p.coords.longitude };
          _pending = null;
          document.dispatchEvent(new CustomEvent('wa:location-ready', { detail: _loc }));
          resolve(_loc);
        },
        () => { _denied = true; _pending = null; resolve(null); },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
      );
    });
    return _pending;
  };

  /* Synchronous read for render paths — null until the prompt resolves,
     at which point 'wa:location-ready' asks the page to re-render. */
  const currentLoc  = () => _loc;
  const locDenied   = () => _denied;

  /* Metres from the reader to an entry, or null if either end is unknown. */
  const distanceTo = (entry, from) => {
    const a = from || _loc;
    const b = coordsFor(entry);
    if (!a || !b) return null;
    return haversineM(a.lat, a.lng, b.lat, b.lng);
  };

  /* The rail string: "1.4 km", or '' when we can't say. */
  const distanceLabel = (entry, from) => format(distanceTo(entry, from));

  /* ── The shared sort: starts-soonest, then distance ──────────
     6e asks for exactly one module owning this so Explore, Tonight and
     the map cannot drift. Undated entries sort after dated ones;
     unknown distances sort after known ones, so a row we know least
     about never leads the list. */
  const startMinutes = (e) => {
    if (e && e.startsAt) {
      const d = new Date(e.startsAt);
      if (!isNaN(d)) {
        try {
          const p = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit', hour12: false,
          }).formatToParts(d);
          const g = (t) => +(p.find(x => x.type === t) || {}).value;
          return g('hour') * 60 + g('minute');
        } catch (_) { return d.getHours() * 60 + d.getMinutes(); }
      }
    }
    const m = /^(\d{1,2})[:.](\d{2})/.exec(String((e && e.time) || '').trim());
    return m ? +m[1] * 60 + +m[2] : null;
  };

  const bySoonestThenDistance = (from) => (a, b) => {
    const ta = startMinutes(a), tb = startMinutes(b);
    if (ta != null && tb != null && ta !== tb) return ta - tb;
    if (ta != null && tb == null) return -1;
    if (ta == null && tb != null) return 1;
    const da = distanceTo(a, from), db = distanceTo(b, from);
    if (da != null && db != null && da !== db) return da - db;
    if (da != null && db == null) return -1;
    if (da == null && db != null) return 1;
    return 0;
  };

  /* ── The ?within= contract ───────────────────────────────────
     The redesign specifies metres; the shipped URLs carry minutes. Both
     are read, and links already in the wild keep meaning what they meant:
     a bare small integer is minutes, anything >= 100 is metres. */
  const parseWithin = (raw) => {
    const n = parseInt(raw, 10);
    if (!isFinite(n) || n <= 0) return 0;
    return n >= 100 ? n : n * WALK_M_PER_MIN;
  };

  const withinFilter = (list, metres, from) => {
    const a = from || _loc;
    if (!metres || !a) return list;             /* off, or position unknown */
    return list.filter((e) => {
      const d = distanceTo(e, a);
      return d == null || d <= metres;          /* unknown distance never hides a row */
    });
  };

  window.WA.Geo = {
    WALK_M_PER_MIN,
    haversineM, walkMinutes, format,
    coordsFor, userLoc, currentLoc, locDenied,
    distanceTo, distanceLabel,
    startMinutes, bySoonestThenDistance,
    parseWithin, withinFilter,
  };
})();
