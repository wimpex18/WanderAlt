/* ============================================================
   WanderAlt — Place (venue) detail page
   ------------------------------------------------------------
   Reads ?id=<venue-id> from the URL, finds the venue in
   window.WA.venues (city slice) or WA._venuesAll (cross-city),
   and renders a standalone place page:

     ← Back link (Discover)
     Eyebrow (kind) · h1 name · meta (neighborhood · kind) · Save
     Social links (website / Facebook / Instagram)
     Open in maps ↗  ·  See on map →
     ──────
     Events here — picks at this venue (RA / Google-Maps pattern)
     Colophon

   A place is a permanent venue, not a dated pick: no curator quote (a
   place has no single curator attached the way a pick does — "Events
   here" below is where curator voice shows up, per-event). It IS
   bookmarkable though (Jul 2026 — Google Maps Saved Places / Airbnb
   Wishlist pattern: saving a *place* to check out later, no date
   attached, is a standard place-discovery convention, not something
   that should be withheld just because it's not a dated pick). Shares
   the same window.WA.Bookmarks store as picks; saved.js's Reading tab
   surfaces bookmarked places alongside dateless picks — both read as
   "things to check out, no schedule" to the reader already.

   Load order (place.html):
     catalog.js → city.js → supabase.js → bookmark.js → place.js
   ============================================================ */
(() => {
  /* Shared render helpers — single implementation in ui-helpers.js (P1). */
  const { esc, safeUrl, buildMeta, isEchoQuote, socialButtons, bookmarkSVG } = window.WA.UI;
  const mediaHtml = window.WA.UI.rowMedia;

  const KIND_LABELS = {
    'record store': 'Record store', 'bookshop': 'Bookshop', 'gallery': 'Gallery',
    'club': 'Club', 'thrift': 'Flea & thrift', 'arts centre': 'Arts centre',
    'cinema': 'Cinema', 'community': 'Community space',
  };
  const kindLabel = (k) => KIND_LABELS[k] || (k ? k[0].toUpperCase() + k.slice(1) : 'Place');

  /* Photo media tile — reuses the app's .thumb--lg treatment so "Events
     here" matches the Discover / Saved / Curator / venue photo cards. Falls
     back to the initials tile when the pick has no image. Decorative
     supplementary link (the title link is the keyboard tab stop). */

  const backLink = () => {
    try {
      const ref = new URL(document.referrer);
      if (ref.pathname.endsWith('discover.html')) return { href: document.referrer, label: '&larr; Discover' };
    } catch (_) { /* cross-origin or empty referrer */ }
    return { href: './discover.html?type=places', label: '&larr; Discover' };
  };

  const render = (venue, picks) => {
    const main = document.getElementById('place-main');
    if (!main) return;

    document.title = `WanderAlt — ${venue.name}`;
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.content = `${venue.name} — ${kindLabel(venue.kind)} in ${venue.neighborhood || venue.city}.`;

    const { href, label } = backLink();
    /* Kind already carries the eyebrow — repeating it here printed the
       same word twice on venues with no neighborhood. */
    const meta = venue.neighborhood || '';
    /* venues.city holds the slug ("tallinn"), so it can't be printed raw.
       It is also the only WHERE most places have: venues.neighborhood is
       empty across the whole table, and the address only arrives if that
       venue has a venue_details row. */
    const citySlug  = venue.city || (window.WA && window.WA.CITY) || 'tallinn';
    const cityLabel = citySlug.charAt(0).toUpperCase() + citySlug.slice(1);

    const social = socialButtons({
      name:      venue.name,
      website:   venue.website,
      facebook:  venue.facebook,
      instagram: venue.instagram,
    });

    const isMarked = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[venue.id]);
    const saveToggle = `<label class="bookmark scene-key scene-key--incard scene-key--wide place-save" title="Save this place">
      <input type="checkbox" class="bookmark__check" data-id="${esc(venue.id)}" aria-label="Save: ${esc(venue.name)}"${isMarked ? ' checked' : ''}>
      ${bookmarkSVG()}
      <span class="scene-key__label">Save</span>
    </label>`;

    /* Events here — picks whose venue name matches this place. */
    const here = picks.filter(p => p.venue && venue.name &&
      p.venue.trim().toLowerCase() === venue.name.trim().toLowerCase());

    /* Dusk Glass scene (no board for this page — the system applied):
       the venue's photo comes from a pick held here (venues carry no
       image_url of their own); the fallback is the kind glyph on the
       dusk gradient, never a gray box. */
    const photoPick = here.find(p => p.imageUrl);
    const heroUrl = photoPick
      ? window.WA.img(photoPick.imageUrl, 1080).replace(/'/g, '%27') : '';
    const sceneBg = heroUrl
      ? `<div class="scene__bg" style="background-image:url('${heroUrl}')" aria-hidden="true"><img class="detail-hero__probe" src="${heroUrl}" alt="" aria-hidden="true"></div>`
      : `<div class="scene__bg scene__bg--fallback" aria-hidden="true"><span class="scene__glyph">${window.WA.UI.thumb({ ...venue, imageUrl: null, title: venue.name }, true)}</span></div>`;

    /* Lime is the live signal: only when something here is on tonight. */
    const today = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()];
    const liveTonight = here.some(p => p.tonight || p.day === 'Tonight' || p.day === today);

    const eventsSection = here.length ? `
      <hr class="rule" style="margin-bottom:0">
      <section aria-labelledby="here-label">
        <header class="search-section-head">
          <p id="here-label" class="eyebrow">Events here</p>
        </header>
        <ol class="list-rows" role="list" data-animate>
          ${here.map(e => `
            <li class="list-row list-row--card" data-id="${esc(e.id)}">
              ${mediaHtml(e)}
              <div class="list-row__body">
                <p class="list-row__title"><a href="venue.html?id=${encodeURIComponent(e.id)}">${esc(e.title)}</a></p>
                <p class="list-row__meta">${esc(buildMeta(e))}</p>
                ${isEchoQuote(e)
                  ? `<p class="list-row__quote">via <a class="handle" href="curator.html?handle=${encodeURIComponent(e.handle)}">${esc(e.handle)}</a></p>`
                  : `<p class="list-row__quote">&mdash; ${esc(e.quote)} <a class="handle" href="curator.html?handle=${encodeURIComponent(e.handle)}">${esc(e.handle)}</a></p>`}
              </div>
            </li>`).join('')}
        </ol>
      </section>` : `
      <hr class="rule" style="margin-bottom:0">
      <div class="picks-empty">
        <div class="picks-empty__plate" style="background-image:url('./assets/${esc(venue.city || (window.WA && window.WA.CITY) || 'tallinn')}-overview.svg')" aria-hidden="true"></div>
        <div class="picks-empty__body">
          <p class="picks-empty__title">Nothing on here right now</p>
          <p class="picks-empty__sub">Check back, or <a href="./discover.html">browse what&rsquo;s on &rarr;</a></p>
        </div>
      </div>`;

    /* Actions, in the same two-row shape as the pick detail: one primary
       CTA on its own line, then labelled keys. Four unlabelled 48px icons
       were the whole action set here — they met the tap floor and told you
       nothing. Directions is the primary because it is what a place page is
       for; the icon set for Facebook/Instagram moves to the long tail,
       where venue.html already puts it. */
    const geocoded = venue.lat != null && venue.lng != null;
    const ctaRow = geocoded
      ? `<div class="scene-actions wa-row">
           <a class="scene-cta" href="https://maps.google.com/?q=${venue.lat},${venue.lng}" target="_blank" rel="noopener noreferrer">
             <span class="action-btn__label">Directions &rarr;</span>
           </a>
         </div>`
      : '';
    const mapKey = geocoded
      ? `<a class="scene-key scene-key--incard scene-key--wide" href="./discover.html?type=places&amp;view=map&amp;id=${encodeURIComponent(venue.id)}" aria-label="See ${esc(venue.name)} on the city map">
           <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>
           <span class="scene-key__label">Map</span>
         </a>`
      : '';
    const siteKey = venue.website
      ? `<a class="scene-key scene-key--incard scene-key--wide" href="${esc(safeUrl(venue.website))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(venue.name)} website (opens in a new tab)">
           <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>
           <span class="scene-key__label">Website</span>
         </a>`
      : '';

    main.innerHTML = `
      <article aria-label="${esc(venue.name)}">

      <div class="scene scene--detail scene--place">
        ${sceneBg}
        <div class="scene__scrim" aria-hidden="true"></div>
        <a class="scene-float scene-float--back" href="${href}" aria-label="Back to Discover">
          <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
          <span class="scene-float__label">${label.replace('&larr; ', '')}</span>
        </a>

        <div class="scene__main">
          <div class="scene-tags">
            ${liveTonight ? '<span class="tag tag--live">Tonight</span>' : ''}
            <span class="tag tag--scene one-line">${esc(kindLabel(venue.kind))}${meta ? ` &middot; ${esc(meta)}` : ''}</span>
          </div>
          <h1 class="scene-title scene-title--detail">${esc(venue.name)}</h1>

          <div class="answer island island--deep">
            <p class="scene-meta one-line">${here.length
              ? `${here.length} pick${here.length !== 1 ? 's' : ''} here`
              : 'Nothing on right now'}</p>
            <!-- The same three-cell answer the pick detail gives. WHERE and
                 HOURS fill in from venue_details once it lands; a place with
                 no enrichment row keeps the honest em-dash rather than a
                 cell that never appears. -->
            <div class="answer__cells wa-row" id="place-cells">
              <span class="answer__cell"><span class="answer__k">Type</span><span class="answer__v one-line">${esc(kindLabel(venue.kind))}</span></span>
              <span class="answer__cell"><span class="answer__k">Where</span><span class="answer__v one-line" data-cell="where">${esc(meta || cityLabel)}</span></span>
            </div>
            ${ctaRow}
            <div class="scene-actions scene-actions--keys wa-row">
              ${saveToggle}
              ${mapKey}
              ${siteKey}
            </div>
          </div>
        </div>
      </div>

      <div class="page-below">
        <!-- Address / phone / full opening hours / description, from the
             same venue_details lane venue.html reads. This page rendered
             without any of it while the rows sat in the table. -->
        <div id="venue-details" class="venue-details" hidden></div>
        <div id="venue-ext" class="venue-ext">${social}</div>

        ${eventsSection}

      <footer class="colophon">
        <p class="colophon__line"><a href="./about.html">About</a> &middot; WanderAlt &middot; A curator vouched for every pick. Places are sourced from OpenStreetMap.</p>
      </footer>
      </div><!-- /.page-below -->
      </article>
    `;

    /* venue_details enrichment — the shared lane in ui-helpers. Fill is
       partial across the table (address on 80 of 188 rows, hours on 58),
       so every consumer here is guarded and the block stays hidden when
       nothing came back. */
    (async () => {
      const city = venue.city || (window.WA && window.WA.CITY) || 'tallinn';
      const vd = await window.WA.UI.fetchVenueDetails(city, venue.name);
      if (!vd) return;

      /* The address is a better WHERE than the neighborhood once we have
         it — it is the thing you actually navigate by. */
      const whereCell = main.querySelector('[data-cell="where"]');
      if (vd.address && whereCell) whereCell.textContent = vd.address;

      /* The third cell is added only once there's an answer for it, best
         available first. Rendering an empty HOURS cell up front printed a
         dead em-dash on the ~70% of enriched venues that have no hours. */
      const today = window.WA.UI.hoursToday(vd.opening_hours);
      const third = today ? ['Hours', today] : (vd.phone ? ['Phone', vd.phone] : null);
      const cells = document.getElementById('place-cells');
      if (third && cells) {
        cells.insertAdjacentHTML('beforeend',
          `<span class="answer__cell"><span class="answer__k">${third[0]}</span>` +
          `<span class="answer__v one-line">${esc(third[1])}</span></span>`);
      }

      /* venues seeds the socials; venue_details fills what OSM missed. */
      let extChanged = false;
      const sv = { name: venue.name, website: venue.website, facebook: venue.facebook, instagram: venue.instagram };
      for (const k of ['website', 'facebook', 'instagram']) {
        if (vd[k] && !sv[k]) { sv[k] = vd[k]; extChanged = true; }
      }
      if (extChanged) {
        const ext = document.getElementById('venue-ext');
        if (ext) ext.innerHTML = socialButtons(sv);
      }

      const el = document.getElementById('venue-details');
      const skip = ['address'];
      /* Today's line moved to the cell, but the full week stays in the tail
         — that disclosure is the reason the block exists. */
      if (third && third[0] === 'Hours') skip.push('hours-today');
      if (third && third[0] === 'Phone') skip.push('phone');
      const html = window.WA.UI.venueFacts(vd, city, { skip });
      if (el && html) { el.innerHTML = html; el.hidden = false; }
    })();

    /* Photo probe: a dead pick-photo URL drops the scene to the dusk
       gradient (never a gray box). */
    const probe = main.querySelector('.detail-hero__probe');
    if (probe) {
      probe.addEventListener('error', () => {
        const bg = probe.closest('.scene__bg');
        if (bg) { bg.style.backgroundImage = ''; bg.classList.add('scene__bg--fallback'); }
      });
    }
  };

  const renderNotFound = () => {
    const main = document.getElementById('place-main');
    if (!main) return;
    const { href, label } = backLink();
    /* .page-below carries the detail column — see venue.js. */
    main.innerHTML = `
      <div class="page-below page-below--notfound">
        <a class="venue-back" href="${href}">${label}</a>
        ${window.WA.UI.emptyState('Not in the catalog',
          'This place may have closed or moved. <a href="discover.html?type=places">Browse places &rarr;</a>')}
      </div>`;
  };

  const init = () => {
    const venues    = (window.WA && window.WA.venues)     || [];
    const venuesAll = (window.WA && window.WA._venuesAll)  || venues;
    const picks     = (window.WA && window.WA._catalogAll) || (window.WA && window.WA.catalog) || [];
    const id        = new URLSearchParams(window.location.search).get('id');

    const venue = id
      ? (venues.find(v => v.id === id) || venuesAll.find(v => v.id === id))
      : null;

    if (venue) {
      /* Reflect the venue's city on the banner without persisting it. */
      if (venue.city && venue.city !== window.WA?.CITY) {
        document.body.dataset.city = venue.city;
      }
      render(venue, picks);
    } else {
      renderNotFound();
    }
  };

  /* Bookmark toggle — persists via the shared store. Delegated once on
     document since render() rebuilds #place-main's innerHTML (a per-
     element listener would leak on re-render via wa:catalog-ready). */
  document.addEventListener('change', (e) => {
    const cb = e.target.closest('.bookmark__check');
    if (!cb || !window.WA.Bookmarks) return;
    window.WA.Bookmarks.set(cb.dataset.id, cb.checked);
  });

  if (window.WA && window.WA.venues) init();
  document.addEventListener('wa:catalog-ready', init);
})();
