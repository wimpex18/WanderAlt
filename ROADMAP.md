# WanderAlt — Architecture audit & roadmap (June 2026)

A strict weak-point audit of the codebase, data layer, and docs, followed by a ranked remediation list — plus, since June 2026, the **frontend & UI/UX execution roadmap** (screenshot-driven visual audit + E2E validation suite, first section below). Written so a future contributor (or model) can act without re-deriving decisions. Read `README.md` for product context, `HANDOFF.md` for the engineering reference, `CLAUDE.md` for working conventions. This file replaces the May 2026 tier/sprint roadmap — everything in those tiers either shipped (see README → Roadmap → Built) or moved to "Explicitly NOT building" below.

**Numbers cited below were measured on 2026-06-09**, on a tree of ~15,600 first-party JS/CSS lines: `styles.css` 5,794 · `catalog.js` 3,563 · `admin.js` 2,216 · `discover.js` 1,310 · `map.js` 680 · `briefing.js` 604.

---

## Framing (unchanged — protects every decision below)

WanderAlt's soul is **curator voice** rendered as **editorial minimalism**: *curator voice is the largest element on screen.* Time, not feed. Voice, not metadata. Reading, not browsing. Any remediation that dilutes this is worse than the debt it fixes.

LLM policy is canonical in `CLAUDE.md` → "LLM model policy" (Groq-first, gated Gemini fallback, embeddings on `gemini-embedding-001`). It is deliberately NOT restated here — that's how the "Gemini 3.5 Flash" doc-drift happened.

---

## Frontend & UI/UX execution roadmap (June 2026 visual audit)

A screenshot-driven audit of every public surface at 390/768/1440, run on the VM with the in-repo harness (method below). Design-system rules referenced here are canonical in `CLAUDE.md` → "Design system canon". Status at audit time: `npm run verify` **green, 24/24** page/width checks (zero overflow, zero console errors, zero tap-target violations) — the remaining flaws are finer-grained than the current assertions, which is exactly what this roadmap fixes: each finding lands with a new assertion so it can't regress silently.

### Progress tracker (updated per PR — last: PR #65 fifth batch, June 2026 — **all 22 findings closed**)

| Finding | Status | Finding | Status |
|---|---|---|---|
| F-1 hero scrim / title legibility | **FIXED** — root cause was a cascade-order bug painting the hero title ink (`.venue-title` declared after its `--onphoto` modifier); compound selector + full-height scrim ramp | F-12 raw `other` in meta | **FIXED** — guarded in every meta builder (5× buildMeta + Tonight kindline + venue block) |
| F-2 FAB occlusion + strip affordance | **FIXED** — list-pane tail clearance + right-edge fade mask on `.mood-chips`/`.discover-pills` | F-13 venue context raw markdown | **FIXED** — `*emphasis*`/`_emphasis_` → `<em>`, HTML-escaped (mid-sentence cut = stored text, a generate-context artifact — out of frontend scope) |
| F-3 off-grid literals | **FIXED** — 40 literals converted to `--s-*` tokens; remaining six are chip-class paddings, annotated as grid-exempt in styles.css | F-14 masthead width/baseline | **FIXED** (earlier in PR #65) |
| F-4 Saved header/empty canon | **FIXED** — `.picks-empty` cards per segment, H1 → "Saved" | F-15 filter-rail/sort placement | **FIXED** — option (b) shipped: facet dropdown-pill row above results, sort right-aligned in the row; V-11 closed in full by the F-16 chrome compression |
| F-5 Profile CTA rule | **FIXED** — `.profile-actions` stacks full-width <768 | F-16 chrome/rhythm pass | **FIXED** — Discover desktop chrome compressed (banner ribbon 120px, pills + mood strip share one hairline-split row, tighter lede); **V-11 now fully passes**: count, first row AND pin all inside the first viewport at 1280×900 with a filter active |
| F-6 standfirst squeeze @390 | **FIXED** — lede stacks below 768, eyebrow above | F-17 Profile/About polish | **mostly fixed** — F-5 CTA stack shipped; About verified clean |
| F-7 placeholder contrast | **FIXED** — `::placeholder` → `--c-ink-mute` (6.6:1) | F-18 curator bio 142ch | **FIXED** — `max-width: 64ch` |
| F-8 glass-nav clearance | **FIXED** — body bottom padding + `--s-6` | F-19 Share 73×27 + harness blind spot | **FIXED** — `.curator-share` 44px + V-14 sweep live in verify.js (sweep immediately caught `taste-skip` at 18px and `map-cluster` at 42px; both fixed) |
| F-9 map defaults + Vilnius | **FIXED** — `CITY_VIEWS` per-city land-weighted center/zoom (Tallinn/Riga 12.4, Helsinki 12.0, Vilnius 12.2), loud error on unknown city; probe confirms all four boot on their own core | F-20 place-page dead end | **FIXED** — kind de-duplicated, map links disambiguated, `.picks-empty` card |
| F-10 repeated fallback quote | **FIXED** — `isEchoQuote()` in all five row renderers; echo rows attribute as "via @handle" | F-21 concierge label | **FIXED** — visible "Concierge" ≥768, button at 44px |
| F-11 duplicate thumbs | **FIXED** — 91 legacy non-spatial photos nulled in Supabase (7 active) + consecutive-dup render guard on Today/Discover lists | F-22 control-weight inversion | **FIXED** — F-15b consolidated the workhorse filters into one labelled row; F-16's compression rebalanced the remaining chrome |

**English-only content pipeline (June 2026, owner request).** The app is English; sources post in ET/RU/LV/LT/PL/FI/UK. Shipped cloud-side, not in this repo: `process-staging` **v38** hardens the language contract (event titles are descriptions, not proper nouns — with RU/ET examples) and adds a write-time compliance guard (any pick whose title/quote still contains Cyrillic gets one targeted Groq translation call before upsert, source title preserved in the new `picks.title_original` column — migration `picks_title_original_english_app`). New **`translate-picks`** function (v2, hand-invoke only, NOT scheduled — Groq llama-4-scout, ~25 items/call, time-capped) backfilled the backlog: two invocations + one manual SQL pass took 672 active picks to **0 Cyrillic titles / 0 Cyrillic quotes**, 66 originals preserved. Latin-script non-English titles are LLM-detected by the same function. `generate-context`/quotes were already English; Google Places (photos/geocode) is language-neutral.

**Cloud sources committed (June 2026).** The deployed-only drift for the translation work is closed: `supabase/functions/process-staging/index.ts` synced to the deployed v38, `supabase/functions/translate-picks/index.ts` (v2) and the `20260610_picks_title_original.sql` migration journal added. (The broader deployed-only inventory — scrapers etc. — remains the architecture audit's item #3.)

**Desktop width ladder extended (June 2026, owner request).** `--reading-max` gains 1440 ≥1680 and 1600 ≥1920 — a 1920 screen now carries 160px side margins instead of 320px. Swept 6 pages × {1680, 1920}: zero overflow, shell/chrome aligned (masthead spans the new widths). Per-block `ch` measures keep prose readable inside the wider shell.

**Performance + a11y pass (June 2026).** First Lighthouse run of the overhaul era, then two fixes: **MapLibre now lazy-loads after first paint** (`maplibre-loader.js`; `map-tiles.js` re-runs init on `wa:maplibre-ready`, and Discover's `syncMap` queues one re-sync via `MapTiles.onReady` — the old early-return left pins empty under lazy boot), and About's prose links gained underlines (the one a11y miss — color-only links). Scores after: **Today 95 · Discover 96 (was 79; TBT 340ms → ~0) · About 99 — accessibility/best-practices/SEO 100 everywhere.** Full reports regenerate via `npm run lighthouse` (summary committed, big JSONs gitignored). Known CLS ~0.11 on Today/About (banner/font arrival) is the remaining sub-threshold item. e2e's nav() also gained a one-retry guard for headless Chrome's transient `ERR_ABORTED` (it gates CI).

### VM tooling (reproduce the audit on any fresh container)

```bash
npm install            # puppeteer (bundled Chromium), sharp, lighthouse — all devDeps, no global installs
npm run verify         # structural gate: 8 pages × 3 widths — overflow / console errors / 44px floor
npm start &            # static server on :5173
npm run smoke          # 42 screenshots → .screenshots/smoke-{mobile,desktop,wide}-*.png
npm run e2e            # behavioural sweep (cards, taste cue, VT tagging, bookmarks)
npm run lighthouse     # perf audit (slow; separate on purpose)
```

Screenshots are read directly (multimodal) or diffed against `docs/screenshots/baseline/`. Console/page errors are captured by the harness itself (same noise filter in smoke/verify/e2e: sandbox cert blocks + dummy-JWT 401/403 ignored). For production fidelity (real Google-Places photos, live Supabase data) screenshot the Cloudflare branch preview: `npm run preview -- <branch-url>` — the script already carries the Chrome flags the sandbox needs (`--disable-quic`, ECH disables). No new dependencies are required for any of this; if pixel-diff automation is ever wanted, `pixelmatch` is the candidate — **ask before adding** (CLAUDE.md working rule).

### Audit findings (verified on screenshots + in CSS; ranked)

**F-1 · HIGH — hero scrim ramp fails long titles (venue detail, mobile).** `.detail-hero::before` runs `rgba(0,0,0,.74) → .4 @40% → 0 @75%`. A 3-line Fraunces title + meta + eyebrow stacked bottom-up pushes the title's upper lines into the <0.2-alpha zone — over a bright photo the white title drops below AA (visible in `smoke-mobile-venue-detail.png`). Fix in `styles.css` only: deepen/extend the ramp (≈ `.78 → .45 @50% → 0 @92%`) so the full text block sits in the ≥0.4-alpha zone; re-check the Tonight hero (`.tonight__hero`) uses the same corrected ramp. No markup change.

**F-2 · MEDIUM — Discover mobile list end-state.** (a) The Map/List FAB occludes the last list rows — the list needs bottom clearance ≥ FAB height + offset while the FAB is shown. (b) The mood-chip strip and the curator-quote rows cut hard at the right viewport edge with no scroll affordance — add an end-fade `mask-image` on the scroll strips (pure CSS, reuses no new tokens). Both visible in `smoke-mobile-discover-list.png`.

**F-3 · MEDIUM — ~50 off-grid spacing literals.** Measured: 9× `gap: 6px`, 5× `padding: 10px …`, 4× `padding: 0 6px`, 7× `margin-{left,right}: 6px`, plus one-offs (`9px 14px`, `8px 10px`…). Worst case is *derived-value drift*: `.discover-view-fab { bottom: calc(72px + var(--s-3)) }` hardcodes a 72px nav clearance while `--nav-h` is 68px. Sweep every literal to the nearest `--s-*` token and derive chrome offsets from `--nav-h`/tokens. Mechanical, but do it as one reviewed PR with a full smoke-diff — 1–2px visual shifts are expected and must be eyeballed.

**F-4 · MEDIUM — Saved page header/empty-state coherence.** The H1 is statically "Your reading list" while the active segment is **Going** (label mismatch reads as a bug), and the empty states are bare mono one-liners ("No upcoming events bookmarked.") while Today's `.picks-empty` sets the canon (city plate + title + sub + link). Unify: per-segment empty card reusing `.picks-empty`, and either a segment-neutral H1 ("Saved") or copy that names the page, not one tab.

**F-5 · LOW — CTA rule applied inconsistently.** The documented mobile rule (primary full-width, pair stacks) is implemented on Today + venue but Profile's `View reading list → / Export JSON` pair stays content-sized at 390. Decide once (recommendation: apply the rule — Profile is a touch page) and encode it in the shared button block rather than per-page actions.

**F-6 · LOW — Discover standfirst squeezed at 390.** The standfirst shares its row with the `VOUCHED BY HUMANS` eyebrow, cutting the measure to ~22ch with a dead right column. Below 768 the eyebrow should stack above the standfirst (the Today page already stacks its equivalent).

**F-7 · LOW — placeholder contrast.** `--c-faint` (#a1a1aa, 2.6:1) styles the search placeholder + glyph. Canonised as decorative-only in CLAUDE.md; strict WCAG readings count placeholders as text — move placeholder text to `--c-ink-mute` italic (6.6:1) and keep `--c-faint` for the glyph.

**F-8 · LOW — content shows through the glass bottom-nav at page end.** On short pages (empty Saved) the colophon renders behind the translucent nav pill (legible-but-cluttered). Bottom padding should guarantee the last content line clears `--nav-h` + safe-area at every page length.

### Below-the-fold & map-default addendum (June 2026 follow-up sweep)

A second pass with full-page captures + scrolled-to-bottom viewport shots at 1440 (`npm run scroll` — added with this sweep) and a probe of the Discover map's default framing. These ran against **live Supabase data** (real photos loaded), so F-10…F-13 are production content/render issues, not sandbox artifacts.

**F-9 · HIGH — map default framing is water-dominated, and Vilnius has no bounds entry.** The map boots by fitting `CITY_BOUNDS` (`map-tiles.js`), but the boxes extend deep into the sea: Tallinn `[[24.65,59.39],[24.86,59.49]]` fits to **zoom 10.88 on desktop / 9.62 mobile** with the Gulf of Finland filling most of the pane and the city core compressed into the bottom edge (Riga 10.69 similar; Helsinki's box also reaches past 60.2 into open water). Worse, **`CITY_BOUNDS` has no `vilnius` entry** — the city is live for internal testing, and `|| CITY_BOUNDS.tallinn` silently frames a Vilnius reader on Tallinn, 600 km away (same silent-fallback class as the `CITY_CONTEXT` bug that bit twice). Fix in `map-tiles.js`: land-weighted per-city default views (trim the north edges to the coastline, or store explicit `{center, zoom}` per city — city core should fill the pane at ~zoom 12+), add `vilnius`, and make an unknown city a loud console error, never a Tallinn fallback.

**F-10 · MEDIUM — fallback quote repeats on every row.** On `curator.html` and venue "more from", every pick lacking its own quote prints the curator's signature line ("The underground isn't a place. It's a posture.") — six identical quotes in a row reads as a rendering bug and dilutes the one line that's supposed to be the loudest thing on screen. Render the fallback once (page level, where it already lives in the curator header) and omit the per-row quote when it would repeat.

**F-11 · MEDIUM — identical thumbnails on consecutive rows.** Today's This Week tail shows six `@raul.reads` "Various venues" picks all carrying the **same photo**. `enrich-pick-images` skips non-spatial venues now, but legacy rows kept the photo it once assigned. Two-part fix: one-shot SQL nulling `image_url` where `venue ILIKE '%various%'` (the initials tile is the honest fallback), plus a render-side guard that drops to the initials tile when a thumb would duplicate its predecessor.

**F-12 · LOW — raw `other` neighborhood leaks into meta.** Rows print `other · gig · Thu` — a raw bucket value shown verbatim. `buildMeta` should omit the neighborhood segment when it's `other`.

**F-13 · LOW — venue "READ MORE" context renders raw markdown and truncates mid-sentence.** Seen live: "This isn't merely a chance to watch *Alcarràs" — a literal `*` from unprocessed emphasis, cut without an ellipsis. Strip/replace markdown emphasis in `context_md` rendering and truncate on a word boundary with `…`.

**F-14 · FIXED (June 2026) — desktop masthead nav floated as a ~468px island and the active tab sat off-baseline.** Two CSS defects: `.nav`'s `margin: 0 auto` shrink-wrapped it as a body-flex item (the declared `max-width: var(--reading-max)` never engaged — `width: 100%` was missing), so the bar floated mid-page instead of spanning the shell like the topbar/banner/page; and the desktop active-item selector outranked the base sizing rule, inheriting the mobile pill's 12px/6px padding/gap — the active tab rendered 47px vs its neighbours' 55px, knocking labels off the shared baseline (the "Profile not aligned" report). Both fixed in `styles.css`; masthead now spans `--reading-max`, left-aligned with content edges, all items 55px on one baseline. Regression guard: V-9 baseline diff catches both classes.

**F-15 · MEDIUM — Discover desktop filter rail and sort placement (proposal).** The stacked rail (quick pills → mood strip → FILTERS → CATEGORY → NEIGHBORHOOD → DISTANCE → SORT radio) consumes the top ~900px of the results column before the first event row, and the time dimension appears twice (Tonight/This week pills *and* the rail). Proposal, in order of preference: (a) at ≥1280 promote the rail to a true third column — `rail | results | map` — so results start at the top of their column; or (b) collapse CATEGORY/NEIGHBORHOOD/DISTANCE into compact dropdown-pills on one row above the results (the pattern Airbnb/Booking settled on). Independent of (a)/(b): SORT is a view control, not a filter — move it out of the rail onto the results-count line as a compact right-aligned "Sort: Relevance ▾", and merge the duplicated time controls. Chip size stays 32px (Material spec) — the win is placement and grouping, not scale.

**F-16 · MEDIUM — Today page scale & alignment rhythm pass.** Element sizing on the main page drifts: the mono eyebrow/section-label runs, section subs, and right-aligned counts ("83 more in Discover") don't share one consistent scale step or baseline with their left-side counterparts ("Browse all this week →"); This Week thumbnails differ in size from the same picks' Discover card thumbs; the digest input + Subscribe button pair don't share a height. One pass, token-only changes: every label on the 11/12px mono steps, left link + right count on one baseline per section rule, thumbs on the shared `.thumb--lg` size, input/button pair equalized at the 44px control height.

**F-17 · LOW — Profile + About polish pass.** Profile: the CTA pair (View reading list → / Export JSON) is the F-5 inconsistency — apply the mobile full-width-stack rule; equalize the password input and Update button to the same control height and width rhythm; section spacing onto the `--s-*` ladder where off-grid. About reads clean (ch measures hold; link cards aligned) — verify-only, no change expected.

### Deep-read addendum (June 2026 — end-user usability pass; full write-up in `docs/audits/ux-audit-2026-06.md`)

A second, journey-level read of the same screenshot corpus. Headline: **the filter→result feedback loop is broken on desktop** — activating Tonight at 1280×900 leaves the results count, the matching row, and the map pin all below the fold while the map shows open water (`smoke-desktop-discover-tonight.png`). This compounds F-9 + F-15 and re-ranks them to the front of Phase 1. New findings:

**F-18 · MEDIUM — curator bio renders at 142ch per line** (measured 1136px @16px at 1280) against the 56–64ch rule. One-line fix: `max-width: 64ch` on `.curator-profile__bio`; sweep other long-form blocks (V-13 gates it).

**F-19 · MEDIUM — curator `Share →` is 73×27px and invisible to the harness.** Under the 44px floor, and its selector isn't in verify's committed TAP_SELECTORS, so the suite can't regress-catch it. Fix the control, add the selector, and add the generic ≥44px sweep (V-14) so unlisted controls can't hide again.

**F-20 · LOW — place page is a dead end.** Kind label duplicated (eyebrow `GALLERY` + sub "Gallery"), two adjacent map links with indistinguishable labels ("Open in maps ↗" external vs "See on map →" internal), ~85% dead white below the fold. Reuse `.picks-empty` for the no-events state, disambiguate the link labels, show the neighborhood.

**F-21 · LOW — concierge promise without a labeled affordance.** The standfirst sells "let the concierge match your night"; the only entry is an unlabeled sparkle glyph (the product's single "generic AI app" tell). Label it "Concierge" at least ≥768px.

**F-22 · LOW — Discover control weight inverted.** Search field ~1216×64 (heaviest element, secondary action), scope toggle next (once-per-session action), while the actual workhorses (time/category filters) are the smallest. Folds into the F-15 redesign as its sizing principle: control weight proportional to use frequency.

Suite additions: **V-11** filter feedback in viewport (count + ≥1 row + ≥1 pin at 1280×900 after activating Tonight) · **V-12** map default frame (per-city zoom ≥ ~11.5, city core in frame, every live city in `CITY_BOUNDS`) · **V-13** no prose block > 70ch · **V-14** generic interactive-control ≥44px sweep with exemption list.

### Execution phases (each lands with its regression assertion)

| Phase | Scope | Findings | Exit criterion |
|---|---|---|---|
| **0 · Tooling** (done, this session) | deps installed on VM, verify green 24/24, fresh 42-shot smoke set, baseline extended to the audit surfaces | — | `npm run verify` exits 0; baseline in `docs/screenshots/baseline/` |
| **1 · Legibility & a11y** | **journey first (deep-read re-rank):** F-9 map defaults + F-15 result visibility, then scrim ramp, placeholder contrast, glass-nav clearance, bio measure, Share control | F-9, F-15, F-1, F-7, F-8, F-18, F-19 | V-11 + V-12 pass; new verify assertion: overlaid hero text box ⊂ scrim ≥0.4-alpha zone; placeholder color ≥4.5:1 |
| **2 · Grid sweep** | all off-grid literals → `--s-*`; FAB offset derived from `--nav-h` | F-3 | `grep -E ':\s*[0-9]*(6|10|14|18)px' styles.css` count = 0 (chips' Material paddings whitelisted); smoke-diff reviewed |
| **3 · Component unification** | Saved header + empty-card canon, Profile CTA rule, Discover standfirst stack, FAB clearance + scroll-strip fade | F-2, F-4, F-5, F-6 | scenarios V-5…V-8 below pass |
| **4 · Baseline refresh & hardening** | replace intentionally-changed baselines, add the new assertions to `verify.js`/`e2e.js`, re-run Lighthouse | — | verify + e2e green; baseline README updated |

One working rule carries over unchanged: **make only the targeted change per PR** — no adjacent refactors riding along, and `npm run verify` + a smoke-diff on every one.

### E2E UI/UX validation suite (visual assertions)

Scenarios V-1…V-4 are already automated (verify.js / e2e.js); V-5…V-10 are the audit's additions — run them via the smoke set + baseline diff until Phase 4 encodes them as code assertions. Baseline screenshots: `docs/screenshots/baseline/` (10 original + 3 added by this audit: `smoke-mobile-saved`, `smoke-mobile-profile`, `smoke-mobile-venue-detail`).

| # | Surface · viewport | Steps | Visual assertion | Harness |
|---|---|---|---|---|
| V-1 | all 8 public pages · 390/768/1440 | load, settle 1.5s | no horizontal overflow; no real console/page errors; every committed control ≥44px | `verify.js` (automated, CI-gating) |
| V-2 | Discover/Saved/Curator/venue/place · 390 | load with live or static catalog | photo-forward `.list-row--card` renders on all five pick-list surfaces; initials tile when no `image_url` | `e2e.js` (automated) |
| V-3 | index→venue · 390 | tap a This Week card | clicked `.thumb` carries `view-transition-name: venue-hero`; detail hero morph target present | `e2e.js` (automated) |
| V-4 | Discover/Saved/Curator · 390 | seed taste profile, load | one "· tuned to you" cue per surface, linking to `index.html#taste-onboarding`; no per-card badges | `e2e.js` (automated) |
| V-5 | venue detail · 390, pick with 3-line title | load `venue.html?id=<long-title pick>` | every overlaid white text pixel-row sits where scrim alpha ≥0.4; eyebrow/title/meta legible over the brightest photo in the catalog | smoke shot `mobile-venue-detail` vs baseline → Phase-1 code assertion |
| V-6 | Discover · 390, Events, no filters | scroll list to end | last `.list-row` fully visible above the FAB; mood strip + curator rows show end-fade affordance when scrollable | smoke shot `mobile-discover-list` → Phase-3 assertion |
| V-7 | Saved · 390, zero bookmarks | open each segment | each empty segment renders the `.picks-empty` card pattern (plate + title + sub), not a bare mono line; H1 doesn't contradict the active segment | smoke shot `mobile-saved` (baselined this audit) |
| V-8 | Profile · 390, signed in | load with dummy session | primary CTA full-width, secondary stacked beneath (post-F-5); toggle row ≥44px | smoke shot `mobile-profile` (baselined this audit) |
| V-9 | Today ↔ Discover ↔ Saved ↔ Profile · 768/1440 | navigate via masthead | content left edges align across pages (shared `--reading-max` ladder); topbar/nav morph, no flicker | smoke `desktop-*`/`wide-*` set vs baseline |
| V-10 | Today · 390, reduced-motion emulated | `prefers-reduced-motion: reduce` | no entrance offset, lime rule at `scaleY(1)`, no VT animation — page identical to settled state | manual/Phase-4 (`page.emulateMediaFeatures`) |

Pass criteria for the suite as a whole: verify 24/24, e2e green, and zero unexplained baseline diffs. A diff is either a regression (fix it) or an intentional change (replace the baseline in the same PR, per `docs/screenshots/README.md`).

---

## 1. Architectural Gaps & Technical Debt

**Repo ↔ production drift is the #1 structural risk.** The repo holds 15 edge functions; production runs more (`archive-stale`, `rotate-tonight`, `geocode-picks`, `enrich-pick-images`, `ingest-telegram`, `ingest-hanzas-perons`, `ingest-echo-gone-wrong`, `ingest-hel-linkedevents`, `classify-moods`, …) that exist **only deployed**. Instrumenting the scrapers in June required pulling live source from Supabase to edit it — there is no review, no history, no rollback for those functions. The migrations directory is a *journal*, not a bootstrap: changes are applied to the DB first via MCP, files written after, and some contain one-shot backfills — replaying them on a fresh project would not reproduce production. Until the deployed-only functions are committed, every edit to them is a production hotfix.

**Pick identity is coupled to source message numbering.** `picks.id = channel-message_id` means a correction posted as a *new* message mints a new identity. The dedup cron (`wa_dedup_active_picks`) is a compensating control, not a fix — and it has a real edge: if two users bookmarked *different* twins of the same event, one user's bookmark now points at an archived pick and Saved will render it as "no longer listed" even though the event is alive under the surviving twin. Low frequency, but it's a correctness hole in the bookmark contract.

**Script-tag ordering is the module system, and nothing enforces it.** `buildMeta` is hand-copied into **5** page scripts, the photo-thumb markup into **5**, `bookmarkSVG` into 3, the taste-nudge helpers into 3, `esc()` into 2, and `KIND_MAP` is duplicated between `discover.js` and `map.js` "by convention". The failure class is proven: `taste.js` was simply missing from `saved.html` and the feature silently no-op'd until June. No build step is a sound constraint; *no shared `ui-helpers.js` script* is not — one more `<script defer>` tag costs nothing and collapses the 5-way copies.

**Detail pages render on a single event with no guard.** `curator.js` and `venue.js` render **only** on `wa:catalog-ready`; `place.js` alone has the init-if-data-already-present guard. Worse, their document-level listeners are bound inside `render()`, so adding the guard naively risks double-binding. Restructure (bind once at module scope) before touching init.

**Append-only CSS is order-dependent by design.** All redesign deltas live in override blocks at the end of `styles.css` (5,794 lines, one file). The desktop-FAB-visible bug was exactly this class of failure: a `@media` hide rule defined *before* the base rule it had to beat. Each new block at the end raises the chance of the next one.

**Scrapers fail silently into "ok".** Every ingest function parses HTML with hand regexes (brittle is accepted), but a source markup change yields *zero parsed events* with `ingest_log.status='ok'`. There are no fixtures to test parsers against and no zero-yield alert. A dead source looks identical to a quiet week.

**Lifecycle machinery now spans 6 crons + 7 instrumented scrapers + per-source flags** (`archive-stale`, `rotate-tonight`, `reset-tonight`, `wa-dedup-picks`, `wa-purge-archived`, `wa-reconcile-absent` + `bumpSeen` in every snapshot scraper + `sources.reconcile_absences`). It's individually sound and collectively undocumented as a system — the reconcile's dry-run→enforce flip is an untracked memory item with no runbook.

---

## 2. UX & State Management Friction

**HIGH — Saved's "no longer listed" can fire falsely offline, with a destructive Dismiss.** `supabase.js` dispatches `wa:catalog-ready` *even when the live fetch fails and the static fallback is used* (by design, so pages render). Saved's change-watch diffs bookmarks against whichever catalog loaded — so on a flaky connection the static catalog (~170 entries vs ~1,000 live) makes **every live bookmarked pick** render as a "no longer listed" gone-row, and its Dismiss button **permanently unbookmarks**. Fix: expose a `WA.DATA_LIVE` flag from `supabase.js` and gate gone-detection (not the time-changed badges) on it; consider an undo on Dismiss regardless.

**Change-watch only fires when the user opens Saved.** A night-of cancellation goes unseen unless they happen to check; the digest is weekly. This is a deliberate no-push brand stance — but the digest email is the one sanctioned channel and doesn't yet include "your saved events changed". That's the gap worth closing, not notifications.

**localStorage is a junk drawer with three naming conventions.** Nine keys across `wa:` (`wa:city`, `wa:saved-snapshots`), `wa-` (`wa-taste-prefs`, `wa-taste-onboarded`, `wa-match-feedback`, `wa-match-seen`, `wa-admin-*`) and `wanderalt:*:v1` (`bookmarks`, `session`). Only the last family is versioned. Any shape change to snapshots or taste prefs has no migration story — it will just silently misparse.

**Bookmark cloud sync is fire-and-forget.** No retry, no conflict resolution beyond last-write-wins per id, and a failed `deleteCloud` leaves a ghost row that resurrects the bookmark on the next `syncFromCloud`. Acceptable at current scale; will generate "my bookmark came back" reports eventually.

**Discover re-filters on every keystroke with no debounce.** `run()` does full `keywordFilter` over the catalog plus map sync per input event. Fine at ~1,000 picks; it is the first thing that will jank as cities multiply. A 150 ms debounce preserves the feel and removes the cliff.

**Two split-brain conventions confuse deep-linking.** Mood lives in the URL *hash* (`#mood=`, owned by `mood-chips.js`) while every other filter is a search param — documented, but it means copied links behave differently for mood. And the map is empty-until-filtered in Events but shows-all in Places; each is defensible alone, together they teach the user two opposite mental models of the same pane.

---

## 3. Scope Creep & Complexity Risks

**Per-city cost is ~7 touchpoints with no enforced checklist.** A new city needs: `city.js` entry, plate SVG, `catalog.js` static seed, `process-staging` `CITY_CONTEXT` entry, `sources` rows, scraper(s), neighborhood whitelist. The `CITY_CONTEXT` omission *silently degrades to Tallinn context* and has bitten twice (Vilnius, then Helsinki — ~1,900 misrejected messages). Either make a missing city entry a hard error in `process-staging`, or commit a NEW-CITY checklist; the silent-degrade default is the worst of the options.

**`catalog.js` (3,563 lines) grows linearly with cities.** The static fallback ships to every visitor on every page. Vilnius alone added a venue seed. Decide the fallback's contract now — "enough to render something" (cap per city) vs "full mirror" (move to a fetched JSON with cache, defeating its offline purpose). Unbounded growth in a render-blocking-adjacent script is the dead-end.

**One bespoke regex scraper per venue website is linear maintenance.** Ten ingest functions already; each new venue site adds a parser someone must fix when the markup shifts. The Fienta/Linked-Events pattern (structured APIs) is the sustainable shape; HTML scrapers should be the exception that earns its keep, not the default for every "verified, NOT yet wired" source in CLAUDE.md.

**Two OG code paths for one feature.** The Pages middleware (real venue photo) supersedes the Satori `og-image` card for any pick with a photo; the edge function remains as fallback. Fine — but it's two render paths, two failure modes, and the Satori path has already silently 401'd once (verify_jwt flip). Candidate for retirement once photo coverage is near-total.

**`admin.js` is a 2,216-line monolith with the service key pasted into localStorage.** Accepted as a desktop tool for one trusted operator; it should never grow features faster than that assumption holds.

**Test-suite self-healing hides data nondeterminism by design.** The e2e suite re-derives IDs when the live/static catalog flips mid-run. Right call for CI stability — but it means a green run cannot tell you *which* data source it exercised. Keep the suite honest by logging the source it ran against.

---

## 4. Missing Context Real-Estate

What a contributor cannot currently find anywhere in the repo, in priority order:

1. **DB schema reference** — tables, columns, RLS policies, triggers, SQL functions. The dead `picks_autopin_trigger` broke every insert fleet-wide for weeks precisely because no doc said it existed. One generated `docs/db-schema.md` (or committed `supabase db dump --schema-only`) ends the per-session `information_schema` spelunking.
2. **Deployed-function inventory** — name, version, `verify_jwt`, in-repo? A drift map. Three scrapers and at least six other functions exist only in production; nothing lists them.
3. **The deployed-only function sources themselves** — commit them. This is the single highest-leverage missing artifact.
4. **localStorage key registry** — key, owner file, shape, versioning policy. Nine keys, three conventions, zero documentation.
5. **Reconcile enforce runbook** — the criteria for flipping `wa_reconcile_absent_picks` to enforce (candidate count stable for N days, spot-check sample_ids), who flips it, and the rollback (`archive_reason='source_absent'` rows are reversible).
6. **Scraper fixtures** — one saved HTML/JSON sample per source, so parser changes are testable offline and a zero-yield run can be distinguished from a markup change.
7. **Docs ownership map** — which file is canonical for what. README/ROADMAP/CLAUDE/HANDOFF have already drifted apart once (the never-deployed "Gemini 3.5 Flash" survived in two files after CLAUDE.md was corrected). One paragraph per doc stating "canonical for X, summary of Y" prevents the next drift.
8. **Per-page error-state matrix** — bad `?id`, network fail, JS off. `<noscript>` shipped June 2026; bad-id copy and behavior still vary by page.

---

## Ranked remediation

**P0 — correctness (do first):**
- ~~Gate Saved's gone-detection on a live-data flag (`WA.DATA_LIVE`); add undo to Dismiss.~~ **DONE June 2026** — `supabase.js` exposes `WA.DATA_LIVE`; gone-rows render only against live data; Dismiss leaves an 8-second Undo that restores bookmark + snapshot.
- ~~Commit the deployed-only edge functions to the repo.~~ **DONE June 2026** — all 30 functions are now committed under `supabase/functions/` and in sync with production (spot-checked: the instrumented scrapers carry their `bumpSeen`/`last_seen_at` changes; append-stream sources like `ingest-telegram` correctly carry none). Repo is the source of truth again; no more editing live source to make a change.

**P1 — structural (next):**
- ~~Extract shared `ui-helpers.js` — one script tag, no build step.~~ **DONE June 2026** — `WA.UI` carries `esc`/`buildMeta`/`isEchoQuote`/`bookmarkSVG`/`thumb`/`rowMedia`; six page scripts alias from it. The extraction immediately caught real drift: venue.js's `buildMeta` had silently missed the F-12 guard. (Taste helpers not extracted — 3 small copies, lower churn.)
- ~~Hard-fail `process-staging` on a missing `CITY_CONTEXT` entry.~~ **DONE June 2026** — v39 (deployed + committed) marks such messages `error` with an actionable rejection instead of silently classifying against the Tallinn context.
- ~~`docs/db-schema.md` + deployed-function inventory.~~ **DONE June 2026** — `docs/db-schema.md` generated from production (17 tables, 24 RLS policies, 3 triggers, 12 SQL functions, 30 crons; notes that `sources`/`staging_messages`/`ingest_log` are RLS-enabled with zero policies, i.e. service-role-only). Regenerate on schema change; don't hand-edit.

**P2 — resilience:**
- ~~Zero-yield alerting on ingest.~~ **DONE June 2026** — central SQL check `wa_ingest_zero_yield_check()` (cron `wa-ingest-health`, daily 06:10 UTC; migration `20260611_ingest_zero_yield_health.sql`): flags any `ingest-%` fn whose 3 most recent ok-runs all yielded 0 inserted + 0 skipped, as one `fn='ingest-health', status='warn'` row the admin pipeline panel surfaces. No per-scraper redeploys needed.
- ~~Debounce Discover's `run()` (150 ms).~~ **DONE June 2026.**
- ~~Reconcile enforce runbook; flip to enforce only after the dry-run count stabilizes.~~ **DONE + ENFORCED June 2026** — `docs/reconcile-enforce-runbook.md`. Dry-run converged (233 → 220 → 116 → 8 → 8); the cron is now `wa_reconcile_absent_picks(true, 3)` for the web scrapers. **Fienta excluded** after spot-checking the 8 stable candidates against the live feed exposed false positives (Starbenders/Napalm Death still listed but flagged) — root cause: `ingest-fienta` under-processes its feed (~2 of ~13 events/run), so its `last_seen` signal is unreliable. See the new **"ingest-fienta under-processing" finding** below; re-enable Fienta in the reconcile only after that's fixed.

**P3 — hygiene:**
- ~~localStorage key registry.~~ **DONE June 2026** — `docs/localstorage-registry.md`: all 11 keys, owner/shape/versioning, plus the rules (new keys `wa:` + versioned).
- ~~Restructure curator/venue init.~~ **DONE June 2026** — curator's document-level listeners (bookmark change + `wa:bookmarks-synced`) moved to module scope (they stacked a duplicate pair per re-render); both pages gained the place.js-style init-if-data-present guard.
- ~~Decide `catalog.js`'s per-city cap.~~ **DECIDED June 2026** — the fallback's contract is "enough to render something": **≤40 picks + ≤12 venues per city** for every city added from here on. Current seed: Tallinn 158 picks (grandfathered pending an editorial trim — choosing survivors is editorial work), Riga 7, Helsinki 4; venues ≤7 everywhere. Enforce on addition, not retroactively.

---

## New findings (June 2026 — from the reconcile-enforce investigation)

**1. `ingest-fienta` under-processes its feed (HIGH — active data loss).** Evidence: the Fienta org feeds list ~13 future events each, but only ~2 active Fienta picks get their `last_seen_at` bumped per run, and two **currently-listed** events (Starbenders 02.07, Napalm Death 17.11) were flagged stale by the reconcile while still present in `fienta.com/o/paavli-kultuurivabrik?format=json`. `ingest_log` shows `status='ok'` with `inserted` 0–2/day, so the zero-yield health check doesn't catch it (it's low-yield, not zero). Root cause not yet confirmed — candidates: the per-event `bumpSeen` PATCH not matching live picks, events being filtered out of `fetchSourceEvents` before `bumpSeen`, or process-staging having minted multi-slug ids that `bumpSeen`'s single-id key (`channel-message_id`) can't hit. **Next step: add one debug line to `bumpSeen` (log pid + PATCH row count), run `ingest-fienta` once, inspect.** Do NOT ship a blind fix to a live ingest function. Fienta is excluded from the reconcile until this is resolved (see `docs/reconcile-enforce-runbook.md`).

**2. Fienta picks carry `day=null` + a synthetic `valid_until` (MEDIUM — data quality).** The 8 stale candidates all have `day=null` and an identical `valid_until=2026-08-14` (a generic ~90-day fallback), so their real event date is unknown and they never expire on time. Symptom of process-staging not extracting a date from the Fienta `starts_at` for some events. Worth a pass once #1 is understood — they're likely the same root cause (events that slipped through with bad date parsing in the May backfill).

**3. The zero-yield health check has a blind spot.** `wa_ingest_zero_yield_check()` flags *0* inserted+skipped, but `ingest-fienta` demonstrates a source can be *low-yield-broken* (2 of 13) while logging `ok`. Consider a per-source "expected vs actual event count" sanity signal, or have scrapers log `parsed`/`processed` (not just `inserted`) so a collapse from 13→2 is visible.

---

## Explicitly NOT building (unchanged)

These would dilute the brand. Listed so the next person knows the answer is no without asking.

- ❌ **Comments / replies on picks.** This is a paper, not a forum.
- ❌ **Star ratings or any 5-point UI.** Voice ≠ rating.
- ❌ **Push notifications.** Interruption is the opposite of editorial. (The weekly digest is the sanctioned channel — extend *it*.)
- ❌ **Trending / popular sort.** Curator-curated, not algorithm-curated.
- ❌ **"For you" personalised feed.** Same. (The taste nudge stays a quiet secondary sort, never a feed.)
- ❌ **Multi-language UI.** Maybe at 10× the audience; not now.
- ❌ **Generic admin dashboard with charts.** Admin should look like the rest of the app.
- ❌ **Onboarding tour / coachmarks.** If the app needs explaining, it's wrong.

**Summer 2026 design explorations (updated June 11 post-WWDC 2026 — proposals, owner to pick):**

*WWDC 2026 context (June 8–9; iOS 27 dev beta 1 — researched via MacRumors' iOS-27/WWDC roundups + 9to5mac's iOS-27 guide on June 11):* a "Snow Leopard"-style refinement year — performance and cleanup over visual overhaul. The design facts that matter to us: **Liquid Glass was tuned for readability** (sharper, more detailed icon rendering; a user-facing **translucency-level slider**; more **depth/separation** in nav bars, menus and buttons); search and assistant merged into one **"Search or Ask"** surface (Siri lives in the Dynamic Island, replacing Spotlight); **extra-large widgets** (Calendar/Photos/Music); app-level redesigns (Music artist pages, Screen Time) and a changed Notification-Center access pattern that promptly ate "broke 15 years of muscle memory" coverage; iPadOS 27/macOS 27 get design parity. Net read for WanderAlt: Apple is *refining glass for legibility, not expanding it* — our three-surface restraint is the current pattern, and the items below follow the same grain. (Re-verified June 11 after the quota reset — the icon story confirmed: iOS 27 integrates **additional Liquid Glass layers directly into icon artwork**, the refraction between layers making icons sharper and fixing iOS 26's blurry icons; users get a 'Clear' icon look via Home Screen edit; the updated HIG auto-applies to apps on the Liquid Glass framework. This validates the layered two-file Beacon master in `brand/masters/icon-layered/` as exactly the right prep — the lime diamond is the refractive layer. Sources: TechTimes, BGR, Cult of Mac WWDC-26 coverage.)

- ~~**`prefers-reduced-transparency` on the three glass surfaces**~~ **SHIPPED June 2026** — the media query swaps all three glass surfaces to their solid fallbacks with a stronger hairline; the web analog of iOS 27's translucency slider.
- ~~**Chrome separation micro-pass**~~ **SHIPPED June 2026** — `--glass-hair` 0.08→0.10 (0.16 under reduced transparency); facet popover already carried `--c-rule-strong`.
- **"Search or Ask" — pattern validated, keep the surface unified** *(note, no work).* iOS 27 merges search + assistant into one field — exactly Discover's search box with the in-field Concierge toggle. Recorded so a future session doesn't split them into separate surfaces.
- ~~**Icon ladder: sharpness audit + layered master**~~ **SHIPPED June 2026** — and the audit caught a real shipping bug: `brand/favicon/favicon.svg` had lost its `<style>` block and rendered BLACK in browser tabs (classes with no fills); fixed with explicit petrol/lime fills, ladder verified legible at 16/32/48/64. `brand/masters/icon-layered/` added (background tile + foreground diamond + README) feeding both Apple's layered-icon pipeline and Android adaptive icons.
- **Native-shell readiness ledger** *(new — owner direction: future iOS/Android apps on top of this web app).* Already native-shaped: bottom tab nav (≈ UITabBar / M3 nav bar), the docked List|Map segmented pill (shipped June 2026), card→hero View Transitions (≈ matched-geometry transitions), self-hosted fonts, manifest + full icon ladder, no-tracking posture. To plan for the shells, not the web app: an **extra-large "Tonight" widget** (the hero pick is a born XL widget — iOS 27 just expanded that tier), Saved "Going" as a **Live Activity** candidate (user-initiated, arguably compatible with the no-push stance — owner call needed), per-platform layered icons (previous item). Principle: web stays the product; native = thin shell + widgets, never a fork.
- **Muscle-memory caution, recorded:** even Apple took flak this cycle for changing the Notification-Center gesture. Our navigation-pattern changes stay baseline-gated and one-per-PR.
- ~~**Per-city category chips**~~ **SHIPPED June 2026 (early)** — `renderCatChips` now offers only categories/kinds with matches in the current city's data (selected ones always keep their chip; full list shown until data loads).
- ~~**Digest "your saved events changed" section**~~ **SHIPPED June 2026** — server-side design settled and implemented: `digest_opt_ins.user_id` (captured at opt-in when signed in), `pick_changes` day/time journal (trigger `picks_log_change`, purged at 60 days via `wa-purge-pick-changes`), and `send-digest` **v11** composing the per-recipient block (changed = journal in 7-day window; "no longer listed" = archived_at in window). Anonymous opt-ins get the unchanged digest; fail-open. v11 also fixed `GEMINI_MODEL` from the nonexistent `gemini-3.5-flash` (every weekly intro had silently 404'd to the static fallback) to `gemini-2.5-flash`. Migration `20260611_digest_changed_events_foundation.sql`.
- Curator "Reading lately" weekly synthesis (below) remains the strongest editorial idea on the shelf.
- *(Shipped from the original list: the docked List|Map toggle, June 2026 — the FAB-era corner button is gone.)*

Still-open product ideas that survived the old Tier 2/3 (kept for the record, unranked): curator weekly synthesis ("Reading lately" on `curator.html`), chrono-pin map, lineage edges, time-traveled briefing.

---

*Last rewritten June 2026 — converted from the May tier/sprint roadmap into a weak-point audit after the photo-card / taste / lifecycle wave shipped.*
