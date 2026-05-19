# WanderAlt — Claude Code instructions

Static site for underground/alternative culture in European cities. First city: Tallinn. Curated by humans, not algorithms — **curator voice is the loudest thing on every screen.**

For deeper context, read these on demand (do NOT auto-import — they bloat context):
- `README.md` — product overview, deploy instructions, current roadmap
- `HANDOFF.md` — engineering reference (tokens, components, state matrices, per-page specs)

## Project overview

- **Stack:** static HTML + CSS + vanilla JS. **No build step, no framework.**
- **Backend:** Supabase (REST + Edge Functions + pg_cron). Project ID `aqnsmmbrspkbfcvougeh`, region `eu-central-1`.
- **Anon key:** in `supabase.js` (public on purpose — RLS is SELECT-only for tables, INSERT only for `bookmarks` and `digest_opt_ins`).
- **Service role key:** never commit. Set as env var `SUPABASE_SERVICE_ROLE_KEY` in cloud env, or paste into admin panel localStorage locally.
- **Canonical mobile viewport:** 390×844. Desktop breakpoint: **768px** (bottom nav → top masthead; content caps at 680px). Quote scales again at 1100px.

## Key commands

```bash
npm start          # local dev server at http://localhost:5173 (npx http-server, no cache)
npm run admin      # admin panel server at http://localhost:8080
```

There is no test suite. Verify changes by opening `localhost:5173` (or `localhost:8080/admin.html`) in a browser and inspecting visually — or by reading the rendered DOM via Chrome MCP.

Deploy edge functions via the Supabase MCP `deploy_edge_function` tool — never via `supabase functions deploy` CLI (the user doesn't have it installed).

## File map

| File | Role |
|---|---|
| `index.html` / `briefing.js` | Briefing — editorial landing (Tonight hero + This Week list). Pure read; no filter UI. |
| `discover.html` / `discover.js` | **Discover** — unified search/filter/map surface. Replaces the old Search + Map pages. |
| `discover-redirect.js` | Loaded by the `map.html` and `search.html` redirect stubs; maps legacy params → Discover URL. |
| `map.js` | Pin overlay + clustering + detail panel. Exposes `window.WA.MapView` API; embedded inside Discover's map pane. Pin positions projected via `WA.MapTiles.project(lng, lat)`. |
| `map-tiles.js` | MapLibre GL basemap. OpenFreeMap vector tiles, custom editorial style (see `map-style.json`). Exposes `window.WA.MapTiles` API used by `map.js`. |
| `map-style.json` | Custom MapLibre style file — newsprint cream land, muted petrol water, off-white roads, JetBrains-style labels. |
| `map-venues.js` | Category definitions (`WA.MAP_CATEGORIES`) — shared by map.js and discover.js chip rendering. |
| `map-world.js` | Legacy illustrated Tallinn SVG generator. **Not loaded by any HTML page** since the May 2026 admin migration to MapLibre — kept on disk solely as the source for `.scripts/regen-overview-svgs.js`, which produces `assets/tallinn-overview.svg` for the city-selector dropdown. Safe to delete once that overview SVG is captured as a static asset. |
| `map.html` | 5-line redirect stub → `discover.html?view=map` (preserves `?id`, `?day`, `?mood` legacy params). |
| `search.html` | 5-line redirect stub → `discover.html` (preserves `?q`, `?mode=match` legacy params). |
| `saved.html` / `saved.js` | Going / Reading / Past segments |
| `venue.html` / `venue.js` | Pick detail page — quote, venue, context, more from curator. Back-link returns to full Discover URL (filters preserved). |
| `curator.html` / `curator.js` | Curator profile — bio + all picks |
| `profile.html` / `profile.js` | Account — bookmarks, digest, export, delete |
| `admin.html` / `admin.js` | Admin panel — pick/venue CRUD, pipeline, column approval, enrichment |
| `catalog.js` | Static fallback catalog. Exposes the raw multi-city list as `WA._catalogAll` / `WA._curatorsAll` and the city-filtered slice as `WA.catalog` / `WA.curators` (read from localStorage `wa:city` since city.js loads after this file). `WA.past` too. supabase.js replaces these with live data when the network responds. |
| `supabase.js` | Live data fetcher; exposes `WA.BASE_URL` + `WA.ANON_KEY`; fires `wa:catalog-ready` |
| `auth.js` | Email/password + Google OAuth, password reset; dispatches `wa:signed-in` / `wa:signed-out` |
| `bookmark.js` | localStorage primary store + Supabase cloud sync; fires `wa:bookmarks-synced` |
| `taste.js` | Taste-profile onboarding (energy/company/money axes); exposes `WA.taste.matchParams()` |
| `city.js`, `mood-chips.js` | Small shared utilities (city switcher, mood-tag filter via `#mood=…` hash) |
| `styles.css` | All styles. Every design decision lives as a `:root` CSS variable. |
| `brand/` | **Canonical brand kit** — SVG masters for tile/wordmark + favicon ladder + PWA/iOS/Android icons + social cards + city-plates v2 docs. Start at `brand/BRAND.md` for palette/type/lockup rules + § 5 city-plates two-mark rule; `brand/IMPLEMENTATION.md` for integration notes; `brand/city-plates.html` for the design preview. Do NOT inline brand colors; use the `--c-accent` (petrol) / `--c-lime` tokens which match the canonical OKLCH literals 1:1. |
| `assets/<city>-overview.svg` | **City plates** (Tallinn, Helsinki, Riga). 1800×1200 illustrated SVGs used as 80×60 thumbnails in the city-selector dropdown AND as a 64 px decorative ribbon (`.city-banner`) injected by `city.js` below the topbar on every content page. The active city is stamped on `body[data-city]` so the banner background swaps when the user switches city. Spec: `brand/BRAND.md` § 5 (two-mark rule — one national flag + one lime accent, never the same element). |
| `manifest.webmanifest` | PWA web manifest. References `brand/pwa/*.svg`. Theme color `#055959` (petrol). |

## Visual conventions (Claude cannot infer these)

- Strictly left-aligned. **No centered blocks.**
- No gradients, no box-shadows, max corner radius 4px.
- Section dividers are **1px horizontal rules**, never background changes or large gaps.
- Single primary accent: petrol `#055959` (`--c-accent`) — handles, arrows, hover, focus rings, logo tile, map detail quote bar, locate-fab "on" state, admin pin marker. Signal lime `#d2dc50` (`--c-lime`) is reserved for live/active state highlights (Tonight badge, active segment count, logo diamond). The older oxblood `#8a2a1a` accent has been fully retired from app code — any remaining mentions are in `map-world.js` (legacy illustrated SVG, only used by admin pin-placement tool) and doc comments.
- Background: warm newsprint `#f6f3ec`, never pure white.
- **Curator quote is the largest element on every screen** — larger than venue name or photo. Voice is the product.
- All tokens live in `:root` in `styles.css`. Do not introduce new CSS variables without asking.
- Real photos via `image_url` when available, CSS halftone fallback otherwise. Never use external image URLs that bypass the `image_url` flow.

## Content conventions

- **Real Tallinn places only:** Sveta Baar, Fotografiska, Paavli Kultuurivabrik, Kai Art Center, Uus Laine, Kelm, EKKM, Lugemik, Telliskivi, etc. No fake venues, no marketing-voice copy.
- **Curator handles** always start with `@` and match the Telegram channel slug exactly: `@sigmundtells` (URL `t.me/sigmundtells`), `@notboring_riga` (URL `t.me/notboring_riga`), `@katestrelca`, etc. The May 2026 normalisation migration retired the legacy bare-handle exception; `curator.js` keeps back-compat for old `?handle=sigmundtells` URLs by auto-prefixing `@` on lookup miss.
- **Metadata format:** `Neighborhood · type · day + time`.
- **Editorial voice:** no em-dashes in headlines, no exclamation marks, no "discover", no marketing voice. Reads like the back page of a newsletter.

## Brand identity (Beacon · v2 · May 2026)

The mark is a **petrol squircle tile with a centered lime diamond**. One mark, no system. Full spec in `brand/BRAND.md` — read it before touching anything that renders the logo.

- **Canonical colors:** petrol `oklch(0.42 0.07 195)` / `#055959`, lime `oklch(0.86 0.16 113)` / `#d2dc50`. Already live as `--c-accent` / `--c-lime` in `styles.css`.
- **Canonical proportions:** tile `rx = 0.18 × side` (iOS squircle), diamond side = `0.20 × tile side`, diamond `rx = 0.12 × diamond side`. The CSS `.logo-mark` in `styles.css:163` is hand-tuned to these ratios at 26 px — do NOT change the 26/5/5/1 px figures without re-deriving from spec.
- **Two wordmark variants:** primary (`brand/masters/wordmark.svg` — Geist 600 lockup) for product chrome; editorial (`wordmark-editorial.svg` — italic "Alt.") for marketing only. Never use editorial in nav.
- **Theme color:** all HTML files declare `<meta name="theme-color" content="#055959" />`. Mobile browser chrome tints petrol.
- **Favicons / app icons:** referenced from `brand/favicon/` and `brand/pwa/` via `<link>` tags + `manifest.webmanifest`. SVG-only currently (universal support in 2026). PNG/ICO rasterizations are a follow-up if older browsers need them — pipeline TBD.
- **OG / Twitter cards:** `brand/social/og-default.svg` (1200×630) and `twitter-default.svg` (1200×675). Wired into `index.html` and `venue.html`.
- **Do not introduce a third color.** Two-tone for a reason. `--c-accent` (petrol) is the only accent; `--c-lime` is signal-only.

## Working rules

- When asked for a visual change, **make only that change** — do not refactor adjacent code.
- Don't add CSS variables, npm packages, or dependencies without asking.
- Keep `README.md` updated when structure or feature scope changes.
- Always end a session with **2–3 short "next step" suggestions** so the user knows what's left.

## Supabase pipeline — token-efficient rules (CRITICAL)

The user is on a constrained plan. Polling burns quota and accomplishes nothing.

- **Never poll.** Do not fire repeated `net.http_post` calls. Do not check `staging_messages` more than once per assistant turn.
- **Fire once, then stop.** Trigger a cron / edge function, tell the user "queue is draining, check back in ~10 min", and end the turn.
- **Health checks are one-shot queries:**
  ```sql
  -- queue depth
  SELECT status, COUNT(*) FROM staging_messages GROUP BY status;
  -- active picks
  SELECT COUNT(*) FROM picks WHERE archived_at IS NULL;
  -- recent ingest results
  SELECT fn, status, inserted, rejected, error, finished_at
    FROM ingest_log ORDER BY id DESC LIMIT 5;
  ```
- **Crons own the schedule.** `process-staging` runs every 30 min; `ingest-telegram` nightly at 02:15 UTC; `generate-context` at 02:30; `enrich-venues` at 03:30; `send-digest` Saturday 09:00 UTC. Only touch a schedule if the user asks.
- **Edge function versions:** deploy via Supabase MCP, confirm the returned version number, then stop. Do not test-fire manually in a loop.

## Discover page — architecture notes

`discover.html` is the canonical discovery surface. It replaced `search.html` and the standalone `map.html`. Key facts for any future work:

- **Bottom nav:** 4 items — Briefing · Discover · Saved · Profile. All five HTML pages share this nav.
- **URL schema:** `?q=&view=list|map&time=tonight|thisweek|all&cat=music,drink&nhood=Kalamaja&mood=&sort=relevance|newest|title|curator&id=<pick-id>&ai=<prompt>&mode=match`
  - `?id=` is the active pin — written on pin tap, restored on load, persists across filter changes.
  - `#mood=…` is owned by `mood-chips.js` (hash, not search param) — do not unify.
- **Basemap:** MapLibre GL JS + OpenFreeMap (free, no API key, OSM vector tiles). Custom editorial style at `map-style.json`. Pins are positioned by projecting `picks.lat/lng` to container pixels via `WA.MapTiles.project(lng, lat)`. Picks without lat/lng don't render on the map but still appear in the list pane.
- **Empty by default:** the map renders NO pins when no filter is active. UX decision — at city zoom 100+ pins is unscannable. Picking Tonight / This week / Free / a category / a mood / a search term immediately populates pins. The `#map-empty-hint` overlay communicates the empty state.
- **Pick coords:** stored on `picks.lat` / `picks.lng`. `picks.address` is the postal address (used as a secondary check + shown in the detail panel). `picks.coords_source` ∈ {`nominatim`, `google_places`, `venue_join`, `manual`}. `picks.coords_locked = true` means admin overrode the coords; the nightly cron skips locked rows.
- **`geocode-picks` cron** (`wa-geocode-picks`, hourly at :20): calls the `geocode-picks` edge function. It selects picks with NULL lat/lng OR NULL address and either forward-geocodes (Nominatim → Google Places fallback) or reverse-geocodes coords-only rows. Skips locked rows. Filters out non-spatial venue names (`%various%`, `%multiple%`, `%online%`, `%popup%`).
- **`geocode-picks` reverse action** (v4+): `POST {action: 'reverse', lat, lng}` returns the resolved postal address. Admin pin editor calls this so the browser never hits Nominatim directly — single User-Agent identity, OSM usage policy respected, editor IPs hidden.
- **`enrich-pick-images` cron** (`wa-enrich-pick-images`, hourly at :40): for each active pick with NULL `image_url`, calls Google Places API Text Search to find the venue, then fetches a CDN photo URL via the Places media endpoint. ~$0.039 per unique venue. Skips "Various venues" / "Multiple" / "Online" / "Popup" entries (no fixed location → no representative photo).
- **Admin pin editor** (`admin.html` pick modal): MapLibre mini-map with a draggable petrol marker. Dragend writes lat/lng to the form; reverse-geocoded address is displayed for sanity checking. "Lock coords" checkbox sets `coords_locked = true` so cron doesn't undo manual placements.
- **WA.MapView API** (exposed by `map.js`):
  - `setFilters({ q, time, cats, mood, nhoods })` — syncs all 5 filter dimensions into the map engine.
  - `render()`, `fitView()`, `focusPin(id)`, `closeDetail()`, `isReady()`.
- **WA.MapTiles API** (exposed by `map-tiles.js`):
  - `init(containerId, opts)`, `project(lng, lat) → {x,y}`, `unproject(x, y) → {lng,lat}`.
  - `fitToPicks(entries)`, `flyTo(lng, lat, zoom)`.
  - `on(event, cb)`, `onReady(cb)`, `resize()`, `isReady()`, `getMap()`.
- **Custom events:**
  - `wa:map-pin-changed` — fired by `map.js` when a pin is tapped or focused; `detail.id` is the pick id (empty string on deselect). `discover.js` listens to scroll+highlight the card and update `?id=`.
  - `wa:mood-changed` — fired by `mood-chips.js` when mood selection changes.
- **Desktop split view:** ≥1024px CSS grid, list ~480px left / map fills right. `view` param ignored on desktop.
- **Mobile:** list or map, toggled by FAB. `view=map` in URL shows map pane.
- **popstate:** `discover.js` has a `popstate` listener — browser back/forward fully restores state without a page reload.

## Live data sources & ingest pipeline (May 2026)

Sources live in the `public.sources` table; each row has `kind`, `channel`, `city`, `curator_handle`, `enabled`, `feed_url`. **Crons own the schedule** (see `cron.job`) — read-only here, only touch if asked.

**Active source matrix (15 rows · 11 enabled · 4 intentionally disabled):**

| Kind | City | Channel | Curator | Cron | Status |
|---|---|---|---|---|---|
| telegram | tallinn | sigmundtells | `@sigmundtells` | `wa-ingest-telegram` (02:15 UTC daily) | ✅ live |
| telegram | tallinn | proEesti | `@proeesti` | same | ✅ live |
| telegram | tallinn | hel_nocturnes | `@hel.nocturnes` | — | ❌ no real channel yet |
| telegram | tallinn | kaisa_writes | `@kaisa.writes` | — | ❌ no real channel yet |
| telegram | tallinn | mattias_v | `@mattias.v` | — | ❌ no real channel yet |
| telegram | tallinn | raul_reads | `@raul.reads` | — | ❌ disabled — RSS feed below covers it |
| rss | tallinn | giadafromgamma | `@raul.reads` | `wa-ingest-rss-{morning,evening}` (09 + 17 UTC) | ✅ live |
| fienta | tallinn | paavli-kultuurivabrik | `@paavli` | `wa-ingest-fienta` (04:00 UTC) | ✅ live |
| fienta | tallinn | 15 (Von Krahl org id) | `@vonkrahl` | same | ✅ live |
| web | tallinn | telliskivi | `@telliskivi` | `wa-ingest-telliskivi` (03:45 UTC) | ✅ live |
| telegram | riga | notboring_riga | `@notboring_riga` | `wa-ingest-telegram` (02:15 UTC) | ✅ live |
| telegram | riga | udgstriga | `@udgstriga` | — | ❌ no real channel yet |
| web | riga | kinobize | `@kinobize` | `wa-ingest-kinobize` (03:30 UTC) | ✅ live |
| web | riga | splendidpalace | `@splendidpalace` | `wa-ingest-splendidpalace` (03:35 UTC) | ✅ live |
| (osm) | tallinn + riga + helsinki | — | — | `wa-ingest-osm` (Mon 03:30 UTC) | ✅ live — multi-city since v8 |

**Pipeline flow:**
`ingest-* → staging_messages → process-staging (every 30m) → picks → enrich-pick-images → geocode-picks → enrich-venues → classify-moods → embed-picks → rotate-tonight (daily 04:05)`

**`ingest-osm` v9 (May 2026):** previously hard-coded to Tallinn. Now loops over a `CITIES` map (Tallinn, Riga, Helsinki) and ingests venues from each Overpass bounding box in one cron tick. Per-city try/catch so a 504 on one city doesn't abort the others — each city's outcome is reported separately in `ingest_log.detail.cities`. Accepts `{city: "..."}` body for ad-hoc backfills; with no body it runs all three. Overpass is rate-limited; the cron already handles transient failures by retrying next tick.

**Adding a new source:** insert a row into `sources` (set `enabled=true`, fill `feed_url`/`channel`/`curator_handle`). The cron picks it up on the next tick. No code change required for telegram/rss/fienta — each ingest function reads the `sources` table on every run.

## LLM model policy (do not deviate)

- **Gemini:** `gemini-2.5-flash` everywhere. `-pro` and `gemini-2.0-flash` return 404 — never use them.
  - URL pattern: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`
- **Groq:** primary `meta-llama/llama-4-scout-17b-16e-instruct`, fallback `llama-3.3-70b-versatile`. Used in `match-pick` and as fallback in `process-staging`.
- Current per-function status:
  - `process-staging` → Gemini 2.5 Flash + Groq fallback
  - `draft-column`, `generate-context`, `send-digest`, `enrich-venues` → Gemini 2.5 Flash
  - `match-pick` → Groq only (v8 — always `find_many`, topK=5; `find_one` mode removed)
  - `geocode-picks` → Nominatim primary, Google Places fallback. Backfills `picks.lat/lng` for any active pick missing coords. Invoke ad-hoc: `POST /functions/v1/geocode-picks {"city":"tallinn","limit":50}`. Inherently location-less picks (`venue ILIKE '%various%'`) should be nulled manually after — they geocode to a meaningless point.

## Cloud-session notes

This repo is designed to run identically locally and in Claude Code on the web:

- No setup script needed — open any `.html` in a browser or run `npm start`.
- `local-secrets.js` is gitignored. Cloud sessions need the same secrets set as **environment variables** in the cloud env settings (not in code).
- `.claude/settings.local.json` is gitignored — its permissions are machine-local and don't transfer.
- Reference assets (wireframes, market-research PDF) live in `docs/archive/` which is gitignored to keep cloud clones light.
