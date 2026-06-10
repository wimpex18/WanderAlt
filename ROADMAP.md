# WanderAlt — Architecture audit & roadmap (June 2026)

A strict weak-point audit of the codebase, data layer, and docs, followed by a ranked remediation list. Written so a future contributor (or model) can act without re-deriving decisions. Read `README.md` for product context, `HANDOFF.md` for the engineering reference, `CLAUDE.md` for working conventions. This file replaces the May 2026 tier/sprint roadmap — everything in those tiers either shipped (see README → Roadmap → Built) or moved to "Explicitly NOT building" below.

**Numbers cited below were measured on 2026-06-09**, on a tree of ~15,600 first-party JS/CSS lines: `styles.css` 5,794 · `catalog.js` 3,563 · `admin.js` 2,216 · `discover.js` 1,310 · `map.js` 680 · `briefing.js` 604.

---

## Framing (unchanged — protects every decision below)

WanderAlt's soul is **curator voice** rendered as **editorial minimalism**: *curator voice is the largest element on screen.* Time, not feed. Voice, not metadata. Reading, not browsing. Any remediation that dilutes this is worse than the debt it fixes.

LLM policy is canonical in `CLAUDE.md` → "LLM model policy" (Groq-first, gated Gemini fallback, embeddings on `gemini-embedding-001`). It is deliberately NOT restated here — that's how the "Gemini 3.5 Flash" doc-drift happened.

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
- Gate Saved's gone-detection on a live-data flag (`WA.DATA_LIVE`); add undo to Dismiss.
- Commit the deployed-only edge functions to the repo.

**P1 — structural (next):**
- Extract shared `ui-helpers.js` (`buildMeta`, thumb/media markup, `bookmarkSVG`, taste helpers, `esc`) — one script tag, no build step.
- Hard-fail `process-staging` on a missing `CITY_CONTEXT` entry.
- `docs/db-schema.md` + deployed-function inventory.

**P2 — resilience:**
- Zero-yield alerting on ingest (`inserted+skipped === 0` → `status='warn'` + surface in admin pipeline panel).
- Debounce Discover's `run()` (150 ms).
- Reconcile enforce runbook; flip to enforce only after the dry-run count stabilizes.

**P3 — hygiene:**
- localStorage key registry + converge on one prefix for new keys.
- Restructure curator/venue init (bind listeners once; add the place.js-style guard).
- Decide `catalog.js`'s per-city cap before city #5.

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

Still-open product ideas that survived the old Tier 2/3 (kept for the record, unranked): curator weekly synthesis ("Reading lately" on `curator.html`), chrono-pin map, lineage edges, time-traveled briefing.

---

*Last rewritten June 2026 — converted from the May tier/sprint roadmap into a weak-point audit after the photo-card / taste / lifecycle wave shipped.*
