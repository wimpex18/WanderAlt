/* ============================================================
   WanderAlt — Place (venue) detail page
   ------------------------------------------------------------
   Reads ?id=<venue-id> from the URL, finds the venue in
   window.WA.venues (city slice) or WA._venuesAll (cross-city),
   and renders a standalone place page:

     ← Back link (Discover)
     Eyebrow (kind) · h1 name · meta (neighborhood · kind)
     Social links (website / Facebook / Instagram)
     Open in maps ↗  ·  See on map →
     ──────
     Events here — picks at this venue (RA / Google-Maps pattern)
     Colophon

   A place is a permanent venue, not a dated pick: no curator
   quote, no bookmark. The events nested below ARE picks and link
   to their own venue.html detail.

   Load order (place.html):
     catalog.js → city.js → supabase.js → bookmark.js → place.js
   ============================================================ */
(() => {
  /* Shared render helpers — single implementation in ui-helpers.js (P1). */
  const { esc, buildMeta, isEchoQuote, socialButtons } = window.WA.UI;
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

    /* Map affordances: a Google-Maps deep link (lightweight — no embedded
       MapLibre on a detail page) + a link back to the place on Discover's
       map. Only when the venue is geocoded. */
    const mapLinks = (venue.lat != null && venue.lng != null)
      ? `<p class="place-maplinks">
           <a class="place-maplink" href="https://maps.google.com/?q=${venue.lat},${venue.lng}" target="_blank" rel="noopener noreferrer">Open in Google Maps &uarr;</a>
           <a class="place-maplink" href="./discover.html?type=places&amp;view=map&amp;id=${encodeURIComponent(venue.id)}">See on city map &rarr;</a>
         </p>`
      : '';

    /* Events here — picks whose venue name matches this place. */
    const here = picks.filter(p => p.venue && venue.name &&
      p.venue.trim().toLowerCase() === venue.name.trim().toLowerCase());

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

    main.innerHTML = `
      <a class="venue-back" href="${href}">${label}</a>

      <article aria-label="${esc(venue.name)}">
        <div class="venue-head">
          <p class="eyebrow">${esc(kindLabel(venue.kind))}</p>
          <h1 class="venue-title">${esc(venue.name)}</h1>
          <p class="meta">${esc(meta)}</p>
          ${social}
          ${mapLinks}
        </div>

        ${eventsSection}
      </article>

      <footer class="colophon">
        <p class="colophon__line"><a href="./about.html">About</a> &middot; WanderAlt &middot; A curator vouched for every pick. AI is the index, not the editor. Places are sourced from OpenStreetMap.</p>
      </footer>
    `;
  };

  const renderNotFound = () => {
    const main = document.getElementById('place-main');
    if (!main) return;
    const { href, label } = backLink();
    main.innerHTML = `
      <a class="venue-back" href="${href}">${label}</a>
      <p class="empty-line">This place isn&rsquo;t in the catalog &mdash; it may have closed or moved.</p>
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

  if (window.WA && window.WA.venues) init();
  document.addEventListener('wa:catalog-ready', init);
})();
