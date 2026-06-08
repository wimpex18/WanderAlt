---
name: wanderalt-design
description: WanderAlt's brand + design system, conventions, and quality bars. Use this whenever designing, restyling, reviewing, or building UI/CSS/frontend for WanderAlt — including when the Design or frontend-design plugin skills run (design critique, design-system, dev handoff, accessibility audit, UX writing) — so output matches the brand instead of generic AI defaults.
---

# WanderAlt design system (seed for design/frontend work)

Read the canonical sources before proposing or making visual changes — do
not invent tokens or restyle from scratch:

- `CLAUDE.md` → "Visual conventions", "Layout / alignment system", "Motion
  conventions" (the binding rules).
- `brand/BRAND.md` → palette, type, lockup, city-plates (Beacon v2).
- `docs/layout-audit-2026-06.md` → spacing, tap targets, width ladder.
- `styles.css` `:root` → every design decision is a CSS variable; reuse
  tokens, do not add new ones without asking.

## Non-negotiables (June 2026)

- **Type:** body/metadata = **Inter** (`--ff-body`); city names + venue/
  event titles + the curator quote = **Fraunces** (`--ff-display`); small
  uppercase eyebrows/labels = **Geist Mono** (`--ff-mono`). No other fonts.
- **Colour:** petrol `#055959` (`--c-accent`) is the only accent; lime
  `#d2dc50` (`--c-lime`) is signal-only (live/active). Do **not** add a
  third colour or reintroduce the retired oxblood.
- **Spacing:** the `--s-*` scale only (4/8/12/16/20/24/32/40/56/72). No
  off-grid literals.
- **Width:** one shared `--reading-max` ladder (1100 ≥768 · 1200 ≥1100 ·
  1280 ≥1440); chrome + content key off it so edges align across pages.
- **Tap targets:** 44px floor on public/touch pages (chips ~32px and
  inline text links are the documented exceptions; admin is a desktop
  density tool).
- **Photos:** full-colour `image_url` via the `WA.img(url,w)` helper;
  text over a photo always gets a **scrim** gradient, never a raw
  text-shadow. Liquid-Glass chrome only via the `--glass-*` tokens.
- **Voice:** strictly left-aligned, editorial; the curator quote is the
  largest element. No marketing voice, no em-dashes in headlines, no
  "discover".

## Quality bar / verification

- After any layout/CSS/markup change run **`npm run verify`** (overflow +
  console-error + 44px tap-target sweep across every public page × 390/
  768/1440). For photo fidelity, eyeball the Cloudflare branch preview
  (`npm run preview`).

## How this pairs with the installed plugins

- `design@knowledge-work-plugins` (`/design-critique`, `/design-system`,
  `/design-handoff`, `/accessibility-review`, `/user-research`,
  `/research-synthesis`) and `frontend-design@claude-plugins-official`
  give generic design/frontend procedures — apply them **through these
  WanderAlt rules** so the result is on-brand, accessible (WCAG 2.1 AA),
  and token-compliant.
- `ui-ux-pro-max@ui-ux-pro-max-skill` adds broader UI-style intelligence;
  filter its suggestions through the non-negotiables above.
