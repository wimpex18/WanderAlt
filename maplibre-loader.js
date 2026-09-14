/* ============================================================
   maplibre-loader.js — defers the MapLibre GL bundle (~800KB JS)
   until after first paint. Injects the self-hosted script and
   stylesheet from vendor/ on window 'load', then announces
   'wa:maplibre-ready' so map-tiles.js can run its deferred init.
   admin.html keeps eager tags; upgrading MapLibre means swapping
   the two vendor/ files and keeping admin.html's tags in lockstep.
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
