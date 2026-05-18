/* ============================================================
   map-tiles.js — MapLibre GL basemap for WanderAlt's Discover map.
   ------------------------------------------------------------
   Replaces the illustrated SVG city plane with a real, pannable,
   zoomable vector basemap. Free tiles from OpenFreeMap (OpenStreetMap
   data, no API key, no rate limit).

   Exposes window.WA.MapTiles — a thin façade so map.js doesn't need
   to know MapLibre exists. Pin overlay (map.js) calls
   .project(lng, lat) to convert real-world coords into container
   pixels and positions absolute-pinned DOM nodes on top.

   Style: a custom editorial style file matching WanderAlt tokens
   (cream paper, muted sea, oxblood roads, mono labels).
   ============================================================ */
(function () {
  'use strict';
  window.WA = window.WA || {};

  /* City defaults — used by fitBounds() before any pins have lat/lng. */
  const CITY_BOUNDS = {
    tallinn:  [[24.65, 59.39], [24.86, 59.49]],
    helsinki: [[24.84, 60.13], [25.10, 60.27]],
    riga:     [[24.02, 56.89], [24.21, 57.02]],
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
      console.warn('[map-tiles] maplibregl global not found — basemap disabled.');
      return null;
    }
    const city   = opts.city || (window.WA && window.WA.CITY) || 'tallinn';
    const bounds = CITY_BOUNDS[city] || CITY_BOUNDS.tallinn;

    map = new maplibregl.Map({
      container:   containerId,
      style:       opts.styleUrl || './map-style.json',
      bounds,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
      cooperativeGestures: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });

    map.touchZoomRotate.disableRotation();

    map.on('load', () => {
      ready = true;
      /* Resize once the canvas is in a visible pane — MapLibre can boot at
         0×0 inside a hidden discover-pane and never recover otherwise. */
      requestAnimationFrame(() => map.resize());
      pending.forEach(fn => { try { fn(); } catch (_) {} });
      pending = [];
    });

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

  function unproject(x, y) {
    if (!map) return null;
    const c = map.unproject([x, y]);
    return { lng: c.lng, lat: c.lat };
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

  function resize() { if (map) map.resize(); }
  function isReady() { return ready; }
  function getMap()  { return map; }

  window.WA.MapTiles = {
    init, project, unproject, fitToPicks, flyTo,
    on, onReady, resize, isReady, getMap,
  };
})();
