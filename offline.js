/* ============================================================
   offline.js — the offline state (6d), with the honest claim.
   ------------------------------------------------------------
   6d drew a card promising "Your saved picks and tonight's list work
   offline. Distances won't update." 6f then flagged that as unbacked:
   there is no service worker in this repo, bookmarks are localStorage
   and the list is not cached, so the stronger claim would have been a
   lie told to someone standing in the street with no signal.

   6f offered two ways out — ship a minimal SW, or soften the copy. This
   is the softened copy, and it is now TRUE of what actually ships:

     • Saves really are still here. bookmark.js is localStorage-first.
     • The catalogue falls back to the bundled catalog.js snapshot, so
       a list still renders — but it is a snapshot, and the banner says
       so rather than implying it is tonight's live list.
     • Distances need geolocation and a coordinate, so they degrade the
       same way they do online without permission.

   When a service worker lands, this file is where the stronger promise
   goes back — not before.
   ============================================================ */
(() => {
  'use strict';

  let node = null;

  const show = () => {
    if (node || !document.body) return;
    node = document.createElement('div');
    node.className = 'wa-offline';
    node.setAttribute('role', 'status');
    node.innerHTML =
      '<span class="wa-offline__dot" aria-hidden="true"></span>' +
      '<span>No signal — your saved picks are still here. ' +
      'What is listed may be out of date.</span>';
    document.body.appendChild(node);
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
