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
    /* Going rows: show neighborhood · kind · time (day already in time-col) */
    if (entry.day) {
      parts.push(entry.neighborhood, entry.kind);
      if (entry.time) parts.push(entry.time);
    } else {
      /* Reading rows (places): neighborhood · kind · hours if set */
      parts.push(entry.venue || entry.neighborhood, entry.kind);
      if (entry.time) parts.push(entry.time);
    }
    return parts.filter(Boolean).join(' · ');
  };

  /* ── Row builders ─────────────────────────────────────────── */

  const curatorHref = (handle) =>
    `curator.html?handle=${encodeURIComponent(handle)}`;

  const venueHref = (id) => `venue.html?id=${encodeURIComponent(id)}`;

  /* Going row — two-column grid with day label on the left. */
  const goingRow = (entry) => {
    const li = document.createElement('li');
    li.className        = 'list-row list-row--going';
    li.dataset.catalogId = entry.id;
    li.innerHTML =
      `<p class="list-row__time">${entry.day === 'Tonight' ? 'Now' : entry.day}</p>
       <div>
         <p class="list-row__title">
           <a href="${venueHref(entry.id)}">${entry.title}</a>
         </p>
         <p class="list-row__meta">${buildMeta(entry)}</p>
         <p class="list-row__quote">
           &mdash; ${entry.quote}
           <a class="handle" href="${curatorHref(entry.handle)}">${entry.handle}</a>
         </p>
       </div>`;
    return li;
  };

  /* Reading row — standard single-column row. */
  const readingRow = (entry) => {
    const li = document.createElement('li');
    li.className        = 'list-row';
    li.dataset.catalogId = entry.id;
    li.innerHTML =
      `<p class="list-row__title">
         <a href="${venueHref(entry.id)}">${entry.title}</a>
       </p>
       <p class="list-row__meta">${buildMeta(entry)}</p>
       <p class="list-row__quote">
         &mdash; ${entry.quote}
         <a class="handle" href="${curatorHref(entry.handle)}">${entry.handle}</a>
       </p>`;
    return li;
  };

  /* Empty-state row shown when a dynamic segment has no items. */
  const emptyRow = (msg) => {
    const li = document.createElement('li');
    li.className = 'list-row';
    li.dataset.empty = 'true';
    li.innerHTML =
      `<p style="font-family:var(--ff-mono);font-size:var(--fs-meta);
                 color:var(--c-ink-mute);letter-spacing:0.04em">${msg}</p>`;
    return li;
  };

  /* ── Render ──────────────────────────────────────────────── */

  const renderLists = () => {
    const catalog       = (window.WA && window.WA.catalog) || [];
    const bookmarkedIds = window.WA.Bookmarks ? window.WA.Bookmarks.ids() : [];

    const bookmarked    = catalog.filter(e => bookmarkedIds.includes(e.id));
    const goingEntries  = bookmarked.filter(e => !!e.day)
                                    .sort((a, b) => dayRank(a.day) - dayRank(b.day));
    const readingEntries = bookmarked.filter(e => !e.day);

    /* ── Going ── */
    const goingList = document.querySelector('.list-rows--going');
    if (goingList) {
      goingList.querySelectorAll('[data-catalog-id], [data-empty]').forEach(el => el.remove());
      if (goingEntries.length) {
        goingEntries.forEach(e => goingList.appendChild(goingRow(e)));
      } else {
        goingList.appendChild(emptyRow('No upcoming events bookmarked.'));
      }
    }

    /* ── Reading ── */
    const readingList = document.querySelector('.list-rows--reading');
    if (readingList) {
      readingList.querySelectorAll('[data-catalog-id], [data-empty]').forEach(el => el.remove());
      if (readingEntries.length) {
        readingEntries.forEach(e => readingList.appendChild(readingRow(e)));
      } else {
        readingList.appendChild(emptyRow('No places saved yet.'));
      }
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

    if (goingTab)   goingTab.textContent   = String(goingCount);
    if (readingTab) readingTab.textContent = String(readingCount);
    if (pastTab)    pastTab.textContent    = String(pastCount);

    const head = document.querySelector('.reading-head__count');
    if (head) {
      head.textContent =
        `${goingCount + readingCount} active · ${pastCount} past`;
    }
  };

  document.addEventListener('wa:catalog-ready',     renderLists);
  document.addEventListener('wa:bookmarks-synced',  renderLists);
})();
