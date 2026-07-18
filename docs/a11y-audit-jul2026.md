# Accessibility Audit: WanderAlt (post Dusk Glass reskin)
**Standard:** WCAG 2.1 AA (project floor: WCAG 2.2 AA) | **Date:** 17 Jul 2026

## Method
`npm run a11y` (new in this audit — axe-core 4.12 via Playwright): every public
page × **both skins** (dusk + day, pinned via `wa:appearance`; an unknown value
silently falls back to sun-following auto, so pin exactly `'dusk'`/`'day'`) ×
390/1440, plus a keyboard walk (focus-ring presence on element, wrapper, and
sibling — the app's three legitimate indicator hosts). Contrast ratios below
were **measured** from computed styles with alpha blending, not read off tokens.
Exit is non-zero on serious/critical violations, so the sweep can gate CI later.

## Summary
**Serious axe violations at start: 22** (every page failed at least one) →
**0 after fixes**. Moderate/manual items and known limitations listed below.

## Findings and fixes

### Operable / Robust — nameless dock tabs (4.1.2 + 2.4.4, serious, every page @390)
Both dock generations hid inactive-tab labels with `display:none`
(`styles.css` had **two** hide sites: the legacy nav and the Dusk Glass dock),
which removes the text from the accessible name — every inactive bottom-nav
tab announced as an unnamed link. **Fix:** visually-hidden clip pattern
(`position:absolute; 1px; clip-path:inset(50%)`) at both sites, with explicit
un-clipping in the active-tab and desktop restore rules. The dock is visually
unchanged; screen readers now hear "Today / Discover / Saved / Profile".

### Perceivable — contrast (1.4.3, serious)
| Element | Was | Measured | Fix |
|---|---|---|---|
| About LIVE badge (both themes) | 60%-alpha glass text on lime | 1.2:1 dusk / 2.7:1 day | solid `--c-ink` on lime |
| Discover curator quotes (dusk) | light-theme `--c-ink-mute` on dark glass | 2.7:1 | `--g-mute` (the documented AA floor token) |
| About "Built in the open" labels (dusk) | global dusk `a{color:inherit}` cascaded cream onto **white** plates (About stays paper by spec) | 1.5:1 | pin `--c-ink` on plate anchors |
| About mobile returnbar (dusk) | light-teal `--g-petrol` on paper | ~2:1 | `--c-accent` |
| Taste prompts + section labels + colophon (day) | `--g-faint`(.5)/`--g-soft`(.6) used as small text | ~3.5–4.0:1 | `--g-mute`(.72) — the token comment itself says "AA floor for running text" |
| Discover sheet eyebrows (dusk @390) | `--g-soft` | borderline | `--g-mute` |

Pattern behind all of these: the Dusk Glass tiers (`g-faint`/`g-soft`/`g-mute`)
are a designed hierarchy where **only g-mute is AA for small text** — several
elements were placed one tier too faint, and two spots leaked cross-theme
tokens (light-theme ink on dark glass; glass-teal on paper).

### Operable — focus visibility (2.4.7)
Composite fields (`.search-box`, `.digest-field`, `.field`) indicated focus
with only a 1–1.5px border-color tint on the wrapper. Strengthened with a
`box-shadow: 0 0 0 1px var(--c-accent)` ring on `:focus-within` (no layout
shift). The bookmark checkbox's sibling-SVG ring and the global
`:focus-visible` petrol ring were already correct.

## Manual-check register (axe "incomplete") — reviewed by eye
Text over photos/glass blur (axe can't compute those backgrounds): the Tonight
hero meta/quote and scene tickers sit on `--scrim-*` scrims per the Dusk law
("Scene never carries text without a scrim ≥ rgba(10,16,17,.78)") — spot-checks
of hero meta on the darkest and lightest committed baselines read comfortably.
**Residual risk:** scrim-over-photo contrast depends on the photo; re-check on
the Cloudflare preview when new hero images land.

## Known checker limitations
- The keyboard walk checks element/parent/sibling for rings — a ring hosted
  anywhere else would still be a false positive.
- Screen-reader behavior (VoiceOver/NVDA) not exercised — the audit validates
  computed accessibility properties, not AT output. Worth one manual VoiceOver
  pass before launch.
- Zoom-to-200% not automated; `verify`'s overflow checks at 390 approximate
  reflow but are not the 1.4.10 reflow test.

## Visibility scan + control census (second pass, 17 Jul)
`npm run visibility` (new): ghost-element detector (alpha/opacity ghosts,
sub-2:1 solid-chain contrast, and **pixel-probing** of text over photos/glass
— the element is screenshotted and its luminance range measured, catching
invisible-over-media text no CSS math can) plus a control census (every
interactive control's height/radius per page × skin × width, aggregated by
class). Scanner lessons learned the hard way, now baked in: Chromium returns
`oklch()` computed colors (regex RGB parsing fabricates ratios — normalize
via canvas); a bg chain with no opaque layer is *unverifiable*, not white;
`clip-path` sr-only elements are invisible by design.

**Census verdict:** the 48px-unit system largely held (nav, pills, chips,
scope buttons, CTAs all 48/r14 — and the unit matches industry consensus:
Apple HIG 44pt, Material 3 48dp, NN/g ≈1cm). Real drift, all fixed:
- `city-selector` was the one control rendering two sizes (40/r12 mobile vs
  48/r14 desktop) → one unit everywhere.
- The Discover deck's search shell was the app's only 40px control → 48.
- Docked field keys (digest ✦, masthead search key, CONCIERGE): radii 9/10
  → 8, and CONCIERGE's 32px box (vs 44 in its base rule) → 44. Census
  lesson: the law's "38px docked key" is the *visual plate* — the `::before`
  inset already renders 38 inside a 44 tap box, and verify's BTNSWEEP
  rightly rejected literal 38px boxes.
- `taste-chip` minted an 11px radius via `calc(14px - 3px)` → 8.
- MapLibre's attribution (an OSM **license requirement**) measured 1.7–2.8:1
  on translucent plates → solid plates, AA-floor text, both themes.

**Deliberately not changed:** the pervasive 44px icon-button tier
(bookmarks, action icons, zoom) — sanctioned by the surviving icon-system
contract ("44px tap target around a ~22px glyph"); `.seg-tabs`' 10px radius
(a container, not a control). Both noted for an owner ruling.

**Non-text contrast (WCAG 1.4.11) — now probed (`npm run contrast-ui`, Jul 2026).**
The new probe composites each control's fill and border against the background
just outside it (canvas-normalized, oklch-safe) and flags boundaries < 3:1.
Result: **dusk is clean; the Daybreak (day) theme's INACTIVE glass controls are
sub-3:1** — Discover/Places pills, sheet-chips, scope tabs and the city selector
render as `border: 1px rgba(16,26,27,.10)` (~1.3:1) over a ~62%-white fill on
cream (~1.0:1), no edge shadow. **Active/selected states are fine** (petrol tint,
≥3:1), so *state* is distinguishable; the gap is the resting outline of unselected
controls. Verified by eye: perceptible but faint.
- **This is an OWNER decision, not auto-fixed** (same class as the pill/type
  rulings): strengthening every day-theme inactive-control border (e.g. `--glass`
  border alpha .10 → ~.30, or a 1px inset edge) is a visible change to the whole
  shipped Daybreak aesthetic. The controls are identifiable today by text +
  grouping + strong active states; 1.4.11 strictly wants the resting boundary
  ≥3:1. Recommend bumping the day inactive-control border to reach 3:1 — small,
  systemic, and it clears the whole register at once. Dusk needs nothing.

## Priority follow-ups
1. Manual VoiceOver pass on Today + Discover — script ready at
   `docs/voiceover-test-checklist.md` (flows, not properties).
2. ✅ `npm run a11y` wired into CI as a hard gate (+ `visibility` informational);
   `npm run contrast-ui` available for the 1.4.11 decision above.
3. Re-check scrim-over-photo contrast whenever hero imagery is refreshed.
4. **Owner:** decide the Daybreak inactive-control border strength (1.4.11 above).
