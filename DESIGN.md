# WanderAlt — design reference

This is an index, not a spec. The authoritative rules live in two places
and this file must never fork from them:

- **`CLAUDE.md`** → "Dusk Glass laws" + "Layout & design contracts" sections —
  the numbered laws (three layers, one unit, single-line law, active state,
  radius vocabulary, control sizing) and the non-negotiables (spacing grid,
  two-tone brand, rhythm hierarchy, tap floor, component list).
- **`docs/redesign-jul26-v3/CC-HANDOFF.md`** → the full Jul 2026 redesign
  spec (single source; the canvas board sits beside it in the same folder).
- **`brand/BRAND.md`** → logo, palette, type specimens.

If you're about to write CSS for a Discover/Today/Saved/etc. change, read
`CLAUDE.md`'s Dusk Glass section first. Don't copy its rules in here —
edit them there, once.

## Verifying a change actually meets the spec

Three tools, three different jobs — run all three after a layout/CSS
change, not just the one that's fastest:

1. **`npm run audit`** (Playwright) — screenshots every public page as
   viewport-sized segments + a numeric icon-size/overflow census. You
   still have to *read* the PNGs (Claude can view images) — see the
   `visual-audit` skill for the reading checklist (alignment, density,
   rhythm, hierarchy).
2. **`npm run geometry`** (Playwright, `.screenshots/geometry-audit.js`)
   — measures real DOM coordinates instead of judging pixels: overlap
   between floating glass panels, content sitting flush against a panel
   edge with no inset, control heights off the 38/44/48/52 ladder,
   container overflow, and sibling-gap rhythm. Currently scoped to
   Discover (`discover`/`discover-places` @ 390/768/1440) — extend
   `PAGES`/`CONTENT_REGIONS` at the top of the file for other pages.
   **This exists because screenshot-reading alone missed real bugs**: a
   Jul 2026 Discover audit found the map scene rendering solid white
   (an opaque background hiding the dark Scene layer), a filter-rail
   overlap on desktop, and filter-rail content sitting flush against
   the glass panel's edge — all confirmed by measuring element rects,
   not by eyeballing PNGs. Screenshots tell you something looks off;
   geometry tells you why and gives you a number to verify the fix against.
3. **`npm run verify` / `npm run e2e` / `npm run visual`** — the
   pass/fail gates (structural, behavioural, pixel-diff). See `CLAUDE.md`
   → Commands.

None of these replace looking at the real thing: real photos, duotone,
and the MapLibre basemap only render correctly on the Cloudflare PR
preview (`npm run preview -- <branch-preview-url>`) — headless Chromium
in the audit/geometry tools can't rasterise the vector basemap and
composites `backdrop-filter` blur inconsistently across GPUs (documented
in `playwright.config.js` and the `visual-audit` skill). Flag anything
blur- or map-tile-specific as "verify on PR preview" rather than
guessing a fix from a headless render.

## Known environment limits (don't mistake these for bugs)

- **MapLibre vector basemap** never rasterises in headless Chromium on
  this stack (tiles fetch, WebGL context creates, canvas never paints).
  Markers/clusters are real; the basemap tile image is not — check the
  PR preview.
- **`backdrop-filter` blur** composites differently across GPUs/software
  rendering, so glass-panel-over-content blur can look sharp/overlapping
  in a headless capture even when it blurs correctly in a real browser.
