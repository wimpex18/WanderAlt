# Design System Audit — WanderAlt (17 Jul 2026)

**Method.** Static analysis of `styles.css` (token inventory/usage, hardcoded
values by category, motion-law compliance, type-scale census, naming roots) on
top of the two rendered audits that preceded it (control census + ghost
visibility scan, `npm run visibility`; WCAG sweep, `npm run a11y`). Two systems
coexist **by design** — Dusk Glass (default) and the June Plate & Rule paper
system (about/admin/print) — so per-system vocabulary differences are not
drift and were not "fixed".

## Summary
**Tokens defined:** ~92 · **Rules audited:** all of styles.css (~9k lines) ·
**Issues found:** 7 classes · **Score: 82/100** — a strong, genuinely
token-driven system; the gap to 100 is type-scale drift and photo-scrim
literals, both catalogued below.

## Naming consistency — PASS
Component prefixes are disciplined BEM-ish roots (`.discover-*` 273,
`.nav-*` 134, `.map-*` 129, `.tonight-*` 126, `.list-*` 122, `.scene-*` 95 …)
with `__element` / `--modifier` used consistently. No orphan naming schemes.

## Token coverage
| Category | State | Action taken |
|----------|-------|--------------|
| Colors | 136 hardcoded values, 79 distinct — but the bulk is sanctioned: `#fff`-on-scrim (photo text law), black photo-scrims, print styles, runtime pin tokens (`--pin-bg` etc. are injected per-pin by map JS with CSS fallbacks) | Migrated: attribution cream literal → `--c-cream`; two dead June tokens deleted (`--c-paper-sink`, `--c-accent-line`, 0 usages) |
| Motion | **4 rogue transitions** (140/220/120 ms hand eases on map chips/pins) against the two-token law; **duplicate `@keyframes wa-pulse`** — two different bodies (breathing pulse vs expanding ripple), the later silently overrode the earlier for every consumer, so the live dot played the wrong animation | All 4 → `--t-fast`/`--t-mid`; ripple renamed `wa-ripple`, consumers pointed by intent (ring→ripple, dots/locate→pulse) |
| Spacing | 80 off-grid px in margin/padding/gap — dominated by 3/5/6/7/10/14px optical fits (chip paddings and 1–2px fits are exempt per contract; 14px = half-`--radius` composites) | No bulk change — flagged as acceptable optical tier; recommend the exemption be written wider than "1–2px" since practice uses 3–7px |
| Radius | 55 off-vocabulary — mostly sanctioned June-system 4px tags on paper pages and 999px pills that Dusk Glass *reintroduced* (dock, toggle pills) despite the "pill retired" June note | Contract contradiction to resolve at owner level: either the pill is back (Dusk dock) or it isn't. Control-tier radii were normalized in the census pass (9/10/11 → 8) |
| Type | **53 distinct font-size values** — the largest drift. `--fs-*` tokens exist but cover ~60 usages; 200+ literals including fractional near-duplicates (10/10.5/11/11.5, 13/13.5/14) | Reported, not mass-edited: consolidating needs an owner-approved scale map; a blind merge would churn every page. Priority action #1 below |
| Unused tokens | `--scrim-desktop` (authored dusk+day pair, 0 consumers — likely staged for desktop scenes) · `--s-10` (completes the documented scale) | Kept both, documented |

## Component completeness (from the rendered censuses)
| Component | States | Sizing | Consistency | Score |
|-----------|--------|--------|-------------|-------|
| `.nav__item` dock | active/hover/focus ✅ | 48/r14 ✅ | one impl ✅ | 9/10 |
| Chips (`.m-chip`/`.sheet-chip`/`.taste-chip`) | ✓-led active ✅ | 48 & 38 tiers | radius unified this pass | 8/10 |
| Fields (`.search-box`/`.digest-field`/`.field`) | focus ring added (a11y pass) ✅ | 48 shell / 44 key box / 38 visual plate ✅ | one composite pattern ✅ | 9/10 |
| Buttons (`.scene-cta`/`.action-btn`/icon tier) | ✅ | 48 CTA / 44 icon tier (sanctioned) | **venue↔place socials fork unified this pass** — website now rides the shared `socialButtons` icon row on both detail pages | 8/10 |
| Scrims/scenes | dusk+day authored ✅ | — | photo-scrim literals vs `--scrim-*` tokens split | 7/10 |

## Priority actions — ALL RESOLVED (owner-approved, 17 Jul)
1. **Type-scale consolidation ✅** — approved mapping applied: every fractional
   size rounded to its integer neighbor (10.5→11, 11.5→12, 12.5→13, 13.5→14,
   14.5→15, 15.5→16, 16.5→17; 32 sites). Distinct font sizes 53 → 46; the
   half-pixel merges are visually invisible (hero/tickers eyeball-verified,
   one-line law intact) but kill the near-duplicate tier ambiguity. The
   remaining integer tail carries real hierarchy and stays.
2. **Pill ruling ✅** — written into CLAUDE.md Dusk law #7: fully-rounded 999px
   is sanctioned for exactly (a) floating glass chrome capsules (dock island,
   floating toggles, switch tracks) and (b) ≤24px badges/dots/counts.
   Tags = `--radius-tag` 8, chips = `--radius` 14, button controls never
   capsule. Five straggler sites normalized (`.list-row__tag`, `.venue-mood`,
   `.discover-ai-example`, `.discover-pill` base, the accent chip spec).
3. **Photo scrim ✅** — new `--scrim-photo` token (owner-approved addition):
   THEME-INVARIANT dark ramp — photos need dark scrims in both themes, so it
   deliberately does not swap with `--scrim-rgb` (scene scrims). The authored
   F-1 stop math moved to the token definition; render pixel-identical.

## Unknown-knowns probes (third pass, 18 Jul)
- **Reduced motion: PASS** — empirical `document.getAnimations()` check under
  `reducedMotion: reduce`, all pages × both skins: zero running animations,
  including WAAPI/JS-driven ones the CSS gate can't reach. The universal
  `* { animation/transition: none !important }` gate holds.
- **WCAG 1.4.10 reflow @320px: PASS** — no horizontal overflow on any page,
  either skin (closes the register item from the first audit).
- **Adjacent-target spacing @390:** one real fix — the 13px-tall "ON MAP →"
  link sat at 0px from the 44px bookmark toggle (grew its hit area
  vertically; horizontal padding would have overlapped the toggle's box).
  Advisory register (sanctioned patterns, owner call if ever revisited):
  dock tabs 2px apart (48px targets — WCAG-fine, below the 8px NN/g
  "should"), composite-field key at 0px (by design), stacked list rows,
  taste-chip grid at 3px.
- **Day-theme pixel coverage:** the Daybreak twin had ZERO visual-regression
  shots while dusk had 24. Suite now runs both skins — 48 baselines
  (dusk names unchanged; day gets `-day`), stable ×4 consecutive after an
  image-settle wait fixed thumbnail pop-in flake (48→47→44 before; 48×4 after).
- **Playwright currency:** 1.61.1 verified as the latest published against
  the registry at probe time — no update available.

## Fixed in this pass
Duplicate keyframes (live-dot animation bug) · 4 motion-law violations ·
venue/place socials pattern fork (critique #9, the last must/should-fix
carrying a user-visible inconsistency) · dead tokens removed · attribution
cream literal → token.
