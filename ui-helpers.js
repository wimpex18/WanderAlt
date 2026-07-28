/* ============================================================
   WanderAlt — ui-helpers.js (June 2026)
   ------------------------------------------------------------
   The shared render helpers that used to be hand-copied into 5–6
   page scripts ("script-tag ordering is the module system, and
   nothing enforces it" — the copies drifted, and fixes like the
   'other' guard had to be applied five times). One extra
   <script defer> tag, no build step.

   Exposes window.WA.UI:
     esc(s)             HTML-escape for template interpolation
     buildMeta(e)       "Neighborhood · kind · day time" meta line
     isEchoQuote(e)     true when a pick's quote merely echoes its
                        curator's signature tagline (or is empty)
     bookmarkSVG()      the bookmark glyph
     thumb(e, large)    a .thumb span (photo or initials tile)
     rowMedia(e)        the .list-row__media link wrapping a --lg thumb
     socialButtons(v)   web/social link buttons for a venue/place
                        ({ name, website, facebook, instagram })
     fetchVenueDetails(city, venueName)
                        the venue_details enrichment row, or null
     venueFacts(vd, city, {skip})
                        address / phone / hours / description markup;
                        `skip` drops fields the page shows elsewhere
     hoursToday(openingHours)
                        today's line out of the opening_hours column
     pickLinks(links, kind)
                        the pick's artist/film/author links, kind-ordered
     priceLabel(pick)   "Free" / "€12" / "€24–75", or '' when unknown

   Load order: any page script using WA.UI must load AFTER this file
   (all pages use <script defer>, so document order is the contract).
   saved.js keeps its own buildMeta on purpose — Going rows put the
   day in a separate time column, so its meta line differs.
   ============================================================ */
(() => {
  window.WA = window.WA || {};

  /* Escapes the single quote as well as the double, so this stays correct if
     someone writes attr='${esc(x)}' — every site uses double quotes today,
     which is the only reason the narrower version was never a live bug.
     Reading a value back through .dataset or .textContent decodes the
     entities, so nothing downstream sees &#39;. */
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  /* Week ordering for day-grouped lists (Tonight first, then Mon–Sun;
     unknown/absent days sink to the end). One shared table so This Week's
     day groups and any other day-sorted surface agree on the week shape. */
  const DAY_RANK = { Tonight: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

  const buildMeta = (e) => {
    /* 'other' is a data bucket, not a place — never print it. */
    const nhood = e.neighborhood && e.neighborhood.toLowerCase() !== 'other' ? e.neighborhood : null;
    const parts = [nhood, e.kind];
    if (e.day && e.day !== 'Tonight') parts.push(e.time ? `${e.day} ${e.time}` : e.day);
    else if (e.time)                  parts.push(e.time);
    return parts.filter(Boolean).join(' · ');
  };

  /* A pick whose quote merely echoes the curator's signature tagline adds
     noise row after row — render the quote only when it was written
     for the pick; otherwise attribute the row with a quiet "via @handle"
     (the Today list idiom). Empty quotes take the same path. */
  const isEchoQuote = (e) => {
    const q = (e.quote || '').trim().toLowerCase();
    if (!q) return true;
    const cs = (window.WA && (window.WA._curatorsAll || window.WA.curators)) || [];
    const c  = cs.find(x => x.handle === e.handle);
    return !!(c && c.tagline && q === c.tagline.trim().toLowerCase());
  };

  const bookmarkSVG = () =>
    `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
         stroke-width="1.25" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
       <path d="M6 3h12v18l-6-4-6 4V3z" />
     </svg>`;

  /* Kind-based placeholder glyphs (July 2026 photo-led redesign) — a plain
     two-letter monogram reads as a broken avatar; a glyph that names the
     kind of thing (a note for a gig, a mask-light for theatre) reads as a
     deliberate placeholder and keeps a no-photo row scannable at a glance.
     Round caps/joins on purpose — distinct from the sharp .ic action-icon
     system, since these describe content rather than trigger an action. */
  const KIND_GLYPH = {
    gig: 'music', club: 'music',
    theatre: 'theatre', burlesque: 'theatre',
    cinema: 'film',
    exhibition: 'art', gallery: 'art', art: 'art', museum: 'art', 'arts centre': 'art',
    talk: 'mic', lecture: 'mic',
    bar: 'drink',
    bookshop: 'book', 'record store': 'vinyl',
    thrift: 'tag', market: 'tag',
  };
  const GLYPH_PATH = {
    music:   '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2.4"/><circle cx="17" cy="16" r="2.4"/>',
    theatre: '<circle cx="12" cy="5" r="1.8"/><path d="M8 20l3-12h2l3 12z"/>',
    film:    '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M8 5v14M16 5v14M3 10h5M16 10h5M3 15h5M16 15h5"/>',
    art:     '<path d="M12 3a9 9 0 1 0 6.4 15.4c.8-.8.3-2.2-.8-2.4h-1.3a2.7 2.7 0 0 1-2-4.5A9 9 0 0 0 12 3z"/><circle cx="7.5" cy="11" r="1.1"/><circle cx="11.5" cy="7.5" r="1.1"/><circle cx="15.8" cy="9.5" r="1.1"/>',
    mic:     '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M9 21h6"/>',
    drink:   '<path d="M6 3h12l-1.6 9.5a4.4 4.4 0 0 1-8.8 0L6 3z"/><path d="M12 15v6"/><path d="M8.5 21h7"/>',
    book:    '<path d="M12 6c-2-1.5-5-2-8-1.3v13c3-.7 6-.2 8 1.3 2-1.5 5-2 8-1.3v-13c-3-.7-6-.2-8 1.3z"/><path d="M12 6v13"/>',
    /* Distinct from "music" (gig/club) on purpose — record store shows up
       right next to Club in Discover's Places quick-filter row, and two
       identical icons side by side in a 4-chip row defeats the point of
       using icons for at-a-glance scanning. */
    vinyl:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="0.8" fill="currentColor"/>',
    tag:     '<path d="M3 11.5 11.5 3H19v7.5L10.5 19z"/><circle cx="15" cy="7" r="1.3"/>',
    star:    '<path d="M12 3.5 14.4 9l6 .8-4.4 4 1.1 6-5.1-3-5.1 3 1.1-6-4.4-4 6-.8z"/>',
  };
  const kindGlyphSvg = (kind) => {
    const key = KIND_GLYPH[(kind || '').toLowerCase()] || 'star';
    return `<svg class="thumb__glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
           `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH_PATH[key]}</svg>`;
  };

  /* Same glyph set, styled as a functional .ic action-icon (sharp square
     caps/joins, matching the button/chip icon system) instead of the
     rounded decorative thumb__glyph — for category-browsing chips (Jul
     2026: Discover's Places quick-filter row + Filters-sheet category
     chips), where the glyph is labeling a tappable filter, not standing
     in for a missing photo. One shared path-per-kind source (GLYPH_PATH)
     for both contexts — never fork the icon set. */
  const kindIconSvg = (kind) => {
    const key = KIND_GLYPH[(kind || '').toLowerCase()] || 'star';
    return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${GLYPH_PATH[key]}</svg>`;
  };

  /* A .thumb span — real photo when an image_url is set, otherwise a
     kind-based glyph tile. Used by the Tonight venue block, This Week rows,
     the venue-detail venue row and Discover's match hero.

     The photo is an <img> (not a CSS background) on purpose: venue photos
     resolve to Google Places CDN URLs that can later 403, and a background
     image has no onerror hook — so a dead URL used to leave a blank grey
     square. The glyph tile is rendered behind the <img>; a single global
     error handler (below) drops a broken .thumb__img so the glyph shows,
     matching the Tonight hero which already degraded this way. */
  const thumb = (entry, large = false) => {
    const imgUrl = entry.imageUrl || entry.image_url || null;
    const cls    = `thumb${large ? ' thumb--lg' : ''}`;
    const label  = imgUrl ? (entry.venue || entry.title || '') : `${entry.venue || entry.title || ''} placeholder`;
    const img    = imgUrl
      ? `<img class="thumb__img" src="${esc(WA.img(String(imgUrl), large ? 400 : 200))}" alt="" loading="lazy" decoding="async">`
      : '';
    return `<span class="${cls}" role="img" aria-label="${esc(label)}">` +
           kindGlyphSvg(entry.kind) +
           img +
           `</span>`;
  };

  /* The crafted empty / error state (city plate + Fraunces title + sub) —
     ONE impl for Saved's empty segments and the detail pages' bad-id
     states, which used to be a bare italic one-liner that read as broken
     next to the rest of the app's empty-state canon. subHTML may carry
     a CTA link; title is plain text. */
  const emptyState = (title, subHTML) => {
    /* Compact since Jul 2026 (owner direction): no city-overview plate —
       the big illustration ate ~450px of vertical space in every empty
       state; the city art lives on About and in the city selector. The
       curator-voice line + bridge link carry the state. */
    return `<div class="picks-empty picks-empty--compact">
         <div class="picks-empty__body">
           <p class="picks-empty__title">${esc(title)}</p>
           <p class="picks-empty__sub">${subHTML}</p>
         </div>
       </div>`;
  };

  /* The photo-card row media: a decorative .list-row__media link wrapping a
     --lg thumb (the title link is the keyboard tab stop). Shared by
     Discover events, Saved, Curator picks, place "events here". */
  const rowMedia = (e) =>
    `<a class="list-row__media" href="venue.html?id=${encodeURIComponent(e.id)}" tabindex="-1" aria-hidden="true">${thumb(e, true)}</a>`;

  /* External web / social links for a venue or place, rendered as a compact
     icon-only row (.social-links / .social-icon in styles.css) — small
     recognizable brand marks like a link-in-bio card, not big labelled
     buttons. Two glyph sets ship in the markup and CSS swaps them by
     viewport: filled marks on mobile (Simple Icons Facebook + Instagram,
     Bootstrap globe), outline marks on desktop (Tabler). Both inherit
     currentColor and go petrol on hover, so the two-tone brand holds (no
     brand colours). Pass { name, website, facebook, instagram }; only the
     links present are rendered, and '' comes back when there are none.
     Single source of truth for the social glyphs on detail pages. */
  const SOCIAL_SVG = {
    website:   "<svg viewBox=\"0 0 16 16\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m7.5-6.923c-.67.204-1.335.82-1.887 1.855q-.215.403-.395.872c.705.157 1.472.257 2.282.287zM4.249 3.539q.214-.577.481-1.078a7 7 0 0 1 .597-.933A7 7 0 0 0 3.051 3.05q.544.277 1.198.49zM3.509 7.5c.036-1.07.188-2.087.436-3.008a9 9 0 0 1-1.565-.667A6.96 6.96 0 0 0 1.018 7.5zm1.4-2.741a12.3 12.3 0 0 0-.4 2.741H7.5V5.091c-.91-.03-1.783-.145-2.591-.332M8.5 5.09V7.5h2.99a12.3 12.3 0 0 0-.399-2.741c-.808.187-1.681.301-2.591.332zM4.51 8.5c.035.987.176 1.914.399 2.741A13.6 13.6 0 0 1 7.5 10.91V8.5zm3.99 0v2.409c.91.03 1.783.145 2.591.332.223-.827.364-1.754.4-2.741zm-3.282 3.696q.18.469.395.872c.552 1.035 1.218 1.65 1.887 1.855V11.91c-.81.03-1.577.13-2.282.287zm.11 2.276a7 7 0 0 1-.598-.933 9 9 0 0 1-.481-1.079 8.4 8.4 0 0 0-1.198.49 7 7 0 0 0 2.276 1.522zm-1.383-2.964A13.4 13.4 0 0 1 3.508 8.5h-2.49a6.96 6.96 0 0 0 1.362 3.675c.47-.258.995-.482 1.565-.667m6.728 2.964a7 7 0 0 0 2.275-1.521 8.4 8.4 0 0 0-1.197-.49 9 9 0 0 1-.481 1.078 7 7 0 0 1-.597.933M8.5 11.909v3.014c.67-.204 1.335-.82 1.887-1.855q.216-.403.395-.872A12.6 12.6 0 0 0 8.5 11.91zm3.555-.401c.57.185 1.095.409 1.565.667A6.96 6.96 0 0 0 14.982 8.5h-2.49a13.4 13.4 0 0 1-.437 3.008M14.982 7.5a6.96 6.96 0 0 0-1.362-3.675c-.47.258-.995.482-1.565.667.248.92.4 1.938.437 3.008zM11.27 2.461q.266.502.482 1.078a8.4 8.4 0 0 0 1.196-.49 7 7 0 0 0-2.275-1.52c.218.283.418.597.597.932m-.488 1.343a8 8 0 0 0-.395-.872C9.835 1.897 9.17 1.282 8.5 1.077V4.09c.81-.03 1.577-.13 2.282-.287z\"/></svg>",
    facebook:  "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z\"/></svg>",
    instagram: "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077\"/></svg>",
  };
  /* Outline variant (Tabler) — shown on desktop; the filled set above
     is shown on mobile. Same currentColor / petrol-hover treatment. */
  const SOCIAL_SVG_LINE = {
    website:   "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /> <path d=\"M3.6 9h16.8\" /> <path d=\"M3.6 15h16.8\" /> <path d=\"M11.5 3a17 17 0 0 0 0 18\" /> <path d=\"M12.5 3a17 17 0 0 1 0 18\" /></svg>",
    facebook:  "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M7 10v4h3v7h4v-7h3l1 -4h-4v-2a1 1 0 0 1 1 -1h3v-4h-3a5 5 0 0 0 -5 5v2h-3\" /></svg>",
    instagram: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 8a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4l0 -8\" /> <path d=\"M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" /> <path d=\"M16.5 7.5v.01\" /></svg>",
  };
  const SOCIAL_LABEL = { website: 'Website', facebook: 'Facebook', instagram: 'Instagram' };

  /* Only http(s) URLs may become an href or an image source. Pick and venue
     URLs come from scraped pages via an LLM, so a `javascript:` value is a
     realistic input, and esc() would happily pass it through — it escapes
     quotes, not schemes. Relative paths stay allowed; everything else is
     dropped rather than rendered dead. */
  const safeUrl = (u) => {
    if (!u) return '';
    const raw = String(u).trim();
    if (/^[\\/][^\\/]/.test(raw) || raw.startsWith('./') || raw.startsWith('../')) return raw;
    try {
      const proto = new URL(raw, location.origin).protocol;
      return (proto === 'http:' || proto === 'https:') ? raw : '';
    } catch (_) { return ''; }
  };

  /* A scraped photo URL, made safe for BOTH halves of the scene backdrop:
     the `url('…')` inside a style attribute and the probe `<img src>` next
     to it. Three separate jobs, which is exactly why hand-rolling it twice
     went wrong — safeUrl() drops non-http(s) schemes, the quote is
     percent-encoded so it cannot close the CSS string, and esc() stops it
     closing the HTML attribute.

     Both detail pages built this inline and only venue.js carried all
     three steps; place.js shipped with none of them, so a pick photo
     containing a double quote broke out of src="…" and the parser
     attached whatever attribute followed (onerror included). Same bug
     class as the Jul 2026 stored-XSS probe, one file it missed. One
     implementation now — call it, don't re-derive it. */
  const heroUrl = (rawUrl, width = 1080) => {
    if (!rawUrl) return '';
    const sized = window.WA.img ? window.WA.img(String(rawUrl), width) : String(rawUrl);
    const safe  = safeUrl(sized);
    return safe ? esc(safe.replace(/'/g, '%27')) : '';
  };

  const socialButtons = (obj) => {
    if (!obj) return '';
    const name = obj.name || 'This venue';
    const btns = ['website', 'facebook', 'instagram']
      .filter(k => obj[k])
      .map(k => {
        const aria = k === 'website' ? `${name} website` : `${name} on ${SOCIAL_LABEL[k]}`;
        /* Both glyph variants ship in the markup; CSS shows the filled set on
           mobile and the outline set on desktop (.social-icon__g--* swap). */
        const url = safeUrl(obj[k]);
        if (!url) return '';
        return `<a class="social-icon" data-social="${k}" href="${esc(url)}" ` +
               `target="_blank" rel="noopener noreferrer" aria-label="${esc(aria)}">` +
               `<span class="social-icon__g social-icon__g--fill">${SOCIAL_SVG[k]}</span>` +
               `<span class="social-icon__g social-icon__g--line">${SOCIAL_SVG_LINE[k]}</span>` +
               `</a>`;
      })
      .join('');
    return btns ? `<div class="social-links">${btns}</div>` : '';
  };

  /* Password show/hide. passwordField() wraps a password <input> in a
     composite .field-pw with an embedded eye toggle (same borderless
     icon-button language as .social-icon); one delegated handler below
     toggles type + glyph for every such field, whenever rendered. The
     glyphs are the Tabler eye / eye-off marks. */
  const EYE_SVG     = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" /></svg>';
  const EYE_OFF_SVG = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" /><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" /><path d="M3 3l18 18" /></svg>';
  const passwordField = (inputHtml, wrapStyle) =>
    `<span class="field-pw"${wrapStyle ? ` style="${wrapStyle}"` : ''}>${inputHtml}` +
    `<button type="button" class="pw-toggle" aria-label="Show password" aria-pressed="false">${EYE_SVG}</button></span>`;

  /* Icon-only action buttons can't show a text confirmation — flash the
     glyph to a petrol check, then restore. One impl for the venue action
     row and the curator share button (was two hand-copies). */
  const flashDone = (el) => {
    if (!el || el.dataset.flashing) return;
    /* Swap only the glyph when the control carries a label — replacing the
       whole subtree would blank "Share"/"Add date" for the 1.6s flash. */
    const target = el.querySelector('.scene-key__label') ? el.querySelector('svg') : el;
    if (!target) return;
    const orig = target.outerHTML === undefined ? target.innerHTML : target.outerHTML;
    const labelled = target !== el;
    el.dataset.flashing = '1';
    el.classList.add('action-icon--done');
    const check = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';
    if (labelled) target.outerHTML = check; else el.innerHTML = check;
    setTimeout(() => {
      if (labelled) { const cur = el.querySelector('svg'); if (cur) cur.outerHTML = orig; }
      else el.innerHTML = orig;
      el.classList.remove('action-icon--done');
      delete el.dataset.flashing;
    }, 1600);
  };

  /* ── The pick's own links ───────────────────────────────────────
     picks.links is written by resolve-links, which asks MusicBrainz /
     Open Library / Wikidata what a named artist, author or film links
     to. Thirteen platforms can come back for one band; showing all
     thirteen is noise, so each kind gets an ordered shortlist and the
     row caps at five.

     Named chips, not icons: the venue's website/socials are icon-only
     because there are three of them and everyone knows the marks. Here
     the set is open-ended and mixed (Bandcamp next to Letterboxd next
     to Open Library), and a row of unfamiliar glyphs is a guessing
     game. wikidata/musicbrainz are deliberately never shown — they are
     how we found the rest, not somewhere a reader wants to go. */
  const LINK_LABEL = {
    spotify: 'Spotify', soundcloud: 'SoundCloud', bandcamp: 'Bandcamp',
    mixcloud: 'Mixcloud', discogs: 'Discogs', residentadvisor: 'Resident Advisor',
    youtube: 'YouTube', lastfm: 'Last.fm', imdb: 'IMDb', letterboxd: 'Letterboxd',
    openlibrary: 'Open Library', website: 'Official site',
    instagram: 'Instagram', facebook: 'Facebook', twitter: 'X', bluesky: 'Bluesky',
  };
  const LINK_ORDER = {
    music: ['spotify', 'bandcamp', 'soundcloud', 'mixcloud', 'youtube', 'discogs', 'residentadvisor', 'lastfm', 'website', 'instagram'],
    film:  ['letterboxd', 'imdb', 'youtube', 'website'],
    book:  ['openlibrary', 'website', 'instagram'],
    other: ['website', 'instagram', 'facebook', 'youtube'],
  };
  const LINK_FAMILY = (kind) => {
    const k = String(kind || '').toLowerCase();
    if (['gig', 'club', 'concert', 'festival'].includes(k)) return 'music';
    if (['cinema', 'film'].includes(k))                     return 'film';
    if (['talk', 'lecture', 'reading', 'bookshop'].includes(k)) return 'book';
    return 'other';
  };
  const LINK_EYEBROW = {
    music: 'Hear them first', film: 'About the film',
    book: 'About the author', other: 'More about this',
  };

  const pickLinks = (links, kind) => {
    if (!links || typeof links !== 'object') return '';
    const family = LINK_FAMILY(kind);
    const chips = LINK_ORDER[family]
      .filter(k => links[k])
      .slice(0, 5)
      .map(k => {
        const url = safeUrl(links[k]);
        if (!url) return '';
        const label = LINK_LABEL[k] || k;
        return `<a class="pick-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer"` +
               ` aria-label="${esc(label)} (opens in a new tab)">${esc(label)}` +
               `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"/><path d="M11 13l9 -9"/><path d="M15 4h5v5"/></svg></a>`;
      })
      .join('');
    if (!chips) return '';
    return `<section class="pick-links" aria-label="${esc(LINK_EYEBROW[family])}">` +
           `<p class="eyebrow">${esc(LINK_EYEBROW[family])}</p>` +
           `<div class="pick-links__row">${chips}</div></section>`;
  };

  /* "Free" / "€12" / "€24–75". Only ever from a stated source value —
     picks with no price data print nothing, never "price TBC". */
  const priceLabel = (p) => {
    if (!p) return '';
    if (p.isFree) return 'Free';
    if (p.priceMin == null) return '';
    const sym = p.currency === 'EUR' ? '€' : (p.currency ? p.currency + ' ' : '');
    const n = (v) => (Number(v) % 1 === 0 ? String(Number(v)) : Number(v).toFixed(2));
    return (p.priceMax != null && Number(p.priceMax) !== Number(p.priceMin))
      ? `${sym}${n(p.priceMin)}–${n(p.priceMax)}`
      : `${sym}${n(p.priceMin)}`;
  };

  /* ── venue_details: one lane, one renderer ──────────────────────
     Wikidata + Google Places enrichment, keyed by (city, lowercased
     venue name). venue.html has read this table since June; place.html
     — the page literally about a venue — rendered without an address,
     hours or phone while the same row sat in the table. Both pages now
     share this fetch and the markup below.

     Fill is partial by design (188 rows for 2573 venues, and hours on
     58 of those), so every field is optional and the block hides itself
     when nothing came back. */
  const fetchVenueDetails = async (city, venueName) => {
    const base = window.WA && window.WA.BASE_URL;
    const key  = window.WA && window.WA.ANON_KEY;
    if (!base || !key || !venueName) return null;
    try {
      const r = await fetch(
        `${base}/rest/v1/venue_details` +
        `?city=eq.${encodeURIComponent(city || 'tallinn')}` +
        `&venue_key=eq.${encodeURIComponent(String(venueName).toLowerCase())}` +
        `&select=website,facebook,instagram,address,short_desc,opening_hours,phone,business_status&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      if (!r.ok) return null;
      const rows = await r.json();
      return rows[0] || null;
    } catch (_) { return null; }
  };

  /* Today's opening line out of Google's weekdayDescriptions array
     (index 0 = Monday; JS getDay() is 0 = Sunday). Returns '' when the
     column is absent or unparseable — callers treat that as "unknown". */
  const hoursToday = (openingHours) => {
    if (!openingHours) return '';
    try {
      const hrs = JSON.parse(openingHours);
      if (!Array.isArray(hrs) || !hrs.length) return '';
      return hrs[(new Date().getDay() + 6) % 7] || '';
    } catch (_) { return ''; }
  };

  /* The facts block: closure status, address, phone, hours, description.
     Every value here is scraped or third-party, so every one is esc()'d.
     Returns '' when the row carries nothing worth printing. */
  const venueFacts = (vd, city, opts) => {
    if (!vd) return '';
    /* opts.skip: field names already shown elsewhere on the page. */
    const skip = (opts && opts.skip) || [];
    const parts = [];

    if (vd.business_status === 'CLOSED_PERMANENTLY') {
      parts.push('<p class="venue-details__status venue-details__status--perm">Permanently closed</p>');
    } else if (vd.business_status === 'CLOSED_TEMPORARILY') {
      parts.push('<p class="venue-details__status venue-details__status--temp">Temporarily closed</p>');
    }

    /* place.html promotes the address into its WHERE cell and the phone
       into the third cell, so repeating them here is the same redundancy
       the old duplicate map key was. venue.html's cells hold the pick's
       own when/where/getting-in, so it keeps every line. */
    if (vd.address && !skip.includes('address')) {
      const mq = encodeURIComponent(`${vd.address}, ${city || 'tallinn'}`);
      parts.push(
        `<a class="venue-details__address" href="https://maps.google.com/?q=${mq}"` +
        ` target="_blank" rel="noopener noreferrer">${esc(vd.address)} &nearr;</a>`
      );
    }

    if (vd.phone && !skip.includes('phone')) {
      parts.push(
        `<a class="venue-details__phone" href="tel:${esc(vd.phone.replace(/\s/g, ''))}">${esc(vd.phone)}</a>`
      );
    }

    if (vd.opening_hours && !skip.includes('hours')) {
      try {
        const hrs = JSON.parse(vd.opening_hours);
        if (Array.isArray(hrs) && hrs.length) {
          const todayIdx  = (new Date().getDay() + 6) % 7;
          const todayLine = hrs[todayIdx] || '';
          const allRows   = hrs.map((line, i) =>
            `<li class="venue-details__hours-row${i === todayIdx ? ' venue-details__hours-row--today' : ''}">${esc(line)}</li>`
          ).join('');
          /* 'hours-today' keeps the full-week disclosure while dropping the
             today line, for pages that already show today in a cell. */
          parts.push(
            '<div class="venue-details__hours">' +
              (skip.includes('hours-today') ? '' : `<p class="venue-details__hours-today">${esc(todayLine)}</p>`) +
              '<details class="venue-details__hours-disclosure">' +
                '<summary class="venue-details__hours-summary">All hours</summary>' +
                `<ol class="venue-details__hours-list">${allRows}</ol>` +
              '</details>' +
            '</div>'
          );
        }
      } catch (_) { /* unparseable column — skip the block */ }
    }

    if (vd.short_desc) parts.push(`<p class="venue-details__desc">${esc(vd.short_desc)}</p>`);

    return parts.join('\n');
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.pw-toggle');
    if (!btn) return;
    const input = btn.parentNode && btn.parentNode.querySelector('input');
    if (!input) return;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    btn.innerHTML = reveal ? EYE_OFF_SVG : EYE_SVG;
    btn.setAttribute('aria-pressed', reveal ? 'true' : 'false');
    btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  });

  /* Drop broken venue photos so the initials tile behind them shows. Google
     Places CDN URLs can 403 over time; image error events don't bubble, so
     listen in the capture phase at the document root. One handler covers
     every .thumb__img on every page (Today, Discover, Saved, Curator, venue,
     place). */
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('thumb__img')) t.remove();
  }, true);

  window.WA.UI = { esc, safeUrl, heroUrl, buildMeta, isEchoQuote, bookmarkSVG, thumb, rowMedia, kindIconSvg, socialButtons, passwordField, DAY_RANK, emptyState, flashDone, fetchVenueDetails, venueFacts, hoursToday, pickLinks, priceLabel };
})();
