/* ============================================================
   discover-redirect.js
   ------------------------------------------------------------
   Bridges legacy /map.html and /search.html URLs to the unified
   /discover surface. Runs ASAP (no DOMContentLoaded wait) so
   the browser never paints the stub page.

   Param mapping:
     map.html?day=X         → discover.html?time=X&view=map
     map.html?q=X           → discover.html?q=X&view=map
     map.html?id=X          → discover.html?id=X&view=map
     map.html?mood=X        → discover.html?cat=X&view=map
       (map.js's ?mood= was the *category* filter — Discover uses ?cat=)
     search.html?q=X        → discover.html?q=X
     search.html?q=X&mode=match → discover.html?ai=X&mode=match
   Hash (#mood=…) is preserved verbatim so mood-chips state survives.
   ============================================================ */
(function () {
  const path = window.location.pathname;
  const isMap    = /\/map\.html$/.test(path)    || path === '/map.html';
  const isSearch = /\/search\.html$/.test(path) || path === '/search.html';
  if (!isMap && !isSearch) return;

  const src = new URLSearchParams(window.location.search);
  const dst = new URLSearchParams();

  if (isMap) {
    if (src.has('q'))    dst.set('q',    src.get('q'));
    if (src.has('day'))  dst.set('time', src.get('day'));
    if (src.has('mood')) dst.set('cat',  src.get('mood'));
    if (src.has('id'))   dst.set('id',   src.get('id'));
    dst.set('view', 'map');
  } else if (isSearch) {
    if (src.get('mode') === 'match') {
      dst.set('mode', 'match');
      if (src.has('q')) dst.set('ai', src.get('q'));
    } else if (src.has('q')) {
      dst.set('q', src.get('q'));
    }
  }

  const qs   = dst.toString();
  const dest = 'discover.html' + (qs ? '?' + qs : '') + window.location.hash;
  /* replace() so the back button skips the stub. */
  window.location.replace(dest);
})();
