/* ============================================================
   about.js — About. Every number is counted from the live catalogue.
   ============================================================ */
(() => {
  'use strict';
  const esc = (s) => window.WA.UI.esc(s);

  const render = () => {
    const picks = window.WA.catalog || [];
    const venues = window.WA.venues || [];
    const sources = new Set(picks.map(e => e.handle).filter(Boolean)).size;
    const counts = document.getElementById('about-counts');
    if (counts) counts.innerHTML = [
      ['Listings', picks.length], ['Places', venues.length], ['Sources', sources],
    ].map(([l, n]) => `<div class="wa-stat"><span class="wa-stat__n">${n || '·'}</span><span class="wa-stat__label">${esc(l)}</span></div>`).join('');

    const feeds = document.getElementById('about-feeds');
    if (feeds) {
      const base = `${window.WA.BASE_URL}/functions/v1/calendar-feed?city=`;
      feeds.innerHTML = (window.WA.CITIES || []).filter(c => c.status === 'live').map((c) => {
        const u = base + encodeURIComponent(c.id);
        return `<a class="wa-feed-url" href="${esc(u)}">${esc(u)}</a>`;
      }).join('');
    }
  };

  document.addEventListener('wa:catalog-ready', render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
})();
