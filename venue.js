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
      ? ` style="background-image:url('${WA.img(entry.imageUrl, 200).replace(/'/g, '%27')}')"` : '';
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

  /* A pick whose quote merely echoes the curator's signature tagline adds
     noise row after row (F-10) — render the quote only when it was written
     for the pick; otherwise attribute the row with a quiet "via @handle"
     (the Today list idiom). Empty quotes take the same path. */
  const isEchoQuote = (e) => {
    const q = (e.quote || '').trim().toLowerCase();
    if (!q) return true;
    const cs = (window.WA && (window.WA._curatorsAll || window.WA.curators)) || [];
    const c  = cs.find(x => x.handle === e.handle);
    return !!(c && c.tagline && q === c.tagline.trim().toLowerCase());
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

    /* OG / Twitter card — set image, title, description. Crawlers get this
       server-side via the Pages middleware (they don't run JS); this keeps
       the live DOM in sync so native OS share sheets that read current
       meta show the same. Prefer the real venue photo (NYT/Airbnb-style),
       falling back to the branded og-image card when there's no photo. */
    const ogImg = entry.imageUrl
      ? (window.WA.img ? window.WA.img(entry.imageUrl, 1200) : entry.imageUrl)
      : ((window.WA && window.WA.BASE_URL)
          ? `${window.WA.BASE_URL}/functions/v1/og-image?id=${encodeURIComponent(entry.id)}`
          : null);
    if (ogImg) {
      document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')
        .forEach(m => m.setAttribute('content', ogImg));
    }
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', `WanderAlt — ${entry.title} · Tallinn`);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', `${entry.quote} — ${entry.handle}`);

    const { href, label } = backLink();
    const eyebrow  = (entry.pin && entry.pin.eyebrow)
                  || (entry.day === 'Tonight' ? 'Tonight' : entry.day)
                  || 'Place';
    const isMarked = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[entry.id]);

    /* Other picks by the same curator (excludes current entry); cap at 5. */
    const moreAll  = catalog.filter(e => e.handle === entry.handle && e.id !== entry.id);
    const more     = moreAll.slice(0, 5);
    const moreRest = moreAll.length - more.length;

    /* Mood-tag chips (interactive filter links) — kept below the header in
       both layouts so they stay tappable rather than overlaid on a photo. */
    const moodChips = entry.moodTags && entry.moodTags.length ? `
        <p class="venue-moods">
          ${entry.moodTags.map(t =>
            `<a href="discover.html#mood=${encodeURIComponent(t)}" class="venue-mood">${t}</a>`
          ).join('')}
        </p>` : '';

    /* Photo-forward header (June 2026): when the pick has an image_url, the
       venue photo fills a banner with a scrim gradient and the eyebrow +
       title + meta sit on it in white. No photo -> the flat header. The big
       curator quote still leads below, either way. */
    const header = entry.imageUrl
      ? `<div class="detail-hero" style="background-image:url('${WA.img(entry.imageUrl, 1080).replace(/'/g, '%27')}')">
           <div class="detail-hero__foot">
             <p class="eyebrow eyebrow--onphoto">${eyebrow}</p>
             <h1 class="venue-title venue-title--onphoto">${entry.title}</h1>
             <p class="meta meta--onphoto">${buildMeta(entry)}</p>
           </div>
         </div>
         ${moodChips}`
      : `<div class="venue-head">
           <p class="eyebrow">${eyebrow}</p>
           <h1 class="venue-title">${entry.title}</h1>
           <p class="meta">${buildMeta(entry)}</p>
           ${moodChips}
         </div>`;

    main.innerHTML = `
      <a class="venue-back" href="${href}">${label}</a>

      <article aria-label="${entry.title}">

        ${header}

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
              <span class="meta">${buildMeta(entry)}</span>
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

        <div class="venue-actions">
          <button class="btn-primary venue-going-btn" type="button">I&rsquo;m going &rarr;</button>
          ${entry.day ? `<button class="btn-secondary venue-cal-btn" type="button" aria-label="Add to calendar">Add to calendar</button>` : ''}
          <button class="btn-secondary venue-share-btn" type="button" aria-label="Share this pick">Share</button>
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
          <ol class="list-rows" role="list" data-animate>
            ${more.map(e =>
              /* Photo-forward card (matches Discover / Saved / Curator): a
                 venue photo (left) + body. The .thumb is a decorative
                 supplementary link; the title link is the keyboard tab stop
                 and the quote handle is a sibling <a> (nesting links is
                 invalid — browsers eject the inner one). */
              `<li class="list-row list-row--card" data-id="${e.id}">
                 <a class="list-row__media" href="venue.html?id=${e.id}" tabindex="-1" aria-hidden="true">${thumbEl(e, true)}</a>
                 <div class="list-row__body">
                   <p class="list-row__title">
                     <a href="venue.html?id=${e.id}">${e.title}</a>
                   </p>
                   <p class="list-row__meta">${buildMeta(e)}</p>
                   ${isEchoQuote(e)
                     ? `<p class="list-row__quote">via <a class="handle" href="curator.html?handle=${encodeURIComponent(e.handle)}">${e.handle}</a></p>`
                     : `<p class="list-row__quote">&mdash; ${e.quote}
                     <a class="handle" href="curator.html?handle=${encodeURIComponent(e.handle)}">${e.handle}</a>
                   </p>`}
                 </div>
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
        <p class="colophon__line"><a href="./about.html">About</a> &middot; WanderAlt &middot; Tallinn edition &middot; A curator vouched for every pick. AI is the index, not the editor.</p>
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

        /* Convert double newlines to paragraph breaks. context_md is
           lightly marked-down — render *emphasis* as <em> instead of
           leaking literal asterisks (F-13), and escape everything else. */
        const escCtx = (s) => s
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const emphasize = (s) => s
          .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
          .replace(/\b_([^_\n]+)_\b/g, '<em>$1</em>');
        bodyEl.innerHTML = ctx
          .split(/\n\n+/)
          .filter(p => p.trim())
          .map(p => `<p>${emphasize(escCtx(p.trim()))}</p>`)
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

    /* Wire Share — native OS share sheet, clipboard fallback. */
    const shareBtn = main.querySelector('.venue-share-btn');
    if (shareBtn && window.WA.Share) {
      shareBtn.addEventListener('click', async () => {
        const r = await window.WA.Share.url({
          title: entry.title,
          text:  `${entry.title} — ${entry.venue}`,
          url:   window.location.href,
        });
        if (r === 'copied' || r === 'shared') {
          const prev = shareBtn.textContent;
          shareBtn.textContent = r === 'copied' ? 'Link copied ✓' : 'Shared ✓';
          setTimeout(() => { shareBtn.textContent = prev; }, 2000);
        }
      });
    }

    /* Wire Add to calendar — client-side .ics download (dated picks only). */
    const calBtn = main.querySelector('.venue-cal-btn');
    if (calBtn && window.WA.Share) {
      calBtn.addEventListener('click', () => {
        if (window.WA.Share.downloadIcs(entry)) {
          const prev = calBtn.textContent;
          calBtn.textContent = 'Added ✓';
          setTimeout(() => { calBtn.textContent = prev; }, 2000);
        }
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
