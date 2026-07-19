/* ============================================================
   WanderAlt — accessibility sweep (npm run a11y)
   ------------------------------------------------------------
   WCAG 2.1/2.2 AA scan of every public page × BOTH skins (dusk +
   daybreak — theme.js picks by sun otherwise) × 390/1440, plus a
   keyboard walk on key pages:
     1. axe-core (wcag2a/wcag2aa/wcag21aa rulesets) — violations with
        selectors and impact; "incomplete" contrast items (text over
        photos/glass axe can't compute) are listed for eyeballing.
     2. Keyboard: TAB-walks the page and reports focusable elements
        that never show a visible focus indicator, plus whether focus
        can reach the main landmarks.
   Static server self-boots (port 5196). Exit code 1 when any page has
   serious/critical axe violations — usable as a gate, informative
   otherwise. Playwright engine (same policy as audit/visual).
   ============================================================ */

const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const PORT = 5196;
const BASE = `http://127.0.0.1:${PORT}`;
const WIDTHS = [390, 768, 1440];
/* theme.js vocabulary: 'dusk' | 'day' (NOT 'daybreak' — an unknown value
   silently falls back to sun-following auto, which is time-of-run-dependent). */
const SKINS = ['dusk', 'day'];
const PAGES = [
  ['today',    '/index.html'],
  ['discover', '/discover.html'],
  ['places',   '/discover.html?type=places'],
  ['saved',    '/saved.html'],
  ['profile',  '/profile.html'],
  ['about',    '/about.html'],
  ['404',      '/404.html'],
];
const KEYBOARD_PAGES = ['today', 'discover', 'profile'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Derive real ids for the DETAIL pages (venue/curator/place) from whatever
   catalog loads — same logic as audit.js/e2e.js. These are where users land
   from shared links, yet the param-less PAGES list never reached them; the
   Jul 2026 venue·day .answer__k contrast fail hid here until this was added.
   Best-effort: if derivation fails (no catalog), the detail pages are skipped
   and the static pages remain the hard gate. */
async function deriveDetailPages(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => { try { localStorage.setItem('wa:city', 'tallinn'); localStorage.setItem('wa:appearance', 'dusk'); } catch (_) {} });
  const page = await context.newPage();
  await page.goto(`${BASE}/discover.html`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  await page.waitForFunction(() => window.__waCatReady === true, null, { timeout: 8000 }).catch(() => {});
  await sleep(600);
  const ids = await page.evaluate(() => {
    const cat = (window.WA && (window.WA._catalogAll || window.WA.catalog)) || [];
    const ven = (window.WA && (window.WA._venuesAll || window.WA.venues)) || [];
    const byH = {}; cat.forEach((e) => { (byH[e.handle] = byH[e.handle] || []).push(e); });
    const multi = Object.keys(byH).find((h) => byH[h].length > 1);
    const names = new Set(cat.map((p) => (p.venue || '').trim().toLowerCase()));
    const v = ven.find((x) => x.name && names.has(x.name.trim().toLowerCase()));
    return {
      pick: (multi && byH[multi][0].id) || (cat[0] && cat[0].id),
      handle: multi || (cat[0] && cat[0].handle),
      venue: v && v.id,
    };
  }).catch(() => ({}));
  await page.close(); await context.close();
  return [
    ids.pick   && ['venue',   `/venue.html?id=${encodeURIComponent(ids.pick)}`],
    ids.handle && ['curator', `/curator.html?handle=${encodeURIComponent(ids.handle)}`],
    ids.venue  && ['place',   `/place.html?id=${encodeURIComponent(ids.venue)}`],
  ].filter(Boolean);
}

(async () => {
  const server = spawn('npx', ['http-server', '.', '-p', String(PORT), '-c-1', '--silent'], { stdio: 'ignore' });
  await sleep(2000);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  const detailPages = await deriveDetailPages(browser);
  if (detailPages.length < 3) console.log(`⚠ detail-page derivation incomplete (${detailPages.map((p) => p[0]).join(',') || 'none'}) — those skipped this run`);
  const ALL_PAGES = [...PAGES, ...detailPages];

  let seriousTotal = 0;
  const summary = [];

  for (const skin of SKINS) {
    for (const [name, url] of ALL_PAGES) {
      for (const width of WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
        await context.addInitScript((s) => {
          try {
            localStorage.setItem('wa:city', 'tallinn');
            localStorage.setItem('wa:appearance', s);
          } catch (_) {}
        }, skin);
        const page = await context.newPage();
        await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
        await page.waitForFunction(() => window.__waCatReady === true, null, { timeout: 6000 }).catch(() => {});
        await sleep(700);

        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();

        const label = `${name} · ${skin} · ${width}`;
        const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        seriousTotal += serious.length;
        if (axe.violations.length || axe.incomplete.length) {
          summary.push({ label, violations: axe.violations, incomplete: axe.incomplete });
        }

        /* Keyboard walk — dusk/390 + dusk/1440 on key pages only (the
           walk is skin-independent enough; keep runtime sane). */
        if (skin === 'dusk' && KEYBOARD_PAGES.includes(name)) {
          const kb = await page.evaluate(async () => {
            const results = { noFocusStyle: [], tabbable: 0 };
            const before = new Map();
            const focusables = [...document.querySelectorAll(
              'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )].filter((el) => el.offsetParent !== null || el.getClientRects().length);
            results.tabbable = focusables.length;
            const ringOn = (el) => {
              if (!el) return false;
              const cs = getComputedStyle(el);
              return cs.outlineStyle !== 'none' || cs.boxShadow !== 'none';
            };
            for (const el of focusables.slice(0, 60)) {
              el.focus({ preventScroll: true });
              if (document.activeElement !== el) continue;
              /* The app's focus conventions include indicator-on-wrapper
                 (.search-box/.digest-field :focus-within) and indicator-on-
                 sibling (.bookmark__check ~ svg) — check all three hosts. */
              const hasRing = ringOn(el) || ringOn(el.parentElement)
                || ringOn(el.nextElementSibling);
              if (!hasRing) {
                const id = el.id ? `#${el.id}` : (el.className && typeof el.className === 'string'
                  ? `.${el.className.trim().split(/\s+/)[0]}` : el.tagName.toLowerCase());
                if (!results.noFocusStyle.includes(id)) results.noFocusStyle.push(id);
              }
            }
            return results;
          }).catch(() => null);
          if (kb && kb.noFocusStyle.length) {
            summary.push({ label: `${label} · keyboard`, keyboard: kb });
          }
        }

        await page.close();
        await context.close();
      }
    }
  }

  await browser.close();
  server.kill();

  console.log('\n=== WanderAlt a11y sweep (axe-core, WCAG 2.1 AA) ===\n');
  for (const s of summary) {
    console.log(`--- ${s.label}`);
    for (const v of s.violations || []) {
      console.log(`  [${v.impact}] ${v.id}: ${v.help}`);
      for (const n of v.nodes.slice(0, 4)) console.log(`      ${n.target.join(' ')}`);
      if (v.nodes.length > 4) console.log(`      …and ${v.nodes.length - 4} more`);
    }
    for (const i of (s.incomplete || []).filter((x) => x.id === 'color-contrast')) {
      console.log(`  [check-manually] ${i.id}: ${i.nodes.length} nodes axe could not compute (text over photo/glass)`);
    }
    if (s.keyboard) {
      console.log(`  [keyboard] ${s.keyboard.tabbable} focusables; NO visible focus ring on: ${s.keyboard.noFocusStyle.join(', ')}`);
    }
  }
  console.log(`\nSerious/critical axe violations: ${seriousTotal}`);
  process.exit(seriousTotal > 0 ? 1 : 0);
})().catch((e) => { console.error('a11y harness error:', e); process.exit(2); });
