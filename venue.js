/* ============================================================
   WanderAlt — Venue detail page
   ------------------------------------------------------------
   Reads ?id=<slug> from the URL, finds the entry in
   window.WA.catalog, and renders the full pick detail.

   Layout (voice-first, matching the Briefing aesthetic):
     ← Back link
     Eyebrow · h1 title · meta
     ──────
     Big curator quote (tonight__quote)
     Attribution (tonight__attr)
     ──────
     Thumbnail + venue name + meta + bookmark
     ──────
     More from @handle (if other picks exist by the same curator)
     Colophon

   Load order (venue.html):
     catalog.js → supabase.js → bookmark.js → venue.js
   ============================================================ */
(() => {
  const bookmarkSVG = () =>
    `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
         stroke-width="1.25" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
       <path d="M6 3h12v18l-6-4-6 4V3z" />
     </svg>`;

  const thumbEl = (entry, large = false) => {
    const cls   = `thumb${large ? ' thumb--lg' : ''}${entry.imageUrl ? ' thumb--has-img' : ''}`;
    const style  = entry.imageUrl
      ? ` style="background-image:url('${entry.imageUrl.replace(/'/g, '%27')}')"` : '';
    const label  = entry.imageUrl ? entry.venue : `${entry.venue} placeholder`;
    return `<span class="${cls}" role="img" aria-label="${label}"${style}>` +
           `<span class="thumb__fallback" aria-hidden="${!!entry.imageUrl}">${entry.thumbInitials}</span>` +
           `</span>`;
  };

  const buildMeta = (entry) => {
    const parts = [entry.neighborhood, entry.kind];
    if (entry.day && entry.day !== 'Tonight') parts.push(entry.time ? `${entry.day} ${entry.time}` : entry.day);
    else if (entry.time)                      parts.push(entry.time);
    return parts.filter(Boolean).join(' · ');
  };

  /* Infer a labelled back link from the previous page.
     For Discover and curator pages we preserve the full referrer URL so
     the user lands back in exactly the state they left.                 */
  const backLink = () => {
    try {
      const ref = new URL(document.referrer);
      const p   = ref.pathname;
      if (p.endsWith('discover.html')) return { href: document.referrer, label: '&larr; Discover' };
      if (p.endsWith('curator.html'))  return { href: document.referrer, label: '&larr; Curator' };
      if (p.endsWith('saved.html'))    return { href: './saved.html',     label: '&larr; Saved' };
    } catch (_) { /* cross-origin or empty referrer */ }
    return { href: './index.html', label: '&larr; Today' };
  };

  const render = (entry, catalog) => {
    const main = document.getElementById('venue-main');
    if (!main) return;

    /* Update tab title and meta description with live content. */
    document.title = `WanderAlt — ${entry.title} · Tallinn`;
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.content = `${entry.quote} — ${entry.handle}`;

    /* OG / Twitter card — set image, title, and description. */
    const OG_BASE = (window.WA && window.WA.BASE_URL)
      ? `${window.WA.BASE_URL}/functions/v1/og-image`
      : null;
    if (OG_BASE) {
      const ogImg = `${OG_BASE}?id=${encodeURIComponent(entry.id)}`;
      document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')
        .forEach(m => m.setAttribute('content', ogImg));
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', `WanderAlt — ${entry.title} · Tallinn`);
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', `${entry.quote} — ${entry.handle}`);
    }

    const { href, label } = backLink();
    const eyebrow  = (entry.pin && entry.pin.eyebrow)
                  || (entry.day === 'Tonight' ? 'Tonight' : entry.day)
                  || 'Place';
    const isMarked = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[entry.id]);

    /* Other picks by the same curator (excludes current entry); cap at 5. */
    const moreAll  = catalog.filter(e => e.handle === entry.handle && e.id !== entry.id);
    const more     = moreAll.slice(0, 5);
    const moreRest = moreAll.length - more.length;

    main.innerHTML = `
      <a class="venue-back" href="${href}">${label}</a>

      <article aria-label="${entry.title}">

        <div class="venue-head">
          <p class="eyebrow">${eyebrow}</p>
          <h1 class="venue-title">${entry.title}</h1>
          <p class="meta">${buildMeta(entry)}</p>
        ${entry.moodTags && entry.moodTags.length ? `
        <p style="margin:var(--s-2) 0 0;display:flex;flex-wrap:wrap;gap:6px;">
          ${entry.moodTags.map(t =>
            `<a href="discover.html#mood=${encodeURIComponent(t)}" style="display:inline-block;padding:3px 10px;border:1px solid var(--c-rule);border-radius:999px;font-family:var(--ff-body);font-size:12px;font-weight:500;color:var(--c-ink-mute);text-decoration:none;">${t}</a>`
          ).join('')}
        </p>` : ''}
        </div>

        <hr class="rule" style="margin-bottom:var(--s-2)">

        <section class="tonight" aria-label="Curator quote">
          <blockquote class="tonight__quote">
            <p>&ldquo;${entry.quote}&rdquo;</p>
            <footer class="tonight__attr">
              <span class="tonight__attr-line" aria-hidden="true"></span><a class="handle" href="curator.html?handle=${encodeURIComponent(entry.handle)}">${entry.handle}</a>
            </footer>
          </blockquote>
        </section>

        <hr class="rule" style="margin-top:var(--s-4)">

        <div class="venue-venue">
          <div class="tonight__venue">
            ${thumbEl(entry, true)}
            ${entry.imageUrl && entry.imageAttr ? `<p class="photo-credit">${entry.imageAttr}</p>` : ''}
            <span class="tonight__venue-body">
              <span class="tonight__venue-name">${entry.venue}</span>
              <span class="meta">${entry.neighborhood} &middot; ${entry.kind}${entry.time ? ' &middot; ' + entry.time : ''}</span>
            </span>
          </div>
          <label class="bookmark">
            <input type="checkbox" class="bookmark__check" data-id="${entry.id}"
                   aria-label="Bookmark: ${entry.title}" ${isMarked ? 'checked' : ''}>
            ${bookmarkSVG()}
          </label>
        </div>

        <!-- Venue details — website / address / short_desc; async-populated by fetchVenueDetails() -->
        <div id="venue-details" class="venue-details" hidden></div>

        <div class="venue-actions" style="display:flex;gap:10px;align-items:center;margin-top:var(--s-5)">
          <button class="btn-primary venue-going-btn" type="button" style="flex:1;text-align:center;">I&rsquo;m going &rarr;</button>
        </div>

        <!-- Why this matters — async-populated by fetchContext() after render -->
        <details class="venue-context" id="venue-context" hidden>
          <summary class="venue-context__toggle">Read more &rarr;</summary>
          <div class="venue-context__body" id="venue-context-body"></div>
        </details>

        ${more.length ? `
        <hr class="rule" style="margin-bottom:0">
        <section aria-labelledby="more-label">
          <header class="search-section-head">
            <p id="more-label" class="eyebrow">More from <a class="handle" href="curator.html?handle=${encodeURIComponent(entry.handle)}">${entry.handle}</a></p>
          </header>
          <ol class="list-rows" role="list">
            ${more.map(e =>
              /* Title is the venue link; quote handle is a sibling <a>.
                 Wrapping the whole row in an <a> would nest the handle
                 link, which browsers eject from the DOM tree. */
              `<li class="list-row">
                 <p class="list-row__title">
                   <a href="venue.html?id=${e.id}">${e.title}</a>
                 </p>
                 <p class="list-row__meta">${buildMeta(e)}</p>
                 <p class="list-row__quote">&mdash; ${e.quote}
                   <a class="handle" href="curator.html?handle=${encodeURIComponent(e.handle)}">${e.handle}</a>
                 </p>
               </li>`
            ).join('')}
          </ol>
          ${moreRest > 0 ? `
          <p class="meta" style="margin-top:var(--s-3)">
            <a class="handle" href="curator.html?handle=${encodeURIComponent(entry.handle)}">View all ${moreAll.length} picks &rarr;</a>
          </p>` : ''}
        </section>` : ''}

      </article>

      <footer class="colophon">
        <p class="colophon__line">WanderAlt &middot; Tallinn edition &middot; A curator vouched for every pick. AI is the index, not the editor.</p>
      </footer>
    `;

    /* Async fetch context_md from Supabase and reveal the <details>. */
    const fetchContext = async () => {
      const base = window.WA && window.WA.BASE_URL;
      const key  = window.WA && window.WA.ANON_KEY;
      if (!base || !key) return;

      try {
        const r = await fetch(
          `${base}/rest/v1/picks?id=eq.${encodeURIComponent(entry.id)}&select=context_md&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } }
        );
        if (!r.ok) return;
        const rows = await r.json();
        const ctx  = rows[0]?.context_md;
        if (!ctx) return;

        const detailsEl = document.getElementById('venue-context');
        const bodyEl    = document.getElementById('venue-context-body');
        if (!detailsEl || !bodyEl) return;

        /* Convert double newlines to paragraph breaks */
        bodyEl.innerHTML = ctx
          .split(/\n\n+/)
          .filter(p => p.trim())
          .map(p => `<p>${p.trim()}</p>`)
          .join('');

        detailsEl.hidden = false;
        detailsEl.open = true;
      } catch (_) { /* gracefully absent */ }
    };

    fetchContext();

    /* Async fetch enrichment data from venue_details (Wikidata + Google Places). */
    const fetchVenueDetails = async () => {
      const base = window.WA && window.WA.BASE_URL;
      const key  = window.WA && window.WA.ANON_KEY;
      if (!base || !key) return;

      const city     = 'tallinn'; // multi-city: entry.city when available
      const venueKey = entry.venue.toLowerCase();

      try {
        const r = await fetch(
          `${base}/rest/v1/venue_details` +
          `?city=eq.${encodeURIComponent(city)}` +
          `&venue_key=eq.${encodeURIComponent(venueKey)}` +
          `&select=website,address,short_desc,opening_hours,phone,business_status&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } }
        );
        if (!r.ok) return;
        const rows = await r.json();
        const vd   = rows[0];
        if (!vd) return;

        const el = document.getElementById('venue-details');
        if (!el) return;

        const parts = [];

        // Closure status — only render when not operational
        if (vd.business_status === 'CLOSED_PERMANENTLY') {
          parts.push(`<p class="venue-details__status venue-details__status--perm">Permanently closed</p>`);
        } else if (vd.business_status === 'CLOSED_TEMPORARILY') {
          parts.push(`<p class="venue-details__status venue-details__status--temp">Temporarily closed</p>`);
        }

        // Website
        if (vd.website) {
          let domain = vd.website;
          try { domain = new URL(vd.website).hostname.replace(/^www\./, ''); } catch (_) {}
          parts.push(
            `<a class="venue-details__website" href="${vd.website}"` +
            ` target="_blank" rel="noopener noreferrer">${domain} ↗</a>`
          );
        }

        // Address → Google Maps deep link
        if (vd.address) {
          const mq = encodeURIComponent(vd.address + ', ' + city);
          parts.push(
            `<a class="venue-details__address" href="https://maps.google.com/?q=${mq}"` +
            ` target="_blank" rel="noopener noreferrer">${vd.address} ↗</a>`
          );
        }

        // Phone
        if (vd.phone) {
          parts.push(
            `<a class="venue-details__phone" href="tel:${vd.phone.replace(/\s/g, '')}">${vd.phone}</a>`
          );
        }

        // Opening hours — today's line prominent, full schedule under disclosure
        if (vd.opening_hours) {
          try {
            const hrs = JSON.parse(vd.opening_hours);
            if (Array.isArray(hrs) && hrs.length) {
              // Google weekdayDescriptions: index 0 = Monday
              // JS getDay(): 0 = Sunday → shift so Monday = 0
              const todayIdx = (new Date().getDay() + 6) % 7;
              const todayLine = hrs[todayIdx] || '';
              const allRows = hrs.map((line, i) =>
                `<li class="venue-details__hours-row${i === todayIdx ? ' venue-details__hours-row--today' : ''}">${line}</li>`
              ).join('');
              parts.push(
                `<div class="venue-details__hours">` +
                  `<p class="venue-details__hours-today">${todayLine}</p>` +
                  `<details class="venue-details__hours-disclosure">` +
                    `<summary class="venue-details__hours-summary">All hours</summary>` +
                    `<ol class="venue-details__hours-list">${allRows}</ol>` +
                  `</details>` +
                `</div>`
              );
            }
          } catch (_) {}
        }

        // Short description (Wikidata)
        if (vd.short_desc) {
          parts.push(`<p class="venue-details__desc">${vd.short_desc}</p>`);
        }

        if (!parts.length) return;
        el.innerHTML = parts.join('\n');
        el.hidden = false;
      } catch (_) { /* gracefully absent */ }
    };

    fetchVenueDetails();

    /* Wire "I'm going" — bookmarks the pick and navigates to saved. */
    const goingBtn = main.querySelector('.venue-going-btn');
    if (goingBtn && window.WA.Bookmarks) {
      goingBtn.addEventListener('click', () => {
        window.WA.Bookmarks.set(entry.id, true);
        goingBtn.textContent = 'Saved ✓';
        goingBtn.style.opacity = '0.7';
        setTimeout(() => { window.location.href = './saved.html'; }, 700);
      });
    }

    /* Wire bookmark toggle. */
    const cb = main.querySelector('.bookmark__check');
    if (cb && window.WA.Bookmarks) {
      cb.addEventListener('change', () => {
        window.WA.Bookmarks.set(entry.id, cb.checked);
      });
    }
  };

  const renderNotFound = () => {
    const main = document.getElementById('venue-main');
    if (!main) return;
    const { href, label } = backLink();
    main.innerHTML = `
      <a class="venue-back" href="${href}">${label}</a>
      <p class="empty-line">This pick isn&rsquo;t in the catalog &mdash; it may have moved.</p>
    `;
  };

  const init = () => {
    const catalog    = (window.WA && window.WA.catalog)    || [];
    const catalogAll = (window.WA && window.WA._catalogAll) || catalog;
    const id         = new URLSearchParams(window.location.search).get('id');
    /* Look in the city-filtered slice first (most common case), then
       fall back to the all-cities snapshot so a Tallinn user clicking
       a bookmarked Riga venue still resolves. When we resolve via the
       fallback, reflect the pick's own city on body[data-city] so the
       banner ribbon swaps to match the content (without persisting the
       change to localStorage — the user's chosen city stays intact).  */
    const entry = id
      ? (catalog.find(e => e.id === id) || catalogAll.find(e => e.id === id))
      : null;

    if (entry) {
      if (entry.city && entry.city !== window.WA?.CITY) {
        document.body.dataset.city = entry.city;
      }
      /* Render against the all-cities catalog so the "more from this
         curator" footer can include picks across cities — a curator
         like @katestrelca with picks in multiple cities now shows
         them all. */
      render(entry, catalogAll);
    } else {
      renderNotFound();
    }
  };

  document.addEventListener('wa:catalog-ready', init);
})();
