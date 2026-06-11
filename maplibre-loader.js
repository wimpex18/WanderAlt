/* ============================================================
   maplibre-loader.js — defers the MapLibre GL bundle (~800KB JS)
   until after the page has painted (June 2026 perf pass: parsing
   it at boot cost Discover ~340ms of main-thread blocking and 15
   Lighthouse performance points; the map pane can arrive a beat
   later without hurting the journey — the V-11 elements are list-
   side). Injects the pinned CDN script + stylesheet on window
   'load', then announces 'wa:maplibre-ready' so map-tiles.js can
   run its deferred init. admin.html keeps eager tags (desktop
   tool, the pin editor needs the map immediately).
   CSP: script-src/style-src already allow https://unpkg.com.
   ============================================================ */
(() => {
  'use strict';
  const VER = '5.24.0';   /* keep in lockstep with admin.html's pinned tags */

  const load = () => {
    if (window.maplibregl) return;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `https://unpkg.com/maplibre-gl@${VER}/dist/maplibre-gl.css`;
    document.head.appendChild(css);

    const s = document.createElement('script');
    s.src = `https://unpkg.com/maplibre-gl@${VER}/dist/maplibre-gl.js`;
    s.onload = () => document.dispatchEvent(new CustomEvent('wa:maplibre-ready'));
    s.onerror = () => console.warn('[maplibre-loader] CDN load failed — basemap disabled this session.');
    document.head.appendChild(s);
  };

  if (document.readyState === 'complete') setTimeout(load, 0);
  else window.addEventListener('load', () => setTimeout(load, 0), { once: true });
})();
