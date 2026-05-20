#!/usr/bin/env node
/* Rasterize the brand favicon + PWA SVG masters to PNG + ICO using sharp.
   Output lands in brand/favicon/ and brand/pwa/ next to the SVG sources,
   plus a multi-size /favicon.ico at repo root for legacy browsers.

       node .scripts/rasterize-favicons.js                                   */
const fs       = require('fs');
const path     = require('path');
const sharp    = require('sharp');
const pngToIco = require('png-to-ico').default;

const ROOT = path.resolve(__dirname, '..');
const BRAND = path.join(ROOT, 'brand');

/* Each entry: [source SVG, destination PNG, target size in px]. */
const PNG_JOBS = [
  /* Favicon raster fallbacks (modern browsers prefer the SVG; these
     exist for older Safari / Chromium <80 and for cases where the ICO
     fallback is fetched). The 16/32/48 PNGs are sourced from the hand-
     tuned per-size SVGs so the diamond stays legible at 16 px.        */
  ['favicon/favicon-16.svg',         'favicon/favicon-16.png',         16],
  ['favicon/favicon-32.svg',         'favicon/favicon-32.png',         32],
  ['favicon/favicon-48.svg',         'favicon/favicon-48.png',         48],
  ['favicon/apple-touch-icon.svg',   'favicon/apple-touch-icon.png',   180],

  /* PWA icons — manifest can reference SVG, but maskable + monochrome
     are more reliably parsed as PNG by Android Chrome / iOS Safari.  */
  ['pwa/icon-192.svg',               'pwa/icon-192.png',               192],
  ['pwa/icon-512.svg',               'pwa/icon-512.png',               512],
  ['pwa/icon-maskable.svg',          'pwa/icon-maskable.png',          512],
  ['pwa/icon-mono.svg',              'pwa/icon-mono.png',              512],

  /* Social cards — Facebook / X scrapers usually accept SVG, but the
     1.2 MB-cap rule and historic compatibility says rasterize.
     Per-city OG cards (og-tallinn, og-helsinki, og-riga) are marketing
     assets — meta tags still point at og-default since OG image is a
     static meta attribute and social scrapers don't run JS. Use the
     per-city PNGs for manual social-share posts when launching a city. */
  ['social/og-default.svg',          'social/og-default.png',          1200],
  ['social/twitter-default.svg',     'social/twitter-default.png',     1200],
  ['social/og-tallinn.svg',          'social/og-tallinn.png',          1200],
  ['social/og-helsinki.svg',         'social/og-helsinki.png',         1200],
  ['social/og-riga.svg',             'social/og-riga.png',             1200],
];

(async () => {
  for (const [src, dst, size] of PNG_JOBS) {
    const srcPath = path.join(BRAND, src);
    const dstPath = path.join(BRAND, dst);
    if (!fs.existsSync(srcPath)) {
      console.warn('skip (missing source):', src);
      continue;
    }
    /* Social cards are 1200 wide × variable height, not square. Use
       sharp's resize with width-only so height is preserved per viewBox. */
    const isSocial = src.startsWith('social/');
    const resize   = isSocial ? { width: size } : { width: size, height: size, fit: 'cover' };
    await sharp(srcPath).resize(resize).png({ quality: 90 }).toFile(dstPath);
    console.log('wrote', path.relative(ROOT, dstPath));
  }

  /* Multi-size ICO at /favicon.ico — combines the 16, 32, 48 PNGs we
     just produced. Browsers pick the right one for the slot. */
  const icoSources = [16, 32, 48].map(s => path.join(BRAND, 'favicon', `favicon-${s}.png`));
  const icoBuf     = await pngToIco(icoSources);
  fs.writeFileSync(path.join(ROOT, 'favicon.ico'), icoBuf);
  console.log('wrote', path.relative(ROOT, path.join(ROOT, 'favicon.ico')), `(${icoBuf.length} bytes)`);

  /* Also drop apple-touch-icon.png at root so iOS Safari's default
     fallback URL (/apple-touch-icon.png) works without an extra
     <link>. */
  fs.copyFileSync(
    path.join(BRAND, 'favicon', 'apple-touch-icon.png'),
    path.join(ROOT, 'apple-touch-icon.png'),
  );
  console.log('wrote', 'apple-touch-icon.png (copied to root)');
})().catch(err => { console.error(err); process.exit(1); });
