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

  /* Directly after the top bar, NOT appended to <body>.

     wa.css has always said this banner "sits under the top bar rather
     than over the tab bar, because the toast owns that slot", and gives
     it `position: sticky; top: var(--topbar-h)` to do it. Appending to
     body made that sticky rule unreachable: a sticky element cannot
     travel up past its own place in the flow, and its place was the very
     end of the document. Measured 12 Aug 2026 on Tonight — the banner
     rendered at y=4589 of a 4724px page, so you had to scroll **3,852px**
     to find out you were offline. On a short page like Saved it landed
     mid-screen instead. Wherever the document happened to end.

     A notice nobody can see is the failure this whole file exists to
     avoid: 6f#5's point was that the offline claim must be *backed*, and
     the staleness number is what makes it honest. Both are worthless
     below the fold.

     Inserted before <main> so it also reserves real layout height rather
     than covering the first row — the same rule the two chrome bars
     follow. Every page has a .wa-topbar; the fallback keeps a page that
     somehow lacks one from losing the banner entirely. */
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
