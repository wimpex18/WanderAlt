#!/usr/bin/env node
/* ============================================================
   build-map-styles.js — writes map-style.json and map-style-dusk.json
   ------------------------------------------------------------
   One layer list, two palettes. Tiles are OpenFreeMap (OpenMapTiles
   schema, free, no key). Colour carries the city: green parks and
   woods, blue water, warm major roads, footpaths drawn because every
   listing is a walk. No POI icons: our pins are the points of interest.
   Run: node .scripts/build-map-styles.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const PALETTES = {
  light: {
    file: 'map-style.json', name: 'WanderAlt day',
    land: '#f2f0ea', residential: '#eeebe3', wood: '#c6dfb1', grass: '#d2e9be', park: '#c9e5b2',
    cemetery: '#d9e5cc', sand: '#f3e8c4', wetland: '#d3e6d0', hospital: '#f6e0e0', school: '#efe7d6',
    water: '#a8d3f0', waterLabel: '#3f76a0', building: '#e4dfd4', buildingEdge: '#d6d0c3',
    casing: '#dbd5c9', minor: '#ffffff', major: '#ffffff', primary: '#fce5ab', primaryCasing: '#e6c27a',
    motorway: '#f8cf8c', motorwayCasing: '#dca95d', path: '#b7ae9d', rail: '#b6b0a6',
    label: '#2b2a27', area: '#6a655b', halo: '#ffffff', parkLabel: '#4d7a3a',
  },
  dusk: {
    file: 'map-style-dusk.json', name: 'WanderAlt night',
    land: '#262624', residential: '#2a2a27', wood: '#2c3a2d', grass: '#2f3e30', park: '#2e4031',
    cemetery: '#323a32', sand: '#3c372c', wetland: '#2c3a3a', hospital: '#3a2f2e', school: '#36322b',
    water: '#21384b', waterLabel: '#9cc2e0', building: '#33322f', buildingEdge: '#3f3e3a',
    casing: '#34332f', minor: '#46453f', major: '#53514b', primary: '#6b5a47', primaryCasing: '#56493b',
    motorway: '#8a6a4b', motorwayCasing: '#6c5441', path: '#7f7c72', rail: '#5b5953',
    label: '#faf9f5', area: '#c9c7bd', halo: '#262624', parkLabel: '#a9cfa3',
  },

};

const z = (...stops) => ['interpolate', ['linear'], ['zoom'], ...stops];
const cls = (...names) => ['in', ['get', 'class'], ['literal', names]];
const SRC = 'openfreemap';
const REGULAR = ['Noto Sans Regular'], BOLD = ['Noto Sans Bold'], ITALIC = ['Noto Sans Italic'];

const layers = (p) => [
  { id: 'background', type: 'background', paint: { 'background-color': p.land } },
  { id: 'landuse-residential', type: 'fill', source: SRC, 'source-layer': 'landuse', filter: cls('residential', 'suburb', 'neighbourhood'), paint: { 'fill-color': p.residential } },
  { id: 'landuse-hospital', type: 'fill', source: SRC, 'source-layer': 'landuse', minzoom: 12, filter: cls('hospital'), paint: { 'fill-color': p.hospital } },
  { id: 'landuse-school', type: 'fill', source: SRC, 'source-layer': 'landuse', minzoom: 12, filter: cls('school', 'college', 'university', 'kindergarten'), paint: { 'fill-color': p.school } },
  { id: 'landuse-cemetery', type: 'fill', source: SRC, 'source-layer': 'landuse', filter: cls('cemetery'), paint: { 'fill-color': p.cemetery } },
  { id: 'landcover-wood', type: 'fill', source: SRC, 'source-layer': 'landcover', filter: cls('wood', 'forest'), paint: { 'fill-color': p.wood } },
  { id: 'landcover-grass', type: 'fill', source: SRC, 'source-layer': 'landcover', filter: cls('grass', 'farmland', 'scrub'), paint: { 'fill-color': p.grass, 'fill-opacity': 0.9 } },
  { id: 'landcover-wetland', type: 'fill', source: SRC, 'source-layer': 'landcover', filter: cls('wetland'), paint: { 'fill-color': p.wetland } },
  { id: 'landcover-sand', type: 'fill', source: SRC, 'source-layer': 'landcover', filter: cls('sand', 'beach'), paint: { 'fill-color': p.sand } },
  { id: 'landuse-pitch', type: 'fill', source: SRC, 'source-layer': 'landuse', minzoom: 13, filter: cls('pitch', 'stadium', 'playground'), paint: { 'fill-color': p.grass } },
  { id: 'park', type: 'fill', source: SRC, 'source-layer': 'park', paint: { 'fill-color': p.park, 'fill-opacity': 0.95 } },
  { id: 'water', type: 'fill', source: SRC, 'source-layer': 'water', paint: { 'fill-color': p.water } },
  { id: 'waterway', type: 'line', source: SRC, 'source-layer': 'waterway', paint: { 'line-color': p.water, 'line-width': z(10, 0.6, 16, 2.4) } },
  { id: 'aeroway', type: 'fill', source: SRC, 'source-layer': 'aeroway', minzoom: 11, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': p.residential } },
  { id: 'buildings', type: 'fill', source: SRC, 'source-layer': 'building', minzoom: 13,
    paint: { 'fill-color': p.building, 'fill-outline-color': p.buildingEdge, 'fill-opacity': z(13, 0, 14, 0.8, 17, 1) } },

  { id: 'path', type: 'line', source: SRC, 'source-layer': 'transportation', minzoom: 14, filter: cls('path'),
    layout: { 'line-cap': 'round' }, paint: { 'line-color': p.path, 'line-width': z(14, 0.6, 18, 1.8), 'line-dasharray': [1, 1.6] } },
  { id: 'road-casing', type: 'line', source: SRC, 'source-layer': 'transportation', minzoom: 12, filter: cls('minor', 'service', 'secondary', 'tertiary'),
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.casing, 'line-width': z(12, 0.8, 18, 11) } },
  { id: 'road-primary-casing', type: 'line', source: SRC, 'source-layer': 'transportation', filter: cls('primary', 'trunk'),
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.primaryCasing, 'line-width': z(8, 1, 18, 15) } },
  { id: 'road-motorway-casing', type: 'line', source: SRC, 'source-layer': 'transportation', filter: cls('motorway'),
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.motorwayCasing, 'line-width': z(6, 1, 18, 17) } },
  { id: 'road-minor', type: 'line', source: SRC, 'source-layer': 'transportation', minzoom: 12, filter: cls('minor', 'service'),
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.minor, 'line-width': z(12, 0.4, 18, 8) } },
  { id: 'road-secondary', type: 'line', source: SRC, 'source-layer': 'transportation', filter: cls('secondary', 'tertiary'),
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.major, 'line-width': z(10, 0.6, 18, 9) } },
  { id: 'road-primary', type: 'line', source: SRC, 'source-layer': 'transportation', filter: cls('primary', 'trunk'),
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.primary, 'line-width': z(8, 0.6, 18, 12) } },
  { id: 'road-motorway', type: 'line', source: SRC, 'source-layer': 'transportation', filter: cls('motorway'),
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.motorway, 'line-width': z(6, 0.6, 18, 14) } },
  { id: 'rail', type: 'line', source: SRC, 'source-layer': 'transportation', minzoom: 12, filter: cls('rail', 'transit'),
    paint: { 'line-color': p.rail, 'line-width': z(12, 0.5, 18, 1.8), 'line-dasharray': [3, 2] } },

  { id: 'water-label', type: 'symbol', source: SRC, 'source-layer': 'water_name', minzoom: 10,
    layout: { 'text-field': ['get', 'name'], 'text-font': ITALIC, 'text-size': z(10, 11, 16, 14), 'text-letter-spacing': 0.08, 'text-max-width': 8 },
    paint: { 'text-color': p.waterLabel, 'text-halo-color': p.water, 'text-halo-width': 1 } },
  { id: 'park-label', type: 'symbol', source: SRC, 'source-layer': 'park', minzoom: 13, filter: ['==', ['geometry-type'], 'Point'],
    layout: { 'text-field': ['get', 'name'], 'text-font': REGULAR, 'text-size': 11, 'text-max-width': 8, 'text-padding': 6 },
    paint: { 'text-color': p.parkLabel, 'text-halo-color': p.halo, 'text-halo-width': 1.2 } },
  { id: 'road-label', type: 'symbol', source: SRC, 'source-layer': 'transportation_name', minzoom: 14, filter: cls('primary', 'secondary', 'tertiary', 'minor'),
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': REGULAR, 'text-size': z(14, 10, 18, 12), 'text-letter-spacing': 0.03 },
    paint: { 'text-color': p.area, 'text-halo-color': p.halo, 'text-halo-width': 1.6 } },
  { id: 'place-area-label', type: 'symbol', source: SRC, 'source-layer': 'place', minzoom: 11, filter: cls('suburb', 'neighbourhood', 'quarter'),
    layout: { 'text-field': ['get', 'name'], 'text-font': BOLD, 'text-size': z(11, 9, 16, 12), 'text-letter-spacing': 0.14, 'text-transform': 'uppercase', 'text-padding': 10, 'text-max-width': 8 },
    paint: { 'text-color': p.area, 'text-halo-color': p.halo, 'text-halo-width': 1.4 } },
  { id: 'place-town-label', type: 'symbol', source: SRC, 'source-layer': 'place', minzoom: 9, maxzoom: 14, filter: cls('village', 'town'),
    layout: { 'text-field': ['get', 'name'], 'text-font': REGULAR, 'text-size': z(9, 10, 14, 13) },
    paint: { 'text-color': p.label, 'text-halo-color': p.halo, 'text-halo-width': 1.4 } },
  { id: 'place-city-label', type: 'symbol', source: SRC, 'source-layer': 'place', minzoom: 4, maxzoom: 12, filter: cls('city'),
    layout: { 'text-field': ['get', 'name'], 'text-font': BOLD, 'text-size': z(4, 11, 12, 17), 'text-letter-spacing': 0.06 },
    paint: { 'text-color': p.label, 'text-halo-color': p.halo, 'text-halo-width': 1.6 } },
];

for (const p of Object.values(PALETTES)) {
  const style = {
    version: 8,
    name: p.name,
    metadata: { 'wanderalt:notes': 'Generated by .scripts/build-map-styles.js; edit the palette there, not this file. Tiles: OpenFreeMap (OpenStreetMap data, free, no key).' },
    sources: { [SRC]: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    layers: layers(p),
  };
  fs.writeFileSync(path.join(__dirname, '..', p.file), JSON.stringify(style, null, 2) + '\n');
  console.log(`${p.file}: ${style.layers.length} layers`);
}
