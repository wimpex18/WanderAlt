---
name: visual-audit
description: Render WanderAlt's pages, SEE them (read screenshots), and critique the UI like a human eye — icon scale, alignment, density, rhythm — across 390/768/1440. Use before/after any UI/CSS/layout change, or whenever asked to review or polish how the app looks. Closes the "model edits CSS blind" gap.
---

# Visual audit — make the render legible to a blind model

A model edits CSS without seeing the result, so it misses what a human catches in one glance: an icon a touch too big, two edges off by a few px, a row with too many (or too few) elements, broken rhythm. This skill forces the render into view and turns "the eye notices" into checks. **Why it matters:** the model that wrote the code cannot grade its own output — only the rendered picture, compared to a reference, can.

## When to run
- After any layout/CSS/markup change, before claiming it's done.
- When asked to "review", "polish", "make it look better", or "check the design".
- Both an *after* pass (did my change land?) and, for a polish request, a *before* pass (what's actually wrong?).

## The loop (do every step — do not skip to code)

0. **State the brief first (kills slop at the source).** Before touching CSS, name the page's subject, its audience, and the ONE job the screen must do — then the single *signature element* that earns it (here: the curator quote). Generic UI is the model drifting to the training average ("distributional convergence"); a stated brief + a reference is the antidote. Every edit serves the brief, not "make it nicer."

1. **Capture.** `npm run audit` → screenshots every public page at **390 / 768 / 1440** into `.screenshots/audit/<page>-<width>.png`, and prints a per-page numeric census: distinct icon (svg) sizes + any horizontal overflow. (For a param page — venue/curator/place — or a specific state, take a targeted shot with a quick puppeteer snippet at the same widths.)

2. **See — and run the slop check.** **Read the PNGs** (Claude can view images). First confirm the brand is *actually on screen*, not assumed: petrol/lime + Fraunces/Inter/Geist applied, no Inter-clone default face, no purple/indigo gradient, no big-number-on-gradient hero, no shadow where a 1px rule belongs. If any region reads like a generic 2024 AI app, name what's generic before anything else. Then critique like a senior product designer, naming concrete deltas — not "looks good":
   - **Icon scale:** are glyphs one consistent size per context? The census flags ">3 distinct icon sizes per page" — reconcile to the icon system (~22px glyph in a 44px target). One-off odd sizes (e.g. a lone 23px among 22s) are the "too big/small" feeling, quantified.
   - **Alignment (optical, not math):** do sibling left edges line up? Do icons sit on the text's cap-height/baseline, not its geometric center? Flag edges that differ by a few px.
   - **Density:** any row with too many elements (cramped) or too few (stranded)? Count per row.
   - **Rhythm & balance:** vertical gaps must step within-item < siblings < heading→content < sections; a heading is never the tightest gap near it. Whitespace, not shadows, separates.
   - **Hierarchy:** the curator quote stays the largest element on the screen.

3. **Anchor to a reference (kills AI-slop).** Compare against `docs/redesign-jun26/` (the intended boards) + the canon in `CLAUDE.md`. Generic-looking output is the model drifting to the training average; a concrete reference is the fix. List exact differences in spacing / icon size / alignment / structure.

4. **Plan & fix** within the system: `--s-*`/`--c-*`/`--t-*` tokens + existing component classes only; no new vars, no arbitrary px, no drop-shadows (1px hairline rules + whitespace). Make only the polish change.

5. **Re-capture, re-read, prove.** `npm run audit` again; read the *after* PNGs; show the after image as evidence. One or two passes. Then run `npm run verify` + `npm run e2e` (must pass).

6. **Fresh-context review** for anything non-trivial: spin a sub-agent that sees only the diff + the after-screenshots + the WanderAlt sizing/rhythm/colour contracts, and have it report gaps (not style opinions) — the model that wrote the code is the worst judge of it. Giving Claude a way to verify its own work is the single highest-leverage quality move (Boris Cherny's rule of thumb, paraphrased: it roughly 2–3×'s output quality).

## Hard caveat — fixed chrome in fullPage shots
`npm run audit` uses `fullPage`, so `position:fixed` chrome (topbar, bottom-nav) is captured at its first-viewport position and **looks like it floats over mid-page content**. That is a screenshot artifact, **not a layout bug.** Confirm chrome with a viewport-height (`fullPage:false`) shot before ever "fixing" it. Crying wolf on this artifact wastes a whole pass.

## Output shape
For a review, report: per page, 4–6 concrete observed flaws (with the screenshot region + the canon rule each breaks), the numeric census highlights, then the prioritized fix list. For a fix, report: before screenshot finding → token-level change → after screenshot → verify/e2e result.
