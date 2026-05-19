# WanderAlt Brand — Asset manifest

Every file in `/brand/`, what it is, what it's for.

All SVG sources are portable: hex-based fills, no external fonts referenced except where text is present (see `IMPLEMENTATION.md` § "Rendering text safely").

---

## Masters · `brand/masters/`

| File | Size (viewBox) | Purpose |
|---|---|---|
| `tile.svg` | 1024 × 1024 | The canonical mark. Petrol rounded square + lime diamond. Use as the source for the React `<Tile />` component. |
| `tile-bleed.svg` | 1024 × 1024 | Full-bleed petrol (no rounded corners). Use as the rasterization source for any icon where the OS applies its own mask (iOS, Android adaptive, PWA maskable). |
| `tile-campaign.svg` | 1024 × 1024 | Inverse — lime ground, petrol diamond. Campaign / launch variant only. |
| `tile-dark.svg` | 1024 × 1024 | Ink ground, slightly larger lime diamond. For dark-mode chrome and dark-variant app icons. |
| `tile-mono.svg` | 1024 × 1024 | Single-color silhouette (alpha). Tile shape with the diamond cut out. Use for Safari pinned tab and any monochrome / themed-icon slot. |
| `wordmark.svg` | 760 × 200 | Primary lockup. Tile + `WanderAlt` set in Geist 600. The everywhere wordmark. |
| `wordmark-editorial.svg` | 660 × 200 | Editorial lockup. `Wander` (Geist 600, ink) + `Alt.` (DM Serif Display Italic, petrol). For marketing surfaces, OG cards, hero takeovers. |

---

## Favicon · `brand/favicon/`

| File | Size | Purpose |
|---|---|---|
| `favicon.svg` | 32 × 32 (viewBox) | Modern browser favicon. Includes inline `prefers-color-scheme: dark` rule — tile swaps from petrol to ink in dark browsers. |
| `favicon-16.svg` | 16 × 16 | Hand-tuned for 16 px. Diamond is a flat 4×4 block (no rotation — preserves weight at this scale). Source for the 16 px slot of the ICO. |
| `favicon-32.svg` | 32 × 32 | Hand-tuned 32 px. Rotation reappears. Source for the 32 px slot of the ICO. |
| `favicon-48.svg` | 48 × 48 | Hand-tuned 48 px. Source for the 48 px slot of the ICO. |
| `apple-touch-icon.svg` | 180 × 180 | Solid petrol bleed (no rounding — iOS applies its own squircle). Rasterize to `/apple-touch-icon.png`. |
| `safari-pinned-tab.svg` | 1024 × 1024 (32 display) | Single-color mono silhouette. Safari applies the user's accent colour. |

---

## PWA · `brand/pwa/`

Manifest icon set. Each maps to a specific `purpose` in `manifest.webmanifest`.

| File | Size | Manifest purpose |
|---|---|---|
| `icon-192.svg` | 192 × 192 | `"any"` |
| `icon-512.svg` | 512 × 512 | `"any"` (splash source) |
| `icon-maskable.svg` | 512 × 512 | `"maskable"` — diamond stays inside the 80% safe zone (r = 205) |
| `icon-mono.svg` | 512 × 512 | `"monochrome"` — alpha-only, OS recolours |

---

## iOS · `brand/ios/`

Three 1024 × 1024 masters for `AppIcon.appiconset`. Xcode 15+ derives all smaller sizes automatically.

| File | Catalogue slot |
|---|---|
| `AppIcon-1024.svg` | `ios-marketing` (default) |
| `AppIcon-1024-dark.svg` | `ios · dark` (iOS 18+) |
| `AppIcon-1024-tinted.svg` | `ios · tinted` (iOS 18+) — greyscale alpha, system applies tint |

---

## Android · `brand/android/`

Adaptive icon layers (Android 8+) and Play Store listing.

| File | Slot |
|---|---|
| `ic_launcher_foreground.svg` | Adaptive `foreground` — diamond only, inside the 66 dp safe zone |
| `ic_launcher_background.svg` | Adaptive `background` — solid petrol |
| `ic_launcher_monochrome.svg` | Adaptive `monochrome` (Android 13+ themed icons) |
| `play-store-512.svg` | Play Store listing icon (512 × 512) |

For pre-Android 8 fallback mipmaps, rasterize `play-store-512.svg` to PNG at 48 / 72 / 96 / 144 / 192 px and drop into `res/mipmap-{m,h,xh,xxh,xxxh}dpi/`.

---

## Social · `brand/social/`

| File | Size | Purpose |
|---|---|---|
| `avatar-1080.svg` | 1080 × 1080 | Square avatar source. All platforms downsample + circle-mask this. |
| `avatar-1080-campaign.svg` | 1080 × 1080 | Inverse colours. For city-launch posts and campaigns. |
| `avatar-1080-dark.svg` | 1080 × 1080 | Ink ground for dark-mode profile contexts. |
| `og-default.svg` | 1200 × 630 | Default Open Graph share card. |
| `twitter-default.svg` | 1200 × 675 | Default X / Twitter share card (`summary_large_image`). |

---

## City plates · `/assets/` (outside `/brand/`)

Editorial city illustrations used as previews in the city-selector dropdown and as the source for any future per-city OG card, marketing hero, or splash. They live in `/assets/` rather than `/brand/` because they are product imagery, not identity assets — but they follow the brand system. See `BRAND.md` § 5 for the two-mark rule (one national flag + one lime accent per plate).

| File | viewBox | Country | Status |
|---|---|---|---|
| `assets/tallinn-overview.svg` | 1800 × 1200 | EE | Live (default city) |
| `assets/helsinki-overview.svg` | 1800 × 1200 | FI | Plate ready · "Coming soon" badge in selector |
| `assets/riga-overview.svg` | 1800 × 1200 | LV | Plate ready · "Coming soon" badge in selector |

All three are path-based SVGs with `xmlns="http://www.w3.org/2000/svg"`, `preserveAspectRatio="xMidYMid slice"`, flat hex fills, no embedded raster, no external font references. Each weighs ≤ 22 KB. The silhouettes are designed to survive at 64 px thumbnail width and scale cleanly to OG-card resolutions.

The catalogue is intentionally short. When new cities ship, add an `assets/<city>-overview.svg` following the same rules (3–5 hero landmarks, one national flag, one lime accent, no text labels, no streets, no neighborhood polygons).

---

## At a glance — total files

- **7** masters
- **6** favicon assets
- **4** PWA icons
- **3** iOS masters
- **4** Android assets
- **5** social cards / avatars
- **3** city plates (`/assets/`)
- **3** Markdown docs (`BRAND.md`, `IMPLEMENTATION.md`, `ASSETS.md`)

= **35 files**, of which **32** are in `/brand/` and **3** are in `/assets/`.

— `/brand/`, May 2026
