/* ============================================================
   saved-page.js — Saved (5f). Replaces saved.js.
   ------------------------------------------------------------
   "Saved borrows their wishlist grid but sorts by EXPIRY, not by date
   added. Time-bound things first, in a card that says happening while
   you're here; then places for whenever; then the honest note about
   what died. A saved item that has quietly expired is the fastest way
   to lose trust in an automated catalogue."

   So there are three blocks and the order is the argument:

     1 Happening while you're here — dated, still ahead, soonest first
     2 Places, for whenever        — undated things and venues
     3 Gone since you saved it     — archived at the source

   Block 3 is the one that matters. We already compute the disappearance
   (archive_reason / archived_at); it just was not said out loud.
   ============================================================ */
(() => {
  'use strict';

  const $   = (id) => document.getElementById(id);
  const UI  = () => window.WA.UI;
  const esc = (s) => UI().esc(s);

  const PLACEHOLDER = /^(unknown|tba|tbc|n\/a|none|null|other|-)$/i;
  const real = (v) => {
    const s = String(v == null ? '' : v).trim();
    return s && !PLACEHOLDER.test(s) ? s : '';
  };

  let cityFilter = 'all';

  /* ── Gather ──────────────────────────────────────────────────
     Bookmarks are ids. They can point at a pick, at a venue, or at
     something that has since been archived — and the third case is the
     one the design cares most about. */
  const gather = () => {
    const ids = Object.keys((window.WA.Bookmarks && window.WA.Bookmarks.get()) || {});
    const picks  = window.WA._catalogAll || window.WA.catalog || [];
    const venues = window.WA._venuesAll  || window.WA.venues  || [];
    const past   = window.WA._pastAll    || window.WA.past    || [];

    const out = { dated: [], anytime: [], gone: [] };

    for (const id of ids) {
      const pick = picks.find(e => e.id === id);
      if (pick) {
        const key = window.WA.when.resolveKey(pick);
        const today = window.WA.when.todayKey();
        if (key && key >= today) out.dated.push(pick);
        else if (key && key < today) out.gone.push({ ...pick, __why: 'it has already happened' });
        else out.anytime.push(pick);
        continue;
      }
      const venue = venues.find(v => v.id === id);
      if (venue) { out.anytime.push({ ...venue, __place: true }); continue; }

      /* Not in either live table. The past table knows why, when it
         has the row; otherwise we say the honest minimum. */
      const dead = past.find(p => p.id === id);
      out.gone.push({
        id,
        title: dead ? (dead.title || id) : id,
        venue: dead ? dead.venue : '',
        city: dead ? dead.city : '',
        __why: 'the source stopped listing it',
      });
    }

    out.dated.sort(window.WA.Geo.bySoonestThenDistance());
    return out;
  };

  const cityOf = (e) => e.city || window.WA.CITY;

  const inCity = (e) => cityFilter === 'all' || cityOf(e) === cityFilter;

  /* ── Row ─────────────────────────────────────────────────────
     Same timetable row as everywhere else — one implementation per
     pattern. The rail carries the day, because on Saved the question is
     "will I still be here" rather than "what time". */
  const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  /* OPEN, not ANY, and never an empty rail. 3a's rule is
     page-independent: a row with no date prints OPEN rather than
     claiming a time we do not have. Saved used to say ANY for places and
     nothing at all for undated events -- two words and a blank for one
     idea, on the screen where the reader is comparing rows most
     directly. */
  const railFor = (e) => {
    if (e.__place) return 'OPEN';
    if (window.WA.when.isTonight(e)) return 'TON';
    const k = window.WA.when.resolveKey(e);
    return k ? DAY_ABBR[new Date(`${k}T12:00:00Z`).getUTCDay()] : 'OPEN';
  };

  const row = (e) => {
    const title = e.__place ? (e.name || '') : (e.title || '');
    /* Same degradation as Tonight: with no permission the distance slot
       falls back to the area so the rail keeps its second line and does
       not reflow when permission arrives later. */
    const measured = window.WA.Geo.distanceLabel(e);
    const area     = real(e.neighborhood);
    const dist     = measured || area;
    const meta  = [
      real(e.kind),
      e.__place ? (measured ? real(e.neighborhood) : '') : real(e.venue),
      real(e.time),
    ].filter(Boolean).join(' · ');
    return `<li><a class="wa-row" href="detail.html?id=${esc(encodeURIComponent(e.id))}">
      <span class="wa-row__rail">
        <span class="wa-row__time${window.WA.when.isTonight(e) ? ' wa-row__time--now' : ''}">${esc(railFor(e))}</span>
        <span class="wa-row__dist">${esc(dist)}</span>
      </span>
      <span class="wa-row__body">
        <span class="wa-row__title">${esc(title)}</span>
        <span class="wa-row__meta">${esc(meta)}</span>
      </span>
      <button class="wa-row__drop" type="button" data-unsave="${esc(e.id)}"
              aria-label="Remove ${esc(title)} from saved">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </a></li>`;
  };

  const block = (title, sub, items) => items.length ? `<section class="wa-section">
      <h2 class="wa-section-title">${esc(title)}</h2>
      <p class="wa-section-sub">${esc(sub)}</p>
      <ul class="wa-rows">${items.map(row).join('')}</ul>
    </section>` : '';

  /* Block 3 speaks plainly and is NOT a row list — a dead thing should
     not look tappable like a live one. */
  const goneBlock = (items) => items.length ? `<section class="wa-section">
      <h2 class="wa-section-title">Gone since you saved it</h2>
      <p class="wa-section-sub">${esc(`${items.length} no longer listed`)}</p>
      ${items.map(e => `<p class="wa-note" style="margin-top:var(--s-3)">
        <span>${esc(e.title || e.id)} — ${esc(e.__why)}.
        <button class="wa-linkbtn" type="button" data-unsave="${esc(e.id)}">Remove</button></span>
      </p>`).join('')}
    </section>` : '';

  const render = () => {
    const all = gather();
    const total = all.dated.length + all.anytime.length + all.gone.length;

    $('saved-title').textContent = total ? `${total} saved` : 'Nothing saved yet';
    $('saved-sub').textContent = total ? 'SOONEST TO EXPIRE FIRST' : '';

    /* City chips only earn their place when more than one city is in
       play — a single "All 12" chip is a control that cannot do
       anything. */
    const cities = [...new Set([...all.dated, ...all.anytime].map(cityOf))];
    $('scope').innerHTML = cities.length > 1
      ? [['all', 'All', total], ...cities.map(c => [c, c.charAt(0).toUpperCase() + c.slice(1),
          [...all.dated, ...all.anytime].filter(e => cityOf(e) === c).length])]
          .map(([id, label, n]) => `<button class="wa-scope__chip" type="button" data-city="${esc(id)}"
             aria-selected="${cityFilter === id}">${esc(label)} <span class="wa-chip__count">${n}</span></button>`).join('')
      : '';

    if (!total) {
      $('saved-body').innerHTML = `<div class="wa-empty">
        <p class="wa-empty__title">Your shortlist is empty.</p>
        <p class="wa-empty__body">The bookmark on any row keeps it here. Nothing is sent anywhere, and it works signed out.</p>
        <div class="wa-empty__actions">
          <a class="wa-btn wa-btn--primary" href="./discover.html">What's on tonight</a>
          <a class="wa-btn" href="./index.html">Explore</a>
        </div>
      </div>`;
      return;
    }

    $('saved-body').innerHTML =
      block("Happening while you're here", `${all.dated.filter(inCity).length} dated · soonest first`, all.dated.filter(inCity)) +
      block('Places, for whenever', `${all.anytime.filter(inCity).length} with no date`, all.anytime.filter(inCity)) +
      goneBlock(all.gone);
  };

  document.addEventListener('click', (e) => {
    const drop = e.target.closest && e.target.closest('[data-unsave]');
    if (drop) {
      e.preventDefault();
      e.stopPropagation();
      const id = drop.dataset.unsave;
      window.WA.Bookmarks.set(id, false);
      render();
      /* Every toast carries its reverse action (6d). */
      window.WA.Toast.show('Removed from saved', 'Undo', () => {
        window.WA.Bookmarks.set(id, true);
        render();
      });
      return;
    }
    const c = e.target.closest && e.target.closest('[data-city]');
    if (c) { cityFilter = c.dataset.city; render(); }
  });

  document.addEventListener('wa:catalog-ready', () => { render(); window.WA.Geo.userLoc(); });
  document.addEventListener('wa:location-ready', render);
  document.addEventListener('wa:bookmarks-synced', render);
  if (window.WA && window.WA.catalog && window.WA.catalog.length) render();
})();
