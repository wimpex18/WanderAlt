/* ============================================================
   offline.js — the offline state (6d), and the worker that backs it.

   6d draws: "No signal. Showing 19:40. Your saved picks and tonight's
   list work offline. Distances won't update. · cached 40 min ago"

   6f#5 said not to ship that claim unbacked: "Either ship a minimal SW
   that caches the last Tonight response and the shell, or soften the
   copy. Do not ship the stronger claim unbacked." The copy was softened
   first. sw.js is the other half, so the claim is now true:

     • Saves are localStorage-first, so they were always here.
     • The shell and the last picks/venues responses are cached by the
       worker, so a list really does render with no signal.
     • Distances need geolocation and a coordinate, so they degrade the
       same way they do online without permission — which is why 6d says
       so rather than pretending otherwise.

   The banner prints how stale the cached list is. That number is the
   difference between an honest offline mode and one that implies it is
   showing you tonight.
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
      `<span>No signal. Showing ${clock()}. Your saved picks and tonight's ` +
      'list work offline. Distances won\'t update.' +
      (stale ? ` <span class="wa-offline__age">${stale}</span>` : '') +
      '</span>';
  };

  const show = () => {
    if (node || !document.body) return;
    node = document.createElement('div');
    node.className = 'wa-offline';
    node.setAttribute('role', 'status');
    document.body.appendChild(node);
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
