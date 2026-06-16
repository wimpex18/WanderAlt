# WanderAlt — Redesign handoff (June 2026)

**Designer:** Claude · **Canvas:** `redesign-jun26/WanderAlt Redesign.html`
**Repo this targets:** `github.com/wimpex18/wanderalt`

This is a *design* deliverable — an interactive canvas showing the unified system
across Today / Discover / About on both desktop (1440) and mobile (390). Below is
the structural logic plus the exact files to drop into the Claude Code workspace.

---

## 1 · Navigation bug investigation (mobile vs desktop)

**Finding — it is NOT a CSS visibility glitch.** The production `nav.js` renders the
full tab set (`Today / Discover / Saved / Profile`) only when a session exists; the
signed-out mobile build falls back to a reduced marketing header
(`Main / About / Sign in`) injected by `auth.js` into `.topbar__right`. On desktop the
full ladder is always present because the masthead tabs are static markup in
`index.html`, independent of auth. So mobile wasn't *hiding* the tabs — it was never
*mounting* them for logged-out users. That is the discrepancy.

**Fix shipped in this design:**
- The four destinations are a single source of truth (`TABS` in `chrome.jsx`) and render
  identically on both viewports — desktop as the masthead tab row, mobile as a **docked
  bottom tab bar** (`.dock`), always visible regardless of auth state. Sign-in becomes a
  per-tab affordance, never a replacement for navigation.
- **About dead-end fix:** mobile About gets a `.returnbar` ("← Back to today's briefing")
  pinned under the topbar, plus the persistent dock — two independent ways back, no
  reliance on browser back.

→ Drop `NAV-FINDINGS.md` (this section) next to `docs/` and wire `nav.js` to render
`TABS` unconditionally; gate only the *Profile* destination's contents on auth, not its
presence.

## 2 · Alignment & responsive parity

One shell owns every edge: `--shell:1240px` + `--gutter:32px`, class `.shell`. The
topbar, the **banner (now a framed 12px plate, not a loose strip)**, the tab row, all
content sections and the colophon share that exact width and gutters — so the nav
container now spans the full banner width instead of sitting choked and narrow. Mobile
re-uses the same shell at `--gutter:20px`.

## 3 · Shape language — "Plate & Rule"

Every surface is either a **plate** (framed content: 12px radius, 1px hairline) or a
**rule** (1px structural hairline on the open page). Controls collapse to **one button
family** (8px radius, 52px tall, primary/secondary/quiet/petrol weights), replacing the
old sharp-white "Surprise me", black-rounded "I'm going", and pill "Saved". Radius
vocabulary is exactly **4 (tags) · 8 (controls) · 12 (plates)** — the 999px pill is
retired. See board 01 in the canvas.

## 4 · Typography & pages

- **Today:** standfirst promoted to a 38–46px serif-italic editorial statement; curator
  comment is a lime-ruled pull-quote; `COLUMN · ISSUE 1` metadata rebuilt as a proper
  editorial plate with tracked mono labels and serif body.
- **Discover (rebuilt):** a single **control deck** (scope segmented control + search +
  Surprise + Where/What chips) over a **curator rail**, then a **list ↔ sticky map**
  split. Mobile collapses to list + a floating **Map** FAB.
- **About:** re-spaced to the global grid; same plate/step components.

---

## Files to inject (paths relative to repo root)

| New/changed file | Purpose |
|---|---|
| `styles/wa-core.css` | Tokens + shape language + shared chrome (topbar, banner plate, tabs, dock, returnbar, colophon). **Source of truth.** |
| `styles/wa-pages.css` | Page-level components for Today / Discover / About. |
| `js/nav.js` (modify) | Render `TABS` unconditionally on all viewports; mount `.dock` on mobile; gate only Profile *content* on auth. |
| `partials/about.html` (modify) | Add `.returnbar` under the topbar. |
| `docs/NAV-FINDINGS.md` | This investigation writeup. |

> Token names in `wa-core.css` mirror the production `styles.css` custom properties
> (`--paper`, `--ink`, `--petrol`, `--lime`, `--rule`…), so the two stylesheets coexist —
> import `wa-core.css` *after* `styles.css` to override safely, then delete the superseded
> blocks (`.btn` pill rules, the floating glass nav, the loose banner strip) once parity
> is confirmed.

The canvas components (`chrome.jsx`, `boards-*.jsx`) are presentation scaffolding for the
design doc — port their markup structure, not the files themselves, into your existing
component framework.
