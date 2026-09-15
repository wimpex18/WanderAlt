/* ============================================================
   map-tiles.js — MapLibre GL basemap for the Tonight map.
   ------------------------------------------------------------
   Free OpenFreeMap vector tiles (OpenStreetMap data, no API key).

   Exposes window.WA.MapTiles — a thin façade so page scripts don't need
   to know MapLibre exists. The pin overlay in tonight.js calls
   .project(lng, lat) to position absolute DOM nodes over the canvas.
   ============================================================ */
(function () {
  'use strict';
  window.WA = window.WA || {};

  /* City default views: explicit land-weighted {center, zoom}, not a bbox
     fit (a bbox puts half of a coastal city's frame in open water).
     EVERY live city in city.js MUST have an entry — a missing one is a
     loud console error. */
  const CITY_VIEWS = {
    tallinn:  { center: [24.745, 59.434], zoom: 12.4 },  /* Old Town · Kalamaja · Telliskivi */
    helsinki: { center: [24.938, 60.168], zoom: 12.0 },  /* Kallio · Punavuori · Kamppi */
    riga:     { center: [24.105, 56.946], zoom: 12.4 },  /* Centrs · Old Riga · Miera iela */
    vilnius:  { center: [25.282, 54.685], zoom: 12.2 },  /* Senamiestis · Užupis · Naujamiestis */
  };

  let map      = null;     /* maplibregl.Map instance */
  let ready    = false;
  let pending  = [];       /* callbacks queued before map is ready */
  let resizeRO = null;     /* ResizeObserver to fix map sizing in hidden panes */

  /* Initialise MapLibre into the given container. Idempotent — calling
     twice is a no-op. */
  function init(containerId, opts = {}) {
    if (map) return map;
    if (typeof window.maplibregl === 'undefined') {
      /* MapLibre is lazy-loaded (maplibre-loader.js); re-run init when it
         announces itself. Pending/onReady queues absorb calls meanwhile. */
      document.addEventListener('wa:maplibre-ready',
        () => init(containerId, opts), { once: true });
      return null;
    }
    const city = opts.city || (window.WA && window.WA.CITY) || 'tallinn';
    let view = CITY_VIEWS[city];
    if (!view) {
      console.error(`[map-tiles] no CITY_VIEWS entry for "${city}" — add one. Falling back to Tallinn framing.`);
      view = CITY_VIEWS.tallinn;
    }

    /* The basemap follows data-theme on <html>, set by theme.js. */
    const styleFor = () =>
      document.documentElement.dataset.theme === 'dusk'
        ? './map-style-dusk.json' : './map-style.json';
    map = new maplibregl.Map({
      container:   containerId,
      style:       opts.styleUrl || styleFor(),
      center:      view.center,
      zoom:        view.zoom,
      attributionControl: { compact: true },
      cooperativeGestures: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });

    map.touchZoomRotate.disableRotation();

    /* Hot-swap the basemap when the Dusk/Daybreak theme flips
       (Profile → Appearance, or the auto sunset switch on a long-
       lived tab). MapLibre re-fetches the style; pins are DOM
       overlays, so they survive untouched. */
    let _activeStyle = opts.styleUrl || styleFor();
    document.addEventListener('wa:theme-changed', () => {
      const next = styleFor();
      if (map && !opts.styleUrl && next !== _activeStyle) {
        _activeStyle = next;
        try { map.setStyle(next); } catch (_) { /* style mid-load */ }
      }
    });

    const markReady = () => {
      if (ready) return;
      ready = true;
      /* Resize once the canvas is in a visible pane — MapLibre can boot at
         0×0 inside a hidden pane and never recover otherwise. */
      requestAnimationFrame(() => map.resize());
      pending.forEach(fn => { try { fn(); } catch (_) {} });
      pending = [];
    };
    map.on('load', markReady);
    /* 'load' fires only for the style the map booted with. theme.js can
       swap the style before that finishes, so 'styledata' covers the
       swapped-in style too. */
    map.on('styledata', markReady);

    /* Auto-resize whenever the container's box changes (pane toggles,
       desktop split-view, viewport rotation). */
    if (typeof ResizeObserver !== 'undefined') {
      const el = document.getElementById(containerId);
      resizeRO = new ResizeObserver(() => { if (map) map.resize(); });
      if (el) resizeRO.observe(el);
    }

    return map;
  }

  /* Project a [lng, lat] pair into container pixel coords {x, y}. Returns
     null if the map isn't ready yet. Pins use this to position themselves. */
  function project(lng, lat) {
    if (!map || lng == null || lat == null) return null;
    const p = map.project([lng, lat]);
    return { x: p.x, y: p.y };
  }

  /* Every camera move goes through here, so prefers-reduced-motion is
     honoured in one place: same destination, no tween. */
  const MOVE_MS = () =>
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 0 : 480;

  function fitToPicks(entries, options = {}) {
    if (!map) return;
    const pts = entries
      .filter(e => e.lat != null && e.lng != null)
      .map(e => [e.lng, e.lat]);
    if (!pts.length) {
      /* No placeable entries — keep current view. */
      return;
    }
    if (pts.length === 1) {
      map.flyTo({ center: pts[0], zoom: 14, duration: MOVE_MS(), ...options });
      return;
    }
    const bounds = pts.reduce(
      (b, p) => b.extend(p),
      new maplibregl.LngLatBounds(pts[0], pts[0])
    );
    map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: MOVE_MS(), ...options });
  }

  function flyTo(lng, lat, zoom) {
    if (!map) return;
    map.flyTo({ center: [lng, lat], zoom: zoom ?? 15, duration: MOVE_MS() });
  }

  function on(event, handler) {
    if (!map) {
      pending.push(() => map.on(event, handler));
      return;
    }
    map.on(event, handler);
  }

  function onReady(fn) {
    if (ready) { fn(); return; }
    pending.push(fn);
  }

  function isReady() { return ready; }
  function getMap()  { return map; }

  window.WA.MapTiles = {
    init, project, fitToPicks, flyTo,
    on, onReady, isReady, getMap,
  };
})();
