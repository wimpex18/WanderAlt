/* map-venues.js — category buckets + pin palette used by map.js/discover.js.
   Exposes WA.MAP_CATEGORIES and WA.MAP_CAT. (The district list and the
   geoToWorld/worldToGeo linear fits left with map-world.js, retired
   May 2026 after the v2 city plates superseded it.)                          */
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
