# WanderAlt — Brand Identity

**Direction shipped:** `01 · Beacon` — petrol tile + signal-lime diamond.
**Version:** v2 · May 2026
**Built on:** the live Compass design system (palette + type tokens are 1:1 with `src/refresh-shared.jsx`).

---

## 1 · The mark

A rounded petrol-green square tile with a small lime square rotated 45° centered inside it.

It is the **only** mark. Every asset in this folder — favicon, app icon, social avatar, OG card — is a derivative of this one primitive. There is no secondary mark, no submark, no logo "system." One tile.

The metaphor: **the beacon.** A single lit window in a dark block. The signal that says "something is happening here." That's the product in three pixels.

### Geometry (canonical)

| Property | Value |
|---|---|
| Tile shape | Rounded square, `rx = 0.18 × side` (iOS squircle ratio) |
| Tile fill | Petrol |
| Diamond | Square rotated 45°, side = `0.20 × tile side` |
| Diamond fill | Lime |
| Diamond corner radius | `0.12 × diamond side` (matches typeset square punctuation) |
| Diamond position | Geometric centre of the tile |

Tile-bleed variants (iOS, Android, Play Store) drop the rounding — the OS applies its own mask. Hand-tuned favicons at 16 px drop the rotation too — pixels are scarce; we use a flat 4×4 block in the centre instead.

---

## 2 · Colour

| Token | Canonical (OKLCH) | sRGB | Usage |
|---|---|---|---|
| `--petrol` | `oklch(0.42 0.07 195)` | `#055959` | Tile ground · primary brand chrome |
| `--lime` | `oklch(0.86 0.16 113)` | `#d2dc50` | Diamond · signal · live-state highlight |
| `--ink` | — | `#0a0a0c` | Body text · dark-mode tile ground |
| `--paper` | — | `#ffffff` | App background |
| `--surface` | — | `#fafaf9` | Secondary surfaces, cards |
| `--hairline` | — | `#e7e5e4` | 1 px rules and borders |
| `--muted` | — | `#71717a` | Secondary text, mono labels |
| `--body` | — | `#1f1f23` | Body copy on paper |

**OKLCH is the source of truth.** When the rendering environment supports it (modern browsers, Sharp 0.32+, resvg, Figma), use the OKLCH literal. The sRGB hex is provided so older rasterizers (older librsvg, ImageMagick legacy builds) produce visually identical output.

All asset SVGs in this folder embed the hex values for portability and document the OKLCH source-of-truth in a top-of-file comment.

---

## 3 · Type

| Family | Weight | Where |
|---|---|---|
| **Geist** | 600 | Wordmark · navigation · titles |
| Geist | 400 / 500 | Body copy, buttons |
| **Geist Mono** | 400 / 500 | Metadata, eyebrows, location chips, tag labels |
| **DM Serif Display** | 400 Italic | Editorial pull-quotes · the "Alt." in the editorial wordmark · OG card hero |

Already loaded by the app via Google Fonts. No new families.

### Wordmark — two variants

**Primary** (`masters/wordmark.svg`): `WanderAlt` set in Geist 600, sitting beside the tile.
- Used everywhere on product surfaces: navigation, splash, system emails, app stores.
- Letter-spacing `-3.5` at 108 px display; scale proportionally.
- Tile : cap-height ratio is **1.4** (a 140 px tile pairs with ~100 px cap-height). Gap between tile and text = one diamond-width (~17% of tile side).

**Editorial** (`masters/wordmark-editorial.svg`): `Wander` (Geist 600, ink) + `Alt.` (DM Serif Display italic, petrol).
- Used for marketing surfaces, hero takeovers, the curator-quote moment, OG cards.
- The italic "Alt." matches the curator pull-quote style already in the live app, so the brand voice and the editorial voice rhyme.
- Never use the editorial variant inside the product chrome. It belongs in long-form moments only.

### Sizing floor

- Wordmark **must not** appear in any circular crop smaller than 256 px — Geist 600 stops being legible below that.
- Below 256 px, the standalone tile always wins.

---

## 4 · Do / don't

**Do**
- Keep the diamond centered.
- Use full-bleed petrol on app icons (no padding, no inner rounded frame) — the OS applies the squircle.
- Use the editorial wordmark in marketing; the primary wordmark in product.
- Treat lime as a signal colour — it's allowed to highlight live state (`Tonight`), saved state, and call-to-action emphasis. Not decoration.

**Don't**
- Rotate, stretch, recolour, or replace the diamond.
- Add a stroke or border to the tile.
- Place the tile on a coloured ground that isn't paper, surface, ink, or another brand surface.
- Use the editorial wordmark in nav.
- Use the wordmark below 256 px in a circular crop.
- Introduce a third colour. The system is two-tone for a reason.

---

## 5 · City plates

A small set of editorial city illustrations lives in `/assets/`, not `/brand/`, but it follows the brand system and deserves to be documented here.

| File | City | Status |
|---|---|---|
| `assets/tallinn-overview.svg` | Tallinn (EE) | Live |
| `assets/helsinki-overview.svg` | Helsinki (FI) | Plate ready · curators in flight |
| `assets/riga-overview.svg` | Riga (LV) | Plate ready · curators in flight |

Each plate is a 1800 × 1200 SVG (`xMidYMid slice`, hex fills, no embedded fonts) drawn as a tourism-poster illustration of 3–5 hero landmarks on a warm cream land + muted petrol sea + soft green park ground. They are used as 80 × 60 thumbnails in the city-selector dropdown, but the silhouettes are designed to survive down to 48 px and scale up cleanly to OG-card sizes.

### The two-mark rule

Every plate carries **exactly one national flag** and **exactly one lime accent**, and they are never the same element:

| City | National flag (cultural signal) | Lime accent (brand signal) |
|---|---|---|
| Tallinn | Estonian tricolor on Pikk Hermann | Telliskivi door awning |
| Helsinki | Finnish cross on Senate Square mast (off-church) | Helsinki Cathedral cross-gleam |
| Riga | Latvian carmine on Daugava embankment | Doms weathercock |

This is the only place national flags appear in the WanderAlt visual system. They earn their place in the plates because the plates are the one moment in the product where we are *picking a country*; everywhere else, the two-tone brand carries the signal alone. Do not introduce flags to any other surface (nav, app icons, share cards, mobile chrome).

### Plate palette (extends the brand palette)

| Token | Hex | Use |
|---|---|---|
| land | `#f6f3ec` | Cream ground |
| sea | `#d9e2e3` | Muted petrol water |
| park | `#c5dec2` | Soft green park polys |
| ink | `#0a0a0c` | Outline (2 / 1.2 px) |
| petrol | `#055959` | Signature mass per plate (one large) |
| lime | `#d2dc50` | Brand signal (one small) |

Roof / wall harmonics — cream `#efe1c4`, mustard `#e5b966`, pink `#ecc4bd`, rose `#d6a098`, mint `#c8e2cb`, sky `#aac9d4`, stone `#d8c8a4`, concrete `#b5b9be`, brick `#b54a32`, rust `#a4452a`, gold `#c89548`, dark `#3a2e22`. These are the OKLCH building tones from `src/illustrated-map.jsx`, embedded as hex for portability.

### National flag specs (canonical)

| Flag | Stripes / construction | Colours |
|---|---|---|
| Estonia | 3 equal horizontal: blue, black, white | `#0072CE` · `#0a0a0c` · `#ffffff` |
| Finland | White field with off-centre blue Nordic cross (5:3:10 horizontal, 4:3:4 vertical) | `#003580` cross on `#ffffff` |
| Latvia | 3 horizontal 2:1:2: carmine, white, carmine | `#9e3039` · `#ffffff` · `#9e3039` |

All flags are drawn at ~130 px wide in the 1800 × 1200 plate viewBox, with a slight hand-drawn uplift at the fly end. At 80 × 60 thumbnail size each flag renders as a ~6 × 3 px coloured chip — small enough to feel natural, dominant enough that the country reads at a glance.

---

## 6 · Why this mark

A short note for anyone who inherits this file later:

WanderAlt is a city guide for alternative culture — vinyl, indie shows, second-hand pages, late-night rooms. The brief asked for an identity that read as **editorial-not-corporate**, **distinct from AI / travel-app conventions**, and **continuous with the live app** so we wouldn't have to redesign anything to ship it.

We considered (and discarded) three other directions: an asterisk-based editorial mark (collided visually with Claude and Perplexity), a riso-printed paste-up identity (loud but didn't survive the favicon-ladder test), and an after-hours marquee identity (beautiful in dark mode, brittle as a daily app icon).

Beacon won because it (a) already exists in the live product, so the brand documents what we have rather than asking for a redesign; (b) survives the full asset matrix from 16 px to 1200 × 630 without losing its silhouette; (c) reads as a signal — which is exactly what the product is.

— `/brand/`, May 2026
