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
    heart:    '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    hearted:  '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="currentColor"/>',
    nav:      '<path d="M20 4 4 11l7 2 2 7z"/>',
    kinds:    '<rect x="3.5" y="11" width="7" height="9.5" rx="2"/><rect x="13.5" y="11" width="7" height="9.5" rx="2"/><path d="M12 2.5c.4 2.2 1.5 3.3 3.7 3.7-2.2.4-3.3 1.5-3.7 3.7-.4-2.2-1.5-3.3-3.7-3.7 2.2-.4 3.3-1.5 3.7-3.7z"/>',
    globe2:   '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5z"/>',
    menu:     '<path d="M4 7h16M4 12h16M4 17h16"/>',
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
    people:   '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.5 13.9a6 6 0 0 1 3.5 5.6"/>',
    user:     '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    moon:     '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    programme:'<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',
    store:    '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12v8.5h13V12M10 20.5v-5h4v5"/>',
    offline:  '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.8a10 10 0 0 1 4.3-2.5M19 12.8a10 10 0 0 0-2.8-2.1M2 9.2a15 15 0 0 1 3.8-2.5M22 9.2A15 15 0 0 0 11 5.6"/><circle cx="12" cy="20" r=".8" fill="currentColor"/>',
    info:     '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
    ai:       '<path d="M11 3.5c.7 4.3 2.9 6.5 7.2 7.2-4.3.7-6.5 2.9-7.2 7.2-.7-4.3-2.9-6.5-7.2-7.2 4.3-.7 6.5-2.9 7.2-7.2z"/><path d="M18.5 15c.3 1.6 1 2.3 2.6 2.6-1.6.3-2.3 1-2.6 2.6-.3-1.6-1-2.3-2.6-2.6 1.6-.3 2.3-1 2.6-2.6z"/>',
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

  /* ── Pictograms ─────────────────────────────────────────────
     The second tier, after 24px UI icons: 48px line drawings for kinds
     and cities, each on a tinted tile in its own hue (set in wa.css by
     .wa-picto--<name>). Hue is decoration here, never the only signal:
     every pictogram sits beside its word. */
  const PICTO = {
    all:      '<path d="M30 10a13 13 0 1 0 8 23 15 15 0 0 1-8-23z"/><path d="M34 8v5M31.5 10.5h5M40 17v3M38.5 18.5h3"/><path d="M6 40c3-2 6-2 9 0s6 2 9 0 6-2 9 0 6 2 9 0"/>',
    gig:      '<rect x="15" y="6" width="10" height="16" rx="5"/><path d="M11 18a9 9 0 0 0 18 0M20 27v9M14 40h12"/><path d="M33 12v14"/><circle cx="30.5" cy="27" r="2.5" fill="currentColor"/><path d="M33 12l6 2"/>',
    club:     '<path d="M24 4v6"/><circle cx="24" cy="21" r="11"/><path d="M13 21h22M24 10v22M15.5 14.5h17M15.5 27.5h17M19 11a20 20 0 0 0 0 20M29 11a20 20 0 0 1 0 20"/><path d="M8 38l2-4 2 4-4-2h4zM38 40l1.5-3 1.5 3-3-1.5h3" stroke-width="1.5"/>',
    film:     '<rect x="7" y="18" width="34" height="22" rx="3"/><path d="M7 18l30-8 1.6 6M13.5 16.3l4 5.2M21.5 14.2l4 5.2M29.5 12l4 5.2"/><path d="M21 25v9l8-4.5z" fill="currentColor"/>',
    theatre:  '<path d="M7 9h17v11a8.5 8.5 0 0 1-17 0z"/><path d="M12 15h.1M19 15h.1M12 22a5 5 0 0 0 7 0"/><path d="M26 17h15v10a7.5 7.5 0 0 1-12.6 5.5"/><path d="M31 23h.1M36 23h.1M30.5 30a5 5 0 0 1 6 0"/>',
    art:      '<rect x="8" y="7" width="32" height="26" rx="2"/><path d="M8 27l9-8 7 6 5-4 11 9"/><circle cx="30" cy="15" r="3" fill="currentColor"/><path d="M17 33l-4 9M31 33l4 9M24 33v5"/>',
    talk:     '<path d="M6 10h24a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H17l-7 6v-6H6a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z"/><path d="M36 17h6a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-2v5l-6-5h-9a3 3 0 0 1-3-3v-1"/><path d="M11 17h16M11 22h10"/>',
    workshop: '<path d="M31 6l11 11-16 16-6 1 1-6z"/><path d="M28 9l11 11"/><path d="M20 28c-5 0-9 3-9 8 0 2-2 4-5 4 3 2 10 3 14-1 3-3 3-7 0-11z" fill="currentColor" fill-opacity=".18"/>',
    festival: '<path d="M4 12c7 5 13 6 20 6s13-1 20-6"/><path d="M8 15l2 7 3-5M16 17l1.5 7 3.5-6M26 18l2 7 2.5-7M35 16.5l2.5 6.5 2-7" stroke-linejoin="round"/><path d="M12 42l12-14 12 14z"/><path d="M24 28v14"/>',
    market:   '<path d="M6 18l4-10h28l4 10"/><path d="M6 18a4.5 4.5 0 0 0 9 0 4.5 4.5 0 0 0 9 0 4.5 4.5 0 0 0 9 0 4.5 4.5 0 0 0 9 0"/><path d="M9 22v19h30V22"/><path d="M20 41V30h8v11"/>',
    records:  '<rect x="4" y="10" width="26" height="28" rx="2"/><circle cx="30" cy="24" r="14" fill="var(--picto-bg, #fff)"/><circle cx="30" cy="24" r="14"/><circle cx="30" cy="24" r="4" fill="currentColor"/><path d="M30 14a10 10 0 0 1 10 10"/>',
    books:    '<path d="M6 12c6-2 12-2 18 2v26c-6-4-12-4-18-2z"/><path d="M42 12c-6-2-12-2-18 2v26c6-4 12-4 18-2z"/><path d="M10 19c3-.8 6-.6 9 .6M10 25c3-.8 6-.6 9 .6M29 19.6c3-1.2 6-1.4 9-.6"/>',
    thrift:   '<path d="M24 12a3.5 3.5 0 1 0-3.5-3.5"/><path d="M24 12v3L6 28a2 2 0 0 0 1.2 3.6h33.6A2 2 0 0 0 42 28L24 15"/><path d="M13 31.6V42h22V31.6"/>',
    centre:   '<path d="M5 18L24 7l19 11z"/><path d="M9 18v18M17 18v18M31 18v18M39 18v18M5 40h38M7 36h34"/><circle cx="24" cy="13.5" r="1.6" fill="currentColor"/>',
    bar:      '<path d="M8 8h26L21 23z"/><path d="M21 23v15M14 40h14"/><path d="M28 8l6-5"/><circle cx="37" cy="19" r="5"/><path d="M37 14v-2"/>',
    place:    '<path d="M24 43s13-11.2 13-22a13 13 0 0 0-26 0c0 10.8 13 22 13 22z"/><circle cx="24" cy="21" r="5" fill="currentColor"/>',
    nearby:   '<path d="M40 8L8 22l14 4 4 14z"/>',
    /* Cities: a landmark over water or trees, the way a visitor knows them. */
    tallinn:  '<path d="M14 36V22l3-10 3 10v14M26 36V14l3-10 3 10v22"/><path d="M8 36v-8h6M20 36v-9h6M32 36v-6h8v6"/><path d="M4 36h40"/><path d="M4 41c3.3-2 6.7-2 10 0s6.7 2 10 0 6.7-2 10 0 6.7 2 10 0"/>',
    riga:     '<path d="M24 36V20l-2-3 2-13 2 13-2 3M18 36V24h12v12"/><path d="M8 36V28h10M30 30h10v6"/><path d="M4 36h40"/><path d="M4 41c3.3-2 6.7-2 10 0s6.7 2 10 0 6.7 2 10 0 6.7-2 10 0"/>',
    helsinki: '<path d="M14 36V24h20v12M16 24a8 8 0 0 1 16 0M24 16v-4M22 12h4"/><path d="M8 36v-7h6M34 29h6v7"/><path d="M4 36h40"/><path d="M4 41c3.3-2 6.7-2 10 0s6.7 2 10 0 6.7 2 10 0 6.7-2 10 0"/>',
    vilnius:  '<path d="M6 40c6-8 12-11 18-11s12 3 18 11"/><path d="M20 30V16h8v14M19 16h10M20 16v-3h2v2h4v-2h2v3"/><path d="M36 28l3-8 3 8zM39 28v4M8 30l2.5-7 2.5 7zM10.5 30v4"/>',
  };
  const PICTO_KIND = {
    gig: 'gig', concert: 'gig', club: 'club', party: 'club', film: 'film', cinema: 'film',
    theatre: 'theatre', dance: 'theatre', exhibition: 'art', gallery: 'art', museum: 'art', art: 'art',
    talk: 'talk', lecture: 'talk', workshop: 'workshop', festival: 'festival', market: 'market',
    'record store': 'records', bookshop: 'books', thrift: 'thrift', 'arts centre': 'centre', community: 'centre', bar: 'bar',
  };
  const Picto = (name, cls) => {
    const n = PICTO[name] ? name : 'place';
    return `<span class="wa-picto wa-picto--${n}${cls ? ` ${cls}` : ''}" aria-hidden="true"><svg viewBox="0 0 48 48" focusable="false">${PICTO[n]}</svg></span>`;
  };
  Picto.kind = (kind, cls) => Picto(PICTO_KIND[String(kind || '').toLowerCase().trim()] || 'place', cls);
  window.WA.Picto = Picto;
})();
