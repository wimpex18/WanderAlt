/* ============================================================
   about.js — About (6d).
   ------------------------------------------------------------
   "About is your credibility page now that curators are gone — and it's
   the only page where the illustrated city plates in assets/ genuinely
   earn their place."

   Every number here is counted from the live catalogue rather than
   written into the copy, because a hand-written "34 sources" is a claim
   that rots the first week nobody updates it. Vilnius is shown as
   internal, not hidden: same treatment as the thin-city case in 3a —
   state the coverage plainly and the product reads as honest rather
   than empty.
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
        <span class="wa-cell__value">${venues.length || '—'}</span></div>
      <div class="wa-cell"><span class="wa-cell__label">Refresh</span>
        <span class="wa-cell__value">hourly</span></div>`;

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
  };

  document.addEventListener('wa:catalog-ready', render);
  if (window.WA && window.WA.catalog) render();
})();
