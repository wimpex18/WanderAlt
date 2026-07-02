/* ============================================================
   WanderAlt — Saved page
   ------------------------------------------------------------
   Reads bookmarked IDs from window.WA.Bookmarks and renders
   matching catalog entries into the three segments:

     Going   — bookmarked entries with day set (upcoming events).
               Grid rows with a left time-column (.list-row--going).
               Sorted: Tonight first, then Mon→Sun.

     Reading — bookmarked entries without day (permanent places).
               Standard rows without a time-column.

     Past    — kept as static HTML; no dynamic data model for
               past attendance yet. Stays as-is until a
               check-in / attended-at feature is built.

   Empty state: if a segment has no items a single muted note
   is shown so the segment doesn't look broken.

   Re-renders on both wa:catalog-ready and wa:bookmarks-synced
   so cloud-synced bookmarks appear without a page reload.

   Load order in saved.html:
     catalog.js → city.js → supabase.js → auth.js → bookmark.js → saved.js
   ============================================================ */
(() => {
  /* Day sort order for Going: Tonight first, then Mon→Sun. */
  const DAY_ORDER = ['Tonight', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayRank   = (d) => { const i = DAY_ORDER.indexOf(d); return i === -1 ? 99 : i; };

  /* ── Meta string ─────────────────────────────────────────── */

  const buildMeta = (entry) => {
    const parts = [];
    /* 'other' is a data bucket, not a place — never print it (F-12). */
    const nhood = entry.neighborhood && entry.neighborhood.toLowerCase() !== 'other' ? entry.neighborhood : null;
    /* Going rows: show neighborhood · kind · time (day already in time-col) */
    if (entry.day) {
      parts.push(nhood, entry.kind);
      if (entry.time) parts.push(entry.time);
    } else {
      /* Reading rows (places): neighborhood · kind · hours if set */
      parts.push(entry.venue || nhood, entry.kind);
      if (entry.time) parts.push(entry.time);
    }
    return parts.filter(Boolean).join(' · ');
  };

  /* Shared render helpers — single implementation in ui-helpers.js (P1).
     (buildMeta stays local: Going rows carry the day in a separate time
     column, so Saved's meta line differs from the standard one.) */
  const { isEchoQuote } = window.WA.UI;
  const mediaHtml = window.WA.UI.rowMedia;

  /* ── Row builders ─────────────────────────────────────────── */

  const curatorHref = (handle) =>
    `curator.html?handle=${encodeURIComponent(handle)}`;

  const venueHref = (id) => `venue.html?id=${encodeURIComponent(id)}`;

  /* Photo media tile — reuses the app's duotone .thumb--lg treatment so
     Saved matches the Discover photo cards. Falls back to the initials
     tile when the entry has no image. Decorative supplementary link. */

  /* Going row — day label · photo · body grid. */
  const goingRow = (entry) => {
    const li = document.createElement('li');
    li.className        = 'list-row list-row--going list-row--card';
    li.dataset.catalogId = entry.id;
    li.innerHTML =
      `<p class="list-row__time${entry.day === 'Tonight' ? ' list-row__time--live' : ''}">${entry.day === 'Tonight' ? 'Tonight' : entry.day}</p>
       ${mediaHtml(entry)}
       <div class="list-row__body">
         <p class="list-row__title">
           <a href="${venueHref(entry.id)}">${entry.title}</a>${entry.__change ? ` <span class="list-row__changed">${entry.__change}</span>` : ''}
         </p>
         <p class="list-row__meta">${buildMeta(entry)}</p>
         ${isEchoQuote(entry)
           ? `<p class="list-row__quote">via <a class="handle" href="${curatorHref(entry.handle)}">${entry.handle}</a></p>`
           : `<p class="list-row__quote">
           &mdash; ${entry.quote}
           <a class="handle" href="${curatorHref(entry.handle)}">${entry.handle}</a>
         </p>`}
       </div>`;
    return li;
  };

  /* Reading row — photo · body card (matches Discover). */
  const readingRow = (entry) => {
    const li = document.createElement('li');
    li.className        = 'list-row list-row--card';
    li.dataset.catalogId = entry.id;
    li.innerHTML =
      `${mediaHtml(entry)}
       <div class="list-row__body">
         <p class="list-row__title">
           <a href="${venueHref(entry.id)}">${entry.title}</a>
         </p>
         <p class="list-row__meta">${buildMeta(entry)}</p>
         ${isEchoQuote(entry)
           ? `<p class="list-row__quote">via <a class="handle" href="${curatorHref(entry.handle)}">${entry.handle}</a></p>`
           : `<p class="list-row__quote">
           &mdash; ${entry.quote}
           <a class="handle" href="${curatorHref(entry.handle)}">${entry.handle}</a>
         </p>`}
       </div>`;
    return li;
  };

  /* Empty-state row shown when a dynamic segment has no items — the
     crafted .picks-empty card (city plate + title + sub), same canon as
     Today and the place page; bare mono one-liners read as broken (F-4). */
  const emptyRow = (title, subHTML) => {
    const li = document.createElement('li');
    li.dataset.empty = 'true';
    const city = localStorage.getItem('wa:city') || 'tallinn';
    li.innerHTML =
      `<div class="picks-empty">
         <div class="picks-empty__plate" style="background-image:url('./assets/${city}-overview.svg')" aria-hidden="true"></div>
         <div class="picks-empty__body">
           <p class="picks-empty__title">${title}</p>
           <p class="picks-empty__sub">${subHTML}</p>
         </div>
       </div>`;
    return li;
  };

  /* ── Taste nudge (on-device, shared idea with Today / Discover) ──
     When the reader has a taste profile, surface their kind of place first
     in Reading. Stable sort: 0-score ties keep catalog order, so curation
     stays primary. Nothing leaves the device. */
  const tastePrefsSet = () =>
    Object.keys(window.WA?.taste?.getPrefs?.() || {}).length > 0;
  const tasteOrder = (arr) => {
    const ts = window.WA?.taste?.tasteScore;
    if (!ts || !tastePrefsSet()) return arr;
    return [...arr].sort((a, b) => ts(b) - ts(a));
  };

  /* ── Change watch (A2) ──────────────────────────────────────
     Snapshot each bookmarked pick so we can flag, on the reader's own
     device, when a saved event's day/time changes since they last looked,
     or when it's pulled from the listings entirely (cancelled / moved /
     deduplicated away). On-device only — nothing is sent anywhere. */
  const SNAP_KEY = 'wa:saved-snapshots';
  const loadSnaps = () => {
    try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '{}'); }
    catch { return {}; }
  };
  const saveSnaps = (s) => {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(s)); } catch (_) { /* storage blocked */ }
  };
  const snapOf = (e) => ({
    id: e.id, title: e.title, venue: e.venue, neighborhood: e.neighborhood,
    kind: e.kind, day: e.day || '', time: e.time || '', handle: e.handle,
  });

  /* Compact "no longer listed" row, rendered from the last snapshot of a
     bookmarked pick that has dropped out of the active catalog. Dismiss
     removes the bookmark (and its snapshot) so the row clears. */
  const goneRow = (snap) => {
    const li = document.createElement('li');
    li.className = 'list-row list-row--gone';
    li.dataset.catalogId = snap.id;
    li.innerHTML =
      `<div class="list-row__body">
         <p class="list-row__title">${snap.title || 'Saved event'} <span class="list-row__cancelled">no longer listed</span></p>
         <p class="list-row__meta">${buildMeta(snap)}</p>
         <p class="list-row__quote">Pulled from the listings &mdash; it may have been cancelled or moved.
           <button type="button" class="list-row__dismiss" data-dismiss="${snap.id}">Dismiss</button>
         </p>
       </div>`;
    return li;
  };

  /* ── Render ──────────────────────────────────────────────── */

  const renderLists = () => {
    /* Use the all-cities snapshot so a user who bookmarked a Riga pick
       while on Tallinn (or vice versa) still sees it in their reading
       list. The user's saved list is a global state — it shouldn't
       silently filter by the active city setting. */
    const catalog       = (window.WA?._catalogAll)
                       || (window.WA?.catalog) || [];
    const bookmarkedIds = window.WA.Bookmarks ? window.WA.Bookmarks.ids() : [];

    const bookmarked    = catalog.filter(e => bookmarkedIds.includes(e.id));
    const goingEntries  = bookmarked.filter(e => !!e.day)
                                    .sort((a, b) => dayRank(a.day) - dayRank(b.day));
    /* Reading has no inherent order (undated saves), so it's the natural
       place for the gentle on-device taste nudge (same idea as Today's This
       Week and Discover's Relevance sort). Going stays soonest-first — an
       explicit chronological intent that taste must not override. */
    const readingEntries = tasteOrder(bookmarked.filter(e => !e.day));

    /* ── Change watch (A2) ──
       Flag day/time changes on dated picks vs the last snapshot, collect
       bookmarked picks that have dropped out of the catalog (cancelled /
       moved / deduped), then refresh snapshots for everything still present
       and prune snapshots for picks no longer bookmarked. */
    const snaps = loadSnaps();
    goingEntries.forEach(e => {
      const s = snaps[e.id];
      if (s && (s.day !== (e.day || '') || s.time !== (e.time || ''))) {
        e.__change = s.day !== (e.day || '') ? 'date changed' : 'time changed';
      }
    });
    const present = new Set(catalog.map(e => e.id));
    /* Gone-detection ONLY against live data (WA.DATA_LIVE): the static
       fallback holds a fraction of the live catalog, so diffing against
       it would flag every live bookmark as "no longer listed" — with a
       destructive Dismiss attached (ROADMAP P0). Time-changed badges
       stay ungated (they compare snapshot-to-entry, not presence). */
    const gone = (window.WA && window.WA.DATA_LIVE)
      ? bookmarkedIds.filter(id => !present.has(id) && snaps[id]).map(id => snaps[id])
      : [];
    bookmarked.forEach(e => { snaps[e.id] = snapOf(e); });
    Object.keys(snaps).forEach(id => { if (!bookmarkedIds.includes(id)) delete snaps[id]; });
    saveSnaps(snaps);

    /* ── Going ── (gone/cancelled rows surface first so they're noticed) */
    const goingList = document.querySelector('.list-rows--going');
    if (goingList) {
      goingList.querySelectorAll('[data-catalog-id], [data-empty]').forEach(el => el.remove());
      gone.forEach(s => goingList.appendChild(goneRow(s)));
      if (goingEntries.length) {
        goingEntries.forEach(e => goingList.appendChild(goingRow(e)));
        /* Calm summary plate under the dated rows (July 2026 board 1e):
           states the lifecycle rule and bridges to Discover. data-empty
           opts it into the per-render cleanup above. */
        const n     = goingEntries.length;
        const words = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const count = words[n] || String(n);
        const foot  = document.createElement('li');
        foot.dataset.empty = 'true';
        foot.innerHTML =
          `<div class="saved-foot">
             <p class="saved-foot__line">${count} ${n === 1 ? 'night' : 'nights'} on the calendar.</p>
             <p class="saved-foot__sub">Dated picks move to Past the morning after.
               <a href="./discover.html?time=thisweek">Browse this week &rarr;</a></p>
           </div>`;
        goingList.appendChild(foot);
      } else if (!gone.length) {
        goingList.appendChild(emptyRow('Nothing on the calendar yet',
          'Save a dated pick and it lands here. <a href="./discover.html?time=thisweek">Browse this week &rarr;</a>'));
      }
    }

    /* ── Reading ── */
    const readingList = document.querySelector('.list-rows--reading');
    if (readingList) {
      readingList.querySelectorAll('[data-catalog-id], [data-empty]').forEach(el => el.remove());
      if (readingEntries.length) {
        readingEntries.forEach(e => readingList.appendChild(readingRow(e)));
      } else {
        readingList.appendChild(emptyRow('No saves yet',
          'Bookmark places and writing to come back to. <a href="./discover.html?type=places">Browse places &rarr;</a>'));
      }
    }

    /* One quiet cue when the taste nudge actually reordered Reading — the
       "tuned to you" text links to the taste check on Today (mirrors
       Discover). No per-card badges. */
    const readingNote = document.querySelector('.seg-note--reading');
    if (readingNote) {
      readingNote.innerHTML = (tastePrefsSet() && readingEntries.length)
        ? 'saved, no date set · <a class="taste-cue" href="index.html#taste-onboarding">tuned to you</a>'
        : 'saved, no date set';
    }

    /* ── Update counts ── */
    updateCounts(goingEntries.length, readingEntries.length);
  };

  const updateCounts = (goingCount, readingCount) => {
    const pastList   = document.querySelector('.list-rows--past');
    const pastCount  = pastList
      ? pastList.querySelectorAll('.list-row:not([data-empty])').length
      : 0;

    const goingTab   = document.querySelector('label[for="seg-going"]   .seg-tab__count');
    const readingTab = document.querySelector('label[for="seg-reading"] .seg-tab__count');
    const pastTab    = document.querySelector('label[for="seg-past"]    .seg-tab__count');

    /* The active segment's count renders as the one lime badge (live-state
       signal) — except when it's 0, where a spotlit zero would read wrong.
       CSS keys the badge on :checked + :not(.seg-tab__count--zero). */
    const setCount = (el, n) => {
      if (!el) return;
      el.textContent = String(n);
      el.classList.toggle('seg-tab__count--zero', n === 0);
    };
    setCount(goingTab,   goingCount);
    setCount(readingTab, readingCount);
    setCount(pastTab,    pastCount);

    const head = document.getElementById('saved-count');
    if (head) {
      head.textContent =
        `${goingCount + readingCount} active · ${pastCount} past`;
    }
  };

  /* Dismiss a "no longer listed" row → drop the bookmark (and its
     snapshot), but leave an Undo behind for ~8s — Dismiss is otherwise
     a one-tap destructive action on data the diff might have gotten
     wrong (ROADMAP P0). Undo restores both bookmark and snapshot. */
  let undoStash = null;   /* { id, snap } of the last dismissal */
  document.addEventListener('click', (e) => {
    const undoBtn = e.target.closest('.list-row__undo');
    if (undoBtn) {
      const id = undoBtn.dataset.undo;
      if (window.WA?.Bookmarks) window.WA.Bookmarks.set(id, true);
      if (undoStash && undoStash.id === id && undoStash.snap) {
        const snaps = loadSnaps();
        snaps[id] = undoStash.snap;
        saveSnaps(snaps);
      }
      undoStash = null;
      renderLists();
      return;
    }
    const btn = e.target.closest('.list-row__dismiss');
    if (!btn) return;
    const id = btn.dataset.dismiss;
    const snaps = loadSnaps();
    undoStash = { id, snap: snaps[id] };
    if (window.WA?.Bookmarks) window.WA.Bookmarks.set(id, false);
    delete snaps[id];
    saveSnaps(snaps);
    const li = btn.closest('li');
    if (li) {
      li.innerHTML =
        `<div class="list-row__body">
           <p class="list-row__quote">Removed from Saved.
             <button type="button" class="list-row__undo" data-undo="${id}">Undo</button>
           </p>
         </div>`;
      setTimeout(() => {
        if (undoStash && undoStash.id === id) { undoStash = null; renderLists(); }
      }, 8000);
    } else {
      renderLists();
    }
  });

  document.addEventListener('wa:catalog-ready',     renderLists);
  document.addEventListener('wa:bookmarks-synced',  renderLists);
})();
