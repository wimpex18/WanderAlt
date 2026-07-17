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

## Priority actions
1. **Type-scale consolidation (owner decision needed):** approve a mapping for
   the fractional sizes (10.5→11? 13.5→14 or 13?) and the long tail; then a
   single mechanical pass + visual re-baseline. Biggest consistency win left.
2. **Resolve the pill contradiction:** June retired 999px; Dusk reintroduced it
   for the dock/toggles. Whichever wins should be written into CLAUDE.md's
   radius vocabulary so future sessions stop treating one of them as drift.
3. **Photo-scrim literals → `--scrim-*`:** the black rgba photo scrims predate
   the token set; migrating them makes day-theme scrims theme-aware. Needs
   eyeball checks per surface (photos want dark scrims in both themes — decide
   intent first).

## Fixed in this pass
Duplicate keyframes (live-dot animation bug) · 4 motion-law violations ·
venue/place socials pattern fork (critique #9, the last must/should-fix
carrying a user-visible inconsistency) · dead tokens removed · attribution
cream literal → token.
