/* ============================================================
   geo.js — WA.Geo, the one distance module.
   ------------------------------------------------------------
   coordsFor() falls back from a pick's own lat/lng to the venue joins,
   and everything returns null rather than zero when it runs out. A null
   distance is a designed state: the row prints its area instead and
   does not shift layout when location permission arrives later.
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  /* ~4.8 km/h. The only declaration; list, filter sheet and map share it. */
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
     Own lat/lng, then the pick's venue (WA.venueFor: venue_id, else the
     case-insensitive name). */
  const coordsFor = (entry) => {
    if (!entry) return null;
    if (entry.lat != null && entry.lng != null) return { lat: entry.lat, lng: entry.lng };
    const v = window.WA && window.WA.venueFor ? window.WA.venueFor(entry) : null;
    if (v && v.lat != null && v.lng != null) return { lat: v.lat, lng: v.lng };
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
     Undated entries sort after dated ones; unknown distances after known
     ones. */
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
     A bare small integer is minutes; anything >= 100 is metres. */
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
    walkMinutes, format,
    coordsFor, userLoc, currentLoc,
    distanceTo, distanceLabel,
    startMinutes, bySoonestThenDistance,
    parseWithin, withinFilter,
  };
})();
