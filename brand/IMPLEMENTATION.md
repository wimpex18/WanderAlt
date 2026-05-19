# WanderAlt Brand — Implementation guide for Claude Code

This folder ships **vector sources** for every brand asset listed in `Brand Identity.html`. The rasterization, file naming, and integration into the codebase are up to you — you know the build tooling. This doc tells you *what* each file is for and *where* it ends up in a typical Next.js / Vite / Expo stack, but it intentionally leaves the *how* open.

---

## TL;DR

1. Read `BRAND.md` first — the canonical palette, type, and geometry.
2. The two files you will reach for most often are:
   - `masters/tile.svg` — the mark, scale-free
   - `masters/wordmark.svg` — the mark + "WanderAlt" lockup
3. Everything else is a derivative SVG at a specific viewBox, ready to be rasterized to PNG by your image pipeline (Sharp / Vite asset pipeline / Expo asset bundler / `npm run build:icons`).
4. Update three things in the codebase:
   - The header lockup component (replace the inline placeholder with `tile.svg` + Geist 600 wordmark).
   - The public `/` asset folder (favicons, apple-touch-icon, OG image).
   - The web manifest (`manifest.webmanifest`) — add the four PWA icon entries.

---

## Folder map

```
brand/
├── BRAND.md                ← canonical palette, type, lockup rules. Start here.
├── IMPLEMENTATION.md       ← this file
├── ASSETS.md               ← every file in this folder, one line each
│
├── masters/                ← scale-free vector sources. Use these as React components.
│   ├── tile.svg
│   ├── tile-bleed.svg              (full-bleed, for OS-masked icons)
│   ├── tile-campaign.svg           (lime ground + petrol diamond — campaign variant)
│   ├── tile-dark.svg               (ink ground — for dark-mode chrome)
│   ├── tile-mono.svg               (single-color alpha silhouette)
│   ├── wordmark.svg                (primary lockup — Geist 600)
│   └── wordmark-editorial.svg      (editorial lockup — italic Alt.)
│
├── favicon/                ← drop into /public on the web app
│   ├── favicon.svg                 (modern, with prefers-color-scheme)
│   ├── favicon-16.svg              (hand-tuned 16 px, drop into the ICO)
│   ├── favicon-32.svg              (hand-tuned 32 px, drop into the ICO)
│   ├── favicon-48.svg              (hand-tuned 48 px, drop into the ICO)
│   ├── apple-touch-icon.svg        (180×180, petrol bleed)
│   └── safari-pinned-tab.svg       (mono, single-color)
│
├── pwa/                    ← web manifest icons
│   ├── icon-192.svg                (purpose: "any")
│   ├── icon-512.svg                (purpose: "any" — splash source)
│   ├── icon-maskable.svg           (purpose: "maskable")
│   └── icon-mono.svg               (purpose: "monochrome")
│
├── ios/                    ← Expo / Xcode AppIcon.appiconset
│   ├── AppIcon-1024.svg            (master — Xcode 15+ generates the rest)
│   ├── AppIcon-1024-dark.svg       (iOS 18+ dark variant)
│   └── AppIcon-1024-tinted.svg     (iOS 18+ tinted — greyscale alpha)
│
├── android/                ← adaptive icon layers
│   ├── ic_launcher_foreground.svg  (108 dp / 432 px — diamond inside safe zone)
│   ├── ic_launcher_background.svg  (108 dp / 432 px — solid petrol)
│   ├── ic_launcher_monochrome.svg  (Android 13+ themed icon)
│   └── play-store-512.svg          (Play Store listing 512×512)
│
└── social/                 ← share + profile imagery
    ├── avatar-1080.svg             (Instagram / Facebook / X source)
    ├── avatar-1080-campaign.svg    (inverse colors — for launches)
    ├── avatar-1080-dark.svg        (dark-mode profile contexts)
    ├── og-default.svg              (1200×630 Open Graph card)
    └── twitter-default.svg         (1200×675 Twitter / X card)
```

---

## What to do with the masters

`masters/tile.svg` and `masters/wordmark.svg` are intended to be **React components**, not static files.

Convert each master to a component that:

- Accepts the standard SVG props (`width`, `height`, `aria-label`, `className`).
- Hardcodes the petrol + lime hexes (or, better, reads them from your existing token export — `refresh-shared.jsx` exports them as part of `COMPASS`).
- Renders inline so the DOM can recolour the tile via `currentColor` if you ever want to.

Suggested API (you decide the exact signature):

```jsx
<Tile size={28} variant="primary" />     // petrol + lime — header default
<Tile size={28} variant="campaign" />    // lime + petrol — marketing
<Tile size={28} variant="dark" />        // ink + lime — dark surfaces
<Wordmark size={28} />                   // tile + "WanderAlt" lockup
<Wordmark size={28} editorial />         // italic Alt. variant
```

Where the live app currently renders the placeholder (`refresh-compass.jsx` line ~73–85: the `<div>` with `26×26 borderRadius:6 background: C.primary` and the nested rotated lime square), replace it with `<Tile size={28} />` or `<Wordmark size={28} />`. The hardcoded inline JSX placeholder is the only thing that needs to change in the live chrome.

---

## What to do with the favicons

Drop into `/public` (or wherever your static assets live):

| Source file | Final filename | Format | Notes |
|---|---|---|---|
| `favicon/favicon.svg` | `/favicon.svg` | SVG | Primary. Already includes the dark-mode media query. |
| `favicon/favicon-16.svg`<br/>`favicon-32.svg`<br/>`favicon-48.svg` | `/favicon.ico` | multi-size ICO | Combine into one ICO. Use the hand-tuned SVGs as the rasterization sources — do **not** auto-export from `tile.svg` at small sizes; the hand-tuning matters at 16 px. |
| `favicon/apple-touch-icon.svg` | `/apple-touch-icon.png` | PNG 180×180 | No alpha. |
| `favicon/safari-pinned-tab.svg` | `/safari-pinned-tab.svg` | SVG | Mono. Safari applies user accent. |

In `<head>`:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="mask-icon" href="/safari-pinned-tab.svg" color="#055959" />
<meta name="theme-color" content="#055959" />
```

(Pick the actual `<head>` integration that fits your meta system — Next.js `metadata` export, Vite plugin, etc.)

---

## PWA manifest

The four `pwa/` files map directly to four `manifest.webmanifest` entries. Rasterize each to PNG at its native size and reference them:

```json
{
  "name": "WanderAlt",
  "short_name": "WanderAlt",
  "theme_color": "#055959",
  "background_color": "#ffffff",
  "icons": [
    { "src": "/icons/icon-192.png",      "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png",      "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-mono.png",     "sizes": "512x512", "type": "image/png", "purpose": "monochrome" }
  ]
}
```

The keys we care about are `purpose: "any" | "maskable" | "monochrome"` — Android and Chromium use these to pick the right icon for the right context. Don't omit `maskable` — without it, the Android home-screen icon gets a generic white background plate behind the petrol tile, which looks like a bug.

---

## iOS (when the native app ships)

The three `ios/AppIcon-1024*.svg` files are masters for the iOS app icon set.

- Rasterize each to 1024 × 1024 PNG.
- Drop into `AppIcon.appiconset/` with the slot names Xcode expects:
  - `Icon-1024.png` → `ios-marketing`
  - `Icon-1024-dark.png` → `ios · dark`
  - `Icon-1024-tinted.png` → `ios · tinted`
- Xcode 15+ derives all smaller sizes (180, 167, 152, 120, 80, 76, 58, 40, 29, 20 — at @1×/@2×/@3× as required) automatically.
- Verify the 80 px Spotlight slot by hand. If the diamond crushes, hand-tune that slot.

If using Expo, `expo-build-properties` and `expo prebuild` will generate the `.appiconset` from a single source — point it at `AppIcon-1024.png` and let it do the rest.

---

## Android (when the native app ships)

The three `android/ic_launcher_*.svg` files map to a standard adaptive icon definition:

`res/mipmap-anydpi-v26/ic_launcher.xml`:

```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@drawable/ic_launcher_background" />
  <foreground android:drawable="@drawable/ic_launcher_foreground" />
  <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
```

Convert each SVG to either a vector drawable (best — `@drawable/`) or a 432 × 432 PNG (acceptable, but loses scalability).

For pre-Android 8 devices, generate the legacy mipmap fallbacks (`mipmap-mdpi/` through `mipmap-xxxhdpi/`) by rasterizing `play-store-512.svg` at 48, 72, 96, 144, 192 px.

---

## Social

`social/og-default.svg` and `social/twitter-default.svg` are share-card templates. Rasterize to PNG and reference:

```html
<meta property="og:image" content="https://wanderalt.app/og/og-default.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://wanderalt.app/og/twitter-default.png" />
```

If you want per-page OG cards later (city-specific, event-specific), use the SVG template as a starting point — replace the wordmark + tagline, keep the tile in the corner, keep the type system.

The avatar SVGs (`avatar-1080.svg` and variants) are 1080 × 1080 squares. Every social platform (Instagram, X, Facebook, LinkedIn, YouTube) renders these as circles. The diamond is centered — it survives every crop.

---

## Rendering text safely

`masters/wordmark.svg`, `social/og-default.svg`, and `social/twitter-default.svg` reference the **Geist** and **DM Serif Display** font families by name in `<text>` nodes. This works in the browser (the app already loads these via Google Fonts) but **will fail in headless rasterizers** that don't have the fonts installed.

Two ways to handle it:

1. **At build time, outline the text to paths.** Run the SVGs through `svgo --enable=convertText` (custom plugin) or `inkscape --export-text-to-path` before rasterizing. This is the right answer for shipped assets — the resulting PNG / SVG is identical visually but has zero font dependencies. We recommend this for all production-bound assets in `social/` and `wordmark.svg`.

2. **In your image pipeline, install the fonts.** If you're rendering OG images on the server with Sharp + a font registry (e.g. `satori`, `@vercel/og`), register Geist and DM Serif Display before render. This is the right answer if you're generating per-page OG cards dynamically.

The diamond and tile SVGs have no text and don't need either of these steps.

---

## Live app — the only chrome change needed

In `src/refresh-compass.jsx`, the existing inline header lockup is currently this (paraphrased):

```jsx
<div style={{ width: 28, height: 28, borderRadius: 6, background: C.primary, … }}>
  <div style={{ width: 9, height: 9, borderRadius: 2, background: C.secondary, transform: 'rotate(45deg)' }} />
</div>
<div style={{ fontFamily: C.sans, fontSize: 18, fontWeight: 600, … }}>WanderAlt</div>
```

This is already Beacon, drawn inline. The brand work doesn't change the live rendering — it just gives the team a single component (`<Wordmark />`) to use everywhere, a spec sheet for proportions, and the full asset matrix for everything outside the React tree.

**Suggested PR shape:**

1. Convert the two inline lockups (mobile + desktop in `refresh-compass.jsx`, plus any equivalents elsewhere) into a single `<Wordmark size={28} />` component.
2. Add `/public/favicon.svg`, `/public/favicon.ico`, `/public/apple-touch-icon.png`.
3. Add `/public/icons/*` and the four `manifest.webmanifest` icon entries.
4. Add `/public/og/og-default.png` and the `og:image` / `twitter:image` meta tags.
5. Leave the iOS and Android assets in `/brand/` for when the native apps ship; nothing to wire up on web today.

Everything else can wait.

---

## Open questions for the design pass

These weren't decided at brand-spec time and might surface during implementation. None are blockers — flag them in code review and we'll resolve.

- **Header lockup spacing on mobile**: the spec puts the gap at one diamond-width (~17% of tile side). At 26 px tile on a 402 px iOS frame, that's ~4 px. Verify it doesn't read as touching at @1× — we may want to relax to 6 px for breathing room.
- **OG card per-city variants**: do we want a separate OG for each city, or one shared default? The template supports either.
- **Loading splash**: tile only at 96 px on a paper ground, or wordmark? Recommend tile only.
- **Geist font licensing**: confirm the production app is permitted to ship Geist via Google Fonts (it is — Geist is OFL'd by Vercel). No issue, just worth confirming on the legal pass.

— `/brand/`, May 2026
