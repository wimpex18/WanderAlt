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
    /* On a desktop the same counts are one quiet line under the lede rather than three big numbers. */
    const line = document.getElementById('about-counted');
    if (line) line.innerHTML = picks.length ? [`${picks.length} listings`, `${venues.length} places`, `${sources} sources`].map(t => `<span>${esc(t)}</span>`).join(' · ') : '';

    const feeds = document.getElementById('about-feeds');
    if (feeds) {
      const base = `${window.WA.BASE_URL}/functions/v1/calendar-feed?city=`;
      feeds.innerHTML = (window.WA.CITIES || []).filter(c => c.status === 'live').map((c) => {
        const u = base + encodeURIComponent(c.id);
        return `<a class="wa-feed-url" href="${esc(u)}">${esc(u)}</a>`;
      }).join('');
    }
  };

  /* A link to #calendar-feed, #privacy or #terms opens the fold it points at. */
  const openHash = () => {
    const t = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    const d = t && (t.tagName === 'DETAILS' ? t : t.closest('details'));
    if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ block: 'start' }), 50); }
  };
  window.addEventListener('hashchange', openHash);
  document.addEventListener('DOMContentLoaded', openHash, { once: true });
  if (document.readyState !== 'loading') openHash();

  document.addEventListener('wa:catalog-ready', render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
  document.addEventListener('wa:language-changed', render);
})();
