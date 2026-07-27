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
  const { esc, safeUrl, buildMeta, isEchoQuote, bookmarkSVG, socialButtons } = window.WA.UI;
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
    return `<a class="action-btn" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer" aria-label="${label} (opens in a new tab)">${label}${EXT_ICON}</a>`;
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
    /* Website rides in the shared socialButtons icon row — place.html
       already solved "website + socials" this way, and the icon-system
       contract makes external links icon-only (the labeled "Venue
       website" button was the one fork of this pattern; design-system
       audit Jul 2026). The ticket link above stays labeled: it's the
       event-specific action. */
    const social = socialButtons({ name: sv.name, website: sv.website, facebook: sv.facebook, instagram: sv.instagram });
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
    /* The venue plate's meta is the VENUE's identity (place · kind) —
       buildMeta(entry) repeated the event's full "nhood · kind · day time"
       line verbatim 40px under the identical page-head meta, and a venue
       isn't "Fri 21:00" (July 2026 audit). Prefer the venue record; fall
       back to the pick's fields, minus the 'other' data bucket. */
    const venueMeta = [
      (matchedVenue && matchedVenue.neighborhood) ||
        (entry.neighborhood && entry.neighborhood.toLowerCase() !== 'other' ? entry.neighborhood : null),
      (matchedVenue && matchedVenue.kind) || null,
      /* Literal separator, not "&middot;" — venueMeta is esc()'d at both of
         its interpolation sites (correctly; the parts are scraped), which
         turned the entity's "&" into "&amp;" and printed the raw entity. */
    ].filter(Boolean).join(' · ');

    /* Other picks by the same curator (excludes current entry); cap at 5. */
    const moreAll  = catalog.filter(e => e.handle === entry.handle && e.id !== entry.id);
    const more     = moreAll.slice(0, 5);
    const moreRest = moreAll.length - more.length;

    /* Mood-tag chips (interactive filter links) — kept in the long tail
       below the answer card so they stay tappable, never over the photo. */
    const moodChips = entry.moodTags && entry.moodTags.length ? `
        <p class="venue-moods">
          ${entry.moodTags.map(t =>
            `<a href="discover.html#mood=${encodeURIComponent(t)}" class="venue-mood">${t}</a>`
          ).join('')}
        </p>` : '';

    /* Map link — venue name + city (venue_details refines the address
       async, but the name query already resolves in Maps). */
    const cityName = (window.WA && window.WA.CITY) || 'tallinn';
    const mapsUrl  = `https://maps.google.com/?q=${encodeURIComponent(`${entry.venue}, ${cityName}`)}`;

    /* Dusk Glass: the photo is the scene; a probe img downgrades
       a dead URL to the dusk-gradient fallback (never a gray box). */
    const heroUrl = entry.imageUrl ? esc(safeUrl(WA.img(entry.imageUrl, 1080)).replace(/'/g, '%27')) : '';
    const sceneBg = entry.imageUrl
      ? `<div class="scene__bg" style="background-image:url('${heroUrl}')" aria-hidden="true"><img class="detail-hero__probe" src="${heroUrl}" alt="" aria-hidden="true"></div>`
      : `<div class="scene__bg scene__bg--fallback" aria-hidden="true">${!entry.imageUrl ? `<span class="scene__glyph">${thumbEl({ ...entry, imageUrl: null }, true)}</span>` : ''}</div>`;

    /* The three answer cells (WHEN / WHERE / GETTING IN) — 12px values,
       single-line. GETTING IN reads the honest best source we have:
       ticket/event page host → mood tags (ticketed / walk-up) → the
       venue's door, stated plainly. */
    const whenVal = [entry.day === 'Tonight' || entry.tonight ? 'Tonight' : entry.day, entry.time]
      .filter(Boolean).join(' ') || 'Open dates';
    const whereVal = matchedVenue
      ? `<a href="place.html?id=${encodeURIComponent(matchedVenue.id)}">${esc(entry.venue)} &nearr;</a>`
      : `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">${esc(entry.venue)} &nearr;</a>`;
    let inVal = 'At the venue';
    let ticketHost = '';
    try { ticketHost = entry.permalink ? new URL(entry.permalink).host : ''; } catch (_) {}
    if (/fienta\.|ra\.co|residentadvisor|piletilevi|tiketti|ticketmaster|eventbrite/i.test(ticketHost)) {
      inVal = `<a href="${esc(safeUrl(entry.permalink))}" target="_blank" rel="noopener noreferrer">Tickets &nearr;</a>`;
    } else if ((entry.moodTags || []).includes('ticketed')) {
      inVal = 'Ticketed';
    } else if ((entry.moodTags || []).includes('walk-up')) {
      inVal = 'Walk-up';
    }

    /* Lime is the TONIGHT signal only — any other day rides glass. */
    const isTonight = entry.tonight || entry.day === 'Tonight'
      || entry.day === ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()];
    const tagDay = isTonight ? 'Tonight' : (entry.day || 'Place');
    const tagClass = isTonight ? 'tag--live' : 'tag--scene';

    main.innerHTML = `
      <article aria-label="${esc(entry.title)}">

      <div class="scene scene--detail">
        ${sceneBg}
        <div class="scene__scrim" aria-hidden="true"></div>
        <a class="scene-float scene-float--back" href="${href}" aria-label="${label.replace('&larr; ', 'Back to ')}">
          <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
          <span class="scene-float__label">${label.replace('&larr; ', '')}</span>
        </a>

        <div class="scene__main">
          <div class="scene-tags">
            <span class="tag ${tagClass}">${esc(tagDay)}</span>
            ${venueMeta ? `<span class="tag tag--scene one-line">${esc(venueMeta)}</span>` : (entry.kind ? `<span class="tag tag--scene one-line">${esc(entry.kind)}</span>` : '')}
          </div>
          <h1 class="scene-title scene-title--detail">${esc(entry.title)}</h1>

          <!-- The whole answer is ONE glass card: quote → three equal
               56px info cells → one 48 action row. -->
          <div class="answer island island--deep">
            <blockquote class="scene-quote scene-quote--card"><p>${esc(entry.quote)}</p></blockquote>
            <p class="scene-attr one-line">&mdash; <a class="handle" href="curator.html?handle=${encodeURIComponent(entry.handle)}">${esc(entry.handle)}</a>${moreAll.length ? ` &middot; ${moreAll.length + 1} picks` : ''}</p>
            <div class="answer__cells wa-row">
              <span class="answer__cell"><span class="answer__k">When</span><span class="answer__v one-line">${esc(whenVal)}</span></span>
              <span class="answer__cell"><span class="answer__k">Where</span><span class="answer__v one-line">${whereVal}</span></span>
              <span class="answer__cell"><span class="answer__k">Getting in</span><span class="answer__v one-line">${inVal}</span></span>
            </div>
            <div class="scene-actions wa-row">
              <button class="scene-cta venue-going-btn" type="button">
                <span class="action-btn__label">I&rsquo;m going &rarr;</span>
              </button>
              <label class="bookmark scene-key scene-key--incard" title="Save this pick">
                <input type="checkbox" class="bookmark__check" data-id="${entry.id}"
                       aria-label="Bookmark: ${esc(entry.title)}" ${isMarked ? 'checked' : ''}>
                ${bookmarkSVG()}
              </label>
              ${entry.day ? `<button class="scene-key scene-key--incard venue-cal-btn" type="button" aria-label="Add to calendar" title="Add to calendar">
                <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="15" rx="2"/><path d="M4 11h16M8 3v5M16 3v5"/></svg>
              </button>` : ''}
              <!-- Share lives here, not floating over the photo: this row IS
                   the pick's action set. It replaces the old map key, which
                   only repeated the WHERE cell's link two lines above. -->
              <button class="scene-key scene-key--incard venue-share-btn" type="button" aria-label="Share this pick" title="Share">
                <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M8 7.5L12 3.5l4 4"/><path d="M5 12v8h14v-8"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="page-below">
        ${moodChips}

        <!-- Venue plate: thumb + name + meta + ONE labelled
             "Venue →" link into the place page — answers the old
             place-page dead end without twin ambiguous map links. -->
        <section class="venue-block" aria-label="Venue">
          <div class="venue-card">
            <span class="venue-card__media">${thumbEl(entry, true)}</span>
            <div class="venue-card__body">
              <p class="venue-card__name">${esc(entry.venue)}</p>
              ${venueMeta ? `<p class="list-row__meta">${esc(venueMeta)}</p>` : ''}
            </div>
            ${matchedVenue ? `<a class="venue-card__go" href="place.html?id=${encodeURIComponent(matchedVenue.id)}">Venue &rarr;</a>` : ''}
          </div>
          ${entry.imageUrl && entry.imageAttr ? `<p class="photo-credit">${esc(entry.imageAttr)}</p>` : ''}

          <!-- Venue details — address / hours / short_desc; async-populated by fetchVenueDetails() -->
          <div id="venue-details" class="venue-details" hidden></div>

          <!-- External "how to go" links: venue website + ticket/event page
               (labelled buttons) then Facebook/Instagram icons. Re-rendered by
               fetchVenueDetails() when a website arrives from venue_details. -->
          <div id="venue-ext" class="venue-ext">${renderExt(socialObj, entry.permalink)}</div>
        </section>

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
                   <p class="list-row__meta">${esc(buildMeta(e))}</p>
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

      <footer class="colophon">
        <p class="colophon__line"><a href="./about.html">About</a> &middot; WanderAlt &middot; A curator vouched for every pick</p>
      </footer>

      </div><!-- /.page-below -->
      </article>
    `;

    /* Quote clamps at 4 lines; when it actually overflows,
       a quiet "more" un-clamps it in place. */
    const quoteP = main.querySelector('.answer .scene-quote p');
    if (quoteP && quoteP.scrollHeight > quoteP.clientHeight + 2) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'quote-more';
      more.textContent = 'more';
      more.addEventListener('click', () => {
        quoteP.closest('.scene-quote').classList.add('scene-quote--open');
        more.remove();
      });
      quoteP.closest('.scene-quote').insertAdjacentElement('afterend', more);
    }

    /* If the scene photo URL is dead (Google Places URIs can 403 over
       time), drop to the dusk-gradient fallback — the voice and answer
       card are separate layers, so nothing else moves (never
       a gray box). The probe shares the background's URL, so it errors
       in lockstep with the unpaintable CSS background. */
    const heroProbe = main.querySelector('.detail-hero__probe');
    if (heroProbe) {
      heroProbe.addEventListener('error', () => {
        const bg = heroProbe.closest('.scene__bg');
        if (bg) {
          bg.style.backgroundImage = '';
          bg.classList.add('scene__bg--fallback');
        }
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
           leaking literal asterisks, and escape everything else. */
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

    /* Icon-only action buttons flash the glyph to a petrol check on
       success — shared impl in ui-helpers (curator share uses it too). */
    const flashDone = window.WA.UI.flashDone;

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
    /* .page-below carries the detail column — without it the empty state
       spanned the viewport while the topbar sat in a 1180 band. */
    main.innerHTML = `
      <div class="page-below page-below--notfound">
        <a class="venue-back" href="${href}">${label}</a>
        ${window.WA.UI.emptyState('Not in the catalog',
          'This pick may have moved or expired. <a href="discover.html">Browse this week &rarr;</a>')}
      </div>`;
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

  /* place.js-style guard: render from the static catalog
     immediately when present; wa:catalog-ready re-renders with live data. */
  if (window.WA && (window.WA._catalogAll || window.WA.catalog)) init();
  document.addEventListener('wa:catalog-ready', init);
})();
