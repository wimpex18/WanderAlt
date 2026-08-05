/* ============================================================
   map-tiles.js — MapLibre GL basemap for WanderAlt's Discover map.
   ------------------------------------------------------------
   Replaces the illustrated SVG city plane with a real, pannable,
   zoomable vector basemap. Free tiles from OpenFreeMap (OpenStreetMap
   data, no API key, no rate limit).

   Exposes window.WA.MapTiles — a thin façade so the page scripts don't
   need to know MapLibre exists. The pin overlay (tonight.js, since the
   Aug 2026 redesign replaced map.js) calls .project(lng, lat) to convert
   real-world coords into container pixels and positions absolute-pinned
   DOM nodes on top.

   Style: a custom editorial style file matching WanderAlt tokens
   (cream paper, muted petrol sea, off-white roads, mono labels).
   ============================================================ */
(function () {
  'use strict';
  window.WA = window.WA || {};

  /* City default views — what the map shows before any pins exist.
     Explicit land-weighted {center, zoom} per city, NOT a bbox fit:
     these are coastal cities, so fitting a bounding box put half the
     frame in open water (Tallinn fit to its old bbox landed at zoom
     ~10.9 desktop / ~9.6 mobile with the Gulf of Finland filling the
     pane). A fixed center/zoom also frames identically
     in the narrow mobile pane and the desktop split pane.
     EVERY live city in city.js MUST have an entry — a missing one is
     a loud console error (the silent fall-back-to-Tallinn class of
     bug has bitten twice; see CITY_CONTEXT in process-staging). */
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
      /* maplibre is lazy-loaded after first paint (maplibre-loader.js,
         June 2026 perf pass) — re-run init when it announces itself
         instead of giving up. The pending/onReady queues already absorb
         any calls made in the meantime. */
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

    /* The basemap follows the theme, and ONLY the theme.
       This used to also require body[data-skin="dusk"], which was the
       Dusk Glass system's marker. The Aug 2026 pages don't carry
       data-skin at all, so the condition was never true and the night
       map silently loaded the paper style — a cream basemap under dark
       chrome. theme.js owns data-theme on <html>; that is the single
       signal now. */
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
    /* 'load' fires at most once, and only for the style the map booted
       with. theme.js resolves Dusk/Daybreak just after this module inits,
       so on a Daybreak boot the handler above swaps the style before the
       first one finished — 'load' never fired, `ready` never latched, and
       the pin overlay stayed empty over a basemap that had visibly
       rendered. 'styledata' covers the swapped-in style. */
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

  /* Fit map to a bounding box covering all visible pin coords. */
  function fitToPicks(entries, options = {}) {
    if (!map) return;
    const pts = entries
      .filter(e => e.lat != null && e.lng != null)
      .map(e => [e.lng, e.lat]);
    if (!pts.length) {
      /* No geocoded entries — keep current view. */
      return;
    }
    if (pts.length === 1) {
      map.flyTo({ center: pts[0], zoom: 14, ...options });
      return;
    }
    const bounds = pts.reduce(
      (b, p) => b.extend(p),
      new maplibregl.LngLatBounds(pts[0], pts[0])
    );
    map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 480, ...options });
  }

  function flyTo(lng, lat, zoom) {
    if (!map) return;
    map.flyTo({ center: [lng, lat], zoom: zoom ?? 15, duration: 480 });
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
