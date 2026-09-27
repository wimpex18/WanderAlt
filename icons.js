/* ============================================================
   icons.js — WA.Icon, the one icon set.
   ------------------------------------------------------------
   24px grid, 1.75 stroke, round joins, drawn in currentColor so every
   icon follows the text it sits beside. WA.Icon(name) returns SVG
   markup; WA.Icon.kind(kind) maps a catalogue kind to its glyph.
   Static pages inline the same paths by hand.
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const P = {
    search:   '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
    close:    '<path d="M6 6l12 12M18 6 6 18"/>',
    check:    '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    plus:     '<path d="M12 5v14M5 12h14"/>',
    arrow:    '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back:     '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    out:      '<path d="M8 16 16 8M9 8h7v7"/>',
    chevron:  '<path d="m9 6 6 6-6 6"/>',
    down:     '<path d="m6 9 6 6 6-6"/>',
    walk:     '<circle cx="13" cy="4.5" r="1.6"/><path d="m9 21 2.6-6.4M14.6 21l-1.9-4.8-1.4-3.4 1-4.3-3.3 1.6-1.6 3.4M12.3 8.9l1.5 3.4 3.2 1.4"/>',
    clock:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    ticket:   '<path d="M3.5 8.5V6.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v2a2.5 2.5 0 0 0 0 5v2a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-2a2.5 2.5 0 0 0 0-5z"/><path d="M14.5 5.5v11" stroke-dasharray="1.6 2"/>',
    save:     '<path d="M6.5 3.5h11v17L12 16.6 6.5 20.5z"/>',
    saved:    '<path d="M6.5 3.5h11v17L12 16.6 6.5 20.5z" fill="currentColor"/>',
    list:     '<path d="M4 6.5h11M4 12h11M4 17.5h7M18 14v7M14.5 17.5h7"/>',
    share:    '<path d="M12 3.5v11M7.5 8 12 3.5 16.5 8M5 13v6.5h14V13"/>',
    filter:   '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    map:      '<path d="m9 4.5-5 2v13l5-2 6 2 5-2v-13l-5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
    pin:      '<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    locate:   '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>',
    layers:   '<path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/>',
    globe:    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5z"/>',
    instagram:'<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.9"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>',
    facebook: '<path d="M14 8.5h2.5V5H14a3.5 3.5 0 0 0-3.5 3.5V11H8v3.5h2.5V21H14v-6.5h2.5L17 11h-3V9a.5.5 0 0 1 .5-.5z"/>',
    follow:   '<path d="M12 4.5v15M4.5 12h15"/>',
    user:     '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    moon:     '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    programme:'<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',
    store:    '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12v8.5h13V12M10 20.5v-5h4v5"/>',
    offline:  '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.8a10 10 0 0 1 4.3-2.5M19 12.8a10 10 0 0 0-2.8-2.1M2 9.2a15 15 0 0 1 3.8-2.5M22 9.2A15 15 0 0 0 11 5.6"/><circle cx="12" cy="20" r=".8" fill="currentColor"/>',
    info:     '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
    spark:    '<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.6 2.6M15.4 15.4 18 18M6 18l2.6-2.6M15.4 8.6 18 6"/>',
    /* Kinds */
    gig:      '<path d="M9 18.5V6l10-2v12"/><circle cx="6.5" cy="18.5" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    club:     '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/>',
    film:     '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
    theatre:  '<path d="M4.5 4.5h9v6a4.5 4.5 0 0 1-9 0z"/><path d="M13.5 8.5h6v6a4.5 4.5 0 0 1-7.8 3"/><path d="M7 8h.01M11 8h.01M7.3 11.5a2.4 2.4 0 0 0 3.4 0M15.5 12h.01M18 12h.01"/>',
    art:      '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="m4 16 4.5-4.5 4 4 2.5-2.5L20 18"/><circle cx="15" cy="8.5" r="1.5"/>',
    talk:     '<path d="M4.5 5.5h15v10h-8l-4.5 4v-4h-2.5z"/><path d="M8.5 10.5h7"/>',
    workshop: '<path d="M14.5 4.5a4 4 0 0 0-4.9 5.3L4 15.4 8.6 20l5.6-5.6a4 4 0 0 0 5.3-4.9l-2.6 2.6-2.3-.6-.6-2.3z"/>',
    market:   '<path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
    books:    '<path d="M4.5 5.5c2.6-1 5-1 7.5.5v14c-2.5-1.5-4.9-1.5-7.5-.5zM19.5 5.5c-2.6-1-5-1-7.5.5v14c2.5-1.5 4.9-1.5 7.5-.5z"/>',
    records:  '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 12h.01M6.8 9A6 6 0 0 1 9 6.8"/>',
    thrift:   '<path d="M12 6.5a1.8 1.8 0 1 0-1.8-1.8M12 6.5v1.8L3.5 15a1 1 0 0 0 .6 1.8h15.8a1 1 0 0 0 .6-1.8L12 8.3"/>',
    festival: '<path d="M5 21V4M5 4.5h12.5l-2.5 4 2.5 4H5"/>',
    bar:      '<path d="M5.5 4.5h13L12 12zM12 12v8M8.5 20.5h7"/>',
    centre:   '<path d="M3.5 20.5h17M5 20.5V10l7-5.5 7 5.5v10.5M9.5 20.5v-6h5v6"/>',
    place:    '<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  };

  /* Catalogue kinds are loose; this is the one place they meet a glyph. */
  const KIND = {
    gig: 'gig', concert: 'gig', music: 'gig',
    club: 'club', party: 'club', rave: 'club',
    film: 'film', cinema: 'film', screening: 'film',
    theatre: 'theatre', dance: 'theatre', performance: 'theatre', burlesque: 'theatre',
    exhibition: 'art', gallery: 'art', art: 'art', museum: 'art',
    talk: 'talk', lecture: 'talk',
    workshop: 'workshop', class: 'workshop',
    market: 'market', flea: 'market', fair: 'market',
    thrift: 'thrift',
    bookshop: 'books', books: 'books', library: 'books',
    'record store': 'records', records: 'records', vinyl: 'records',
    festival: 'festival',
    bar: 'bar', pub: 'bar', cafe: 'bar',
    'arts centre': 'centre', community: 'centre',
  };

  const kindIcon = (kind) => KIND[String(kind || '').toLowerCase().trim()] || 'place';

  const Icon = (name, cls) =>
    `<svg class="wa-ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name] || P.place}</svg>`;

  Icon.kind = (kind, cls) => Icon(kindIcon(kind), cls);
  Icon.kindName = kindIcon;

  window.WA.Icon = Icon;
})();
