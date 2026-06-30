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
  /* Shared render helpers — single implementation in ui-helpers.js (P1). */
  const { esc, buildMeta, isEchoQuote, bookmarkSVG, socialButtons } = window.WA.UI;
  const thumbEl = window.WA.UI.thumb;

  /* Standard "opens elsewhere" diagonal-arrow glyph (Tabler external-link),
     shared by the website + ticket buttons. */
  const EXT_ICON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"/><path d="M11 13l9 -9"/><path d="M15 4h5v5"/></svg>';

  /* The pick's external source/ticket page (picks.source_url -> entry.permalink).
     Ticketing hosts read "Tickets", other event pages "Event page"; Telegram
     curator posts carry no event page and are filtered out. Returns a bare
     labelled .action-btn so it sits in the external-links row. */
  const sourceCta = (url) => {
    if (!url) return '';
    let host = '';
    try { host = new URL(url).host.replace(/^www\./, ''); } catch (_) { return ''; }
    if (/(^|\.)t\.me$/.test(host) || /telegram/i.test(host)) return '';
    const isTickets = /fienta\.|ra\.co|residentadvisor|piletilevi|tiketti|ticketmaster|eventbrite/i.test(host);
    const label = isTickets ? 'Tickets' : 'Event page';
    return `<a class="action-btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${label} (opens in a new tab)">${label}${EXT_ICON}</a>`;
  };

  /* The external-links row for a pick: the venue website + ticket/event page
     as labelled buttons (the primary "how do I actually go" actions, so they
     keep labels per the icon-system rules), then Facebook/Instagram as the
     compact icon set. Re-rendered by fetchVenueDetails() when a website
     arrives async from venue_details. Empty string when the venue has none. */
  const renderExt = (sv, permalink) => {
    const parts = [];
    /* Event/ticket page FIRST — a link straight to this event (where you buy
       a ticket) is more useful than the venue's home page, which is only the
       fallback. */
    const ticket = sourceCta(permalink);
    if (ticket) parts.push(ticket);
    if (sv.website) {
      parts.push(`<a class="action-btn" href="${esc(sv.website)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(sv.name || 'Venue')} website (opens in a new tab)">Venue website${EXT_ICON}</a>`);
    }
    const social = socialButtons({ name: sv.name, facebook: sv.facebook, instagram: sv.instagram });
    if (social) parts.push(social);
    return parts.join('');
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

    /* Web / social links for this pick's venue. venue_details (fetched
       async below) only carries a website; Facebook/Instagram live on the
       venues table — so match this event's venue by name against the
       already-loaded venues catalog (no extra request) and reuse them.
       fetchVenueDetails() merges in a website later if the venue row had
       none. */
    const venuesAll = (window.WA && (window.WA._venuesAll || window.WA.venues)) || [];
    const vKey = (entry.venue || '').trim().toLowerCase();
    const matchedVenue = vKey
      ? venuesAll.find(v => (v.name || '').trim().toLowerCase() === vKey)
      : null;
    const socialObj = {
      name:      entry.venue,
      website:   (matchedVenue && matchedVenue.website)   || null,
      facebook:  (matchedVenue && matchedVenue.facebook)  || null,
      instagram: (matchedVenue && matchedVenue.instagram) || null,
    };

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

    /* Flat header (no photo). Kept as a named string so a hero whose photo
       fails to load can swap to exactly this — matching every photoless
       pick — rather than sitting on a black box. */
    const headerFlat =
      `<div class="page-head">
         <p class="page-head__eyebrow">${eyebrow}</p>
         <h1 class="page-head__title">${entry.title}</h1>
         <p class="page-head__meta">${buildMeta(entry)}</p>
       </div>`;

    /* Photo-forward header (June 2026): when the pick has an image_url, the
       venue photo fills a banner with a scrim gradient and the eyebrow +
       title + meta sit on it in white. The visible fill is a CSS background;
       an invisible <img> probe with the same URL gives us an onerror hook
       (backgrounds have none) so an expired Google Places URL degrades to
       the flat header. The big curator quote still leads below, either way. */
    const heroUrl = entry.imageUrl ? WA.img(entry.imageUrl, 1080).replace(/'/g, '%27') : '';
    const header = (entry.imageUrl
      ? `<div class="detail-hero" style="background-image:url('${heroUrl}')">
           <img class="detail-hero__probe" src="${heroUrl}" alt="" aria-hidden="true">
           <div class="detail-hero__foot">
             <p class="eyebrow eyebrow--onphoto">${eyebrow}</p>
             <h1 class="venue-title venue-title--onphoto">${entry.title}</h1>
             <p class="meta meta--onphoto">${buildMeta(entry)}</p>
           </div>
         </div>`
      : headerFlat) + moodChips;

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

        <!-- Venue: which place hosts this pick. Reuses the app photo-card
             atoms (thumb + body) in an aligned card with a clear eyebrow, so
             the block's purpose reads at a glance. -->
        <section class="venue-block" aria-label="Venue">
          <p class="eyebrow">Venue</p>
          <div class="venue-card">
            <span class="venue-card__media">${thumbEl(entry, true)}</span>
            <div class="venue-card__body">
              <p class="venue-card__name">${entry.venue}</p>
              <p class="list-row__meta">${buildMeta(entry)}</p>
            </div>
            <label class="bookmark">
              <input type="checkbox" class="bookmark__check" data-id="${entry.id}"
                     aria-label="Bookmark: ${entry.title}" ${isMarked ? 'checked' : ''}>
              ${bookmarkSVG()}
            </label>
          </div>
          ${entry.imageUrl && entry.imageAttr ? `<p class="photo-credit">${entry.imageAttr}</p>` : ''}

          <!-- Venue details — address / hours / short_desc; async-populated by fetchVenueDetails() -->
          <div id="venue-details" class="venue-details" hidden></div>

          <!-- External "how to go" links: venue website + ticket/event page
               (labelled buttons) then Facebook/Instagram icons. Re-rendered by
               fetchVenueDetails() when a website arrives from venue_details. -->
          <div id="venue-ext" class="venue-ext">${renderExt(socialObj, entry.permalink)}</div>
        </section>

        <div class="venue-actions">
          <button class="action-btn action-btn--primary venue-going-btn" type="button" aria-label="I'm going">
            <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>
            <span class="action-btn__label">I&rsquo;m going</span>
          </button>
          ${entry.day ? `<button class="action-icon venue-cal-btn" type="button" aria-label="Add to calendar" title="Add to calendar">
            <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M12 13.5v4M10 15.5h4"/></svg>
          </button>` : ''}
          <button class="action-icon venue-share-btn" type="button" aria-label="Share this pick" title="Share">
            <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
          </button>
        </div>

        <!-- About this event — the curator's longer context, async-populated
             by fetchContext(). Shown as a plain section (not a disclosure) so
             the detail reads without a click. -->
        <section class="venue-about" id="venue-context" hidden>
          <p class="eyebrow">About this event</p>
          <div class="venue-about__body" id="venue-context-body"></div>
        </section>

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
        <p class="colophon__line"><a href="./about.html">About</a> &middot; WanderAlt &middot; A curator vouched for every pick</p>
      </footer>
    `;

    /* If the hero photo URL is dead (Google Places URIs can 403 over time),
       swap the scrim hero for the flat header so the title is never left on
       a black box. The probe shares the hero's URL, so it errors in lockstep
       with the unpaintable background. */
    const heroProbe = main.querySelector('.detail-hero__probe');
    if (heroProbe) {
      heroProbe.addEventListener('error', () => {
        const hero = heroProbe.closest('.detail-hero');
        if (hero) hero.outerHTML = headerFlat;
      });
    }

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
          `&select=website,facebook,instagram,address,short_desc,opening_hours,phone,business_status&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } }
        );
        if (!r.ok) return;
        const rows = await r.json();
        const vd   = rows[0];
        if (!vd) return;

        /* Website/Facebook/Instagram show in the external-links row (#venue-ext).
           The venues table seeds them synchronously; venue_details (Wikidata +
           Google + homepage scrape) fills any the venues row was missing, then
           we re-render the row so they still appear. */
        let extChanged = false;
        for (const k of ['website', 'facebook', 'instagram']) {
          if (vd[k] && !socialObj[k]) { socialObj[k] = vd[k]; extChanged = true; }
        }
        if (extChanged) {
          const ext = document.getElementById('venue-ext');
          if (ext) ext.innerHTML = renderExt(socialObj, entry.permalink);
        }

        const el = document.getElementById('venue-details');
        if (!el) return;

        const parts = [];

        // Closure status — only render when not operational
        if (vd.business_status === 'CLOSED_PERMANENTLY') {
          parts.push(`<p class="venue-details__status venue-details__status--perm">Permanently closed</p>`);
        } else if (vd.business_status === 'CLOSED_TEMPORARILY') {
          parts.push(`<p class="venue-details__status venue-details__status--temp">Temporarily closed</p>`);
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
        const lbl = goingBtn.querySelector('.action-btn__label');
        if (lbl) lbl.textContent = 'Saved ✓';
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

    /* Icon-only action buttons can't show a text confirmation, so briefly
       swap the glyph to a petrol check, then restore it. */
    const flashDone = (el) => {
      if (!el || el.dataset.flashing) return;
      const orig = el.innerHTML;
      el.dataset.flashing = '1';
      el.classList.add('action-icon--done');
      el.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';
      setTimeout(() => { el.innerHTML = orig; el.classList.remove('action-icon--done'); delete el.dataset.flashing; }, 1600);
    };

    /* Wire Share — native OS share sheet, clipboard fallback. */
    const shareBtn = main.querySelector('.venue-share-btn');
    if (shareBtn && window.WA.Share) {
      shareBtn.addEventListener('click', async () => {
        const r = await window.WA.Share.url({
          title: entry.title,
          text:  `${entry.title} — ${entry.venue}`,
          url:   window.location.href,
        });
        if (r === 'copied' || r === 'shared') flashDone(shareBtn);
      });
    }

    /* Wire Add to calendar — client-side .ics download (dated picks only). */
    const calBtn = main.querySelector('.venue-cal-btn');
    if (calBtn && window.WA.Share) {
      calBtn.addEventListener('click', () => {
        if (window.WA.Share.downloadIcs(entry)) flashDone(calBtn);
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

  /* place.js-style guard (ROADMAP P3): render from the static catalog
     immediately when present; wa:catalog-ready re-renders with live data. */
  if (window.WA && (window.WA._catalogAll || window.WA.catalog)) init();
  document.addEventListener('wa:catalog-ready', init);
})();
