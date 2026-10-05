/* ============================================================
   notfound.js — the 404: what is on, as the next-best answer.
   ============================================================ */
(() => {
  'use strict';
  const R = () => window.WA.R;

  const render = () => {
    const soon = R().live().filter(e => !R().isOff(e)).filter(e => window.WA.when.matches(e, 'thisweek'))
      .sort(window.WA.Geo.byDateThenSoonest()).slice(0, 5);
    const host = document.getElementById('preview');
    if (!host || !soon.length) return;
    host.innerHTML = `<section class="wa-sect">${R().sect({ title: 'On this week', href: 'discover.html', more: 'Programme' })}
      <ul class="wa-rows">${soon.map(e => R().row(e, { day: true })).join('')}</ul></section>`;
  };

  document.addEventListener('wa:catalog-ready', render);
  document.addEventListener('wa:language-changed', render);
})();
