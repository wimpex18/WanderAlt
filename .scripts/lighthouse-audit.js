#!/usr/bin/env node
/* Programmatic Lighthouse audit. Runs against the local dev server
   at http://localhost:5173 and writes scores to docs/lighthouse/.
   Per LAUNCH.md QA target: Performance ≥ 90, Accessibility ≥ 95,
   Best Practices ≥ 95, SEO ≥ 100.

       npm start            # in one terminal
       node .scripts/lighthouse-audit.js                                */
const fs        = require('fs');
const path      = require('path');
const puppeteer = require('puppeteer');
/* Lighthouse 12+ ships as ESM with a `default` export only when
   loaded through CJS interop. Grab the function and call it. */
const lighthouse = require('lighthouse/core/index.js').default;

const BASE = process.env.WA_URL || 'http://localhost:5173';
const OUT  = path.resolve(__dirname, '..', 'docs', 'lighthouse');
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: 'briefing',  url: `${BASE}/index.html` },
  { name: 'discover',  url: `${BASE}/discover.html` },
  { name: 'about',     url: `${BASE}/about.html` },
];

/* Three categories Lighthouse will run. Skipping pwa — we have a
   manifest + theme-color + icons but no service worker, which is
   intentional for an editorial site that needs fresh data. */
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox',
           '--disable-dev-shm-usage', '--ignore-certificate-errors'],
  });
  const port = new URL(browser.wsEndpoint()).port;

  const summary = {};
  for (const p of PAGES) {
    const { lhr } = await lighthouse(p.url, {
      port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: CATEGORIES,
      formFactor: 'desktop',
      screenEmulation: {
        mobile: false, width: 1280, height: 900, deviceScaleFactor: 1, disabled: false,
      },
      throttling: {
        rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1,
        requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0,
      },
    });

    fs.writeFileSync(path.join(OUT, `${p.name}.json`), JSON.stringify(lhr, null, 2));

    const scores = {};
    for (const cat of CATEGORIES) {
      const c = lhr.categories[cat];
      scores[cat] = c ? Math.round(c.score * 100) : null;
    }
    summary[p.name] = scores;
    const line = CATEGORIES.map(c => `${c}:${scores[c]}`).join('  ');
    console.log(`${p.name.padEnd(10)} ${line}`);
  }

  fs.writeFileSync(
    path.join(OUT, 'summary.json'),
    JSON.stringify({ generated: new Date().toISOString(), pages: summary }, null, 2),
  );

  await browser.close();
  console.log(`\nFull reports in ${path.relative(process.cwd(), OUT)}/`);
})().catch(e => { console.error(e); process.exit(1); });
