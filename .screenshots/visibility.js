/* ============================================================
   WanderAlt — visibility + control census (npm run visibility)
   ------------------------------------------------------------
   Two blind spots axe leaves open, made measurable:

   1. GHOST ELEMENTS — things a sighted user simply cannot see:
      · text/icons whose fg alpha or cumulative opacity ≈ 0
      · text/icons whose fg-vs-composited-bg ratio < 2:1 when the
        background chain is solid/alpha colors (dark-on-dark, the
        liquid-glass failure mode)
      · text over PHOTOS/scenes (axe gives up there): the element is
        screenshotted and its pixel luminance range measured — if the
        crop is near-uniform, nothing visible was drawn.
        KNOWN FALSE POSITIVES of the probe (verify by eye before fixing):
        thin small mono glyphs ("01", "404") can read range≈0 while
        faintly visible; off-screen-by-design skip links probe empty.

   2. CONTROL CENSUS — every interactive control's height/radius per
      page × skin × width, aggregated by class key, so drift from the
      sizing law is a printed list, not a feeling. Dusk law: unit 48px,
      docked keys 38px, radius vocabulary 8/14/20/24; chips ~32px are
      Material-exempt; about.html stays on the paper system (52/44).
      (Industry calibration, Jul 2026: Apple HIG 44pt · Material 3
      48dp · NN/g ≈1cm — the 48px unit matches consensus.)

   Playwright engine (repo policy). Informational — exit 0 always; the
   human reads the report. ~60 page-loads; runs several minutes.
   ============================================================ */

const { spawn } = require('child_process');
const { chromium } = require('playwright');

let sharp = null;
try { sharp = require('sharp'); } catch (_) { /* media checks degrade */ }

const PORT = 5195;
const BASE = `http://127.0.0.1:${PORT}`;
const WIDTHS = [390, 768, 1440];
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = spawn('npx', ['http-server', '.', '-p', String(PORT), '-c-1', '--silent'], { stdio: 'ignore' });
  await sleep(2000);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  const ghosts = [];
  const lowVis = [];
  const census = new Map(); /* key → { heights:Map, radii:Set, pages:Set } */

  /* Each (skin, page, width) scan is independent; run them through a
     bounded pool instead of 42 serial context loads (was the dominant
     CI cost). Shared ghosts/lowVis/census updates are race-free — JS is
     single-threaded, so map/array writes between awaits don't interleave. */
  const tasks = [];
  for (const skin of SKINS)
    for (const [name, url] of PAGES)
      for (const width of WIDTHS)
        tasks.push({ skin, name, url, width });

  const runOne = async ({ skin, name, url, width }) => {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
        await context.addInitScript((s) => {
          try { localStorage.setItem('wa:city', 'tallinn'); localStorage.setItem('wa:appearance', s); } catch (_) {}
        }, skin);
        const page = await context.newPage();
        await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
        await page.waitForFunction(() => window.__waCatReady === true, null, { timeout: 6000 }).catch(() => {});
        await sleep(700);

        const scan = await page.evaluate(() => {
          /* Normalize ANY computed color (rgb/rgba/oklch/color()) via a 1×1
             canvas — Chromium returns oklch() for modern palettes and a
             regex parser reads its numbers as RGB garbage (first run of
             this scanner produced 1.09:1 "ghosts" for visibly fine text). */
          const cnv = document.createElement('canvas');
          cnv.width = cnv.height = 1;
          const cctx = cnv.getContext('2d', { willReadFrequently: true });
          const ccache = new Map();
          const parseC = (s) => {
            if (!s || s === 'none') return null;
            if (ccache.has(s)) return ccache.get(s);
            cctx.clearRect(0, 0, 1, 1);
            cctx.fillStyle = '#000';
            cctx.fillStyle = s; /* invalid values keep #000 — acceptable */
            cctx.fillRect(0, 0, 1, 1);
            const d = cctx.getImageData(0, 0, 1, 1).data;
            const out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
            /* Recover true alpha: canvas premultiplies; re-read unblended
               by parsing rgba() directly when present. */
            const m = (s.match(/rgba?\(([^)]+)\)/) || [])[1];
            if (m) {
              const n = m.split(/[,/\s]+/).filter(Boolean).map(Number);
              if (n.length >= 3) { out.r = n[0]; out.g = n[1]; out.b = n[2]; out.a = n.length > 3 ? n[3] : 1; }
            }
            ccache.set(s, out);
            return out;
          };
          const lum = (c) => {
            const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
            return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
          };
          const ratio = (a, b) => {
            const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x);
            return (h + 0.05) / (l + 0.05);
          };
          const over = (top, under) => ({ /* top rgba composited over under rgb */
            r: top.r * top.a + under.r * (1 - top.a),
            g: top.g * top.a + under.g * (1 - top.a),
            b: top.b * top.a + under.b * (1 - top.a),
            a: 1,
          });
          const keyOf = (el) => {
            const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '')
              .trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
            return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (el.type ? `[${el.type}]` : '');
          };
          const sel = (el) => {
            if (el.id) return '#' + el.id;
            return keyOf(el);
          };

          const out = { ghosts: [], low: [], media: [], controls: [] };
          const all = [...document.querySelectorAll('body *')];

          /* Effective bg chain: composite rgba layers bottom-up; detect media.
             A chain that ends WITHOUT an opaque layer is UNVERIFIABLE (the
             dusk body paints via gradient/scene) — assuming white there
             fabricated ghosts for perfectly visible cream text (first two
             runs of this scanner). Unverifiable → pixel-probe route. */
          const bgInfo = (el) => {
            const layers = [];
            let n = el;
            let opaque = false;
            while (n && n !== document.documentElement) {
              const cs = getComputedStyle(n);
              if (cs.backgroundImage && cs.backgroundImage !== 'none') return { mediaBacked: true };
              if (['IMG', 'VIDEO', 'CANVAS', 'PICTURE'].includes(n.tagName)) return { mediaBacked: true };
              const c = parseC(cs.backgroundColor);
              if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) { opaque = true; break; } }
              n = n.parentElement;
            }
            if (!opaque) {
              const rootCs = getComputedStyle(document.documentElement);
              if (rootCs.backgroundImage !== 'none') return { mediaBacked: true };
              const rootC = parseC(rootCs.backgroundColor);
              if (!rootC || rootC.a < 0.99) return { mediaBacked: true }; /* unverifiable */
              layers.push(rootC);
            }
            let base = { r: 255, g: 255, b: 255, a: 1 };
            for (const l of layers.reverse()) base = over(l, base);
            return { mediaBacked: false, bg: base };
          };

          const cumOpacity = (el) => {
            let o = 1; let n = el;
            while (n && n !== document.documentElement) { o *= parseFloat(getComputedStyle(n).opacity || '1'); n = n.parentElement; }
            return o;
          };

          let scanned = 0;
          for (const el of all) {
            if (scanned > 500) break;
            const r = el.getClientRects()[0];
            if (!r || r.width < 2 || r.height < 2) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            /* sr-only elements (skip links, clipped labels) are invisible BY
               DESIGN — their job is the accessibility tree, not the screen. */
            if (cs.clipPath && cs.clipPath !== 'none') continue;
            if (r.width <= 2 && r.height <= 2) continue;

            /* ---- census: interactive controls ---- */
            const isControl = el.matches('button, a, input:not([type=hidden]), select, textarea, [role=button], [role=tab], label.bookmark');
            if (isControl && r.height >= 8) {
              out.controls.push({
                key: keyOf(el), h: Math.round(r.height), w: Math.round(r.width),
                radius: cs.borderRadius.split(' ')[0],
              });
            }

            /* ---- ghost detection: direct text or standalone svg icon ---- */
            const directText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
            const isIcon = el.tagName === 'svg';
            if (!directText && !isIcon) continue;
            scanned++;

            const op = cumOpacity(el);
            const fg = parseC(isIcon ? (cs.stroke !== 'none' && cs.stroke !== 'rgba(0, 0, 0, 0)' ? cs.stroke : cs.fill) : cs.color);
            if (!fg) continue;
            const label = `${sel(el)} "${(el.textContent || '').trim().slice(0, 26)}"`;

            if (op < 0.15 || fg.a * op < 0.15) {
              out.ghosts.push({ what: label, why: `alpha/opacity ≈ ${(fg.a * op).toFixed(2)}` });
              continue;
            }
            const bi = bgInfo(el);
            if (bi.mediaBacked) {
              /* Unverifiable-by-chain (glass over scene/gradient) → settle
                 empirically with the pixel probe; icons qualify too. */
              if (out.media.length < 40) {
                el.dataset.waVisProbe = '1';
                out.media.push({ what: label });
              }
              continue;
            }
            const fgFlat = over({ ...fg, a: fg.a * op }, bi.bg);
            const rt = ratio(fgFlat, bi.bg);
            if (rt < 2.0)      out.ghosts.push({ what: label, why: `contrast ${rt.toFixed(2)}:1 on solid chain` });
            else if (rt < 3.0) out.low.push({ what: label, why: `contrast ${rt.toFixed(2)}:1` });
          }
          return out;
        });

        const tag = `${name} · ${skin} · ${width}`;
        for (const g of scan.ghosts) ghosts.push({ tag, ...g });
        for (const l of scan.low) lowVis.push({ tag, ...l });
        for (const c of scan.controls) {
          const k = `${c.key}`;
          if (!census.has(k)) census.set(k, { heights: new Map(), radii: new Set(), pages: new Set() });
          const e = census.get(k);
          e.heights.set(c.h, (e.heights.get(c.h) || 0) + 1);
          e.radii.add(c.radius);
          e.pages.add(name);
        }

        /* Media-backed text: pixel-sample each probe crop — near-uniform
           crop means nothing visible was drawn (invisible text on photo). */
        if (sharp) {
          const probes = await page.$$('[data-wa-vis-probe="1"]');
          for (const h of probes.slice(0, 40)) {
            try {
              const buf = await h.screenshot({ timeout: 2000 });
              const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
              const px = [...data].sort((a, b) => a - b);
              const range = px[Math.floor(px.length * 0.98)] - px[Math.floor(px.length * 0.02)];
              if (range < 24) {
                const label = await h.evaluate((el) => `${el.tagName.toLowerCase()} "${(el.textContent || '').trim().slice(0, 26)}"`);
                ghosts.push({ tag, what: label, why: `over-media crop luminance range ${range} — nothing visibly drawn` });
              }
            } catch (_) { /* detached/offscreen — skip */ }
          }
        }

        await page.close().catch(() => {});
        await context.close().catch(() => {});
  };

  const CONCURRENCY = 5;
  let idx = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (idx < tasks.length) {
      const t = tasks[idx++];
      await runOne(t).catch((e) => console.error(`  visibility task error ${t.name}·${t.skin}·${t.width}: ${e.message}`));
    }
  }));

  await browser.close();
  server.kill();

  console.log('\n=== GHOSTS (effectively invisible) ===');
  for (const g of ghosts) console.log(`  ${g.tag} — ${g.what} — ${g.why}`);
  if (!ghosts.length) console.log('  none');

  console.log('\n=== LOW VISIBILITY (2–3:1 on solid chain — review) ===');
  const seen = new Set();
  for (const l of lowVis) {
    const k = l.what + l.why.slice(0, 12);
    if (seen.has(k)) continue; seen.add(k);
    console.log(`  ${l.tag} — ${l.what} — ${l.why}`);
  }
  if (!lowVis.length) console.log('  none');

  console.log('\n=== CONTROL CENSUS (heights per class key; law: 48 unit / 38 docked / chips ~32 / about page 52·44) ===');
  const rows = [...census.entries()].sort((a, b) => b[1].pages.size - a[1].pages.size);
  for (const [k, e] of rows) {
    const hs = [...e.heights.entries()].sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h}×${n}`).join(' ');
    console.log(`  ${k}  → heights ${hs} · radii ${[...e.radii].join(',')} · pages ${[...e.pages].join(',')}`);
  }
  console.log('\nInformational — read the lists, fix what violates the law, ignore exempt classes.');
})().catch((e) => { console.error('visibility harness error:', e); process.exit(2); });
