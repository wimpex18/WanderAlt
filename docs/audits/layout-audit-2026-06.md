# Layout & alignment audit — design-system compliance (June 2026)

A grid/alignment/spacing review of WanderAlt against the current official
design systems, plus the fixes applied. Companion to the width-ladder work
(PR #29) and the button-sizing fixes (this PR).

## Sources (official docs + research, June 2026)

- **Apple Human Interface Guidelines** — Layout & inputs. Minimum tap
  target **44×44pt**; iOS 26 "Liquid Glass" update is the largest design
  refresh since iOS 7. https://developer.apple.com/design/human-interface-guidelines/
- **Material Design 3** — Spacing & layout. **4dp base / 8dp rhythm**:
  components size in 8dp increments, icons/typography may use the 4dp grid;
  layout gutters 8dp (or 32dp for stronger separation); touch targets
  **48×48dp** with ≥8dp between them. Chips are **32dp** tall.
  https://m3.material.io/foundations/layout/understanding-layout/spacing ·
  https://m3.material.io/styles/spacing/overview
- **Microsoft Fluent 2** — Layout & button. **4px base** spacing ramp used
  across every component; one prominent **primary** button per layout,
  secondary placed beside it (top or left in LTR); >2 equal-priority
  buttons → all neutral. https://fluent2.microsoft.design/layout ·
  https://fluent2.microsoft.design/components/web/react/core/button/usage
- **Button pair / form-action research** — Desktop: size action buttons to
  **content**, **left-align**, primary first, 8–16px gap (full-width is a
  *mobile* pattern). Mobile: primary CTA full-width, stack vertically.
  Left-aligning the action group with the form raises completion
  (Wroblewski). https://medium.theoremone.co/button-ambiguity-alignment-order-a42736e25334 ·
  https://subux.pro/guides/article/button-hierarchy-primary-secondary-tertiary

## What WanderAlt already does right

- **Spacing scale is grid-compliant.** `--s-*` = 4/8/12/16/20/24/32/40/56/72
  — a 4px base with 8px rhythm, matching all three systems.
- **Content width** uses one shared `--reading-max` token across every page
  (1100 → 1200 → 1280 ladder), so chrome and content align (PR #29).
- **Chips at ~32px** match Material's chip spec — deliberately *not* bumped
  to 44 (blanket-44 would violate the chip guideline).
- List-row tap areas already padded to 44×44; hero buttons already 50px.

## Issues found (measured at 1440px) and fixed

| Element | Before | After | Standard |
|---|---|---|---|
| Today hero `I'm going` / `Save` | 601×50 each (stretched 50/50) | **150×50, content-sized, left-aligned, primary-first** | Apple/Material/Fluent: desktop CTAs size to content |
| Venue `I'm going / Add to calendar / Share` | ~399×42 (stretched, **42 < 44**) | **content-sized, 44px tall, left-aligned** | HIG 44pt + content sizing |
| `.btn-primary` / `.btn-secondary` height | ~38px | **min-height 44px** | Apple HIG tap target |
| Saved `Going/Reading/Past` seg-tab | 169×**39** | **169×44** | Apple HIG tap target |
| Discover `Events/Places` scope toggle | 102×**39** | **102×44** | Apple HIG tap target |
| Venue action-row gap | inline `10px` (off-grid) | `--s-3` (12px) token | 8px-grid + 8–16px button gap |

Mobile behaviour is preserved/clarified per the research: hero + venue
**primary CTAs go full-width and stack** on phones (the recommended phone
pattern), only the desktop stretch was removed.

## Verification

Puppeteer on the VM: every control re-measured before/after; 6 pages ×
4 widths (1920/1440/768/390) = **zero horizontal overflow, zero JS errors**.
Screenshots of hero (desktop + mobile) and venue confirm the CTA pair now
reads as primary-then-secondary, content-sized, left-aligned.

## Deliberately NOT changed (scope discipline)

- Chips stay ~32px (Material chip spec).
- The 4px `--s-*` scale is already compliant — left as is.
- No new tokens, no new colours, no component restructure beyond the
  button action rows.

---

## Round 2 — profile, admin, icons/tabs/links (June 2026)

Extended the same audit to profile form controls, the admin panel, and
the remaining interactive elements (icon buttons, masthead links, tabs).

### Public site — tap targets brought to the 44px floor (measured)

| Element | Before | After |
|---|---|---|
| `.venue-social__link` (web/FB/IG glyphs) | **16×16** | 44×44 hit area (glyph stays 16px) |
| `.city-selector` (city switcher) | 99×**25** | 99×44 |
| `.discover-view-fab` (Map/List toggle) | 75×**34** | 75×44 |
| `.auth-btn` (masthead Sign in / account) | 57×**26** | 57×44 |
| `.topbar__about` (masthead About) | 41×**26** | 41×44 |
| `.auth-panel__submit` / `__close` (auth overlay + profile) | ~38px | min-height 44 |
| `.profile-toggle` (digest switch hit area) | ~24px | min-height 44 (switch stays 24px) |

The social-glyph row uses a negative margin so each link is a 44px hit
target without making the venue card taller or sparser; the glyphs stay
visually 16px and left-align with the card text.

### Inline links — left as-is (correct per spec)

The "on map →" row link, colophon "About", and curator handles are
**inline text links**, which WCAG 2.5.5 explicitly exempts from the 44px
target. Bumping them would harm the editorial line rhythm. No change.

### Pictures / icons / tabs

- **Thumbnails** are already consistent: fixed square sizes (64/88px),
  `object-fit: cover`, uniform petrol duotone. No change needed.
- **Tabs**: bottom-nav/masthead `.nav__item` (44–47px ✓), Saved
  `.seg-tab` and Discover `.discover-scope__btn` (fixed to 44 in round 1).
- **Icon glyphs** inside larger controls (nav icons 20px, pin glyphs)
  inherit their parent's ≥44 target — left as-is.

### Admin panel — audited, density-appropriate

Admin is a **desktop, mouse-driven data tool**. Apple's 44pt is a *touch*
guideline; Material ("dense" variant) and Fluent both endorse denser
controls for desktop data tools, where information density is a feature.
`admin.css` already uses the `--s-*` token grid consistently and inherited
the shared width ladder. The only fix applied: the topbar **city select +
auth button** had mismatched heights (22 vs 28px) sitting side by side —
unified to a shared **32px** (dense) so the toolbar aligns cleanly. The
data-dense section controls (search inputs, reset links, filter chips) are
intentionally left compact.

### Verification (round 2)

9 pages × 4 widths (1920/1440/768/390): **zero horizontal overflow**, no
new JS errors (admin's "Failed to fetch" is the pre-existing Supabase data
call in the sandbox, unrelated to layout). Every fixed control re-measured
at 44px; topbar, Places cards and profile screenshotted.
