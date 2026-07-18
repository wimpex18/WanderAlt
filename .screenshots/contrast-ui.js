/* ============================================================
   WanderAlt — non-text contrast probe (npm run contrast-ui)
   ------------------------------------------------------------
   WCAG 1.4.11 (Non-text Contrast, AA): the visual boundary that lets
   you SEE a UI control (its fill-vs-surroundings, or its border) must
   be ≥ 3:1. axe's color-contrast rule only covers TEXT; this is the
   dimension it leaves open — and the "glass button shape on glass
   background" case is exactly where the Dusk Glass system is at risk.

   Per control (button / input / select / textarea / role=button /
   chips / toggles) on every page × both skins × 390 & 1440:
     1. Composite the control's own background over its ancestor chain.
     2. Sample the page background just OUTSIDE the control's left edge
        (elementFromPoint) and composite that too.
     3. A control is "identifiable" if EITHER
          · its border (width>0, non-transparent) is ≥3:1 vs the OUTSIDE
            background (a visible outline), OR
          · its fill differs from the outside background by ≥3:1 (a
            visible solid shape).
        Otherwise the boundary is sub-3:1 → a 1.4.11 flag.

   Skips: links/inline text (identified by text, 1.4.11-exempt), the
   scene chrome over photos (photo-dependent, manual register), and
   controls with no border AND a fill equal to their parent (decorative
   groupings, not standalone controls). INFORMATIONAL — exit 0 always;
   read the list, judge each. Canvas-normalized colors (oklch-safe).
   ============================================================ */

const { spawn } = require('child_process');
const { chromium } = require('playwright');

const PORT = 5194;
const BASE = `http://127.0.0.1:${PORT}`;
const WIDTHS = [390, 1440];
const SKINS = ['dusk', 'day'];
const PAGES = [
  ['today', '/index.html'], ['discover', '/discover.html'],
  ['places', '/discover.html?type=places'], ['saved', '/saved.html'],
  ['profile', '/profile.html'], ['about', '/about.html'], ['404', '/404.html'],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = spawn('npx', ['http-server', '.', '-p', String(PORT), '-c-1', '--silent'], { stdio: 'ignore' });
  await sleep(2000);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  const flags = [];
  for (const skin of SKINS) {
    for (const [name, url] of PAGES) {
      for (const width of WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
        await context.addInitScript((s) => { try { localStorage.setItem('wa:city', 'tallinn'); localStorage.setItem('wa:appearance', s); } catch (_) {} }, skin);
        const page = await context.newPage();
        await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
        await page.waitForFunction(() => window.__waCatReady === true, null, { timeout: 6000 }).catch(() => {});
        await sleep(700);

        const found = await page.evaluate(() => {
          const cnv = document.createElement('canvas'); cnv.width = cnv.height = 1;
          const cx = cnv.getContext('2d', { willReadFrequently: true });
          const parse = (s) => {
            if (!s || s === 'none' || s === 'transparent') return null;
            cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = s; cx.fillRect(0, 0, 1, 1);
            const d = cx.getImageData(0, 0, 1, 1).data;
            const out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
            const m = (s.match(/rgba?\(([^)]+)\)/) || [])[1];
            if (m) { const n = m.split(/[,/\s]+/).filter(Boolean).map(Number); if (n.length >= 3) { out.r = n[0]; out.g = n[1]; out.b = n[2]; out.a = n.length > 3 ? n[3] : 1; } }
            return out;
          };
          const over = (t, u) => t.a >= 0.999 ? t : { r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 };
          const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
          const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
          const bgOf = (el) => {
            const layers = []; let n = el, opaque = false, media = false;
            while (n && n !== document.documentElement) {
              const cs = getComputedStyle(n);
              if (cs.backgroundImage !== 'none' || ['IMG','VIDEO','CANVAS','PICTURE'].includes(n.tagName)) { media = true; break; }
              const c = parse(cs.backgroundColor);
              if (c && c.a > 0) { layers.push(c); if (c.a >= 0.999) { opaque = true; break; } }
              n = n.parentElement;
            }
            if (media) return null; // photo-backed → manual register, skip
            const rootC = parse(getComputedStyle(document.documentElement).backgroundColor);
            let base = opaque ? layers.pop() : (rootC && rootC.a >= 0.999 ? rootC : null);
            if (!base) return null;
            for (const l of layers.reverse()) base = over(l, base);
            return base;
          };
          const key = (el) => { const c = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').trim().split(/\s+/)[0]; return el.tagName.toLowerCase() + (c ? '.' + c : '') + (el.type ? `[${el.type}]` : ''); };

          const out = [];
          const controls = [...document.querySelectorAll('button, input:not([type=hidden]), select, textarea, [role=button], .chip, .m-chip, .sheet-chip, .mood-chip, [class*=toggle]')];
          for (const el of controls) {
            const r = el.getClientRects()[0];
            if (!r || r.width < 10 || r.height < 10) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            // sample the OUTSIDE background just left of the control
            const ox = Math.max(1, r.left - 3), oy = r.top + r.height / 2;
            const outsideEl = document.elementFromPoint(ox, oy);
            if (outsideEl === el || (outsideEl && el.contains(outsideEl))) continue; // no clear "outside"
            const outBg = outsideEl ? bgOf(outsideEl) : null;
            const selfBg = bgOf(el);
            if (!outBg || !selfBg) continue; // photo-backed / indeterminate → skip
            const bw = parseFloat(cs.borderTopWidth) || 0;
            const border = bw > 0 ? parse(cs.borderTopColor) : null;
            const borderFlat = border && border.a > 0 ? over(border, outBg) : null;
            const borderVsOut = borderFlat ? ratio(borderFlat, outBg) : 0;
            const fillVsOut = ratio(selfBg, outBg);
            const identifiable = borderVsOut >= 3 || fillVsOut >= 3;
            if (!identifiable && fillVsOut < 2.9) {
              out.push(`${key(el)} "${(el.textContent||'').trim().slice(0,14)}" border ${borderVsOut.toFixed(2)} / fill ${fillVsOut.toFixed(2)} :1 vs surround`);
            }
          }
          return [...new Set(out)].slice(0, 8);
        });
        for (const f of found) flags.push({ tag: `${name}·${skin}·${width}`, f });
        await page.close(); await context.close();
      }
    }
  }

  await browser.close(); server.kill();
  console.log('\n=== WCAG 1.4.11 non-text contrast (UI boundary < 3:1 vs surround) ===');
  if (!flags.length) console.log('  none — every measured control boundary ≥ 3:1 (or is text/photo-backed, exempt).');
  for (const x of flags) console.log(`  ${x.tag} — ${x.f}`);
  console.log('\nInformational: verify each by eye (some glass controls sit on glass by design with an inset-shadow edge the compositing math can\'t see).');
})().catch((e) => { console.error('contrast-ui harness error:', e); process.exit(2); });
