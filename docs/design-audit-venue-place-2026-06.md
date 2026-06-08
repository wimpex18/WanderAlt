# Design audit — venue + place detail pages, mobile + desktop

Brand-seeded pass via the `wanderalt-design` skill, audited at 390 and
1440. Both pages were already in good shape — these are tap-target
refinements, not structural fixes.

## Already correct (no change)

- **One `<h1>` each** — venue title (`Drone Night at Ääniwalli`) and place
  name (`Biit Me Record Store`) render as `<h1>` (from the photo-forward /
  brand work).
- **No unnamed controls**; the curator handles, social glyphs, and back
  link all have accessible names.
- **Contrast** of `.meta` / `.eyebrow` / `.venue-social__link` = 6.61:1 on
  white (passes AA).
- **No horizontal overflow** at either width.

## Fixes (both viewports — non-responsive properties)

| Element | Before | After |
|---|---|---|
| `.venue-back` (back-nav link, venue + place) | ~42px | **44px** (inline-flex, min-height 44) |
| `.venue-mood` (mood chips) | 28px | **32px** (Material chip height) |
| `.venue-venue .bookmark` (venue detail bookmark) | ~36px | **44×44** hit area (glyph stays 20px) |

Left correct as-is: inline curator-handle links and the place "on map"
link (WCAG inline-link exemption); the focus-only skip link.

## Verification

`npm run verify` → 24/24 on the param-less public pages (unaffected).
Detail-page re-check (with live ids) confirms: venue back 44 / mood 32 /
bookmark 44; place back 44. All token-based — no new variables, fonts, or
colours. (venue/place need `?id=` so they're audited manually per-PR
rather than in the param-less `verify` sweep.)
