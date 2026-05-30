# WanderAlt — Roadmap

A plan for what's next, written so a future contributor (or Sonnet 4.6) can implement without re-deriving decisions. Read `README.md` for product context, `HANDOFF.md` for the engineering reference, `CLAUDE.md` for working conventions. This file is opinionated and ranked.

---

## Framing

WanderAlt's soul is **curator voice** rendered as **editorial minimalism**. The product principle that protects every other decision: *curator voice is the largest element on screen.* Every feature must amplify that, not crowd it.

The product is a printed cultural weekly translated to web. Three implications follow:

1. **Time, not feed.** Items don't refresh by scroll position. They publish on a cadence (a week, a tonight). Anything that smells like an algorithmic feed dilutes the brand.
2. **Voice, not metadata.** A pick without a quote is wallpaper. New surfaces should give voice more room, not bury it under tags and ratings.
3. **Reading, not browsing.** Sessions should feel like reading the back page of a paper, not flipping through a catalogue.

**AI providers, used right:**
- **Gemini 3.5 Flash** — everywhere in the cron pipeline. Best for: classification, structured output, editorial composition that runs offline (cron / nightly). `gemini-2.5-flash` is the fallback; `-pro` and `gemini-2.0-flash` return 404 "no longer available to new users" — never substitute. Embeddings stay on `gemini-embedding-001`.
- **Groq Llama-4-Scout-17b** (`meta-llama/llama-4-scout-17b-16e-instruct`, fallback `llama-3.3-70b-versatile`) — real-time only. Good for: `match-pick`, anything where p95 latency must be < 1s. Also fallback in `process-staging`.

Everything below picks one of these two for a reason; keep it that way.

---

## Shipped

Features already live. See `README.md` for implementation detail.

- **Mood tags + chip filter** — `mood-chips.js`, multi-select on Briefing.
- **Curator's column** — `draft-column` edge function (Gemini 3.5 Flash, Mon 08:00 UTC), admin approval, rendered on Briefing.
- **Match-me** — `match-pick` edge function (Groq Llama-4-scout-17b, Llama-3.3-70b fallback), AI mode toggle on the unified Discover page (Search + Map merged May 2026).
- **Discover (unified Search + Map)** — May 2026 consolidation per Baymard split-view research. Single page with shared filter state, list/map view toggle on mobile, side-by-side split ≥1024px.
- **MapLibre basemap** — `map-tiles.js` + custom `map-style.json` (OpenFreeMap tiles). Replaced the illustrated SVG plane; pins now use real `picks.lat/lng` projected through `WA.MapTiles.project()`. `geocode-picks` cron backfills coords nightly.
- **Multi-city ingest** — `ingest-osm` v11 covers Tallinn / Riga / Helsinki / Vilnius in one nightly tick; Telegram / RSS / Fienta / venue scrapers all configured per the `sources` table (~24 source rows). See CLAUDE.md → "Live data sources & ingest pipeline" for the canonical source matrix.
- **Beacon brand kit + city plates v2** — `brand/` masters, favicons, manifest, OG cards; illustrated city plates at `assets/<city>-overview.svg` shown as 80×60 thumbnails in the city selector and a 64 px city banner ribbon under the topbar on every page.
- **Email digest** — `send-digest` (Sat 09:00 UTC), opt-in on Profile.
- **"Why this matters"** — `generate-context` (nightly, Gemini 3.5 Flash), `<details>` on Venue detail.
- **OG images** — `og-image` edge function (Satori + @resvg/resvg-wasm), wired on Venue + Curator pages.
- **Venue enrichment** — `enrich-venues` (nightly 03:30 UTC): Wikidata + Nominatim → `venue_details` table (website, address, lat/lng, short_desc, image). Admin panel exposes per-venue lock and bulk-run. Venue detail page shows enrichment inline.
- **404 page** — `404.html`, matches site aesthetic.
- **About / Privacy / Contact** — `about.html`, one editorial page with five sections (About / Curators / Venues / Privacy / Contact). Linked from every page's colophon. No separate Terms / Cookie banner — see CLAUDE.md "Domain + page architecture" for the single-domain, no-tracking stance.
- **Loading skeletons** — static, layout-reserving skeletons (Tonight hero, pick rows, Discover browse rows) hold space until `wa:catalog-ready`, so hydration doesn't jolt. No shimmer / spinner, per the editorial brand.
- **Editorial redesign of Today / Discover / Saved / Profile** (May 2026) — flat Tonight hero, rebalanced Discover split with an immersive AI concierge panel, unified ink-fill segmented controls, refined Profile. Same tokens, two-tone, voice-loudest.
- **Walking-radius filter** — Discover "Distance" control (Any / 5 / 15 / 30 min walk). Opt-in geolocation; a shared haversine filters both the list and the map pins (Events + Places). Deep-links via `&within=`, shows a removable applied chip, and falls back gracefully (with a note) if location is declined.

---

## Tier 1 — Outstanding moves (build these)

*(Print stylesheet was here — shipped May 2026, see "Shipped"
above. The `@media print` block in `styles.css:2832` hides chrome,
keeps the editorial column intact, prints the website URL next to
venue links, and prints page numbers via `@page @bottom-right`.)*

---

## Tier 2 — Solid wins

### 6. "Surprise me" — single button on Briefing
- Pure JS. One button below Tonight: `Surprise me →`. Click fade-replaces the hero with a random pick from active catalog (filtered by current city). Respects `prefers-reduced-motion`.
- Deliberately tier 2: charming, but the column already gives the Briefing its editorial heartbeat.

### 7. Curator weekly synthesis
- On `curator.html`, an auto-generated 2-line *"Reading lately"* paragraph synthesizing their last 3–5 picks. Cron weekly, Gemini 3.5 Flash, store in `curators.synthesis_md`.
- The full column shipped — this is the smaller per-profile variant, which still has independent value on the curator page itself.

---

## Tier 3 — Quiet experiments to revisit

These are off-roadmap but worth keeping a record of, to avoid re-debating.

- **"What's on the desk" — public curator workspace.** Curator profile shows drafts they're considering. Print-magazine "letters" energy. Hard: requires curator-side UX. **Revisit after column ships.**
- **Chrono-pin map.** Time slider 18:00 → 02:00, pins light up at their event time. Visual delight. **Revisit after picks have proper time fields.**
- **Lineage edges.** Manually-curated cross-references between picks ("If you went to X, the through-line to Y is…"). Editorial annotation. **Revisit if curators ask for it.**
- **Time-traveled briefing.** "Same week last year" page. **Revisit at 12-month anniversary.**

---

## Explicitly NOT building

These would dilute the brand. Listed so the next person knows the answer is no without having to ask.

- ❌ **Comments / replies on picks.** This is a paper, not a forum.
- ❌ **Star ratings or any 5-point UI.** Voice ≠ rating.
- ❌ **Push notifications.** Interruption is the opposite of editorial.
- ❌ **Trending / popular sort.** The whole point is curator-curated, not algorithm-curated.
- ❌ **"For you" personalised feed.** Same.
- ❌ **Multi-language UI.** Maybe at 10× the audience; not now.
- ❌ **Generic admin dashboard with charts.** Admin should look like the rest of the app.
- ❌ **Onboarding tour / coachmarks.** If the app needs explaining, it's wrong.

---

## Sequencing — proposed sprints

Each "sprint" assumes ~1 calendar week of evening sessions, not full-time work.

**Sprint 1 — Quick wins** *(low-risk, high visual pay-off)*
- ~~Print stylesheet~~ ✓ shipped May 2026
- ~~"Surprise me" button~~ ✓ shipped (the `#surprise-btn` on Briefing)
- ~~Loading skeletons~~ ✓ shipped (static, layout-reserving)

**Sprint 2 — Map depth**
- ~~Walking radius filter: geolocation opt-in + haversine filter~~ ✓ shipped (Discover "Distance" control, Events + Places).

**Sprint 3 — Curator presence**
- Curator weekly synthesis: edge fn + `curator.html` render (4h)
- ~~City selector: promote from placeholder to real switcher~~ ✓ shipped — a real keyboard-accessible dropdown with city-plate thumbnails. Tallinn / Helsinki / Riga are live; Vilnius is scaffolded as "coming soon".

**Sprint 4+ — opportunistic**
- Any Tier 3 items as the catalog grows and user feedback lands.

---

## Implementation notes for the executor

A handful of patterns to keep consistent:

- **Edge function naming:** verb-noun, lowercase-hyphen. `classify-moods`, `draft-column`, `match-pick`, `send-digest`, `generate-context`, `og-image`. Existing convention.
- **AI prompts live in code, not env.** Inline in the edge function with comments explaining tone goals. Do not hide them in JSON config — the prompt *is* the product spec.
- **Always cache LLM output to a column.** Never call an LLM at request time except for `match-pick` and similar real-time features. Everything else is cron-batched and cached.
- **Voice rules for prompts:** include in every editorial prompt: *"No em-dashes in headlines. No exclamation marks. No 'discover'. No marketing voice. Read like a back-page newsletter."* This is repetitive but enforces the brand.
- **CSS additions:** reuse the existing token system and component classes. New components only when the existing inventory genuinely doesn't fit.
- **HTML pages stay defer-script and CSP-friendly.** No inline scripts.
- **Mobile-first canonical width 390×844.** Verify every new component there before desktop.
- **Test pattern:** the `node` smoke-test approach used to verify the recent auth/profile work is good. Add to it as features land.

---

*Last updated May 2026 — reflects the shipped pipeline and the Today / Discover / Saved / Profile editorial redesign.*
