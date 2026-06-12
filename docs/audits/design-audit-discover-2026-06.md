# Design audit — Discover (`discover.html`), mobile + desktop

Brand-seeded pass via the `wanderalt-design` skill, audited at **both** 390
(mobile) and 1440 (desktop) since Discover's layout differs (single pane +
FAB vs. list/map split + filter rail). Critique, WCAG 2.1 AA audit,
design-system check, and dev-handoff for the fixes in this PR.

## Design critique (against the brand)

On-brand and strong on both viewports: Events/Places ink-fill toggle, the
photo-forward event cards, mono filter legends, the desktop list/map split,
petrol/lime discipline, Fraunces titles + Inter body. No restyle needed.

## WCAG 2.1 AA audit (both viewports)

| Check | Mobile | Desktop |
|---|---|---|
| `html[lang]` = en | ✅ | ✅ |
| Search input accessible name | ✅ (`<label for="discover-q">`) | ✅ |
| Icon buttons have `aria-label` | ✅ (AI toggle, clear, zoom, locate, FAB) | ✅ |
| Text contrast (meta/quote/eyebrow/count) | ✅ 6.61:1 | ✅ 6.61:1 |
| **Document has one `<h1>`** | ❌→✅ **fixed** | ❌→✅ **fixed** |
| **Map zoom/locate ≥ 44px** | n/a (hidden) | ⚠️→✅ 34–36 → **44** |

Measurement false-positives confirmed OK: the active scope button + Map FAB
report "ratio 1" only because they're white-on-dark measured against the
white page (real contrast is high); the search input/sheet radios are
labelled via `label[for]` (a crude name check missed the association).

## Bug found (desktop)

**The Map/List FAB was showing on desktop.** The desktop-hide rule
(`@media ≥1024 { .discover-view-fab { display:none } }`) sat *before* the
base `.discover-view-fab { display:inline-flex }` in the file, so source
order let the base win at ≥1024 → the FAB wrongly appeared over the
always-visible split. Fixed by scoping the hide to
`body[data-page="discover"] .discover-view-fab` so it outranks the base
regardless of order.

## Dev-handoff (exact changes)

- **`discover.html`** — the editorial lede becomes the page `<h1>`
  (`.discover-lede__title` `<p>`→`<h1>`, same class/visual) — supplies the
  missing top-level heading.
- **`styles.css`**
  - Desktop FAB hide → scoped to `body[data-page="discover"]` (bug fix).
  - `.map-zoom-btn` 36×34 → **44×44**; `.map-locate-fab` 36×36 → **44×44**
    (touch targets for the map controls).
- **`.screenshots/verify.js`** — added `.map-zoom-btn` + `.map-locate-fab`
  to the 44px sweep.

Left as-is (correct): `.search-box__ai-btn` 36px — passes WCAG AA (2.5.8 ≥
24px) and lives inside the 54px search box; forcing 44 would inflate the
box. Quick-filter pills + mood/sheet chips ~32–34px = the documented chip
exception. Inline links (`.handle`, "on map →") = WCAG inline exemption.

## Verification

`npm run verify` → 24/24 (overflow, console errors, 44px targets). Dual-
viewport re-check confirms: 1 `<h1>` each; FAB shown on mobile / hidden on
desktop; map controls 44×44 on desktop. All token-based — no new variables,
fonts, or colours.
