#!/usr/bin/env node
/* One source for the mark. Writes every SVG in brand/, rewrites the inline
   mark in each page, and leaves rasterising to rasterize-favicons.js.

       node .scripts/build-brand.js                                       */
const fs   = require('fs');
const path = require('path');

const ROOT  = path.resolve(__dirname, '..');
const BRAND = path.join(ROOT, 'brand');
const RED   = '#d83a14';

/* A route that spells a W: you walk it, it ends under a night spark. */
const ROUTE = 'M6.5 12 11 23 16 14 21 23 23.5 17';
const SPARK = 'm25 4.5 1.3 3.2 3.2 1.3-3.2 1.3L25 13.5l-1.3-3.2L20.5 9l3.2-1.3z';

const glyph = (ink) =>
  `<path d="${ROUTE}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="${SPARK}" fill="${ink}"/>`;
const tile  = (rx) => `<rect width="32" height="32"${rx ? ` rx="${rx}"` : ''} fill="${RED}"/>`;
const svg   = (body, comment) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  <!-- ${comment} -->\n  ${body}\n</svg>\n`;
const NOTE  = 'A route that spells W, ending under a night spark: wander, then something worth the walk.';

const write = (rel, text) => fs.writeFileSync(path.join(BRAND, rel), text);
const inset = (s) => `<g transform="translate(${(16 - 16 * s).toFixed(2)} ${(16 - 16 * s).toFixed(2)}) scale(${s})">${glyph('#fff')}</g>`;

const rounded = svg(tile(9) + glyph('#fff'), NOTE);
write('favicon/favicon.svg', rounded);
for (const n of [16, 32, 48]) write(`favicon/favicon-${n}.svg`, rounded);
write('masters/tile.svg', rounded.replace('viewBox="0 0 32 32"', 'viewBox="0 0 32 32" width="1024" height="1024"'));
write('favicon/apple-touch-icon.svg', svg(tile() + inset(0.78), NOTE));
write('pwa/icon-192.svg', rounded);
write('pwa/icon-512.svg', rounded);
write('pwa/icon-maskable.svg', svg(tile() + inset(0.6), NOTE));
write('pwa/icon-mono.svg', svg(`<g transform="translate(1.6 1.6) scale(.9)">${glyph('#000')}</g>`, NOTE));
write('favicon/safari-pinned-tab.svg', svg(glyph('#000'), NOTE));

/* Social cards keep their outlined wordmark; only the tile changes. */
for (const f of ['social/og-default.svg', 'social/twitter-default.svg']) {
  const p = path.join(BRAND, f);
  const s = fs.readFileSync(p, 'utf8');
  const next = s.replace(/<g transform="translate\(96 96\) scale\(3\)">[\s\S]*?<\/g>/,
    `<g transform="translate(96 96) scale(3)">${tile(9)}${glyph('#fff')}</g>`);
  if (next === s && !s.includes(ROUTE)) throw new Error(`mark not found in ${f}`);
  fs.writeFileSync(p, next);
}

/* Inline marks in pages (top bar only; the splash draws its own). */
const INLINE = `<svg class="wa-brand__mark" viewBox="0 0 32 32" aria-hidden="true">${tile(9)}${glyph('#fff')}</svg>`;
let pages = 0;
for (const f of fs.readdirSync(ROOT).filter((x) => x.endsWith('.html'))) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const next = s.replace(/<svg class="wa-brand__mark"[\s\S]*?<\/svg>/, INLINE);
  if (next !== s) { fs.writeFileSync(path.join(ROOT, f), next); pages++; }
}
/* The splash draws the same mark from its parts. */
const SPLASH = `<div class="wa-splash__stage"><svg class="wa-splash__mark" viewBox="0 0 32 32" width="104" height="104" focusable="false"><g class="wa-splash__tile">${tile(9)}</g><circle class="wa-splash__ring" cx="25" cy="9" r="4" fill="none" stroke="${RED}" stroke-width=".6"/><path class="wa-splash__route" pathLength="1" d="${ROUTE}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path class="wa-splash__spark" d="${SPARK}" fill="#fff"/></svg><span class="wa-splash__word"><span class="wa-splash__w1">wander</span><span class="wa-splash__w2">alt</span></span><span class="wa-splash__line">Tonight in Tallinn</span></div>`;
const jsPath = path.join(ROOT, 'brand-reveal.js');
const js = fs.readFileSync(jsPath, 'utf8');
fs.writeFileSync(jsPath, js.replace(/(\/\*mark:start\*\/\n)[\s\S]*?(\n  \/\*mark:end\*\/)/, (_, a, b) => `${a}  cover.innerHTML = ${JSON.stringify(SPLASH).replace(/^"|"$/g, "'").replace(/\\"/g, '"')};${b}`));
console.log(`brand SVGs written; ${pages} pages updated`);
module.exports = { ROUTE, SPARK };
