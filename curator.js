/* ============================================================
   WanderAlt — Curator profile page
   ------------------------------------------------------------
   Reads ?handle=<encoded> from the URL, finds the curator in
   window.WA.curators (catalog.js), renders their profile and
   all their picks from window.WA.catalog.

   Layout (voice-first):
     ← Back link
     Handle (large mono, accent)
     Tagline (display italic, muted)
     ──────
     Bio (body serif)
     ──────
     Picks by this curator (list-row format)
     Colophon

   Load order (curator.html):
     catalog.js → supabase.js → auth.js → bookmark.js → curator.js
   ============================================================ */
(() => {
  const buildMeta = (entry) => {
    const parts = [entry.neighborhood, entry.kind];
    if (entry.day && entry.day !== 'Tonight') parts.push(`${entry.day} ${entry.time}`);
    else if (entry.time)                      parts.push(entry.time);
    return parts.filter(Boolean).join(' · ');
  };

  const bookmarkSVG = () =>
    `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
         stroke-width="1.25" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
       <path d="M6 3h12v18l-6-4-6 4V3z" />
     </svg>`;

  /* Infer a labelled back link from the previous page. */
  const backLink = () => {
    try {
      const ref = new URL(document.referrer).pathname;
      if (ref.endsWith('venue.html'))   return { href: document.referrer, label: '&larr; Pick' };
      if (ref.endsWith('search.html'))  return { href: './search.html',   label: '&larr; Search' };
      if (ref.endsWith('map.html'))     return { href: './map.html',      label: '&larr; Map' };
    } catch (_) { /* cross-origin or empty referrer */ }
    return { href: './index.html', label: '&larr; Briefing' };
  };

  const render = (curator, picks) => {
    const main = document.getElementById('curator-main');
    if (!main) return;

    document.title = `WanderAlt — ${curator.name || curator.handle} · Tallinn`;
    const descEl = document.querySelector('meta[name="description"]');
    const descText = curator.tagline || `${curator.handle} curates alternative Tallinn.`;
    if (descEl) descEl.content = descText;

    /* OG / Twitter card */
    const OG_BASE = (window.WA && window.WA.BASE_URL)
      ? `${window.WA.BASE_URL}/functions/v1/og-image`
      : null;
    if (OG_BASE) {
      const ogImg = `${OG_BASE}?handle=${encodeURIComponent(curator.handle)}`;
      document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')
        .forEach(m => m.setAttribute('content', ogImg));
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', `WanderAlt — ${curator.name || curator.handle} · Tallinn`);
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', descText);
    }

    const { href, label } = backLink();

    /* Cap the displayed list; show a note if the catalog has more. */
    const MAX_SHOWN = 30;
    const shown     = picks.slice(0, MAX_SHOWN);
    const remaining = picks.length - shown.length;

    main.innerHTML = `
      <a class="venue-back" href="${href}">${label}</a>

      <article aria-label="Curator: ${curator.handle}">

        <div class="curator-profile">
          <p class="curator-profile__handle">${curator.handle}</p>
          ${curator.tagline ? `<p class="curator-profile__tagline">${curator.tagline}</p>` : ''}
        </div>

        ${curator.bio ? `
        <hr class="rule" style="margin-bottom:var(--s-5)">
        <p class="curator-profile__bio">${curator.bio}</p>
        ` : ''}

        ${picks.length ? `
        <hr class="rule" style="margin: var(--s-7) 0 0">
        <section aria-labelledby="picks-label">
          <header class="search-section-head">
            <p id="picks-label" class="eyebrow">${picks.length} pick${picks.length !== 1 ? 's' : ''} in Tallinn</p>
          </header>
          <ol class="list-rows" role="list">
            ${shown.map(e => {
              const isMarked = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[e.id]);
              return `<li class="list-row list-row--bookmarkable">
                 <div>
                   <p class="list-row__title">
                     <a href="venue.html?id=${e.id}">${e.title}</a>
                   </p>
                   <p class="list-row__meta">${buildMeta(e)}</p>
                   <p class="list-row__quote">&mdash; ${e.quote}</p>
                 </div>
                 <label class="bookmark">
                   <input type="checkbox" class="bookmark__check" data-id="${e.id}"
                          aria-label="Bookmark: ${e.title}" ${isMarked ? 'checked' : ''}>
                   ${bookmarkSVG()}
                 </label>
               </li>`;
            }).join('')}
          </ol>
          ${remaining > 0 ? `<p class="meta" style="margin-top:var(--s-3)">Showing 30 of ${picks.length} picks.</p>` : ''}
        </section>` : `
        <p class="empty-line" style="margin-top:var(--s-6)">No current picks from this curator.</p>
        `}

      </article>

      <footer class="colophon">
        <p class="colophon__line">WanderAlt &middot; Tallinn edition &middot; Curated by humans, not algorithms.</p>
      </footer>
    `;
  };

  const renderNotFound = () => {
    const main = document.getElementById('curator-main');
    if (!main) return;
    const { href, label } = backLink();
    main.innerHTML = `
      <a class="venue-back" href="${href}">${label}</a>
      <p class="empty-line">Curator not found.</p>
    `;
  };

  const init = () => {
    const curators = (window.WA && window.WA.curators) || [];
    const catalog  = (window.WA && window.WA.catalog)  || [];

    const raw    = new URLSearchParams(window.location.search).get('handle') || '';
    const handle = decodeURIComponent(raw);
    const picks  = catalog.filter(e => e.handle === handle);

    /* Prefer the static curators table (which has bios + taglines).
       Fall back to a synthesised profile if the handle exists only in
       the live catalog — e.g. handles added via the ingest pipeline. */
    const curator = curators.find(c => c.handle === handle)
                 || (picks.length ? { handle, tagline: '', bio: '' } : null);

    if (!curator) { renderNotFound(); return; }

    render(curator, picks);

    /* Wire bookmark toggles. */
    if (window.WA.Bookmarks) {
      document.addEventListener('change', (e) => {
        const cb = e.target.closest('.bookmark__check');
        if (!cb) return;
        window.WA.Bookmarks.set(cb.dataset.id, cb.checked);
      });

      /* Re-sync checkbox states when cloud bookmarks arrive. */
      document.addEventListener('wa:bookmarks-synced', () => {
        const store = window.WA.Bookmarks.get();
        document.querySelectorAll('.bookmark__check').forEach(cb => {
          cb.checked = !!(store[cb.dataset.id]);
        });
      });
    }
  };

  document.addEventListener('wa:catalog-ready', init);
})();
