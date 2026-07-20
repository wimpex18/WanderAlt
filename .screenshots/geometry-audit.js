/* ============================================================
   WanderAlt — geometry audit (npm run geometry) · Playwright
   ------------------------------------------------------------
   Screenshots tell you *something* looks off; they don't tell you WHY,
   and reading them is a fuzzy judgment call that misses exactly the kind
   of bug a ruler catches instantly. This script measures real DOM
   geometry instead of eyeballing pixels:
     1. OVERLAP — does any "content" region (list, filter rail, empty-
        state card) intersect another content region it shouldn't? The
        full-bleed map scene is expected to sit under everything, so it's
        excluded; anything else overlapping is a stacking/positioning bug.
     2. ALIGNMENT — do sibling label/control left-edges match within a
        couple px (the "left-aligned, no ragged edges" contract)?
     3. SIZE OUTLIERS — do controls fall on the 38/44/48/52 tier ladder,
        or is something an odd one-off height?
     4. OVERFLOW — does any container's content exceed its own box
        (scrollWidth/Height > clientWidth/Height), i.e. "bigger than its
        frame"?
     5. RHYTHM — vertical gaps between sibling filter fieldsets: are they
        one consistent value, per the spacing-grid contract?
   Not a pass/fail gate — a seeing aid, printed as numbers instead of a
   picture, meant to run ALONGSIDE `npm run audit` (which still requires
   reading the PNGs — this catches what the eye skims past).
   ============================================================ */

const { spawn } = require('child_process');
const { chromium } = require('playwright');

const PORT = 5187;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  ['discover',        '/discover.html'],
  ['discover-places', '/discover.html?type=places'],
];
const WIDTHS = [1440, 768, 390];

/* Regions that carry real content — any unexpected intersection between
   two of these (that aren't in a parent/child relationship) is a bug.
   The map pane is the full-bleed Scene by design, so it's excluded here
   and checked separately (only its floating chrome, not the pane itself). */
const CONTENT_REGIONS = [
  '.discover-sheet',
  '.deck',
  '.discover-pane--list',
  '.map-empty-hint',
  '.map-sheet',
  '.map-detail',
];

/* Control-ish selectors expected to land on the 38/44/48/52 height ladder
   (Control sizing contract + Dusk Glass "one unit" law). */
const CONTROL_SELECTORS = [
  '.facet-pill', '.discover-pill', '.discover-scope__btn',
  '.map-zoom-btn', '.map-locate-fab', '.search-box',
  '.btn-primary', '.discover-sheet__apply', '.discover-sheet__clear',
  '.city-selector',
];
const ALLOWED_HEIGHTS = [38, 44, 48, 52];
const HEIGHT_TOLERANCE = 1; // sub-px rounding

(async () => {
  const server = spawn('npx', ['http-server', '.', '-p', String(PORT), '-c-1', '--silent'], { stdio: 'ignore' });
  await sleep(1500);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  });

  for (const [name, url] of PAGES) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        deviceScaleFactor: 1,
      });
      await context.addInitScript(() => {
        try {
          localStorage.setItem('wa:city', 'tallinn');
          localStorage.setItem('wa:appearance', 'dusk');
        } catch (_) {}
      });
      const page = await context.newPage();
      await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
      await page.waitForFunction(() => window.__waCatReady === true, null, { timeout: 6000 }).catch(() => {});
      await sleep(2500); // let discover.js populate real rows + facet chips

      const report = await page.evaluate(({ CONTENT_REGIONS, CONTROL_SELECTORS, ALLOWED_HEIGHTS, HEIGHT_TOLERANCE }) => {
        const out = { overlaps: [], alignment: [], sizes: [], overflow: [], gaps: [] };

        const rectOf = (el) => el.getBoundingClientRect();
        const isVisible = (el) => {
          const r = rectOf(el);
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.hidden;
        };
        const intersects = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        const intersectRect = (a, b) => {
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          return { w: Math.max(0, w), h: Math.max(0, h) };
        };
        const contains = (a, b) => a.contains(b) || b.contains(a);

        // 1. OVERLAP between distinct content regions. A shared 1-2px seam
        // (e.g. two panels with matching border-radius meant to sit flush)
        // is by design, not a bug — require BOTH dimensions of the overlap
        // to exceed a few px so only a real 2-D collision gets flagged.
        const regionEls = CONTENT_REGIONS
          .map((sel) => ({ sel, el: document.querySelector(sel) }))
          .filter((r) => r.el && isVisible(r.el));
        for (let i = 0; i < regionEls.length; i += 1) {
          for (let j = i + 1; j < regionEls.length; j += 1) {
            const A = regionEls[i]; const B = regionEls[j];
            if (contains(A.el, B.el)) continue;
            const ra = rectOf(A.el); const rb = rectOf(B.el);
            if (intersects(ra, rb)) {
              const { w, h } = intersectRect(ra, rb);
              if (w > 4 && h > 4) {
                out.overlaps.push(`${A.sel} × ${B.sel} — ${Math.round(w)}×${Math.round(h)}px overlap (A:${Math.round(ra.left)},${Math.round(ra.top)},${Math.round(ra.width)}×${Math.round(ra.height)} B:${Math.round(rb.left)},${Math.round(rb.top)},${Math.round(rb.width)}×${Math.round(rb.height)})`);
              }
            }
          }
        }

        // 2. ALIGNMENT — .eyebrow legends inside the filter rail should share one left edge.
        const eyebrows = [...document.querySelectorAll('.discover-sheet .eyebrow')].filter(isVisible);
        if (eyebrows.length > 1) {
          const xs = eyebrows.map((el) => Math.round(rectOf(el).left));
          const min = Math.min(...xs); const max = Math.max(...xs);
          if (max - min > 2) out.alignment.push(`.discover-sheet .eyebrow left-edge spread: ${min}–${max}px (${xs.length} labels) — should share one edge`);
        }
        // Chip-row start x per fieldset should match the eyebrow above it.
        document.querySelectorAll('.discover-sheet__field').forEach((field) => {
          const legend = field.querySelector('.eyebrow');
          const firstChip = field.querySelector('.discover-sheet__chips > *, .facet-pill');
          if (legend && firstChip && isVisible(legend) && isVisible(firstChip)) {
            const dx = Math.round(rectOf(firstChip).left) - Math.round(rectOf(legend).left);
            if (Math.abs(dx) > 2) {
              const label = legend.textContent.trim();
              out.alignment.push(`"${label}" fieldset: legend left=${Math.round(rectOf(legend).left)} vs first control left=${Math.round(rectOf(firstChip).left)} (Δ${dx}px)`);
            }
          }
        });

        // 3. SIZE — control height census against the 38/44/48/52 ladder.
        const tally = {};
        CONTROL_SELECTORS.forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => {
            if (!isVisible(el)) return;
            const h = Math.round(rectOf(el).height);
            const onLadder = ALLOWED_HEIGHTS.some((t) => Math.abs(t - h) <= HEIGHT_TOLERANCE);
            if (!onLadder) {
              const key = `${sel} @${h}px`;
              tally[key] = (tally[key] || 0) + 1;
            }
          });
        });
        Object.entries(tally).forEach(([k, n]) => out.sizes.push(`${k} × ${n} — off the 38/44/48/52 ladder`));

        // 4. OVERFLOW — container content exceeding its own box.
        [...CONTENT_REGIONS, '.discover-sheet__body', '.deck', 'body'].forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => {
            if (!isVisible(el)) return;
            const cs = getComputedStyle(el);
            // Deliberate horizontal scroll rails (snap-rails, .deck's quick
            // filters) aren't "bigger than their frame" — they're designed
            // to scroll. Only 'visible' overflow-x (incl. the CSS quirk
            // where overflow-y:auto silently makes overflow-x behave as
            // auto while still computing as 'visible') is a real bug.
            if (['hidden', 'auto', 'scroll'].includes(cs.overflowX)) return;
            if (el.scrollWidth - el.clientWidth > 4) out.overflow.push(`${sel}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth} (+${el.scrollWidth - el.clientWidth}px horizontal)`);
          });
        });

        // 5. RHYTHM — gaps between sibling filter fieldsets should be one value.
        const fields = [...document.querySelectorAll('.discover-sheet__field')].filter(isVisible);
        const gaps = [];
        for (let i = 1; i < fields.length; i += 1) {
          const prev = rectOf(fields[i - 1]); const cur = rectOf(fields[i]);
          gaps.push(Math.round(cur.top - prev.bottom));
        }
        if (gaps.length) {
          const uniq = [...new Set(gaps)];
          out.gaps.push(`fieldset sibling gaps: [${gaps.join(', ')}]${uniq.length > 1 ? ' — inconsistent, should be one value' : ' — consistent'}`);
        }

        return out;
      }, { CONTENT_REGIONS, CONTROL_SELECTORS, ALLOWED_HEIGHTS, HEIGHT_TOLERANCE });

      console.log(`\n=== ${name} @${width} ===`);
      console.log(`  overlaps:   ${report.overlaps.length ? '\n    ⚠ ' + report.overlaps.join('\n    ⚠ ') : '(none)'}`);
      console.log(`  alignment:  ${report.alignment.length ? '\n    ⚠ ' + report.alignment.join('\n    ⚠ ') : '(none)'}`);
      console.log(`  sizes:      ${report.sizes.length ? '\n    ⚠ ' + report.sizes.join('\n    ⚠ ') : '(none off-ladder)'}`);
      console.log(`  overflow:   ${report.overflow.length ? '\n    ⚠ ' + report.overflow.join('\n    ⚠ ') : '(none)'}`);
      console.log(`  rhythm:     ${report.gaps.length ? report.gaps.join('\n    ') : '(n/a)'}`);

      await page.close();
      await context.close();
    }
  }

  await browser.close();
  server.kill();
})().catch((e) => { console.error('geometry-audit error:', e); process.exit(1); });
