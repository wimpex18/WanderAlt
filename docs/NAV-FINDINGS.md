# Navigation findings — June 2026 "Plate & Rule" redesign

The Claude Design redesign (`docs/redesign-jun26/`) opened with a **navigation bug
investigation** (HANDOFF §1): it claimed mobile signed-out users never saw the primary
tab set because `nav.js` only mounted the tabs when a session existed, falling back to a
reduced marketing header on mobile. This note records what we found when we checked that
claim against the **shipped code**, and what we actually changed.

## The claim (from the redesign HANDOFF)

> The production `nav.js` renders the full tab set (`Today / Discover / Saved / Profile`)
> only when a session exists; the signed-out mobile build falls back to a reduced marketing
> header (`Main / About / Sign in`). … wire `nav.js` to render `TABS` unconditionally; gate
> only the *Profile* destination's contents on auth, not its presence.

## The finding — the bug does not exist in shipped code

There is **no `nav.js`**. Navigation is **static HTML on every page**, not JS-mounted:

- `<nav class="nav" aria-label="Primary">` with four `.nav__item` links
  (`Today / Discover / Saved / Profile`) is hard-coded into all nine public pages:
  `index, discover, saved, profile, about, venue, curator, place, 404`.
- The active tab is marked with `aria-current="page"` in the markup — **no JS needed**
  (see the comment above the `<nav>` in `index.html`).
- The four tabs render **identically on mobile and desktop** (CSS swaps the bottom bar for
  the masthead row at the 768px breakpoint); they are **never auth-gated**. A grep for any
  auth/session/login conditioning of `.nav` / `.nav__item` across all JS returns nothing.
- `auth.js` injects only the sign-in trigger into `.topbar__right`; it never touches the
  primary nav and never replaces it with a marketing header.

So the discrepancy the redesign set out to fix — tabs present on desktop, missing on
signed-out mobile — **is not present in this codebase**. The redesign was authored against
an assumed architecture (a React-style `nav.js` + `TABS` source) that WanderAlt's
static-HTML stack never had.

## What we changed anyway (purely visual)

With no functional bug to fix, we adopted the redesign's two *aesthetic* nav improvements
(owner-confirmed: "Adopt the docked bar"):

1. **Docked bottom bar.** The mobile `.nav` was a floating glass **pill**. Phase 0 reskins
   it (in `styles.css`, `@media (max-width:767px)`) into a **full-width docked bar** with a
   hairline top rule and a petrol active-tab underline — flush to the viewport edges, every
   tab labelled. The markup is unchanged; only the CSS moved from pill to dock. The sanctioned
   `prefers-reduced-transparency` fallback is preserved (the dock stays a glass chrome surface).
2. **About return affordance.** Mobile About now carries a `.returnbar`
   ("← Back to today's briefing") under the topbar (`about.html:44`), so the page has an
   explicit way back in addition to the always-present dock — closing the "About dead-end"
   the redesign flagged, without relying on browser back.

## Items deliberately NOT taken from §1

- **`nav.js` + unconditional `TABS` render** — not applicable; nav is already static and
  unconditional.
- **Gating Profile *content* on auth** — already the case (`profile.html` shows a signed-out
  state; the tab itself is always present), so no change.

## Net

The navigation is correct and consistent as shipped. The redesign's nav work reduced, in
practice, to a **cosmetic** change (floating pill → docked bar) plus the About return bar —
both landed in Phase 0 / Phase 3. No behavioural nav change was required or made.
