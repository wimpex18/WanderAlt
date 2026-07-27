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
  /* Shared render helpers — single implementation in ui-helpers.js (P1). */
  const { esc, buildMeta, bookmarkSVG } = window.WA.UI;
  const mediaHtml = window.WA.UI.rowMedia;


  /* Gentle on-device taste nudge — same idea as Today / Discover / Saved.
     When the reader has a taste profile, surface this curator's picks that
     match their taste first. Shared stable-sort impl in taste.js: 0-score
     ties keep the curator's own ordering primary. Nothing leaves the device. */
  const tastePrefsSet = () =>
    Object.keys(window.WA?.taste?.getPrefs?.() || {}).length > 0;
  const tasteOrder = (entries) =>
    window.WA?.taste ? window.WA.taste.orderByTaste(entries) : entries;

  /* Photo media tile — reuses the app's .thumb--lg treatment so curator
     picks match the Discover / Saved photo cards. Falls back to the initials
     tile when the pick has no image. Decorative supplementary link. */

  /* ── Reading lately ────────────────────────────────────────
     The curator-column feature's home since July 2026 (retired from
     Today's week__rail — it was published once in 16 tries
     there, a per-city cadence nobody kept feeding). Per-curator instead:
     fetches this curator's own latest published columns row. Reuses the
     .column/.column__* markup+CSS the old Today rail used (kept for
     exactly this). Minimal Markdown: *em*, **strong**, blank-line
     paragraphs. Gracefully absent — no published column, no section. */
  const toColumnHtml = (md) => {
    const escaped = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const inline = escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
    return inline
      .split(/\n\n+/)
      .filter(p => p.trim())
      .map(p => `<p>${p.replace(/\n/g, ' ').trim()}</p>`)
      .join('');
  };

  const renderReadingLately = async (curator) => {
    const slot = document.getElementById('curator-column-slot');
    if (!slot) return;
    const url = window.WA && window.WA.BASE_URL;
    const key = window.WA && window.WA.ANON_KEY;
    if (!url || !key) return;

    try {
      // back-compat: a few `columns` rows historically stored the handle without
      // the leading "@" (same quirk `init()` already works around for curators/picks)
      const bare = curator.handle.replace(/^@/, '');
      const handles = `${curator.handle},${bare}`;
      const res = await fetch(
        `${url}/rest/v1/columns?curator_handle=in.(${encodeURIComponent(handles)})` +
        `&status=eq.published&order=week_of.desc&limit=1&select=*`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      if (!res.ok) return;
      const rows = await res.json();
      if (!rows || !rows.length || !rows[0].body_md) return;

      const col = rows[0];

      /* Staleness gate (design-critique should-fix #14, Jul 2026): a
         "cultural weekly" must not lead with a months-old "Edition No. 1".
         The draft-column cron is frozen pre-launch, so every published
         column is currently stale — better to show nothing than a stale
         edition. Hide when the edition's week is older than STALE_DAYS.
         Uses week_of (the edition's week); falls back to approved_at. */
      const STALE_DAYS = 42; // 6 weeks — beyond this it isn't "lately"
      const dateStr = col.week_of || col.approved_at;
      if (dateStr) {
        const ageDays = (Date.now() - new Date(dateStr).getTime()) / 86400000;
        if (Number.isFinite(ageDays) && ageDays > STALE_DAYS) return;
      }
      const dateLabel = col.approved_at
        ? new Date(col.approved_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        : '';
      const issueLabel = col.issue_num ? ` &middot; Edition No. ${col.issue_num}` : '';

      slot.innerHTML =
        `<section class="column" aria-labelledby="reading-lately-label">
           <div class="column__head">
             <span id="reading-lately-label" class="column__eyebrow">Reading lately${issueLabel}</span>
             ${dateLabel ? `<span class="meta">${dateLabel}</span>` : ''}
           </div>
           <div class="column__body">${toColumnHtml(col.body_md)}</div>
         </section>`;
    } catch (_) {
      /* Network errors are silently swallowed — the page degrades gracefully. */
    }
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

    /* Rows carry no mood tags. One curator's picks share almost the same
       set — four of @paavli's five are identical — so per-row they were
       ~24 near-identical chips saying nothing about any individual pick,
       in the same vocabulary as the filter chips directly above them. The
       filter is where those tags do work; every other pick list on the
       site prints none. */
    const buildRows = (entries) => tasteOrder(entries).slice(0, MAX_SHOWN).map(e => {
      const isMarked = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[e.id]);
      return `<li class="list-row list-row--card list-row--bookmarkable" data-id="${esc(e.id)}">
               ${mediaHtml(e)}
               <div class="list-row__body">
                 <p class="list-row__title">
                   <a href="venue.html?id=${encodeURIComponent(e.id)}">${esc(e.title)}</a>
                 </p>
                 <p class="list-row__meta">${esc(buildMeta(e))}</p>
                 ${e.quote && (!curator.tagline || e.quote.trim().toLowerCase() !== curator.tagline.trim().toLowerCase())
                   ? `<p class="list-row__quote"><span class="list-row__quote-text">&mdash; ${esc(e.quote)}</span></p>`
                   : ''}
               </div>
               <label class="bookmark">
                 <input type="checkbox" class="bookmark__check" data-id="${e.id}"
                        aria-label="Bookmark: ${esc(e.title)}" ${isMarked ? 'checked' : ''}>
                 ${bookmarkSVG()}
               </label>
             </li>`;
    }).join('');

    main.innerHTML = `
      <a class="venue-back" href="${href}">${label}</a>

      <article aria-label="Curator: ${esc(curator.handle)}">

        <!-- Dusk head: ONE glass head card — avatar · handle · mono
             ticker (picks · city · Telegram ↗) · motto quote. Handles
             match the Telegram slug, so the ↗ link derives from it. -->
        <header class="curator-card island">
          <div class="curator-card__row">
            <span class="curator-card__avatar" aria-hidden="true">${esc((curator.handle || '@?').replace('@', '').charAt(0).toUpperCase())}</span>
            <div class="curator-card__id">
              <h1 class="curator-card__handle">${esc(curator.handle)}</h1>
              <!-- The count and city shrink; the Telegram link does not.
                   As one ellipsized line it read "5 PICKS · TALLINN …" at
                   390 and the link — the only way off this page to the
                   curator themselves — was the first thing cut. -->
              <p class="curator-card__ticker"><span class="curator-card__ticker-text">${picks.length} PICK${picks.length !== 1 ? 'S' : ''} &middot; ${((window.WA && window.WA.CITY) || 'tallinn').toUpperCase()}</span> <a class="curator-card__tg" href="https://t.me/${encodeURIComponent((curator.handle || '').replace('@', ''))}" target="_blank" rel="noopener noreferrer">TELEGRAM &nearr;</a></p>
            </div>
            <div class="curator-actions">
              <button type="button" id="curator-share-btn" class="action-icon" aria-label="Share this curator page" title="Share"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9h-1a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-8a2 2 0 0 0 -2 -2h-1" /><path d="M12 14v-11" /><path d="M9 6l3 -3l3 3" /></svg></button>
              <a class="action-icon" href="${(window.WA && window.WA.BASE_URL) || ''}/functions/v1/calendar-feed?city=${encodeURIComponent((window.WA && window.WA.CITY) || 'tallinn')}&amp;handle=${encodeURIComponent(curator.handle)}"
                 aria-label="Subscribe to ${esc(curator.handle)}'s picks in your calendar" title="Calendar feed (.ics)">
                <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M12 13.5v4M10 15.5h4"/></svg>
              </a>
            </div>
          </div>
          ${curator.tagline ? `<blockquote class="curator-card__motto"><p>&ldquo;${esc(curator.tagline)}&rdquo;</p></blockquote>` : ''}
        </header>

        ${curator.bio ? `
        <hr class="rule" style="margin-bottom:var(--s-5)">
        <p class="curator-profile__bio">${esc(curator.bio)}</p>
        ` : ''}

        <div id="curator-column-slot"></div>

        ${picks.length ? `
        <hr class="rule" style="margin: var(--s-7) 0 0">
        <section aria-labelledby="picks-label">
          <header class="search-section-head">
            <p id="picks-label" class="eyebrow">${picks.length} pick${picks.length !== 1 ? 's' : ''} in ${(() => {
              /* The curator's home city, not a hardcoded "Tallinn" — a Riga
                 curator's page must not claim the wrong city (critique #5). */
              const c = curator.city || (picks[0] && picks[0].city) || (window.WA && window.WA.CITY) || 'tallinn';
              return c.charAt(0).toUpperCase() + c.slice(1);
            })()}${
              tastePrefsSet()
                ? ' · <a class="taste-cue" href="index.html#taste-onboarding">tuned to you</a>'
                : ''}</p>
          </header>
          ${allTags.length >= 2 ? `
          <div class="m-chips curator-chips" id="curator-chips">
            <button class="m-chip m-chip--active" type="button" data-tag="">All</button>
            ${allTags.map(t => `<button class="m-chip" type="button" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
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
        <p class="colophon__line"><a href="./about.html">About</a> &middot; WanderAlt &middot; A curator vouched for every pick</p>
      </footer>
    `;

    /* Wire share button — native OS share sheet, clipboard fallback.
       Icon-only (same .action-icon idiom as the venue action row); the
       shared flashDone swaps the glyph to a petrol check on success. */
    const shareBtn = main.querySelector('#curator-share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        const share = window.WA && window.WA.Share;
        if (share) {
          const r = await share.url({
            title: `${curator.name || curator.handle} on WanderAlt`,
            text:  curator.tagline || '',
            url:   window.location.href,
          });
          if (r === 'copied' || r === 'shared') window.WA.UI.flashDone(shareBtn);
        } else {
          navigator.clipboard.writeText(window.location.href).then(() => window.WA.UI.flashDone(shareBtn));
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

  };

  /* Document-level wiring — bound ONCE at module scope. These used to be
     bound inside render(), stacking a duplicate pair on every re-render
     (restructure before adding the init guard, or the guard
     makes the double-bind worse). Bookmarks availability is checked at
     event time, not bind time. */
  document.addEventListener('change', (e) => {
    const cb = e.target.closest('.bookmark__check');
    if (!cb || !window.WA?.Bookmarks) return;
    window.WA.Bookmarks.set(cb.dataset.id, cb.checked);
  });
  document.addEventListener('wa:bookmarks-synced', () => {
    const store = window.WA?.Bookmarks?.get?.() || {};
    document.querySelectorAll('.bookmark__check').forEach(cb => {
      cb.checked = !!store[cb.dataset.id];
    });
  });

  const renderNotFound = () => {
    const main = document.getElementById('curator-main');
    if (!main) return;
    const { href, label } = backLink();
    main.innerHTML = `
      <a class="venue-back" href="${href}">${label}</a>
      ${window.WA.UI.emptyState('No curator by that handle',
        'They may write for another city. <a href="index.html">Back to today&rsquo;s briefing &rarr;</a>')}
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
    renderReadingLately(curator);  /* async — doesn't block the sync render above */
  };

  /* place.js-style guard: when the static catalog is already
     present (script ran after catalog.js — the normal defer order), render
     immediately instead of waiting for the live fetch; wa:catalog-ready
     re-renders with live data. render() is idempotent (innerHTML swap). */
  if (window.WA && (window.WA._curatorsAll || window.WA.curators)) init();
  document.addEventListener('wa:catalog-ready', init);
})();
