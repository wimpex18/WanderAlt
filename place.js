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
  const { esc, buildMeta, isEchoQuote, socialButtons, bookmarkSVG } = window.WA.UI;
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
       same word twice on venues with no neighborhood (F-20). */
    const meta = venue.neighborhood || '';

    const social = socialButtons({
      name:      venue.name,
      website:   venue.website,
      facebook:  venue.facebook,
      instagram: venue.instagram,
    });

    const isMarked = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[venue.id]);
    const saveToggle = `<label class="bookmark scene-key scene-key--incard place-save" title="Save this place">
      <input type="checkbox" class="bookmark__check" data-id="${esc(venue.id)}" aria-label="Save: ${esc(venue.name)}"${isMarked ? ' checked' : ''}>
      ${bookmarkSVG()}
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

    /* Map keys: Google-Maps deep link + the place on Discover's map —
       icon keys in the one 48 action row (geocoded venues only). */
    const mapKeys = (venue.lat != null && venue.lng != null)
      ? `<a class="scene-key scene-key--incard" href="https://maps.google.com/?q=${venue.lat},${venue.lng}" target="_blank" rel="noopener noreferrer" aria-label="Open in Google Maps (opens in a new tab)" title="Open in Google Maps">
           <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg>
         </a>
         <a class="scene-key scene-key--incard" href="./discover.html?type=places&amp;id=${encodeURIComponent(venue.id)}" aria-label="See on the city map" title="See on the city map">
           <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>
         </a>`
      : '';

    main.innerHTML = `
      <article aria-label="${esc(venue.name)}">

      <div class="scene scene--detail scene--place">
        ${sceneBg}
        <div class="scene__scrim" aria-hidden="true"></div>
        <a class="scene-float scene-float--back" href="${href}" aria-label="Back to Discover">
          <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
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
            <div class="scene-actions scene-actions--place wa-row">
              ${saveToggle}
              ${mapKeys}
              ${social}
            </div>
          </div>
        </div>
      </div>

      <div class="page-below">
        ${eventsSection}

      <footer class="colophon">
        <p class="colophon__line"><a href="./about.html">About</a> &middot; WanderAlt &middot; A curator vouched for every pick. Places are sourced from OpenStreetMap.</p>
      </footer>
      </div><!-- /.page-below -->
      </article>
    `;

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
    main.innerHTML = `
      <a class="venue-back" href="${href}">${label}</a>
      ${window.WA.UI.emptyState('Not in the catalog',
        'This place may have closed or moved. <a href="discover.html?type=places">Browse places &rarr;</a>')}
    `;
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
