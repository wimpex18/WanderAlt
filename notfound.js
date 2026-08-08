/* ============================================================
   notfound.js — the 404 state (6d).
   ------------------------------------------------------------
   "Every state carries the next-best action — 404 offers tonight. These
   are the screens users hit when they're already annoyed; they deserve
   the same care as the happy path."

   So the page does not just apologise and link away: it shows the first
   few things that are actually on, which is what the reader wanted when
   they followed the dead link.
   ============================================================ */
(() => {
  'use strict';
  const esc = (s) => window.WA.UI.esc(s);

  const render = () => {
    const city = (window.WA.CITIES || []).find(c => c.id === window.WA.CITY);
    const label = city ? city.label.charAt(0) + city.label.slice(1).toLowerCase() : 'Tallinn';
    const link = document.getElementById('tonight-link');
    if (link) link.textContent = `Tonight in ${label}`;

    const soon = (window.WA.catalog || [])
      .filter(e => window.WA.when.matches(e, 'thisweek'))
      .sort(window.WA.Geo ? window.WA.Geo.bySoonestThenDistance() : undefined)
      .slice(0, 4);

    const host = document.getElementById('tonight-preview');
    if (!host || !soon.length) return;

    /* This was the one rail renderer in the repo that bypassed the time
       model: it printed picks.time raw, so a pick carrying a bare date
       showed "00:00" and three of four rows showed nothing at all. Both
       are the failures the rail rules exist to prevent — a clock only
       when one parses, and never a blank rail. Same chain as Tonight:
       a stated clock, else the weekday, else OPEN. */
    const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const rail = (e) => {
      const m = window.WA.when.statedMinutes(e);
      if (m != null) {
        return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      }
      if (window.WA.when.isTonight(e)) return 'TON';
      const k = window.WA.when.resolveKey(e);
      return k ? DAY_ABBR[new Date(`${k}T12:00:00Z`).getUTCDay()] : 'OPEN';
    };
    host.innerHTML = `<section class="wa-section">
      <h2 class="wa-section-title">On this week</h2>
      <p class="wa-section-sub">${esc(`${soon.length} of what's coming up`)}</p>
      <ul class="wa-rows">${soon.map(e => `<li><a class="wa-row" href="detail.html?id=${esc(encodeURIComponent(e.id))}">
        <span class="wa-row__rail"><span class="wa-row__time">${esc(rail(e))}</span></span>
        <span class="wa-row__body">
          <span class="wa-row__title">${esc(e.title || '')}</span>
          <span class="wa-row__meta">${esc([e.kind, e.venue].filter(Boolean).join(' · '))}</span>
        </span></a></li>`).join('')}</ul>
    </section>`;
  };

  document.addEventListener('wa:catalog-ready', render);
  if (window.WA && window.WA.catalog) render();
})();
