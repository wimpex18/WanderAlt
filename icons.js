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

  /* Two tones, like a system symbol drawn hierarchically: the line in currentColor
     and, where a shape has a body, that body (class "t") filled at a low strength
     behind it. Selected (the current tab, a pressed toggle) the body fills in and
     the inner lines (class "k") are knocked out of it. Keep the "t" shape first. */
  const P = {
    search:   '<circle class="t" cx="10.5" cy="10.5" r="6.5"/><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.4 15.4 4.6 4.6"/>',
    close:    '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    check:    '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    plus:     '<path d="M12 5v14M5 12h14"/>',
    arrow:    '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back:     '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    out:      '<path d="M8 16 16 8M9.5 8H16v6.5"/>',
    chevron:  '<path d="m9.5 6 6 6-6 6"/>',
    left:     '<path d="m14.5 6-6 6 6 6"/>',
    down:     '<path d="m6 9.5 6 6 6-6"/>',
    walk:     '<circle cx="13.2" cy="4.6" r="1.7"/><path d="m8.8 21 2.7-6.5M14.7 21l-1.8-4.6-1.6-3.6 1-4.3-3.4 1.7-1.5 3.3M12.4 8.9l1.6 3.3 3.3 1.3"/>',
    /* Now: a clock with the brand's night spark. */
    clock:    '<circle class="t" cx="11" cy="13" r="7.5"/><circle cx="11" cy="13" r="7.5"/><path class="k" d="M11 9v4l2.8 1.8"/><path class="t" d="M19 2.6c.3 1.5 1 2.2 2.4 2.4-1.4.3-2.1 1-2.4 2.4-.3-1.4-1-2.1-2.4-2.4 1.4-.2 2.1-.9 2.4-2.4z"/><path d="M19 2.6c.3 1.5 1 2.2 2.4 2.4-1.4.3-2.1 1-2.4 2.4-.3-1.4-1-2.1-2.4-2.4 1.4-.2 2.1-.9 2.4-2.4z"/>',
    calendar: '<path class="t" d="M3.5 9.5V7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2.5z"/><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path class="k" d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
    ticket:   '<path class="t" d="M3.5 8.5V7a1.5 1.5 0 0 1 1.5-1.5h14A1.5 1.5 0 0 1 20.5 7v1.5a2.5 2.5 0 0 0 0 5V15a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15v-1.5a2.5 2.5 0 0 0 0-5z"/><path d="M3.5 8.5V7a1.5 1.5 0 0 1 1.5-1.5h14A1.5 1.5 0 0 1 20.5 7v1.5a2.5 2.5 0 0 0 0 5V15a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15v-1.5a2.5 2.5 0 0 0 0-5z"/><path class="k" d="M14.5 5.5v11" stroke-dasharray="1.6 2.2"/>',
    heart:    '<path class="t" d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    hearted:  '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="currentColor"/>',
    nav:      '<path class="t" d="M20 4 4 11l7 2 2 7z"/><path d="M20 4 4 11l7 2 2 7z"/>',
    kinds:    '<rect class="t" x="3.5" y="11" width="7" height="9.5" rx="2"/><rect x="3.5" y="11" width="7" height="9.5" rx="2"/><rect x="13.5" y="11" width="7" height="9.5" rx="2"/><path d="M12 2.5c.4 2.2 1.5 3.3 3.7 3.7-2.2.4-3.3 1.5-3.7 3.7-.4-2.2-1.5-3.3-3.7-3.7 2.2-.4 3.3-1.5 3.7-3.7z"/>',
    globe2:   '<circle class="t" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path class="k" d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5z"/>',
    menu:     '<path d="M4 7h16M4 12h16M4 17h16"/>',
    /* Saved: a bookmark with a soft fold at its foot. */
    save:     '<path class="t" d="M7 3.5h10A1.5 1.5 0 0 1 18.5 5v15.5L12 16.4l-6.5 4.1V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M7 3.5h10A1.5 1.5 0 0 1 18.5 5v15.5L12 16.4l-6.5 4.1V5A1.5 1.5 0 0 1 7 3.5z"/>',
    saved:    '<path d="M7 3.5h10A1.5 1.5 0 0 1 18.5 5v15.5L12 16.4l-6.5 4.1V5A1.5 1.5 0 0 1 7 3.5z" fill="currentColor"/>',
    list:     '<path d="M4 6.5h11M4 12h11M4 17.5h7M18 14v7M14.5 17.5h7"/>',
    share:    '<path class="t" d="M5 13v5.5A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2V13z"/><path d="M12 3.5v11M7.5 8 12 3.5 16.5 8M5 13v5.5A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2V13"/>',
    filter:   '<circle class="t" cx="16" cy="7" r="2.2"/><circle class="t" cx="9" cy="17" r="2.2"/><path d="M4 7h9.8M18.2 7H20M4 17h2.8M11.2 17H20"/><circle cx="16" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
    /* Map: a folded map, its middle panel toned, and a pin. */
    map:      '<path class="t" d="M9 4.5l6 2v13l-6-2z"/><path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path class="k" d="M9 4.5v13M15 6.5v13"/>',
    pin:      '<path class="t" d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z"/><path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z"/><circle class="k" cx="12" cy="10" r="2.3"/>',
    locate:   '<circle class="t" cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>',
    layers:   '<path class="t" d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z"/><path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5l8.5 4.5 8.5-4.5"/>',
    globe:    '<circle class="t" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path class="k" d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5z"/>',
    instagram:'<rect class="t" x="3.5" y="3.5" width="17" height="17" rx="5"/><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle class="k" cx="12" cy="12" r="3.9"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>',
    facebook: '<path d="M14 8.5h2.5V5H14a3.5 3.5 0 0 0-3.5 3.5V11H8v3.5h2.5V21H14v-6.5h2.5L17 11h-3V9a.5.5 0 0 1 .5-.5z"/>',
    follow:   '<path d="M12 4.5v15M4.5 12h15"/>',
    people:   '<circle class="t" cx="9" cy="8.5" r="3.3"/><path class="t" d="M3 19.5a6 6 0 0 1 12 0z"/><circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.5 13.9a6 6 0 0 1 3.5 5.6"/>',
    /* You: a head and shoulders. */
    user:     '<circle class="t" cx="12" cy="8.3" r="3.8"/><path class="t" d="M4.6 20.3a7.4 7.4 0 0 1 14.8 0z"/><circle cx="12" cy="8.3" r="3.8"/><path d="M4.6 20.3a7.4 7.4 0 0 1 14.8 0z"/>',
    moon:     '<path class="t" d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/><path d="M17 3.5v3M15.5 5h3"/>',
    sun:      '<circle class="t" cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    programme:'<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',
    store:    '<path class="t" d="M4 9.5 5.5 4h13L20 9.5z"/><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12v8.5h13V12M10 20.5v-5h4v5"/>',
    offline:  '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.8a10 10 0 0 1 4.3-2.5M19 12.8a10 10 0 0 0-2.8-2.1M2 9.2a15 15 0 0 1 3.8-2.5M22 9.2A15 15 0 0 0 11 5.6"/><circle cx="12" cy="20" r=".8" fill="currentColor"/>',
    info:     '<circle class="t" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path class="k" d="M12 11v5.5M12 7.8v.4"/>',
    ai:       '<path class="t" d="M11 3.5c.7 4.3 2.9 6.5 7.2 7.2-4.3.7-6.5 2.9-7.2 7.2-.7-4.3-2.9-6.5-7.2-7.2 4.3-.7 6.5-2.9 7.2-7.2z"/><path d="M11 3.5c.7 4.3 2.9 6.5 7.2 7.2-4.3.7-6.5 2.9-7.2 7.2-.7-4.3-2.9-6.5-7.2-7.2 4.3-.7 6.5-2.9 7.2-7.2z"/><path d="M18.5 15c.3 1.6 1 2.3 2.6 2.6-1.6.3-2.3 1-2.6 2.6-.3-1.6-1-2.3-2.6-2.6 1.6-.3 2.3-1 2.6-2.6z"/>',
    spark:    '<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.6 2.6M15.4 15.4 18 18M6 18l2.6-2.6M15.4 8.6 18 6"/>',
    refresh:  '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    shuffle:  '<path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.7-3.4M20 7h-3.5c-1.4 0-2.4.9-3.2 2.1"/><path d="m17.5 4.5 2.5 2.5-2.5 2.5M17.5 14.5l2.5 2.5-2.5 2.5"/>',
    /* Guide: an open book with a ribbon. */
    guide:    '<path class="t" d="M12 6.5C10 5 7.3 4.6 4 5v13.5c3.3-.4 6 0 8 1.5z"/><path d="M12 6.5C10 5 7.3 4.6 4 5v13.5c3.3-.4 6 0 8 1.5 2-1.5 4.7-1.9 8-1.5V5c-3.3-.4-6 0-8 1.5zM12 6.5V20"/><path d="M16 4.6V10l1.5-1 1.5 1V4.8"/>',
    /* Easy to join alone: two stools at a counter. */
    join:     '<path class="t" d="M3.5 8.5h7v2h-7zM13.5 8.5h7v2h-7z"/><path d="M3.5 8.5h7M4.8 8.5 4 19M9.2 8.5l.8 10.5M4.4 14h5.2M13.5 8.5h7M14.8 8.5 14 19M19.2 8.5l.8 10.5M14.4 14h5.2"/>',
    /* Kinds */
    gig:      '<circle class="t" cx="6.5" cy="18.5" r="2.5"/><circle class="t" cx="16.5" cy="16" r="2.5"/><path d="M9 18.5V6l10-2v12"/><path d="M9 9.5l10-2"/><circle cx="6.5" cy="18.5" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    club:     '<circle class="t" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><circle class="k" cx="12" cy="12" r="2.5"/><path class="k" d="M12 6.5a5.5 5.5 0 0 1 5.5 5.5"/>',
    film:     '<rect class="t" x="7.5" y="5" width="9" height="14"/><rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
    theatre:  '<path class="t" d="M4.5 4.5h9v6a4.5 4.5 0 0 1-9 0z"/><path d="M4.5 4.5h9v6a4.5 4.5 0 0 1-9 0z"/><path d="M13.5 8.5h6v6a4.5 4.5 0 0 1-7.8 3"/><path class="k" d="M7 8h.01M11 8h.01M7.3 11.5a2.4 2.4 0 0 0 3.4 0"/><path d="M15.5 12h.01M18 12h.01"/>',
    art:      '<rect class="t" x="4" y="4" width="16" height="16" rx="1.5"/><rect x="4" y="4" width="16" height="16" rx="1.5"/><path class="k" d="m4 16 4.5-4.5 4 4 2.5-2.5L20 18"/><circle class="k" cx="15" cy="8.5" r="1.5"/>',
    talk:     '<path class="t" d="M4.5 5.5h15v10h-8l-4.5 4v-4h-2.5z"/><path d="M4.5 5.5h15v10h-8l-4.5 4v-4h-2.5z"/><path class="k" d="M8.5 10.5h7"/>',
    workshop: '<path class="t" d="M14.5 4.5a4 4 0 0 0-4.9 5.3L4 15.4 8.6 20l5.6-5.6a4 4 0 0 0 5.3-4.9l-2.6 2.6-2.3-.6-.6-2.3z"/><path d="M14.5 4.5a4 4 0 0 0-4.9 5.3L4 15.4 8.6 20l5.6-5.6a4 4 0 0 0 5.3-4.9l-2.6 2.6-2.3-.6-.6-2.3z"/>',
    market:   '<path class="t" d="M5.5 8h13l-1 12.5h-11z"/><path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
    books:    '<path class="t" d="M4.5 5.5c2.6-1 5-1 7.5.5v14c-2.5-1.5-4.9-1.5-7.5-.5z"/><path d="M4.5 5.5c2.6-1 5-1 7.5.5v14c-2.5-1.5-4.9-1.5-7.5-.5zM19.5 5.5c-2.6-1-5-1-7.5.5v14c2.5-1.5 4.9-1.5 7.5-.5z"/>',
    records:  '<circle class="t" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><circle class="k" cx="12" cy="12" r="3"/><path class="k" d="M12 12h.01M6.8 9A6 6 0 0 1 9 6.8"/>',
    thrift:   '<path class="t" d="M12 8.3 3.5 15a1 1 0 0 0 .6 1.8h15.8a1 1 0 0 0 .6-1.8z"/><path d="M12 6.5a1.8 1.8 0 1 0-1.8-1.8M12 6.5v1.8L3.5 15a1 1 0 0 0 .6 1.8h15.8a1 1 0 0 0 .6-1.8L12 8.3"/>',
    festival: '<path class="t" d="M5 4.5h12.5l-2.5 4 2.5 4H5z"/><path d="M5 21V4M5 4.5h12.5l-2.5 4 2.5 4H5"/>',
    bar:      '<path class="t" d="M5.5 4.5h13L12 12z"/><path d="M5.5 4.5h13L12 12zM12 12v8M8.5 20.5h7"/>',
    centre:   '<path class="t" d="M5 10l7-5.5 7 5.5v10.5H5z"/><path d="M3.5 20.5h17M5 20.5V10l7-5.5 7 5.5v10.5"/><path class="k" d="M9.5 20.5v-6h5v6"/>',
    place:    '<path class="t" d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z"/><path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z"/><circle class="k" cx="12" cy="10" r="2.3"/>',
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
    bar: 'bar', pub: 'bar', cafe: 'bar', taproom: 'bar',
    'arts centre': 'centre', community: 'centre',
  };

  const kindIcon = (kind) => KIND[String(kind || '').toLowerCase().trim()] || 'place';

  const Icon = (name, cls) =>
    `<svg class="wa-ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name] || P.place}</svg>`;

  Icon.kind = (kind, cls) => Icon(kindIcon(kind), cls);
  Icon.kindName = kindIcon;

  window.WA.Icon = Icon;

  /* ── Labels ─────────────────────────────────────────────────
     The second tier, after 24px UI icons: round, flat discs for kinds and
     cities, each one Tallinn object on a muted ground with a faint groove
     ring like a record. They stand in for a picture when there is none, and
     a logo or photo sits in the same circle when there is one. Drawn on a
     64 grid; colours are fixed (the discs paint pictures, not the interface,
     so they do not follow the theme or the accent). Every disc sits beside
     its word. */
  const L = '#E6DCC8', B = '#B7CAD3', S = '#1F4A3F', R = '#C4573A', D = '#33406A', G = '#A9BBA0', K = '#101216', H = '#F28A4B';
  const DISC = {
    record:   [R, `<rect x="11" y="22" width="11" height="28" fill="${L}"/><rect x="23" y="17" width="11" height="33" fill="${B}"/><circle cx="43" cy="28" r="13" fill="${K}"/><circle cx="43" cy="28" r="8.5" fill="none" stroke="${L}" stroke-opacity=".3" stroke-width=".8"/><circle cx="43" cy="28" r="4" fill="${H}"/><circle cx="43" cy="28" r=".9" fill="${K}"/><rect x="7" y="40" width="50" height="20" fill="${K}"/><rect x="24" y="46" width="16" height="6" fill="${H}"/>`],
    cinema:   [D, `<rect x="14" y="14" width="36" height="22" fill="${L}"/><path d="M29 20 29 30 38 25Z" fill="${D}"/><rect x="14" y="38" width="36" height="2" fill="${H}"/><path d="M4 64V55a6 6 0 0 1 12 0V64Z" fill="${K}"/><path d="M24 64V57a8 8 0 0 1 16 0V64Z" fill="${K}"/><path d="M48 64V55a6 6 0 0 1 12 0V64Z" fill="${K}"/>`],
    gig:      [S, `<path d="M32 0 8 64H56Z" fill="${H}" fill-opacity=".22"/><rect x="31" y="30" width="2.6" height="24" fill="${K}"/><circle cx="32" cy="23" r="9" fill="${G}"/><rect x="24" y="22" width="16" height="3" fill="${K}" fill-opacity=".45"/><rect x="21" y="53" width="22" height="4" rx="2" fill="${K}"/><rect y="58" width="64" height="6" fill="${K}" fill-opacity=".35"/>`],
    club:     [K, `<rect x="31" width="2" height="15" fill="${L}"/><circle cx="32" cy="31" r="16" fill="${L}"/><path d="M16 31h32M32 15v32M20 20c8 4 16 4 24 0M20 42c8-4 16-4 24 0" fill="none" stroke="${D}" stroke-width="1.4"/><rect x="8" y="14" width="4" height="4" fill="${H}"/><rect x="52" y="10" width="3" height="3" fill="${H}"/><rect x="53" y="46" width="4" height="4" fill="${H}"/><rect x="9" y="47" width="3" height="3" fill="${H}"/>`],
    theatre:  [L, `<rect y="50" width="64" height="14" fill="${K}"/><path d="M0 0H25C20 14 22 32 13 50H0Z" fill="${R}"/><path d="M64 0H39C44 14 42 32 51 50H64Z" fill="${R}"/><rect width="64" height="7" fill="${K}" fill-opacity=".22"/><ellipse cx="32" cy="53" rx="12" ry="3" fill="${H}"/><circle cx="32" cy="33" r="3.6" fill="${K}"/><path d="M26 52 28 39Q32 36 36 39L38 52Z" fill="${K}"/>`],
    gallery:  [B, `<rect x="13" y="10" width="38" height="31" fill="${K}"/><rect x="16" y="13" width="32" height="25" fill="${L}"/><circle cx="37" cy="22" r="5" fill="${R}"/><path d="M16 38 26 27 33 34 39 29 48 38Z" fill="${S}"/><rect x="18" y="50" width="28" height="4" fill="${K}"/><rect x="21" y="54" width="3" height="10" fill="${K}"/><rect x="40" y="54" width="3" height="10" fill="${K}"/>`],
    books:    [G, `<rect y="52" width="64" height="12" fill="${K}" fill-opacity=".25"/><rect x="10" y="41" width="44" height="11" fill="${D}"/><rect x="14" y="44" width="7" height="5" fill="${H}"/><rect x="14" y="30" width="38" height="11" fill="${R}"/><rect x="18" y="19" width="30" height="11" fill="${L}"/><rect x="22" y="22" width="6" height="5" fill="${D}"/>`],
    bar:      [D, `<path d="M14 13H50L32 36Z" fill="${L}"/><path d="M19 18H45L32 33Z" fill="${R}"/><rect x="31" y="36" width="2" height="15" fill="${L}"/><rect x="22" y="50" width="20" height="3" rx="1.5" fill="${L}"/><circle cx="40" cy="15" r="3" fill="${G}"/><path d="M40 15 47 6" stroke="${H}" stroke-width="1.6"/><rect y="56" width="64" height="8" fill="${K}" fill-opacity=".35"/>`],
    thrift:   [S, `<path d="M32 19V15a3.5 3.5 0 1 1 3.5 3.5" fill="none" stroke="${L}" stroke-width="2.4" stroke-linecap="round"/><path d="M32 19 11 31H53Z" fill="none" stroke="${L}" stroke-width="2.4" stroke-linejoin="round"/><path d="M15 33 23 29Q32 37 41 29L49 33 44 41 42 39V57H22V39L20 41Z" fill="${R}"/>`],
    beer:     [S, `<rect y="56" width="64" height="8" fill="${K}" fill-opacity=".35"/><path d="M20 15H44L41 55H23Z" fill="${L}" fill-opacity=".3"/><path d="M21.4 24H42.6L40.7 52.5H23.3Z" fill="${H}"/><rect x="27" y="29" width="2.2" height="19" fill="${L}" fill-opacity=".55"/><circle cx="35" cy="40" r="1.2" fill="${L}" fill-opacity=".7"/><circle cx="33" cy="33" r=".9" fill="${L}" fill-opacity=".7"/><path d="M19 25V19a5 5 0 0 1 6.5-4.8 5.5 5.5 0 0 1 9.5-1 5 5 0 0 1 9 3.3V25Z" fill="${L}"/><path d="M44 30h4a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-5" fill="none" stroke="${L}" stroke-opacity=".45" stroke-width="2.6"/>`],
    spire:    [D, `<circle cx="51" cy="13" r="5" fill="${H}"/><path d="M32 4 36 28H28Z" fill="${L}"/><rect x="28" y="28" width="8" height="26" fill="${L}"/><circle cx="32" cy="36" r="2.2" fill="${D}"/><path d="M15 24 21 40H9Z" fill="${L}"/><rect x="10" y="40" width="10" height="14" fill="${L}"/><path d="M49 26 55 40H43Z" fill="${L}"/><rect x="44" y="40" width="10" height="14" fill="${L}"/><rect y="54" width="64" height="10" fill="${K}"/>`],
    all:      [D, `<path d="M40 10a19 19 0 1 0 14 31 16 16 0 0 1-14-31Z" fill="${L}"/><rect x="12" y="14" width="3.5" height="3.5" fill="${H}"/><rect x="24" y="8" width="3" height="3" fill="${H}"/><rect x="52" y="26" width="3" height="3" fill="${H}"/><rect y="50" width="64" height="14" fill="${K}" fill-opacity=".4"/><path d="M0 52c8-3 12 3 21 0s12 3 21 0 12 3 22 0" fill="none" stroke="${L}" stroke-opacity=".55" stroke-width="1.6"/>`],
    talk:     [B, `<path d="M16 8H48a4 4 0 0 1 4 4V24a4 4 0 0 1-4 4H35L28 35V28H16a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Z" fill="${L}"/><rect x="20" y="14" width="24" height="2.4" fill="${D}"/><rect x="20" y="20" width="16" height="2.4" fill="${D}"/><path d="M18 40H46L43 58H21Z" fill="${K}"/><rect y="58" width="64" height="6" fill="${K}" fill-opacity=".3"/>`],
    workshop: [G, `<path d="M12 52 16 40 42 14 50 22 24 48Z" fill="${R}"/><path d="M12 52 16 40 24 48Z" fill="${L}"/><path d="M12 52 14 46 18 50Z" fill="${K}"/><path d="M42 14 46 10 54 18 50 22Z" fill="${K}" fill-opacity=".6"/><rect y="56" width="64" height="8" fill="${K}" fill-opacity=".25"/>`],
    festival: [S, `<path d="M4 12Q32 28 60 12" fill="none" stroke="${L}" stroke-width="1.6"/><path d="M12 16 18 16 15 23Z" fill="${H}"/><path d="M26 20 32 20 29 27Z" fill="${L}"/><path d="M42 20 48 20 45 27Z" fill="${H}"/><path d="M8 52 32 22 56 52Z" fill="${L}"/><path d="M26 52 32 36 38 52Z" fill="${K}"/><rect y="52" width="64" height="12" fill="${K}" fill-opacity=".4"/>`],
    market:   [L, `<path d="M8 14h8v14H8zM24 14h8v14h-8zM40 14h8v14h-8z" fill="${R}"/><path d="M16 14h8v14h-8zM32 14h8v14h-8zM48 14h8v14h-8z" fill="#fff"/><rect x="10" y="28" width="44" height="3" fill="${K}" fill-opacity=".25"/><rect x="8" y="42" width="48" height="6" fill="${K}"/><rect x="12" y="34" width="10" height="8" fill="${D}"/><rect x="26" y="32" width="10" height="10" fill="${G}"/><rect x="40" y="35" width="10" height="7" fill="${H}"/><rect x="10" y="48" width="4" height="16" fill="${K}"/><rect x="50" y="48" width="4" height="16" fill="${K}"/>`],
    centre:   [B, `<path d="M6 26 32 10 58 26Z" fill="${L}"/><rect x="12" y="28" width="6" height="22" fill="${L}"/><rect x="24" y="28" width="6" height="22" fill="${L}"/><rect x="36" y="28" width="6" height="22" fill="${L}"/><rect x="48" y="28" width="6" height="22" fill="${L}"/><rect x="6" y="50" width="52" height="6" fill="${K}"/><circle cx="32" cy="20" r="2.4" fill="${H}"/>`],
    place:    [G, `<ellipse cx="32" cy="55" rx="14" ry="3.5" fill="${K}" fill-opacity=".25"/><path d="M32 54C32 54 47 40 47 27a15 15 0 0 0-30 0C17 40 32 54 32 54Z" fill="${R}"/><circle cx="32" cy="27" r="5.5" fill="${L}"/>`],
    nearby:   [D, `<path d="M47 13 15 29 29 34 34 49Z" fill="${L}"/><circle cx="32" cy="32" r="24" fill="none" stroke="${L}" stroke-opacity=".3" stroke-width="1"/><circle cx="32" cy="32" r="1.6" fill="${H}"/>`],
    riga:     [B, `<path d="M20 22 26 8 32 22Z" fill="${K}"/><rect x="21" y="22" width="10" height="30" fill="${L}"/><path d="M38 28 44 14 50 28Z" fill="${K}"/><rect x="39" y="28" width="10" height="24" fill="${L}"/><rect x="6" y="38" width="12" height="14" fill="${L}"/><rect y="52" width="64" height="12" fill="${K}" fill-opacity=".4"/>`],
    helsinki: [L, `<circle cx="32" cy="26" r="13" fill="${B}"/><rect x="19" y="26" width="26" height="24" fill="${B}"/><path d="M32 8v8M29 11h6" stroke="${K}" stroke-width="1.8"/><rect x="22" y="32" width="4" height="10" fill="${K}" fill-opacity=".5"/><rect x="30" y="32" width="4" height="10" fill="${K}" fill-opacity=".5"/><rect x="38" y="32" width="4" height="10" fill="${K}" fill-opacity=".5"/><rect y="50" width="64" height="14" fill="${D}"/>`],
    vilnius:  [S, `<rect x="26" y="20" width="12" height="32" fill="${L}"/><path d="M24 20h16L32 8Z" fill="${R}"/><rect x="29" y="28" width="6" height="8" fill="${S}"/><path d="M8 52 22 36 36 52Z" fill="${G}" fill-opacity=".6"/><path d="M34 52 48 38 62 52Z" fill="${G}" fill-opacity=".6"/><rect y="52" width="64" height="12" fill="${K}" fill-opacity=".4"/>`],
  };
  const GROOVE = '<circle cx="32" cy="32" r="29" fill="none" stroke="#101216" stroke-opacity=".16" stroke-width=".8"/>';
  /* The names the rest of the site asks for, and the disc each one gets. */
  const DISC_FOR = { films: 'cinema', film: 'cinema', art: 'gallery', records: 'record', tallinn: 'spire' };
  const PICTO_KIND = {
    gig: 'gig', concert: 'gig', club: 'club', party: 'club', film: 'film', cinema: 'film',
    theatre: 'theatre', dance: 'theatre', exhibition: 'art', gallery: 'art', museum: 'art', art: 'art',
    talk: 'talk', lecture: 'talk', workshop: 'workshop', festival: 'festival', market: 'market',
    'record store': 'records', bookshop: 'books', thrift: 'thrift', 'arts centre': 'centre', community: 'centre', bar: 'bar', taproom: 'beer',
  };
  const Picto = (name, cls) => {
    const key = DISC_FOR[name] || name;
    const d = DISC[key] || DISC.place;
    const n = DISC[key] ? name : 'place';
    return `<span class="wa-picto wa-picto--${n}${cls ? ` ${cls}` : ''}" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><rect width="64" height="64" fill="${d[0]}"/>${d[1]}${GROOVE}</svg></span>`;
  };
  Picto.kind = (kind, cls) => Picto(PICTO_KIND[String(kind || '').toLowerCase().trim()] || 'place', cls);
  window.WA.Picto = Picto;
})();
