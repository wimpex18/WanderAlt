/* map-venues.js — categories, districts, geo helpers used by map.js.
   Exposes WA.MAP_CATEGORIES, WA.MAP_DISTRICTS, WA.geoToWorld, WA.worldToGeo.
   Loaded before map.js (and historically before map-world.js, retired
   May 2026 after the v2 city plates superseded it).                          */
window.WA = window.WA || {};

WA.MAP_CATEGORIES = [
  { id: 'music',   label: 'Music' },
  { id: 'drink',   label: 'Craft beer' },
  { id: 'vinyl',   label: 'Vinyl & books' },
  { id: 'market',  label: 'Flea & market' },
  { id: 'culture', label: 'Cultural space' },
  { id: 'art',     label: 'Street art' },
  { id: 'free',    label: 'Free entry' },
];

/* Map-pin colours keyed by normalised category bucket (see normaliseKind
   in map.js). Read by pinHTML / clusterPinHTML / detailHTML as
   window.WA.MAP_CAT — {bg, fg, label}; white glyph on a mid-dark fill.

   BRAND NOTE: this is a deliberate, owner-approved evolution beyond the
   strict two-tone rule (CLAUDE.md). It is a MUTED, desaturated "print-ink"
   palette — faded editorial tones, NOT bright app colours — used ONLY on
   map pins (never in page chrome, which stays petrol + lime + ink). Music
   keeps the brand petrol as its anchor; lime stays reserved for the
   live/active pin state. Keep these low-chroma + mid-dark so they read as
   a cohesive risograph family and white glyphs stay legible. */
WA.MAP_CAT = {
  music:    { bg: '#055959', fg: '#ffffff', label: 'Music' },          /* brand petrol */
  culture:  { bg: '#5b4a63', fg: '#ffffff', label: 'Cultural space' }, /* muted aubergine */
  vinyl:    { bg: '#7a5a3c', fg: '#ffffff', label: 'Vinyl & books' },  /* muted tobacco */
  market:   { bg: '#586b46', fg: '#ffffff', label: 'Flea & market' },  /* muted moss */
  film:     { bg: '#44506b', fg: '#ffffff', label: 'Cinema' },         /* muted slate */
  drink:    { bg: '#7a5540', fg: '#ffffff', label: 'Craft beer' },     /* muted coffee */
  food:     { bg: '#6b6256', fg: '#ffffff', label: 'Food' },           /* muted taupe */
  festival: { bg: '#884f5b', fg: '#ffffff', label: 'Festival' },       /* muted rose-brown */
  art:      { bg: '#3f6b62', fg: '#ffffff', label: 'Street art' },     /* muted teal */
  default:  { bg: '#44454d', fg: '#ffffff', label: '' },               /* neutral graphite */
};

WA.MAP_DISTRICTS = [
  { id: 'vanalinn',   label: 'Vanalinn',   cx: 1030, cy: 565 },
  { id: 'kalamaja',   label: 'Kalamaja',   cx:  560, cy: 510 },
  { id: 'telliskivi', label: 'Telliskivi', cx:  690, cy: 760 },
  { id: 'noblessner', label: 'Noblessner', cx:  620, cy: 300 },
  { id: 'kopli',      label: 'Kopli',      cx:  180, cy: 540 },
  { id: 'kesklinn',   label: 'Kesklinn',   cx: 1200, cy: 700 },
  { id: 'kadriorg',   label: 'Kadriorg',   cx: 1440, cy: 640 },
  { id: 'pirita',     label: 'Pirita',     cx: 1700, cy: 560 },
  { id: 'kristiine',  label: 'Kristiine',  cx:  800, cy: 950 },
];

// Linear fit: Tallinn centre lat 59.4370, lng 24.7536 → world (1030, 580)
WA.geoToWorld = function geoToWorld(lat, lng) {
  const lng0 = 24.7536, lat0 = 59.4370;
  return {
    x: Math.round(1030 + (lng - lng0) * 5400),
    y: Math.round(580  - (lat - lat0) * 5400),
  };
};
WA.worldToGeo = function worldToGeo(x, y) {
  const lng0 = 24.7536, lat0 = 59.4370;
  return {
    lat: lat0 - (y - 580)  / 5400,
    lng: lng0 + (x - 1030) / 5400,
  };
};
