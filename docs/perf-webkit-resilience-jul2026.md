# Performance / WebKit / Resilience audit — WanderAlt (18 Jul 2026)

Three dimensions no prior pass had touched: **performance** (the repo's own
`npm run lighthouse` had never been run this engagement), **Safari/WebKit**
(every prior test ran Chromium only — but a mobile-first guide's iPhone users
get WebKit, where `backdrop-filter`/`oklch`/`clip-path` classically break), and
**resilience paths** (dead ids, broken images, bad form input).

## Performance — Lighthouse (desktop, throttled)
| Page | Perf | A11y | Best-Practices | SEO |
|------|-----|------|----------------|-----|
| briefing | 98 | 93 | **77** | 100 |
| discover | 95 | 97 | 100 | 100 |
| about | 98 | 100 | 100 | 100 |

Performance is strong (95–98) even with glass blur + photo scenes. Two briefing
outliers, both diagnosed to the exact element/URL:

- **best-practices 77 → LOCALHOST MEASUREMENT ARTIFACT, not a production bug
  (corrected 18 Jul after direct verification).** `third-party-cookies` +
  `inspector-issues` came from **Wikimedia** hero/thumb photos
  (`commons.wikimedia.org`, `upload.wikimedia.org`) setting cookies
  (`WMF-Last-Access`, `GeoIP` — curl-confirmed). BUT: `supabase.js`'s
  `proxifyImage()` rewrites Wikimedia URLs to `/img/wm/<enc>` on production,
  where the `workers/wikimedia-proxy/` Cloudflare Worker re-fetches and strips
  Set-Cookie + sets `referrer-policy: no-referrer`. **It deliberately bypasses
  on localhost** (so dev needs no worker), which is exactly what Lighthouse hit
  — the raw cookie-setting URL. On `wanderalt.app` the "no third-party cookies"
  promise holds. **Google photos** (`lh3.googleusercontent.com`, 39 live picks)
  were also checked: HTTP 200, **zero Set-Cookie** — never a cookie issue.
  Lesson baked into `.scripts/lighthouse-audit.js`: run against production (or
  read best-practices with the localhost proxy-bypass in mind).
  - *Residual, minor, non-urgent (owner):* those 39 Google URLs are a live
    dependency on the **retired** Google Places photo CDN — they work today and
    set no cookies, but bypass the app's own edge cache and could be revoked.
    Re-enrich them to Supabase storage when convenient (pipeline op), or extend
    the proxy + `WA.img` to route Google through the edge too (perf/caching win;
    needs a coordinated worker redeploy → client push, or Google images 404).
- **a11y 93 (desktop 1280)** → `color-contrast` on `.scene-ticker` /
  `.scene-attr` / `.scene-aside__label` (mono text over the desktop photo hero
  — the text-over-photo manual-check class; scrim-covered, photo-dependent,
  design-intent) and `link-in-text-block` (fixed below).

## WCAG 1.4.1 (Use of Color) — FIXED
Lighthouse's `link-in-text-block` caught what our axe tag-set
(`wcag2a/2aa/21aa`) did not: inline **`@handle` links are distinguished from
surrounding prose by color alone**. Measured petrol-handle vs ink-mute
surrounding = **1.23:1** (dusk g-petrol vs surrounding = 1.31:1) — far below the
3:1 the color-only exception requires. **Fix:** a thin, offset, half-alpha
underline on `a.handle` (editorial-subtle; `color-mix(in oklch …)` verified
rendering in WebKit + Chromium). Standalone handles (curator `<h1>`) are not
`<a>`, so the fix scopes to real links only.

## WebKit / Safari sweep — CLEAN
`webkit.launch()` over all 7 pages × both skins × 390: **zero** console errors,
zero page errors, zero horizontal overflow, and `.island` glass reports a live
`backdrop-filter` on every combo. The `-webkit-` prefixes, `oklch()`, and
`clip-path` all hold in Safari's engine — the mobile-first audience is covered.

## Resilience — two false alarms correctly NOT "fixed", one owner note
Discipline note: a keyword-regex probe first flagged dead-id pages as "blank"
and route-abort flagged the hero fallback as broken. **Both were verified false
before any change** (the check-the-evidence rule) — chasing either would have
been a regression.
- **Dead venue/curator/place ids** → graceful, on-voice not-found states already
  exist ("Not in the catalog", "No curator by that handle", "Not in the
  catalog"). Not blank. (Minor: these use `<p>` not `<h1>` — left as-is; the
  `emptyState` component is shared across many non-error contexts.)
- **Broken hero image** (genuine 404 on the real image host) → `paintScene`'s
  probe fires and the scene correctly degrades to the gradient fallback
  (`scene__bg--fallback`, bg cleared). Works.
- **Invalid digest email** → native `type=email` validation blocks submit, and
  `#digest-optin-status` is already `aria-live="polite"` for the JS
  success/error copy. WCAG 3.3.1 met.

## Follow-ups
1. **Owner (optional, non-urgent):** re-enrich the 39 Google-Places-CDN image
   URLs to Supabase storage (the Places API is retired; the URLs work + set no
   cookies today but are a dependency worth removing). Best-practices "77" needs
   no action — it was a localhost artifact (see above); production proxies
   Wikimedia and Google sets no cookies.
2. Consider adding `npm run lighthouse` + a WebKit line to CI once a headless
   Chrome/WebKit is provisioned there.
3. Desktop scene-text-over-photo contrast stays in the manual-check register
   (photo-dependent; scrim-covered by design).
