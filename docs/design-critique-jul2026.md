# Design critique — full-app UX audit (16 Jul 2026)

> **Status update (same day):** must-fix **#1** landed (shared `when.js` derivation stamped onto both catalog paths; Today's fallback now relabels itself "Latest picks · nothing dated this week yet"; e2e went 68/70 → **70/70**). Must-fix **#3** landed (generate-context v17 + draft-column v20 sanitize before save; SQL sweep repaired 28 truncated contexts + 12 unbalanced columns; 0 remain). Tooling: audit rebuilt on Playwright segment capture; `npm run visual` pixel-diff suite added. Must-fixes **#2, #4, #5** and the should-fix list remain open.

**Method.** Every public page rendered and read at 390 / 768 / 1440 (`npm run audit` + targeted Puppeteer captures for venue / curator / place / search / map / 404, plus viewport-truth shots for fixed chrome). `npm run verify`: **24/24 pass**. `npm run e2e`: **68/70 — 2 failures** (Discover events renders 0 cards; dependent view-transition check). Dynamic suspects verified with a live-data probe and one-shot SQL against the picks table, not eyeballed.

**Stage/context.** Pre-release (no users, crons intentionally disabled). Critique is calibrated for a launch-readiness pass: brand and system polish are largely done; the gaps are data-honesty and cross-surface consistency.

**Two false alarms, documented so nobody "fixes" them.** (1) fullPage screenshots capture `position:fixed` chrome mid-page — known artifact. (2) *New:* rows far below the fold (Worth a visit at 390, the places list at 1440) capture as empty frames / dead whitespace in fullPage shots; a scroll probe confirmed all 54 place rows and all 3 Worth-a-visit rows hydrate fine in a real viewport. Likely `content-visibility`/lazy rendering. Consider adding this second caveat to `.claude/skills/visual-audit/SKILL.md`. The blank map canvas in headless shots is a WebGL artifact (MapLibre, zero console errors) — verify tiles on a real device, don't patch.

---

## Overall impression

The editorial identity is real and distinctive — Fraunces + mono labels + the petrol/lime restraint reads like a printed cultural weekly, not a 2024-template app. The biggest opportunity is not visual: **the product's core promise ("what's on this week, vouched by a human") is currently contradicted by its own data surfaces.** Today says 8 picks this week; Discover says 0. Fix the honesty layer and the design carries the rest.

---

## Like / Wish / Wonder

### Like (keep, and protect)

- **Voice is exceptional and consistent.** The 404 ("*Nothing here tonight.*" — "…which is the nature of things worth paying attention to"), the Saved empty state, the About page. Back-page-of-a-newsletter, achieved.
- **Component discipline is visible.** One `.page-head` everywhere, one list-row pattern with kind-glyph placeholders (no fake initials), chips with ✓ active states, the composite digest/search fields, two control heights. The Jun-26 Plate & Rule system survived contact with real pages.
- **Venue detail is the best screen in the app.** Scrim hero → mood chips → quote-as-hero with attribution → petrol CTA → 44px icon row → venue plate. Hierarchy is exactly per contract.
- **Saved empty state** (illustration + one-line Fraunces + single CTA) is best-in-class.
- **About at 1440** is a genuinely good editorial layout: narrow measure, full-width section rules, numbered 01/02/03 cards.
- **A11y bones pass measurement**: 44px targets, no overflow at any width, no console errors (verify 24/24), contrast palette AA by construction, recent label-in-name pass.

### Wish (ranked below as must/should-fix)

- One shared, date-derived definition of "tonight / this week" across Today and Discover.
- Editorial text sanitized: no raw markdown asterisks, no mid-sentence truncation — the curator's words are the product.
- The About page to stop claiming Helsinki/Riga are LIVE while its own copy says "in flight".
- Counts that match the lists they sit next to.
- One neighborhood spelling, one "website+socials" pattern, a real signed-out Profile state.

### Wonder (open questions for the owner, not defects)

- **Lime as decoration.** The quote blocks (venue, 404) carry a lime left rule. Contract says lime is signal-only. Bless the quote-rule as canon in CLAUDE.md, or switch it to petrol — currently it's ambiguous precedent.
- **The multicolor city illustrations** (About, Saved empty state) sit outside the two-tone rule. They're charming and probably brand-kit-approved — worth writing down that illustrations are exempt, so a future session doesn't "fix" them.
- **The nav tab is literally named "Discover"** while the voice rule bans the word. Rename (Browse? Index? All picks?) or scope the rule to copy only.
- **Map-first friction**: mobile map requires a filter before showing anything ("Filter to see picks on the map") while the places map happily clusters everything. Why not cluster events by default too?
- **Tablet (768) toggle pattern**: masthead chrome + the floating mobile List/Map pill coexist. Decide which world 768 belongs to.
- **"Reading 0" tab on Saved** — will a first-time user know what "Reading" collects?

---

## Must-fix (launch-blocking)

### 1. "This week" contradicts itself across the two core surfaces
Live Tallinn data has `this_week=false` and `tonight=false` on **all** picks (the flag-refresh cron is among the 30 disabled). The two pages then diverge:
- **Today** ([briefing.js:558](../briefing.js#L558)) silently falls back to "8 most-recent picks" and labels them **"This week · 8 picks · 3 curators"** — fabricated freshness; some may be past events.
- **Discover** ([discover.js:88](../discover.js#L88)) applies the flag honestly → **"0 results"** with 158/22 events in the catalog. `npm run e2e` fails 2/70 on exactly this.

**Fix:** derive tonight/this-week from real dates at read time in ONE shared helper both pages consume (or re-enable the flag cron pre-launch — owner decision); never label fallback content "This week"; give the Discover empty state a "see all dates →" escape. *Trust is the product; this is the first thing a tester will catch.*

### 2. About page shows lime LIVE badges on Helsinki and Riga
Copy two paragraphs below says "We're live in Tallinn, with Helsinki and Riga **in flight**." Lime is the live-signal color, applied to non-live cities — a false signal in the brand's own vocabulary. Badge states: LIVE / IN FLIGHT (neutral, no lime).

### 3. Raw markdown + mid-sentence truncation in curator editorial
- venue.html "About this event": `This isn't merely a chance to watch *Alcarràs` — leaked `*`, cut mid-sentence, no period.
- curator.html "Reading lately" column opens `*Tallinn breathes a particular kind of quiet…` — leaked `*` in the signature editorial element, huge at 1440.

**Fix in the pipeline** (`process-staging` sanitation): strip markdown emphasis, truncate at sentence boundary or not at all. Sweep existing rows with one-shot SQL for `*`, `_`, `[`.

### 4. Duplicate neighborhood: "Pohja-Tallinn" vs "Põhja-Tallinn"
Visible to users twice: search.html neighborhoods list shows both ("5 picks" + "2 picks" for the same place), and Discover's filter rail renders both chips. Diacritic normalization at ingest + a one-time merge. Also: "other" is lowercase among capitalized names.

### 5. Counts disagree with the lists they caption
- Places tab badge says **6**; results header says **54 places**. *(Root cause found: `renderAll()` never refreshes the scope badges, so they freeze at the static-seed counts while catalog-ready re-renders live results.)*
- ~~curator.html says "6 picks in Tallinn"; renders 2 rows.~~ **Retracted** — segment captures show label and rows agree; the "missing" rows were the fullPage lazy-render artifact. What IS real: the label hardcodes "in Tallinn" for every curator, including Riga/Helsinki ones.
- (And Today's "8 picks · 3 curators" vs Discover's 0 — same family as #1.)

Counts must be computed from the same filtered set that renders. Nothing erodes "curated by humans" faster than numbers that don't add up.

---

## Should-fix (before or shortly after launch)

6. **Profile tab dead-ends.** Signed out, profile.html silently redirects to index.html (probe-confirmed): tap Profile → land on Today, nav highlights Today, no explanation. Give profile.html a signed-out state (what an account gets you + Sign in CTA).
7. **Apollo flood in Places.** Eight identical "Apollo" rows + Apollo Kids + Apollo kino — a mainstream mall chain dominating an "underground, not-the-visitor-guide" list, and with no neighborhood in the meta the branches are indistinguishable. Curate the chain out (or collapse to one row), and always render `Neighborhood · type` on place rows.
8. **Venue hero eyebrow reads "PLACE" on an event pick** (Film Club screening). Should be the kind or nothing.
9. **Two implementations of "venue website + socials."** venue.html: labeled "Venue website ⧉" button + FB/IG icons. place.html: bare globe/FB/IG icon row. One pattern per contract — pick one (the place.html icon row matches the Jul-26 icon system).
10. **Discover 1440 filter-rail containment.** The MOOD chip row and its rule escape the left rail and run across the results column; SORT introduces radio buttons — a third selection control where chips/segs are the system. Also the map zoom "+/−/locate" stack self-overlaps.
11. **Mobile map empty-state card is clipped** behind the List/Map pill and its text cut ("…open Filters for category"). Reserve bottom padding for the docked pill (safe-area inset).
12. **Mid-word ellipsis on curator taglines** in browse cards ("The undergrou…", "Go to the openi…"). Clamp at word boundary or allow two lines.
13. **Stranded globe icon** as a lone third line on place list rows — fold it into the trailing edge of the row (like bookmark).
14. **"Reading lately · Edition No. 1 · May 2026"** — a "cultural weekly" leading with a two-month-old Edition No. 1. Hide stale editions past N weeks, or hold the feature until cadence is real.
15. **This-week 2-col grid (≥768) has ragged per-column rules** — dividers land at different heights across columns and titles wrap 1–3 lines. Consider row-aligned dividers or equal-height rows.

### Minor / polish

- Icon census: 22 vs 23px glyph mix on every page (topbar vs cards) — reconcile to one; the lone 12px and 16px marks are fine in context.
- "Open in Google Maps ↑" — use ↗ for external links (matches convention; "See on city map →" is right).
- "Skip" chip stranded on its own row in Tune-tonight's-briefing; at 1440 the panel is ~70% dead space. Consider inline Skip and a max-width on the panel.
- curator.html Share (labeled) + calendar (icon-only) sit as an uneven pair; calendar icon's purpose is not discoverable.
- Ääniwalli (Helsinki/Kallio) reachable under the Tallinn banner via cross-city links — by design for bookmarks, but the page gives no city cue; consider a city eyebrow on place/venue pages when it differs from the active city.

---

## Accessibility snapshot

- **Contrast**: petrol-on-white and ink-on-paper pass AA; lime never used as text (badge = lime bg + ink text, sanctioned). ✅
- **Touch targets**: 44px floor verified programmatically across 24 page/width checks. ✅
- **Readability**: body measures kept to ~56–64ch even at 1440. ✅
- **Watch**: quote captions at 13px italic are at the small end — fine as captions, don't let them carry load-bearing info alone; mood tag chips on curator rows render ~26px tall (chips are Material-exempt, but keep ≥32px).

## Priority order for implementation

1. **#1 shared tonight/this-week derivation** (fixes e2e 2/70, the Today/Discover contradiction, and honest labeling in one change).
2. **#3 pipeline text sanitation + data sweep** (protects the signature element everywhere at once).
3. **#2 About LIVE badges** (one-file honesty fix, high embarrassment value).
4. **#4 + #5 data hygiene** (neighborhood merge; counts from rendered sets).
5. **#6–#9** UX dead-ends and pattern forks.
6. Everything below is polish; batch with the next visual pass and re-run `npm run audit` + `verify` + `e2e`.
