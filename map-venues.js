/* map-venues.js — categories, districts, geo helpers for the illustrated map.
   Exposes WA.MAP_CATEGORIES, WA.MAP_DISTRICTS, WA.geoToWorld, WA.worldToGeo.
   Loaded before map-world.js and map.js.                                      */
window.WA = window.WA || {};

WA.MAP_CATEGORIES = [
  { id: 'music',   label: 'Music' },
  { id: 'drink',   label: 'Craft beer' },
  { id: 'vinyl',   label: 'Vinyl & books' },
  { id: 'market',  label: 'Flea & market' },
  { id: 'culture', label: 'Cultural space' },
  { id: 'art',     label: 'Street art' },
];

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
