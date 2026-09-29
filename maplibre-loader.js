/* ============================================================
   maplibre-loader.js — defers the MapLibre GL bundle until after
   first paint. MapLibre 6 ships as ES modules only, so it is pulled
   in with a dynamic import() from vendor/ on window 'load', exposed
   as window.maplibregl, and announced with 'wa:maplibre-ready'.
   Used by the map and by the detail page's address preview. Upgrading MapLibre means
   swapping the four vendor/ files: maplibre-gl.mjs, -shared.mjs,
   -worker.mjs and maplibre-gl.css.
   ============================================================ */
(() => {
  'use strict';

  let loading = false;
  const load = () => {
    if (window.maplibregl || loading) return;
    loading = true;
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
      .catch(() => {
        loading = false;
        document.dispatchEvent(new CustomEvent('wa:maplibre-error'));
        console.warn('[maplibre-loader] bundle failed to load');
      });
  };

  // Detail previews can request the bundle without waiting for unrelated
  // images to finish loading. The normal map still starts after paint.
  document.addEventListener('wa:maplibre-request', load);
  if (document.querySelector('.map-page')) load();          // the map is the page: no waiting for images
  else if (document.readyState === 'complete') setTimeout(load, 0);
  else window.addEventListener('load', () => setTimeout(load, 0), { once: true });
})();
