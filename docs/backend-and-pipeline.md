# Backend & pipeline reference

Encyclopedic detail relocated out of `CLAUDE.md` (which is now contracts-only). Read on demand — not every turn. Covers: file map, Discover internals, the ingest pipeline + source matrix, and per-edge-function LLM status. Conventions/contracts stay in `CLAUDE.md`; this is the "how it actually works today" reference.

## File map

| File | Role |
|---|---|
| `index.html` / `briefing.js` | Briefing — Tonight hero + This Week. Pure read; taste onboarding banner. |
| `discover.html` / `discover.js` | **Discover** — unified search/filter/map (replaced Search + Map). See Discover internals below. |
| `discover-redirect.js` | Loaded by `map.html`/`search.html` redirect stubs; maps legacy params → Discover URL. |
| `map.js` / `map-tiles.js` / `map-style.json` / `map-venues.js` | Pin overlay+clustering+detail panel (`WA.MapView`); MapLibre basemap (`WA.MapTiles`, OpenFreeMap); custom editorial style; category defs (`WA.MAP_CATEGORIES`). |
| `maplibre-loader.js` | Lazy-loads MapLibre after first paint; fires `wa:maplibre-ready` (perf pass, June 2026). |
| `saved.html` / `saved.js` | Going / Reading / Past. **Change-watch:** snapshots bookmarks in `wa:saved-snapshots`, flags `time changed` / "no longer listed" gone-rows (Dismiss→unbookmark, 8s Undo). Gone-detection gated on `WA.DATA_LIVE` (never against the static fallback). On-device only. |
| `venue.html` / `venue.js` | Pick detail — quote, venue, context, "more from curator" (`.list-row--card`s). Loads view-transition.js. Back-link preserves Discover filters. |
| `place.html` / `place.js` | Standalone venue page — name/kind/neighborhood/social glyphs + upcoming picks at venue. |
| `curator.html` / `curator.js` | Curator profile — bio + all picks as photo cards + taste nudge. Init-if-data-present guard + listeners bound at module scope. |
| `profile.html` / `profile.js` | Account — bookmarks, digest, export, delete. |
| `about.html` | Static editorial — About/Curators/Venues/Privacy/Contact, one scroll. |
| `admin.html` / `admin.js` | Admin panel — pick/venue CRUD, pipeline monitor, column approval, pin editor. Desktop tool; service key in localStorage. |
| `catalog.js` | Static fallback catalog. `WA._catalogAll`/`_curatorsAll` (all cities) + `WA.catalog`/`curators` (city slice). supabase.js replaces with live data. Per-city cap: ≤40 picks / ≤12 venues for new cities. |
| `supabase.js` | Live fetcher; exposes `WA.BASE_URL`/`WA.ANON_KEY`/**`WA.DATA_LIVE`**; fires `wa:catalog-ready` (even on fetch failure → static fallback). |
| `auth.js` | Email/password + Google OAuth; `wa:signed-in`/`wa:signed-out`. |
| `bookmark.js` | localStorage primary + Supabase cloud sync; `wa:bookmarks-synced`. |
| `taste.js` | Taste onboarding (energy/company/money). `WA.taste.tasteScore` re-orders 4 surfaces (Today This Week, Discover Relevance, Saved Reading, Curator picks) as a stable secondary sort — curation primary, 0-score = no reorder. "· tuned to you" cue links to `index.html#taste-onboarding`. On-device only. |
| `ui-helpers.js` | **Shared render helpers** `WA.UI`: `esc`/`buildMeta`/`isEchoQuote`/`bookmarkSVG`/`thumb`/`rowMedia`. Loads right after catalog.js on content pages; page scripts alias — never hand-copy. |
| `city.js` / `mood-chips.js` / `share.js` / `view-transition.js` / `taste-flag.js` | City switcher + banner; `#mood=` hash filter; share/`.ics` helper (`WA.Share`); card→hero View Transition; pre-paint taste-onboarded flag. |
| `styles.css` | All styles; every decision a `:root` var. |
| `functions/_middleware.js` | Cloudflare Pages Function — rewrites per-pick/curator OG meta server-side. Fail-open. Inert under local http-server. |
| `_headers` / `_redirects` | Cloudflare config (HSTS/CSP/cache; apex/www + legacy aliases). No bare→`.html` rules (loop). |
| `brand/` · `assets/<city>-overview.svg` | Brand kit (`brand/BRAND.md`) + city plates (banner ribbon + selector thumbs). |

## Discover internals

- **Bottom nav:** Today · Discover · Saved · Profile (home id stays `data-page="briefing"`).
- **Events vs Places** scoped toggle (`state.type`) — picks vs venues. Places = all alt-culture venues (`WA.VENUE_KINDS`), social-glyph rows only (no photos/quote), pins shown immediately. Events = photo cards, empty-until-filtered map.
- **URL schema:** `?type=events|places&q=&view=list|map&time=tonight|thisweek|all&cat=&nhood=&within=5|15|30&sort=&id=<pick>&ai=&mode=match`. `#mood=` is hash-owned by mood-chips.js (do not unify). `within` = walking-radius (geolocation + haversine ~80m/min, Events+Places). Sort: Events relevance(+taste nudge)/newest; Places featured/nearest.
- **Map:** MapLibre GL 5.24.0 (CDN-pinned discover+admin) + OpenFreeMap. Pins projected from `picks.lat/lng` via `WA.MapTiles.project()`. Empty when no filter active. `WA.MapView`: `setFilters`/`setPlaces`/`render`/`fitView`/`focusPin`/`closeDetail`/`isReady`. `WA.MapTiles`: `init`/`project`/`unproject`/`fitToPicks`/`flyTo`/`on`/`onReady`/`resize`/`getMap`. Events: `wa:map-pin-changed`, `wa:mood-changed`.
- **Desktop ≥1024px** = 3-col CSS-grid split (filter rail 236px · list · sticky map; `view` ignored). Filters = the persistent rail (fieldsets open under mono eyebrows, live-apply; When + Mood are events-only). Mobile = bottom sheet (+ Filters / Apply, same facets) + a List|Map seg docked in the bottom glass chrome (July 2026 — the floating FAB is retired).
- **Coords:** `picks.lat/lng`, `picks.address`, `picks.coords_source` ∈ {nominatim, google_places, venue_join, manual}, `picks.coords_locked` (admin override; cron skips). Admin pin editor = draggable MapLibre marker → reverse-geocode via `geocode-picks {action:'reverse'}`.
- popstate fully restores state without reload.

## Supabase pipeline

**Flow:** `ingest-* → staging_messages → process-staging (every 30m, upsert onConflict id) → picks → enrich-images → geocode-picks → enrich-venues → classify-moods → embed-picks → rotate-tonight (04:05) → archive-stale → wa-dedup-picks (04:30) → wa-purge-archived (04:45)`.

**Pre-release cadence (applied 2 Jul 2026, provider-strategy P0):** three high-frequency crons were dialled down while the app has no users — `wa-process-staging` `*/30 * * * *`→`12 * * * *` · `embed-picks-auto` `*/30 * * * *`→`40 6,12,18,23 * * *` · `wa-geocode-picks` `20 * * * *`→`20 5 * * *`. Restore at launch with: `select cron.alter_job(jobid, schedule => '<old>') from cron.job where jobname = '<name>';` using the old schedules above. Spend caps still owner-console-only (not settable via API): Groq console spend limit, Google Cloud budget alert ≤€5 — set + note here when done.

**Crons own the schedule** (`cron.job`) — only touch if asked. Healthy crons invoke via `public.invoke_wa_fn(fn)` (sends anon Bearer); a raw `net.http_post` with no Authorization header 401s against `verify_jwt:true` functions (fixed June 2026 for hel-linkedevents + generate-context). `wa-ingest-health` (06:10) flags any `ingest-%` fn whose 3 latest ok-runs all yielded 0.

**Pick lifecycle:** `archived_at` soft-archives (app reads `archived_at IS NULL`); `archive_reason` ∈ {duplicate, source_absent, …}. `wa_dedup_active_picks()` archives exact dups (same city·venue·title·day·time), keeps richest/bookmarked twin. `wa_reconcile_absent_picks(p_enforce,p_grace_days)` flags future-dated picks gone stale via `picks.last_seen_at` (scrapers `bumpSeen()` every crawl) — only sources flagged `sources.reconcile_absences=true`. **Currently DRY-RUN** (see `docs/reconcile-enforce-runbook.md`); Fienta excluded. Staging upserts MUST use `?on_conflict=channel,message_id` or duplicates 409 and `bumpSeen` never runs (the June 2026 under-processing bug).

**Adding a source:** insert a `sources` row (`enabled=true`, `feed_url`/`channel`/`curator_handle`). Telegram/RSS/Fienta need no code change. **Any new city MUST get a `process-staging` `CITY_CONTEXT` entry** or it silently degrades to the Tallinn context (the bug that lost ~1,900 Helsinki + all Vilnius messages).

### Source matrix (24 rows · ~20 enabled)

| Kind | City | Channel(s) | Cron |
|---|---|---|---|
| telegram | tallinn | sigmundtells, proEesti | wa-ingest-telegram 02:15 |
| rss | tallinn | giadafromgamma (`@raul.reads`) | wa-ingest-rss morning/evening 09+17 |
| fienta | tallinn | paavli-kultuurivabrik, 15 (Von Krahl) | wa-ingest-fienta 04:00 |
| web | tallinn | telliskivi | wa-ingest-telliskivi 03:45 |
| telegram | helsinki | helsinkievents, otaniemievents, ayyevents | wa-ingest-telegram |
| web | helsinki | hel-linkedevents (Linked Events API) | wa-ingest-hel-linkedevents 03:50 |
| telegram | riga | notboring_riga, AfishaRiga | wa-ingest-telegram |
| web | riga | kinobize, splendidpalace, hanzasperons, echogonewrong | wa-ingest-{kinobize 03:30, splendidpalace 03:35, hanzas-perons 03:50, echo-gone-wrong 03:55} |
| telegram | vilnius | afishavilnius | wa-ingest-telegram |
| web | vilnius | ra-vilnius (`ingest-ra`) | **hand-invoke only** (RA ToS — no cron) |
| osm | all 4 | — | wa-ingest-osm Mon 03:30 (venues) |

Disabled/dormant: hel_nocturnes, kaisa_writes, mattias_v, raul_reads (Telegram placeholders), udgstriga (dormant).

### Gotchas & settled decisions (do not re-raise)
- **echogonewrong** needs a real desktop Safari UA (Cloudflare 403s default UAs) — copy the `BROWSER_UA` pattern. It's an RSS feed (items age off) → excluded from absence-reconcile.
- **hel-linkedevents** is municipal open data, ~40% off-brand noise — filtered by `SKIP_VENUE_PATTERNS` (location.name) + `SKIP_PATTERNS` + `pipeline_config.skip_keywords` (checked before the LLM, free). Don't add the bare `lapsi` term (Finnish-compound false positives).
- **ingest-osm** loops a `CITIES` map (4 cities, per-city try/catch), captures `contact:website/facebook/instagram`. Overpass rate-limited; retries next tick.
- **RA cron** will NOT be scheduled (ToS). **Vilnius** runs on the in-house editorial desk (feeds attributed per-card, honest umbrella note on Today via `HOUSE_DESK_CITIES`); no resident curator is being recruited. `city.js` is `'live'` for internal testing.
- **English-only:** `process-staging` v38 + `translate-picks` (hand-invoke) enforce English titles/quotes; source title kept in `picks.title_original`.
- Riga: `@kseniakamikaza` added as curator (manual seeding only); kanepes.lv / naba.lv / lcca.lv etc. investigated, none viable (no machine-readable feed).

## LLM model policy — per-function status

Policy (Groq-first, gated Gemini fallback, no grounding, embeddings on `gemini-embedding-001`) is canonical in `CLAUDE.md`. Current versions:

- **Groq:** primary `meta-llama/llama-4-scout-17b-16e-instruct`, fallback `llama-3.3-70b-versatile`.
- **Gemini:** `gemini-2.5-flash` / `-2.5-flash-lite` only. URL `…/v1beta/models/gemini-2.5-flash:generateContent?key=…`.
- **Gemini text fallback retired 2 Jul 2026:** `pipeline_config.gemini_fallback_enabled=false` — process-staging / generate-context / draft-column now run Groq-only (their Gemini code paths are dormant, kept for an emergency re-flip). Next fallback lane per the new policy = OpenRouter `:free` / Cerebras, pending an owner-created key.
- `process-staging` (v38+) → Groq primary; Gemini fallback DISABLED (see above). ~100% Groq in practice. Holds the `CITY_CONTEXT` map.
- `generate-context` (v11) → Groq primary, Gemini `2.5-flash-lite` fallback. Only picks with `context_md IS NULL`.
- `draft-column` (v14) → Groq primary, Gemini `2.5-flash-lite` fallback. Weekly 140-word column.
- `send-digest` (v11) → Gemini `2.5-flash` (low volume). Composes the "your saved events changed" block from `digest_opt_ins.user_id` + `pick_changes`.
- `match-pick` (v8) → ranking on Groq only (`find_many`, topK=5); embeddings on `gemini-embedding-001`.
- `embed-picks` (v3, 2 Jul 2026) → **outage found + fixed**: v2 diffed embedded ids client-side into one giant `id=not.in.(…)` URL; past ~500 embeddings the URL blew the HTTP/2 header limit and the fn 500'd on every cron tick from ~12 Jun (496/516 active picks unembedded — the concierge was silently degraded). v3 uses the `wa_picks_missing_embeddings` anti-join RPC; backfill run 2 Jul embedded 303, the 4×/day cron drains the rest (free-tier 429s just defer to the next run).
- `enrich-venues` → no LLM, no paid API (Wikidata + Nominatim + a homepage og:image scrape).
- `geocode-picks` → Nominatim only. `enrich-images` → Wikidata/Wikimedia only (populates `picks.image_url`). Both free/unauthenticated.
- **Provider revision proposal (Jul 2026):** the free-tier AI + places/events strategy (Overture-based `discover-venues` rebuild, OpenRouter fallback lane, Gemini 3.x pin refresh, cron dial-down, spend caps) is in `docs/provider-strategy-jul26.md` — proposal only, nothing applied yet.
- **Google Places retired (Jul 2026):** `GOOGLE_PLACES_API_KEY` was removed after an uncapped-retry bug (`geocode-picks`, `enrich-venues`, and the old `enrich-pick-images` re-billed Places every cron tick for venues it could never resolve) produced an unexpected ~€45 charge. `geocode-picks`/`enrich-venues`/`enrich-images` all stamp a `*_failed_at` cooldown column on a pick/venue so an unresolvable one is skipped for 14 days instead of retried every run. `enrich-pick-images` is dormant (cron unscheduled).
- **`discover-venues` v2 (2 Jul 2026) — Overture-backed, Google-free:** the admin venue search now queries the local **`places_index`** table (1,895 alt-culture venues across the 4 cities, extracted from the Overture Maps places theme June 2026 release, filtered to the WA kind vocabulary, confidence ≥ 0.55) via the `wa_search_places_index` pg_trgm RPC. Zero external calls, zero keys, all 4 cities (incl. Vilnius). Saves pending-review picks with `discovery_source='overture_index'` + real lat/lng (`coords_source='venue_join'`). Refresh procedure for newer Overture releases → `supabase/functions/load-places-index/README.md`.
