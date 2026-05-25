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

/* Map-pin colours keyed by normalised category bucket. Read by pinHTML /
   clusterPinHTML / detailHTML as window.WA.MAP_CAT — {bg, fg, label}.

   Per the 2026 research (and the two-tone brand rule), category color
   reads "app, not weekly" — so pins stay the single brand petrol and the
   per-kind GLYPH carries category differentiation (The-Economist
   discipline: differentiate by form, not hue). Lime is reserved for the
   live/active pin state (CSS), never the resting fill. The labels here
   still feed the detail-panel eyebrow. */
const PIN_BG = '#055959', PIN_FG = '#ffffff';
WA.MAP_CAT = {
  music:    { bg: PIN_BG, fg: PIN_FG, label: 'Music' },
  culture:  { bg: PIN_BG, fg: PIN_FG, label: 'Cultural space' },
  vinyl:    { bg: PIN_BG, fg: PIN_FG, label: 'Vinyl & books' },
  market:   { bg: PIN_BG, fg: PIN_FG, label: 'Flea & market' },
  film:     { bg: PIN_BG, fg: PIN_FG, label: 'Cinema' },
  drink:    { bg: PIN_BG, fg: PIN_FG, label: 'Craft beer' },
  food:     { bg: PIN_BG, fg: PIN_FG, label: 'Food' },
  festival: { bg: PIN_BG, fg: PIN_FG, label: 'Festival' },
  art:      { bg: PIN_BG, fg: PIN_FG, label: 'Street art' },
  default:  { bg: PIN_BG, fg: PIN_FG, label: '' },
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
