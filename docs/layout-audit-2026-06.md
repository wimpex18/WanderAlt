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
