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
     Mood-tag filter chips (if ≥2 distinct tags)
     Picks by this curator (list-row format)
     Colophon

   Load order (curator.html):
     catalog.js → supabase.js → auth.js → bookmark.js → curator.js
   ============================================================ */
(() => {
  const buildMeta = (entry) => {
    const parts = [entry.neighborhood, entry.kind];
    if (entry.day && entry.day !== 'Tonight') parts.push(entry.time ? `${entry.day} ${entry.time}` : entry.day);
    else if (entry.time)                      parts.push(entry.time);
    return parts.filter(Boolean).join(' · ');
  };

  const bookmarkSVG = () =>
    `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
         stroke-width="1.25" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
       <path d="M6 3h12v18l-6-4-6 4V3z" />
     </svg>`;

  /* Gentle on-device taste nudge — same idea as Today / Discover / Saved.
     When the reader has a taste profile, surface this curator's picks that
     match their taste first. Stable sort: 0-score ties keep curation order,
     so the curator's own ordering stays primary. Nothing leaves the device. */
  const tastePrefsSet = () =>
    Object.keys(window.WA?.taste?.getPrefs?.() || {}).length > 0;
  const tasteOrder = (entries) => {
    const ts = window.WA?.taste?.tasteScore;
    if (!ts || !tastePrefsSet()) return entries;
    return [...entries].sort((a, b) => ts(b) - ts(a));
  };

  /* Photo media tile — reuses the app's .thumb--lg treatment so curator
     picks match the Discover / Saved photo cards. Falls back to the initials
     tile when the pick has no image. Decorative supplementary link. */
  const mediaHtml = (e) => {
    const imgUrl = e.imageUrl || e.image_url || null;
    const initials = (e.thumbInitials || e.thumb_initials
      || (e.venue || e.title || '?').slice(0, 2)).toUpperCase().slice(0, 2);
    const cls = `thumb thumb--lg${imgUrl ? ' thumb--has-img' : ''}`;
    const sty = imgUrl ? ` style="background-image:url('${WA.img(String(imgUrl), 200).replace(/'/g, '%27')}')"` : '';
    return `<a class="list-row__media" href="venue.html?id=${e.id}" tabindex="-1" aria-hidden="true">
      <span class="${cls}" role="img" aria-label="${e.venue || e.title}"${sty}>
        <span class="thumb__fallback" aria-hidden="${!!imgUrl}">${initials}</span>
      </span></a>`;
  };

  /* Infer a labelled back link from the previous page.
     For Discover and venue/curator referrers we preserve the full referrer
     URL so filter and pick state survive the round-trip.                  */
  const backLink = () => {
    try {
      const ref = new URL(document.referrer);
      const p   = ref.pathname;
      if (p.endsWith('venue.html'))    return { href: document.referrer, label: '&larr; Pick' };
      if (p.endsWith('discover.html')) return { href: document.referrer, label: '&larr; Discover' };
    } catch (_) { /* cross-origin or empty referrer */ }
    return { href: './index.html', label: '&larr; Today' };
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
    const MAX_SHOWN = 30;
    const allTags   = [...new Set(picks.flatMap(e => e.moodTags || []))].sort();

    const buildRows = (entries) => tasteOrder(entries).slice(0, MAX_SHOWN).map(e => {
      const isMarked = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[e.id]);
      return `<li class="list-row list-row--card list-row--bookmarkable" data-id="${e.id}">
               ${mediaHtml(e)}
               <div class="list-row__body">
                 <p class="list-row__title">
                   <a href="venue.html?id=${e.id}">${e.title}</a>
                 </p>
                 <p class="list-row__meta">${buildMeta(e)}</p>
                 <p class="list-row__quote">&mdash; ${e.quote}</p>
                 ${e.moodTags && e.moodTags.length
                   ? `<p class="list-row__tags">${
                       e.moodTags.map(t =>
                         `<a class="list-row__tag" href="discover.html#mood=${encodeURIComponent(t)}">${t}</a>`
                       ).join('')}</p>`
                   : ''}
               </div>
               <label class="bookmark">
                 <input type="checkbox" class="bookmark__check" data-id="${e.id}"
                        aria-label="Bookmark: ${e.title}" ${isMarked ? 'checked' : ''}>
                 ${bookmarkSVG()}
               </label>
             </li>`;
    }).join('');

    main.innerHTML = `
      <a class="venue-back" href="${href}">${label}</a>

      <article aria-label="Curator: ${curator.handle}">

        <div class="curator-profile">
          <p class="curator-profile__handle">${curator.handle}</p>
          ${curator.tagline ? `<p class="curator-profile__tagline">${curator.tagline}</p>` : ''}
          <button type="button" id="curator-share-btn" style="margin-top:var(--s-3);font-family:var(--ff-mono);font-size:11px;letter-spacing:0.06em;color:var(--c-ink-mute);background:none;border:1px solid var(--c-rule);border-radius:3px;padding:4px 10px;cursor:pointer;">Share &rarr;</button>
        </div>

        ${curator.bio ? `
        <hr class="rule" style="margin-bottom:var(--s-5)">
        <p class="curator-profile__bio">${curator.bio}</p>
        ` : ''}

        ${picks.length ? `
        <hr class="rule" style="margin: var(--s-7) 0 0">
        <section aria-labelledby="picks-label">
          <header class="search-section-head">
            <p id="picks-label" class="eyebrow">${picks.length} pick${picks.length !== 1 ? 's' : ''} in Tallinn${
              tastePrefsSet()
                ? ' · <a class="taste-cue" href="index.html#taste-onboarding">tuned to you</a>'
                : ''}</p>
          </header>
          ${allTags.length >= 2 ? `
          <div class="m-chips" id="curator-chips" style="margin-bottom:var(--s-4);">
            <button class="m-chip m-chip--active" type="button" data-tag="">All</button>
            ${allTags.map(t => `<button class="m-chip" type="button" data-tag="${t}">${t}</button>`).join('')}
          </div>` : ''}
          <ol class="list-rows" role="list" id="curator-picks-list" data-animate>
            ${buildRows(picks)}
          </ol>
          ${picks.length > MAX_SHOWN ? `<p class="meta" style="margin-top:var(--s-3)">Showing 30 of ${picks.length} picks.</p>` : ''}
        </section>` : `
        <p class="empty-line" style="margin-top:var(--s-6)">No current picks from this curator.</p>
        `}

      </article>

      <footer class="colophon">
        <p class="colophon__line"><a href="./about.html">About</a> &middot; WanderAlt &middot; Tallinn edition &middot; A curator vouched for every pick. AI is the index, not the editor.</p>
      </footer>
    `;

    /* Wire share button — native OS share sheet, clipboard fallback. */
    const shareBtn = main.querySelector('#curator-share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        const share = window.WA && window.WA.Share;
        const done = (label) => {
          shareBtn.textContent = label;
          setTimeout(() => { shareBtn.textContent = 'Share →'; }, 2000);
        };
        if (share) {
          const r = await share.url({
            title: `${curator.name || curator.handle} on WanderAlt`,
            text:  curator.tagline || '',
            url:   window.location.href,
          });
          if (r === 'copied') done('Copied ✓');
          else if (r === 'shared') done('Shared ✓');
        } else {
          navigator.clipboard.writeText(window.location.href).then(() => done('Copied ✓'));
        }
      });
    }

    /* Wire mood-tag filter chips. */
    const chipsEl = main.querySelector('#curator-chips');
    const listEl  = main.querySelector('#curator-picks-list');
    if (chipsEl && listEl) {
      chipsEl.addEventListener('click', (ev) => {
        const chip = ev.target.closest('[data-tag]');
        if (!chip) return;
        const tag = chip.dataset.tag;
        chipsEl.querySelectorAll('[data-tag]').forEach(c =>
          c.classList.toggle('m-chip--active', c === chip));
        const filtered = tag
          ? picks.filter(e => (e.moodTags || []).includes(tag))
          : picks;
        listEl.innerHTML = buildRows(filtered);
      });
    }

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
    /* Always look in the all-cities snapshots so cross-city curator
       URLs resolve. A Tallinn user clicking a bookmarked @katestrelca
       (Riga) link should land on the curator's profile — not a 404. */
    const curators = (window.WA?._curatorsAll)
                  || (window.WA?.curators) || [];
    const catalog  = (window.WA?._catalogAll)
                  || (window.WA?.catalog)  || [];

    const raw    = new URLSearchParams(window.location.search).get('handle') || '';
    /* Back-compat: a few rows historically used bare handles ("sigmundtells").
       After the May 2026 normalisation all handles start with '@'. Old
       bookmarked URLs like /curator.html?handle=sigmundtells should still
       resolve, so we look up both forms and use whichever matches.       */
    const requested = decodeURIComponent(raw);
    const prefixed  = requested.startsWith('@') ? requested : '@' + requested;
    const handle = curators.some(c => c.handle === requested) ? requested
                 : curators.some(c => c.handle === prefixed)  ? prefixed
                 : requested;
    const picks  = catalog.filter(e => e.handle === handle);

    /* Prefer the static curators table (which has bios + taglines).
       Fall back to a synthesised profile if the handle exists only in
       the live catalog — e.g. handles added via the ingest pipeline. */
    const curator = curators.find(c => c.handle === handle)
                 || (picks.length ? { handle, tagline: '', bio: '' } : null);

    if (!curator) { renderNotFound(); return; }

    /* Reflect the curator's home city on body[data-city] so the banner
       ribbon swaps to match when the visitor's CITY differs (e.g.
       browsing Tallinn but viewing a Riga curator). Doesn't persist
       to localStorage — the user's chosen city stays the same. */
    if (curator.city && curator.city !== window.WA?.CITY) {
      document.body.dataset.city = curator.city;
    }

    render(curator, picks);
  };

  document.addEventListener('wa:catalog-ready', init);
})();
