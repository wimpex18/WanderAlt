# WanderAlt — Architecture audit & roadmap (June 2026)

A strict weak-point audit of the codebase, data layer, and docs, followed by a ranked remediation list. Written so a future contributor (or model) can act without re-deriving decisions. Read `README.md` for product context, `HANDOFF.md` for the engineering reference, `CLAUDE.md` for working conventions. This file replaces the May 2026 tier/sprint roadmap — everything in those tiers either shipped (see README → Roadmap → Built) or moved to "Explicitly NOT building" below.

---

## Framing (unchanged — protects every decision below)

WanderAlt's soul is **curator voice** rendered as **editorial minimalism**: *curator voice is the largest element on screen.* Time, not feed. Voice, not metadata. Reading, not browsing. Any remediation that dilutes this is worse than the debt it fixes.

LLM policy is canonical in `CLAUDE.md` → "LLM model policy" (Groq-first, gated Gemini fallback, embeddings on `gemini-embedding-001`). It is deliberately NOT restated here — that's how the "Gemini 3.5 Flash" doc-drift happened.

---

## Frontend & UI/UX visual audit (June 2026) — CLOSED

The screenshot-driven visual audit of every public surface at 390/768/1440 (findings **F-1…F-22**) is **fully closed** — all 22 shipped June 2026, plus the follow-up passes (English-only content pipeline, the `--reading-max` desktop width ladder, and the Lighthouse perf/a11y pass: Today 95 · Discover 96 · About 99, a11y/BP/SEO 100). The per-finding detail lives in `docs/audits/` (dated per-surface critiques) and in README → Roadmap → Built; the V-1…V-14 visual-assertion suite + the VM reproduction steps live in `docs/screenshots/README.md`. Method in one line: `npm run verify` (structural gate — overflow / console / 44px floor) + `npm run smoke`/`e2e` against `docs/screenshots/baseline/`, or `npm run preview -- <branch-url>` for production fidelity (real photos, live data).

---

## 1. Architectural Gaps & Technical Debt

**Repo ↔ production drift is the #1 structural risk.** The repo holds 15 edge functions; production runs more (`archive-stale`, `rotate-tonight`, `geocode-picks`, `enrich-pick-images`, `ingest-telegram`, `ingest-hanzas-perons`, `ingest-echo-gone-wrong`, `ingest-hel-linkedevents`, `classify-moods`, …) that exist **only deployed**. Instrumenting the scrapers in June required pulling live source from Supabase to edit it — there is no review, no history, no rollback for those functions. The migrations directory is a *journal*, not a bootstrap: changes are applied to the DB first via MCP, files written after, and some contain one-shot backfills — replaying them on a fresh project would not reproduce production. Until the deployed-only functions are committed, every edit to them is a production hotfix. *(P0 remediation shipped June 2026 — all 30 functions now committed; see "Ranked remediation" below.)*

**Pick identity is coupled to source message numbering.** `picks.id = channel-message_id` means a correction posted as a *new* message mints a new identity. The dedup cron (`wa_dedup_active_picks`) is a compensating control, not a fix — and it has a real edge: if two users bookmarked *different* twins of the same event, one user's bookmark now points at an archived pick and Saved will render it as "no longer listed" even though the event is alive under the surviving twin. Low frequency, but it's a correctness hole in the bookmark contract.

**Script-tag ordering is the module system, and nothing enforces it.** `buildMeta` is hand-copied into **5** page scripts, the photo-thumb markup into **5**, `bookmarkSVG` into 3, the taste-nudge helpers into 3, `esc()` into 2, and `KIND_MAP` is duplicated between `discover.js` and `map.js` "by convention". The failure class is proven: `taste.js` was simply missing from `saved.html` and the feature silently no-op'd until June. No build step is a sound constraint; *no shared `ui-helpers.js` script* is not — one more `<script defer>` tag costs nothing and collapses the 5-way copies. *(P1 shipped June 2026 — `WA.UI` extracted; the six main render helpers are now single-impl.)*

**Detail pages render on a single event with no guard.** `curator.js` and `venue.js` render **only** on `wa:catalog-ready`; `place.js` alone had the init-if-data-already-present guard. Their document-level listeners were bound inside `render()`, so adding the guard naively risks double-binding. *(P3 shipped June 2026 — curator/venue listeners moved to module scope + guarded.)*

**Append-only CSS is order-dependent by design.** All redesign deltas live in override blocks at the end of `styles.css` (5,800+ lines, one file). The desktop-FAB-visible bug was exactly this class of failure: a `@media` hide rule defined *before* the base rule it had to beat. Each new block at the end raises the chance of the next one.

**Scrapers fail silently into "ok".** Every ingest function parses HTML with hand regexes (brittle is accepted), but a source markup change yields *zero parsed events* with `ingest_log.status='ok'`. There are no fixtures to test parsers against. *(A zero-yield alert shipped June 2026 — `wa_ingest_zero_yield_check()` — but it has a blind spot for low-yield-broken sources; see "New findings" below.)*

**Lifecycle machinery now spans 6 crons + 7 instrumented scrapers + per-source flags** (`archive-stale`, `rotate-tonight`, `reset-tonight`, `wa-dedup-picks`, `wa-purge-archived`, `wa-reconcile-absent` + `bumpSeen` in every snapshot scraper + `sources.reconcile_absences`). It's individually sound and collectively documented only in `docs/reconcile-enforce-runbook.md` for the enforce flip — the rest of the system's interplay is still tribal.

---

## 2. UX & State Management Friction

**Saved's "no longer listed" gone-detection** now gates on `WA.DATA_LIVE` (P0, June 2026) so a flaky-connection static fallback no longer marks every live bookmark as gone, and Dismiss carries an 8-second Undo. Remaining friction:

**Change-watch only fires when the user opens Saved.** A night-of cancellation goes unseen unless they happen to check; the digest is weekly. This is a deliberate no-push brand stance — the digest email is the one sanctioned channel, and `send-digest` v11 now includes a "your saved events changed" block (June 2026). Anonymous opt-ins get the unchanged digest.

**localStorage is three naming conventions** (`wa:`, `wa-`, `wanderalt:*:v1`) — now catalogued in `docs/localstorage-registry.md` (11 keys, owner/shape/versioning). Only the `wanderalt:*:v1` family is versioned; shape changes to the unversioned keys still have no migration story.

**Bookmark cloud sync is fire-and-forget.** No retry, no conflict resolution beyond last-write-wins per id, and a failed `deleteCloud` leaves a ghost row that resurrects the bookmark on the next `syncFromCloud`. Acceptable at current scale; will generate "my bookmark came back" reports eventually.

**Two split-brain conventions confuse deep-linking.** Mood lives in the URL *hash* (`#mood=`, owned by `mood-chips.js`) while every other filter is a search param — documented, but copied links behave differently for mood. And the map is empty-until-filtered in Events but shows-all in Places; each is defensible alone, together they teach two opposite mental models of the same pane.

---

## 3. Scope Creep & Complexity Risks

**Per-city cost is ~7 touchpoints with no enforced checklist.** A new city needs: `city.js` entry, plate SVG, `catalog.js` static seed, `process-staging` `CITY_CONTEXT` entry, `sources` rows, scraper(s), neighborhood whitelist. The `CITY_CONTEXT` omission *silently degraded to Tallinn context* and bit twice (Vilnius, then Helsinki — ~1,900 misrejected messages) — now a hard error in `process-staging` v39 (June 2026). The rest of the per-city checklist is still uncommitted tribal knowledge.

**`catalog.js` (3,563 lines) grows linearly with cities.** The static fallback ships to every visitor on every page. The fallback's contract is now "enough to render something": **≤40 picks + ≤12 venues per city** for every city added from here (June 2026), enforced on addition, not retroactively (Tallinn's 158 is grandfathered pending an editorial trim).

**One bespoke regex scraper per venue website is linear maintenance.** Ten ingest functions already; each new venue site adds a parser someone must fix when the markup shifts. The Fienta/Linked-Events pattern (structured APIs) is the sustainable shape; HTML scrapers should be the exception that earns its keep, not the default.

**Two OG code paths for one feature.** The Pages middleware (real venue photo) supersedes the Satori `og-image` card for any pick with a photo; the edge function remains as fallback — two render paths, two failure modes, and the Satori path has already silently 401'd once (verify_jwt flip). Candidate for retirement once photo coverage is near-total.

**`admin.js` is a 2,216-line monolith with the service key pasted into localStorage.** Accepted as a desktop tool for one trusted operator; it should never grow features faster than that assumption holds.

**Test-suite self-healing hides data nondeterminism by design.** The e2e suite re-derives IDs when the live/static catalog flips mid-run. Right call for CI stability — but a green run can't tell you *which* data source it exercised. Log the source it ran against.

---

## 4. Missing Context Real-Estate

Most of the June-2026 gaps below are now filled — `docs/db-schema.md` (schema reference), `docs/backend-and-pipeline.md` (deployed-function inventory + pipeline), `docs/localstorage-registry.md`, `docs/reconcile-enforce-runbook.md`, and the deployed functions committed under `supabase/functions/`. Still open:

- **Scraper fixtures** — one saved HTML/JSON sample per source, so parser changes are testable offline and a zero-yield run can be distinguished from a markup change.
- **Docs ownership map** — which file is canonical for what (README/ROADMAP/CLAUDE/HANDOFF drifted apart once — the never-deployed "Gemini 3.5 Flash" survived in two files after CLAUDE.md was corrected). CLAUDE.md's doc index is the current answer; keep it honest.
- **Per-page error-state matrix** — bad `?id`, network fail, JS off. `<noscript>` shipped June 2026; bad-id copy and behaviour still vary by page.

---

## Ranked remediation — CLOSED

**All P0-P3 items shipped June 2026** and are noted inline in §1-3 above: WA.DATA_LIVE gone-detection + Dismiss undo; the 30 edge functions committed; `ui-helpers.js` (`WA.UI`) extraction; `process-staging` `CITY_CONTEXT` hard-fail (v39); `docs/db-schema.md` + deployed-function inventory; zero-yield ingest health check; Discover `run()` debounce; the reconcile enforce runbook (dry-run converged, now enforced for web scrapers — Fienta excluded, see below); `docs/localstorage-registry.md`; curator/venue init restructure; and the `catalog.js` per-city cap. The remaining open work is in "New findings" below.

---

## New findings (June 2026 — from the reconcile-enforce investigation)

**1. `ingest-fienta` under-processes its feed (HIGH — active data loss).** Evidence: the Fienta org feeds list ~13 future events each, but only ~2 active Fienta picks get their `last_seen_at` bumped per run, and two **currently-listed** events (Starbenders 02.07, Napalm Death 17.11) were flagged stale by the reconcile while still present in `fienta.com/o/paavli-kultuurivabrik?format=json`. `ingest_log` shows `status='ok'` with `inserted` 0–2/day, so the zero-yield health check doesn't catch it (it's low-yield, not zero). Root cause not yet confirmed — candidates: the per-event `bumpSeen` PATCH not matching live picks, events being filtered out of `fetchSourceEvents` before `bumpSeen`, or process-staging having minted multi-slug ids that `bumpSeen`'s single-id key (`channel-message_id`) can't hit. **Next step: add one debug line to `bumpSeen` (log pid + PATCH row count), run `ingest-fienta` once, inspect.** Do NOT ship a blind fix to a live ingest function. Fienta is excluded from the reconcile until this is resolved (see `docs/reconcile-enforce-runbook.md`).

**2. Fienta picks carry `day=null` + a synthetic `valid_until` (MEDIUM — data quality).** The 8 stale candidates all have `day=null` and an identical `valid_until=2026-08-14` (a generic ~90-day fallback), so their real event date is unknown and they never expire on time. Symptom of process-staging not extracting a date from the Fienta `starts_at` for some events. Likely the same root cause as #1 (bad date parsing in the May backfill).

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

---

## Design explorations shelf (proposals, owner to pick)

WWDC 2026 read: a refinement year — Apple *refined* Liquid Glass for legibility (sharper layered icons, a user-facing translucency slider, more nav depth), it didn't expand it. Our three-surface glass restraint matches the grain, and the layered Beacon master in `brand/masters/icon-layered/` (background tile + refractive lime diamond) is the right prep for iOS 27's layered-icon pipeline + Android adaptive icons.

- **"Search or Ask" — keep the surface unified** *(note, no work)*. iOS 27 merges search + assistant into one field — exactly Discover's search box with the in-field Concierge toggle. Recorded so a future session doesn't split them.
- **Native-shell readiness ledger** *(owner direction: future iOS/Android shells on this web app)*. Already native-shaped: bottom tab nav, the docked List|Map segmented pill, card→hero View Transitions, self-hosted fonts, manifest + full icon ladder, no-tracking posture. To plan for the shells (not the web app): an **extra-large "Tonight" widget** (the hero pick is a born XL widget), Saved "Going" as a **Live Activity** candidate (user-initiated — arguably compatible with the no-push stance, owner call), per-platform layered icons. Principle: web stays the product; native = thin shell + widgets, never a fork.
- **Muscle-memory caution:** even Apple took flak for changing the Notification-Center gesture this cycle — our navigation-pattern changes stay baseline-gated, one-per-PR.

Still-open product ideas (unranked, kept for the record): curator weekly synthesis ("Reading lately" on `curator.html`, the strongest editorial idea on the shelf), chrono-pin map, lineage edges, time-traveled briefing.

*Shipped from the shelf June 2026: `prefers-reduced-transparency` fallbacks on the three glass surfaces, the chrome-separation micro-pass, the icon sharpness audit + layered master, per-city category chips, the digest "your saved events changed" section, and the docked List|Map toggle (the FAB-era corner button is gone).*

---

*Last rewritten June 2026 — converted from the May tier/sprint roadmap into a weak-point audit after the photo-card / taste / lifecycle wave shipped. Closed frontend-audit + remediation trackers collapsed to pointers July 2026.*
