/* ============================================================
   maplibre-loader.js — defers the MapLibre GL bundle (~800KB JS)
   until after the page has painted (June 2026 perf pass: parsing
   it at boot cost Discover ~340ms of main-thread blocking and 15
   Lighthouse performance points; the map pane can arrive a beat
   later without hurting the journey — the V-11 elements are list-
   side). Injects the script + stylesheet on window 'load', then
   announces 'wa:maplibre-ready' so map-tiles.js can run its
   deferred init. admin.html keeps eager tags (desktop tool, the
   pin editor needs the map immediately).

   Self-hosted from vendor/ (Jul 2026) rather than unpkg, for the
   same reason the fonts were: it drops the last third-party script
   origin, so the CSP is 'self' only. Upgrading is a manual swap of
   the two files in vendor/ — keep admin.html's tags in lockstep.
   ============================================================ */
(() => {
  'use strict';

  const load = () => {
    if (window.maplibregl) return;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = './vendor/maplibre-gl.css';
    document.head.appendChild(css);

    const s = document.createElement('script');
    s.src = './vendor/maplibre-gl.js';
    s.onload = () => document.dispatchEvent(new CustomEvent('wa:maplibre-ready'));
    s.onerror = () => console.warn('[maplibre-loader] bundle failed to load — basemap disabled this session.');
    document.head.appendChild(s);
  };

  if (document.readyState === 'complete') setTimeout(load, 0);
  else window.addEventListener('load', () => setTimeout(load, 0), { once: true });
})();
