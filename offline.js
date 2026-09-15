/* ============================================================
   offline.js — the offline banner, and service-worker registration.
   ------------------------------------------------------------
   Saves are localStorage-first; sw.js caches the shell and the last
   listings response; distances degrade as they do without location
   permission. The banner prints how old the cached listings are.
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
})();
