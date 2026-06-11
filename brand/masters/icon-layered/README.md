# Beacon — layered icon master (June 2026)

One source for both native icon pipelines, derived from the flat Beacon
masters (`brand/masters/tile.svg`, spec in `brand/BRAND.md`):

- `background.svg` — full-bleed petrol tile (`#055959`). The platform
  applies its own mask: iOS squircle, Android adaptive shape (circle,
  squircle, rounded square — OEM-dependent).
- `foreground.svg` — the lime diamond (`#d2dc50`) on a transparent
  1024 canvas, spec proportions (side = 0.20 × tile, rx = 0.12 × side),
  centered well inside Android's 66/108 safe zone.

Targets:
- **Apple (Icon Composer / layered "Liquid Glass" icons, iOS 26+; iOS 27
  sharpened layered-icon rendering at WWDC 2026):** import the two SVGs
  as separate layers — background flat, diamond as the specular layer.
- **Android adaptive icons:** `background.svg` → `ic_launcher_background`,
  `foreground.svg` → `ic_launcher_foreground`.

Rules (same as the flat mark): never restyle the layers independently,
never add a third color, never put lime on paper as a foreground — lime
exists only against petrol/ink. The web favicon/PWA ladder stays on the
flat masters; this directory exists solely for future native shells.
