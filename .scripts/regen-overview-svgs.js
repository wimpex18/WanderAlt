#!/usr/bin/env node
/* Generate static city-overview SVGs used by the city-selector dropdown.
   Source: map-world.js (browser module). We fake a window/document just
   enough to load the module, then call WA.mapWorldSVG() and write the
   result to disk. Re-run any time map-world.js changes:

       node .scripts/regen-overview-svgs.js                              */
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT     = path.resolve(__dirname, '..');
const OUT_DIR  = path.join(ROOT, 'assets');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

/* ── Tallinn — from map-world.js ───────────────────────────── */
const source = fs.readFileSync(path.join(ROOT, 'map-world.js'), 'utf8');
/* Browser scripts use `window.WA = ...` to initialise, then mutate bare `WA`.
   In a vm context window and the global object are separate, so we mirror
   window.WA onto a global WA via a Proxy assigner. */
const win = {};
const sandbox = { window: win, document: {} };
Object.defineProperty(sandbox, 'WA', {
  get() { return win.WA; },
  set(v) { win.WA = v; },
});
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const tallinnSvgRaw = sandbox.window.WA && sandbox.window.WA.mapWorldSVG && sandbox.window.WA.mapWorldSVG();
if (!tallinnSvgRaw) {
  console.error('failed to call WA.mapWorldSVG()');
  process.exit(1);
}
/* map-world.js writes SVG to innerHTML in the browser, where the xmlns is
   implicit. When stored as a standalone .svg file and loaded via <img src>,
   the file MUST declare xmlns="http://www.w3.org/2000/svg" or the browser
   rejects it as a broken image. Inject the namespace if it's missing. */
const tallinnSvg = /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(tallinnSvgRaw)
  ? tallinnSvgRaw
  : tallinnSvgRaw.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');

fs.writeFileSync(path.join(OUT_DIR, 'tallinn-overview.svg'), tallinnSvg);
console.log('wrote assets/tallinn-overview.svg', tallinnSvg.length, 'bytes');

/* ── Placeholder for unreleased cities ──────────────────────
   A simple newsprint-cream square with a stylised silhouette and a
   "Coming soon" caption. Same 1800×1200 viewBox so it scales identically. */
const placeholder = (cityName) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 1200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect width="1800" height="1200" fill="#f6f3ec"/>
  <g stroke="#a8a297" stroke-width="2" fill="none" opacity="0.5">
    <path d="M 200 760 L 350 600 L 500 720 L 650 540 L 820 660 L 1000 480 L 1180 620 L 1340 500 L 1500 640 L 1650 560 L 1800 700 L 1800 1200 L 0 1200 L 0 800 Z"/>
    <path d="M 0 820 L 220 820 M 380 820 L 600 820 M 760 820 L 960 820 M 1100 820 L 1320 820 M 1460 820 L 1700 820" stroke-dasharray="6 10" stroke-width="1"/>
  </g>
  <g font-family="ui-monospace, 'JetBrains Mono', monospace" fill="#6b6b72" text-anchor="middle">
    <text x="900" y="380" font-size="120" letter-spacing="12" font-weight="600" fill="#0a0a0c">${cityName}</text>
    <text x="900" y="460" font-size="40" letter-spacing="8" text-transform="uppercase">— COMING SOON —</text>
  </g>
</svg>`;

fs.writeFileSync(path.join(OUT_DIR, 'helsinki-overview.svg'), placeholder('HELSINKI'));
fs.writeFileSync(path.join(OUT_DIR, 'riga-overview.svg'),     placeholder('RIGA'));
console.log('wrote helsinki-overview.svg, riga-overview.svg (placeholders)');
