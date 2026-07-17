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

- **best-practices 77** → `third-party-cookies` + `inspector-issues`, both from
  **Wikimedia-hotlinked hero/thumb photos** (`commons.wikimedia.org`,
  `upload.wikimedia.org`) in the static catalog setting third-party cookies.
  Ironic for a "we don't track you" site. **Owner action (data/pipeline, not
  code):** the live pipeline serves images from Supabase storage; the static
  `catalog.js` snapshot still carries Wikimedia placeholder URLs. Fix at the
  source — proxy/rehost catalog images, or regenerate the snapshot from
  storage-backed picks — rather than in CSS.
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
1. **Owner:** rehost/proxy the Wikimedia catalog images (best-practices 77 →
   ~100; removes third-party cookies from the "no-tracking" site).
2. Consider adding `npm run lighthouse` + a WebKit line to CI once a headless
   Chrome/WebKit is provisioned there.
3. Desktop scene-text-over-photo contrast stays in the manual-check register
   (photo-dependent; scrim-covered by design).
