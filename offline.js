/* ============================================================
   offline.js — the offline banner, and service-worker registration.
   ------------------------------------------------------------
   Saves are localStorage-first; sw.js caches the shell and the last
   listings response; distances degrade as they do without location
   permission. The banner prints how old the cached listings are.

   Freshness lives here too: a tab left open overnight, or an installed
   app resumed the next morning, reloads itself when it comes back, so
   "tonight" is tonight and the list is today's without a pull to refresh.
   ============================================================ */
(() => {
  'use strict';

  let node = null;
  let cachedAt = null;

  /* Registered here rather than in a page script because this module is
     the one that owns the offline story, and it loads on every page.
     Silent on failure: a browser without service workers, or a page
     opened from the filesystem, must still work exactly as before. */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'wa:cache-age') {
        cachedAt = e.data.at;
        if (node) paint();
      }
    });
  }

  const askCacheAge = () => {
    const c = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (c) c.postMessage({ type: 'wa:cache-age' });
  };

  /* "40 min ago" -- and nothing at all when we do not know, rather than
     a confident "just now" the cache cannot support. */
  const ago = (t) => {
    if (!t) return '';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1)    return 'cached just now';
    if (m < 60)   return `cached ${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24)   return `cached ${h} ${h === 1 ? 'hour' : 'hours'} ago`;
    return `cached ${Math.round(h / 24)} days ago`;
  };

  const clock = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const paint = () => {
    if (!node) return;
    const stale = ago(cachedAt);
    node.innerHTML =
      '<span class="wa-offline__dot" aria-hidden="true"></span>' +
      `<span>No signal. Showing ${clock()}. Your saves work offline, and ` +
      'listings stay as they last loaded. Distances won\'t update.' +
      (stale ? ` <span class="wa-offline__age">${stale}</span>` : '') +
      '</span>';
  };

  /* Inserted directly after the top bar, not appended to <body>: the
     banner is `position: sticky; top: var(--topbar-h)`, which can only
     work from its place in the flow, and it reserves real layout height
     rather than covering the first row. */
  const show = () => {
    if (node || !document.body) return;
    node = document.createElement('div');
    node.className = 'wa-offline';
    node.setAttribute('role', 'status');
    const topbar = document.querySelector('.wa-topbar');
    if (topbar && topbar.parentNode) topbar.insertAdjacentElement('afterend', node);
    else document.body.insertBefore(node, document.body.firstChild);
    paint();
    askCacheAge();
  };

  const hide = () => { if (node) { node.remove(); node = null; } };

  const sync = () => (navigator.onLine === false ? show() : hide());

  window.addEventListener('offline', show);
  window.addEventListener('online', hide);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync, { once: true });
  } else {
    sync();
  }

  /* ── Warm the Map ────────────────────────────────────────────
     The Map is one tap from every page and its MapLibre bundles are the
     heaviest thing it needs (about 290 KB compressed). Once a page has
     loaded and the browser is idle, fetch them through the worker so the
     first Map visit opens from the cache. Skipped on the Map itself, on
     Data Saver and on slow connections, and once the bundle is cached. */
  const warmMap = async () => {
    try {
      if (document.body && document.body.dataset.page === 'map') return;
      const c = navigator.connection;
      if (c && (c.saveData || /(^|-)2g$|^3g$/.test(c.effectiveType || ''))) return;
      if (!('caches' in window) || !navigator.serviceWorker || !navigator.serviceWorker.controller) return;
      if (await caches.match('./vendor/maplibre-gl.mjs')) return;
      const dusk = document.documentElement.dataset.theme === 'dusk';
      const urls = ['./vendor/maplibre-gl.mjs', './vendor/maplibre-gl-shared.mjs', './vendor/maplibre-gl-worker.mjs',
        './vendor/maplibre-gl.css', dusk ? './map-style-dusk.json' : './map-style.json'];
      for (const u of urls) await fetch(u, { priority: 'low' }).catch(() => {});
      fetch('https://tiles.openfreemap.org/planet', { mode: 'cors', priority: 'low' }).catch(() => {});
    } catch (_) { /* a warm-up that fails changes nothing */ }
  };
  const idleWarm = () => (window.requestIdleCallback ? requestIdleCallback(warmMap, { timeout: 8000 }) : setTimeout(warmMap, 4000));
  if (document.readyState === 'complete') setTimeout(idleWarm, 3000);
  else window.addEventListener('load', () => setTimeout(idleWarm, 3000), { once: true });

  /* ── Freshness ───────────────────────────────────────────────
     A page is stale when the Tallinn calendar day has turned since it
     loaded, or when it was put away and has been out of sight for a while.
     It reloads only when nobody is mid-task: no open sheet, no focused
     field. The address keeps its filters, so the reader lands where they were. */
  const STALE_AFTER = 30 * 60 * 1000;
  const dayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date());
  const loadedDay = dayKey();
  let hiddenAt = 0;

  const idle = () => {
    if (document.querySelector('dialog[open]')) return false;
    const a = document.activeElement;
    return !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && !(a && a.isContentEditable);
  };

  const check = (resumed) => {
    if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
    /* Pick up a new deploy while we are here; the reload below then runs it. */
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
    const away = hiddenAt && Date.now() - hiddenAt > STALE_AFTER;
    if ((dayKey() !== loadedDay || (resumed && away)) && idle()) location.reload();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else { check(true); hiddenAt = 0; }
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) check(true); });
  window.addEventListener('online', () => check(false));
  setInterval(() => check(false), 60 * 1000);   /* a tab left in view as midnight passes */
})();
