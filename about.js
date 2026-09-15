/* ============================================================
   about.js — About.
   ------------------------------------------------------------
   Every number is counted from the live catalogue rather than written
   into the copy. Vilnius is shown as internal, not hidden.
   ============================================================ */
(() => {
  'use strict';
  const esc = (s) => window.WA.UI.esc(s);

  const render = () => {
    const picks  = window.WA._catalogAll || [];
    const venues = window.WA._venuesAll  || [];
    const sources = new Set(picks.map(e => e.handle).filter(Boolean)).size;

    const counts = document.getElementById('about-counts');
    if (counts) counts.innerHTML = `
      <div class="wa-cell"><span class="wa-cell__label">Sources read</span>
        <span class="wa-cell__value">${sources || '—'}</span></div>
      <div class="wa-cell"><span class="wa-cell__label">Places listed</span>
        <span class="wa-cell__value">${venues.length || '—'}</span></div>`;

    const grid = document.getElementById('about-cities');
    if (grid) grid.innerHTML = (window.WA.CITIES || []).map((c) => {
      const n = venues.filter(v => v.city === c.id).length;
      const tonight = picks.filter(e => e.city === c.id && window.WA.when.isTonight(e)).length;
      const status = c.status === 'internal'
        ? 'internal testing'
        : `live · ${n} places`;
      return `<a class="wa-card" href="index.html" data-city-plate="${esc(c.id)}">
        <span class="wa-card__well"><img class="wa-card__photo" src="${esc(c.thumb)}" alt="" loading="lazy" /></span>
        <span class="wa-card__body">
          <span class="wa-card__title">${esc(c.label.charAt(0) + c.label.slice(1).toLowerCase())}</span>
          <span class="wa-card__meta">${esc(status)}</span>
          <span class="wa-card__meta">${esc(tonight ? `${tonight} on tonight` : 'nothing tonight')}</span>
        </span>
      </a>`;
    }).join('');

    /* The calendar feed with its real per-city URL. Vilnius is left out:
       internal testing does not claim parity. */
    const feeds = document.getElementById('about-feeds');
    if (feeds) {
      const base = `${window.WA.BASE_URL}/functions/v1/calendar-feed?city=`;
      feeds.innerHTML = (window.WA.CITIES || [])
        .filter(c => c.status === 'live')
        .map((c) => {
          const url = base + encodeURIComponent(c.id);
          const name = c.label.charAt(0) + c.label.slice(1).toLowerCase();
          /* overflow-wrap:anywhere: a feed URL is one long unbroken token.
             Printed in full because subscribing means copying it. */
          return `<p class="wa-detail__note" style="margin-top:var(--s-4)">
            <strong>${esc(name)}</strong><br>
            <a href="${esc(url)}" style="overflow-wrap:anywhere">${esc(url)}</a>
          </p>`;
        }).join('');
    }
  };

  document.addEventListener('wa:catalog-ready', render);
  if (window.WA && window.WA.catalog) render();
})();
