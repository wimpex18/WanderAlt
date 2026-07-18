# Screen-reader test checklist — WanderAlt (Today + Discover)

**Why this is a human task.** `npm run a11y` (axe) validates accessibility
*properties* — roles, names, contrast, focus order — but it cannot hear what a
screen reader actually *says*. This checklist is the ~20-minute manual pass to
run before launch. It targets the two core flows; the patterns generalize.

## Setup
- **iOS/macOS VoiceOver** (the primary audience — mobile Safari): `⌘F5` to
  toggle on macOS; Settings → Accessibility → VoiceOver on iOS. Rotor: two-finger
  rotate (iOS) / `VO+U` (macOS) to jump by Headings, Links, Form Controls.
- **NVDA (Windows/Firefox)** as a cross-check: `Insert+↓` to read-all,
  `H` next heading, `F` next form field, `K` next link.
- Test **both skins** (Profile → Appearance → Dusk, then Daybreak) — same DOM,
  but verify the theme swap doesn't change what's announced.
- Turn the **screen off / eyes closed** for the last pass — if you can complete
  the task blind, it works.

## Pass/fail: each row must be YES
Legend: **A** = announced correctly · **R** = correct role · **O** = logical order

### Today (`/index.html`)
| # | Step | Expect | A | R | O |
|---|------|--------|---|---|---|
| 1 | Swipe from top | "WanderAlt, link" → city selector announces name + "pop-up button" | | | |
| 2 | Rotor → Headings | Land on the page title, then "This week" (or "Latest picks"), "Worth a visit" — in that order, each a heading | | | |
| 3 | Tonight hero | Title read as heading; the mono ticker + attribution read as text; the **@handle reads as a link** (curator name) | | | |
| 4 | "I'm going" | Announced as a button with its label — not "button" alone | | | |
| 5 | Bookmark toggle | Announced with state ("selected"/"not selected"), and toggling re-announces the new state | | | |
| 6 | Dock nav | Each tab a link with its NAME (Today/Discover/Saved/Profile) — **not a nameless link** (this was the Jul 2026 fix; confirm it holds in AT) | | | |
| 7 | Digest field | Input announced with its label; type a bad email + submit → the error/status is **announced** (aria-live), not silent | | | |

### Discover (`/discover.html`)
| # | Step | Expect | A | R | O |
|---|------|--------|---|---|---|
| 8 | Events/Places segmented | Announced as a control with selected state; switching re-announces | | | |
| 9 | Search field | Labeled; the CONCIERGE/✦ submit is a named button | | | |
| 10 | Filter chips (Tonight/This week/Free) | Each a button; the ✓ active state is announced (leading "✓", not color-only) | | | |
| 11 | Curator rows | Handle link + tagline read in order; "N picks" read; the whole row is reachable and its destination clear | | | |
| 12 | Neighborhood / category filters | Each chip a button with a full, correct name ("Põhja-Tallinn", "Vinyl & books" — verify the label isn't truncated in the accessible name) | | | |
| 13 | List/Map toggle | Announced with current view + state | | | |

### Cross-cutting (spot-check on any page)
| # | Check | Expect |
|---|-------|--------|
| 14 | Focus order | Tab/VO-swipe order matches visual order; no focus trap in the auth sheet (Esc closes, focus returns) |
| 15 | Skip link | First Tab reveals "Skip to content"; activating it jumps past the chrome |
| 16 | Images | Decorative photos/glyphs are silent (empty alt); no "image" noise between cards |
| 17 | Empty states | "Nothing on the calendar yet" / "No picks this week…" read as text, in curator voice |
| 18 | Dynamic updates | Applying a filter → the result count / "N results" is announced (or focus lands somewhere sensible), not a silent DOM swap |

## What to file
For any **NO**, note: page · element · what VO said · what it should say. Group
by pattern (nav, card, form, chip) — a fix to the shared component (`WA.UI`,
`.nav__item`, `.chip`) usually clears every instance at once.

## Known-good going in (from `npm run a11y`, so AT should confirm, not surprise)
- Dock tabs have accessible names (clip pattern, not `display:none`).
- Composite fields show a focus ring; `#digest-optin-status` is `aria-live`.
- Contrast passes AA on text; `@handle` links carry an underline (not color-only).
- No serious axe violations across 42 page-variants.

If VoiceOver contradicts any of these, that's a real AT-vs-DOM gap worth a bug —
the automated pass can't catch it, which is the whole point of this checklist.
