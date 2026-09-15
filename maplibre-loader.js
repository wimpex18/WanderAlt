/* ============================================================
   maplibre-loader.js — defers the MapLibre GL bundle until after
   first paint. MapLibre 6 ships as ES modules only, so it is pulled
   in with a dynamic import() from vendor/ on window 'load', exposed
   as window.maplibregl, and announced with 'wa:maplibre-ready'.
   Used by discover.html and admin.html. Upgrading MapLibre means
   swapping the four vendor/ files: maplibre-gl.mjs, -shared.mjs,
   -worker.mjs and maplibre-gl.css.
   ============================================================ */
(() => {
  'use strict';

  const load = () => {
    if (window.maplibregl) return;
    if (!document.querySelector('link[href$="vendor/maplibre-gl.css"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = './vendor/maplibre-gl.css';
      document.head.appendChild(css);
    }

    import('./vendor/maplibre-gl.mjs')
      .then((mod) => {
        window.maplibregl = mod;
        document.dispatchEvent(new CustomEvent('wa:maplibre-ready'));
      })
      .catch(() => console.warn('[maplibre-loader] bundle failed to load — basemap disabled this session.'));
  };

  if (document.readyState === 'complete') setTimeout(load, 0);
  else window.addEventListener('load', () => setTimeout(load, 0), { once: true });
})();
