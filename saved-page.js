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

  /* Guarded: detail.html shipped without toast.js and the unguarded call
     threw, aborting the handler it sat in -- so the list toggled, the
     label never refreshed, and nothing said why. A missing optional
     module must degrade, not break the interaction around it. */
  const toast = (msg, label, undo) => {
    if (window.WA.Toast && window.WA.Toast.show) window.WA.Toast.show(msg, label, undo);
  };

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
      /* 3b prints how long ago and then says the plain thing: "the
         source stopped listing it four days ago. Probably cancelled."
         The elapsed part is real -- past.created_at is when we archived
         it -- and "probably" is the hedge the design chose, because a
         Fienta absence is under-processing rather than a cancellation
         (see the reconcile-absent note in CLAUDE.md). */
      const ago = dead && dead.archivedAt ? agoWords(dead.archivedAt) : '';
      out.gone.push({
        id,
        title: dead ? (dead.title || id) : id,
        venue: dead ? dead.venue : '',
        city: dead ? dead.city : '',
        __why: ago ? `the source stopped listing it ${ago}` : 'the source stopped listing it',
        __guess: ago ? 'Probably cancelled.' : '',
      });
    }

    out.dated.sort(window.WA.Geo.bySoonestThenDistance());
    return out;
  };

  /* "four days ago" -- plain words, no clock. Anything inside a day is
     "today", because "3 hours ago" invites a precision we do not have:
     the archiver runs on a schedule, not at the moment a listing died. */
  const agoWords = (iso) => {
    const ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms) || ms < 0) return '';
    const d = Math.floor(ms / 86400000);
    if (d < 1)  return 'today';
    if (d === 1) return 'yesterday';
    if (d < 14) return `${d} days ago`;
    if (d < 60) return `${Math.round(d / 7)} weeks ago`;
    return `${Math.round(d / 30)} months ago`;
  };

  const cityOf = (e) => e.city || window.WA.CITY;

  /* Everything a bookmark can point at, for the mosaic's id lookup. */
  const pool = () => [
    ...(window.WA._catalogAll || window.WA.catalog || []),
    ...(window.WA._venuesAll  || window.WA.venues  || []),
  ];

  const cityLabel = (id) => {
    const c = (window.WA.CITIES || []).find(x => x.id === id);
    return c ? c.label.charAt(0) + c.label.slice(1).toLowerCase() : (id || '');
  };

  const inCity = (e) => cityFilter === 'all' || cityOf(e) === cityFilter;

  /* A chosen list narrows exactly like a city chip does, so the two
     compose instead of fighting. */
  const inList = (e) => {
    if (!listFilter || !window.WA.Lists) return true;
    return window.WA.Lists.items(listFilter).includes(e.id);
  };

  const shown = (arr) => arr.filter(inCity).filter(inList);

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
    /* Same arrow form as Tonight (1a): a place says when it shuts. */
    if (e.__place || e.openingHours) {
      const h = e.openingHours && window.WA.Hours.rail(e.openingHours);
      return h || 'OPEN';
    }
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
        <span>${esc(e.title || e.id)} — ${esc(e.__why)}.${e.__guess ? ` ${esc(e.__guess)}` : ''}
        <button class="wa-linkbtn" type="button" data-unsave="${esc(e.id)}">Remove</button></span>
      </p>`).join('')}
    </section>` : '';

  /* Viewing one list narrows every block below, the same way the city
     chips do. Kept as page state rather than a URL param because a
     list id is meaningless on another device and Saved is local-first. */
  let listFilter = '';

  /* Up to four tiles from the list's own contents (5f). A photo when
     there is one, the category mark otherwise -- never a grey box. */
  const mosaic = (ids) => {
    const byId = Object.fromEntries(pool().map(e => [e.id, e]));
    const tiles = ids.map(id => byId[id]).filter(Boolean).slice(0, 4);
    if (!tiles.length) {
      return `<span class="wa-list-card__mosaic"><span class="wa-list-card__tile"></span></span>`;
    }
    return `<span class="wa-list-card__mosaic">${tiles.map(e => {
      const photo = e.imageUrl ? UI().safeUrl(e.imageUrl) : '';
      const mark  = window.WA.Marks ? window.WA.Marks.markFor(e.kind) : 'place';
      return `<span class="wa-list-card__tile">${photo
        ? `<img src="${esc(window.WA.img ? window.WA.img(photo, 200) : photo)}" alt="" loading="lazy">`
        : `<svg aria-hidden="true"><use href="#wa-mark-${esc(mark)}"></use></svg>`}</span>`;
    }).join('')}</span>`;
  };

  const listsBlock = () => {
    const L = window.WA.Lists;
    if (!L) return '';
    const lists = L.forCity(window.WA.CITY);
    const goneIds = new Set(gather().gone.map(g => g.id));

    /* The section exists even with no lists, because it is the only
       place to make one -- an invitation, not an empty state. */
    const cards = lists.map(l => {
      const n = (l.items || []).length;
      const expired = (l.items || []).filter(id => goneIds.has(id)).length;
      const sub = expired
        ? `${n} saved · <em>${expired} expired</em>`
        : `${n} ${n === 1 ? 'saved' : 'saved'} · ${esc(cityLabel(l.city))}`;
      return `<li><button class="wa-list-card" type="button" data-list="${esc(l.id)}"
                aria-pressed="${listFilter === l.id}">
        ${mosaic(l.items || [])}
        <span class="wa-list-card__name">${esc(l.name)}</span>
        <span class="wa-list-card__sub">${sub}</span>
      </button></li>`;
    }).join('');

    return `<section class="wa-section">
      <h2 class="wa-section-title">Lists</h2>
      <p class="wa-section-sub">${esc(lists.length
        ? `${lists.length} ${lists.length === 1 ? 'list' : 'lists'} · tap to narrow`
        : 'Group saves into a day out, a trip, a weekend')}</p>
      ${cards ? `<ul class="wa-lists">${cards}</ul>` : ''}
      <p style="margin-top:var(--s-4)"><button class="wa-btn" type="button" id="new-list">New list</button>
      ${listFilter ? `<button class="wa-btn wa-btn--quiet" type="button" data-list="">Show everything saved</button>` : ''}</p>
    </section>`;
  };

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

    const dated = shown(all.dated);
    const anytime = shown(all.anytime);
    const L = window.WA.Lists;
    const viewing = listFilter && L ? L.byId(listFilter) : null;

    if (viewing) {
      $('saved-title').textContent = viewing.name;
      $('saved-sub').textContent = `${dated.length + anytime.length} IN THIS LIST`;
    }

    $('saved-body').innerHTML =
      listsBlock() +
      block("Happening while you're here", `${dated.length} dated · soonest first`, dated) +
      block('Places, for whenever', `${anytime.length} with no date`, anytime) +
      (viewing ? '' : goneBlock(all.gone));
  };

  /* ── The add-to-list sheet ───────────────────────────────────
     One question at a time, same as every other sheet in the product:
     the lists this pick is already in, checked, then one field to make
     a new one. Closing is the only way out and nothing is destructive,
     so there is no confirm step. */
  const sheet = () => document.getElementById('sheet');

  const openSheet = (pickId) => {
    const d = sheet();
    if (!d || !window.WA.Lists) return;
    const L = window.WA.Lists;
    const lists = L.forCity(window.WA.CITY);
    const inThem = new Set(L.listsFor(pickId).map(l => l.id));

    document.getElementById('sheet-title').textContent = 'Add to a list';
    document.getElementById('sheet-body').innerHTML = `
      ${lists.length ? `<div class="wa-chips">${lists.map(l => `
        <button class="wa-chip" type="button" data-toggle-list="${esc(l.id)}" data-pick="${esc(pickId)}"
                aria-pressed="${inThem.has(l.id)}">${esc(l.name)}</button>`).join('')}</div>`
        : `<p class="wa-detail__note">No lists yet. Name one and this goes straight into it.</p>`}
      <div class="wa-field" style="margin-top:var(--s-5)">
        <label class="wa-field__label" for="list-name">New list</label>
        <input class="wa-input" id="list-name" type="text" maxlength="60"
               placeholder="Kalamaja day off" autocomplete="off">
      </div>`;
    document.getElementById('sheet-foot').innerHTML =
      `<button class="wa-btn wa-btn--primary" type="button" id="list-create" data-pick="${esc(pickId)}" style="flex:1">Create and add</button>`;
    d.showModal();
  };

  const closeSheet = () => { const d = sheet(); if (d && d.open) d.close(); };

  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#sheet-close')) { closeSheet(); return; }

    /* Toggle membership from the sheet. */
    const tog = e.target.closest && e.target.closest('[data-toggle-list]');
    if (tog) {
      const L = window.WA.Lists;
      const listId = tog.dataset.toggleList, pickId = tog.dataset.pick;
      const on = tog.getAttribute('aria-pressed') === 'true';
      if (on) L.removeItem(listId, pickId); else L.add(listId, pickId);
      tog.setAttribute('aria-pressed', String(!on));
      const l = L.byId(listId);
      if (!on && l) toast(`Saved to ${l.name}`, 'Undo', () => {
        L.removeItem(listId, pickId); render();
      });
      render();
      return;
    }

    /* Create a list, optionally with a pick going straight into it. */
    const mk = e.target.closest && e.target.closest('#list-create, #new-list');
    if (mk) {
      const input = document.getElementById('list-name');
      const name = input ? input.value : '';
      if (mk.id === 'new-list' && !input) {
        /* Opened from the Lists section rather than a row: same sheet,
           no pick attached. */
        openSheet('');
        return;
      }
      const L = window.WA.Lists;
      const id = L.create(name);
      if (!id) { if (input) input.focus(); return; }
      const pickId = mk.dataset.pick;
      if (pickId) L.add(id, pickId);
      closeSheet();
      render();
      toast(pickId ? `Saved to ${L.byId(id).name}` : `List "${L.byId(id).name}" created`,
        'Undo', () => { L.remove(id); render(); });
      return;
    }

    const addBtn = e.target.closest && e.target.closest('[data-addlist]');
    if (addBtn) {
      e.preventDefault();
      e.stopPropagation();
      openSheet(addBtn.dataset.addlist);
      return;
    }

    const lc = e.target.closest && e.target.closest('[data-list]');
    if (lc) { listFilter = lc.dataset.list || ''; render(); return; }

    const drop = e.target.closest && e.target.closest('[data-unsave]');
    if (drop) {
      e.preventDefault();
      e.stopPropagation();
      const id = drop.dataset.unsave;
      window.WA.Bookmarks.set(id, false);
      render();
      /* Every toast carries its reverse action (6d). */
      toast('Removed from saved', 'Undo', () => {
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
