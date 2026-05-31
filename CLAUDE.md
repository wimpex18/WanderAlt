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
- **Canonical mobile viewport:** 390×844. Desktop breakpoint: **768px** (bottom nav → top masthead; content caps at **1024px** uniformly on every page so edges line up across navigation). Quote scales again at 1100px.

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
| `map.html` | 5-line redirect stub → `discover.html?view=map` (preserves `?id`, `?day`, `?mood` legacy params). |
| `search.html` | 5-line redirect stub → `discover.html` (preserves `?q`, `?mode=match` legacy params). |
| `saved.html` / `saved.js` | Going / Reading / Past segments |
| `venue.html` / `venue.js` | Pick (event) detail page — quote, venue, context, more from curator. Back-link returns to full Discover URL (filters preserved). |
| `place.html` / `place.js` | Standalone Places (venue) detail page — name, kind, neighborhood, social glyphs, and upcoming picks at that venue (each linking to its `venue.html`). Opened from Discover Places list rows + the map's venue detail panel (`?id=<venue-id>`). |
| `curator.html` / `curator.js` | Curator profile — bio + all picks |
| `profile.html` / `profile.js` | Account — bookmarks, digest, export, delete |
| `about.html` | Static editorial page — About / Curators / Venues / Privacy / Contact in one scroll. No JS beyond catalog.js + city.js + auth.js for the banner + topbar chrome. Linked from every page's colophon. |
| `admin.html` / `admin.js` | Admin panel — pick/venue CRUD, pipeline, column approval, enrichment |
| `catalog.js` | Static fallback catalog. Exposes the raw multi-city list as `WA._catalogAll` / `WA._curatorsAll` and the city-filtered slice as `WA.catalog` / `WA.curators` (read from localStorage `wa:city` since city.js loads after this file). `WA.past` too. supabase.js replaces these with live data when the network responds. |
| `supabase.js` | Live data fetcher; exposes `WA.BASE_URL` + `WA.ANON_KEY`; fires `wa:catalog-ready` |
| `auth.js` | Email/password + Google OAuth, password reset; dispatches `wa:signed-in` / `wa:signed-out` |
| `bookmark.js` | localStorage primary store + Supabase cloud sync; fires `wa:bookmarks-synced` |
| `taste.js` | Taste-profile onboarding (energy/company/money axes); exposes `WA.taste.matchParams()` |
| `city.js`, `mood-chips.js` | Small shared utilities (city switcher, mood-tag filter via `#mood=…` hash) |
| `styles.css` | All styles. Every design decision lives as a `:root` CSS variable. |
| `brand/` | **Canonical brand kit** — SVG masters for tile/wordmark + favicon ladder + PWA/iOS/Android icons + social cards + city-plates v2 docs. Start at `brand/BRAND.md` for palette/type/lockup rules + § 5 city-plates two-mark rule; `brand/IMPLEMENTATION.md` for integration notes; `brand/city-plates.html` for the design preview. Do NOT inline brand colors; use the `--c-accent` (petrol) / `--c-lime` tokens which match the canonical OKLCH literals 1:1. |
| `assets/<city>-overview.svg` | **City plates** (Tallinn, Helsinki, Riga). 1800×1200 illustrated SVGs used as 80×60 thumbnails in the city-selector dropdown AND as a cityscape ribbon (`.city-banner`, 96px mobile / 120px desktop, cropped to the skyline via `object-position: center 74%`) injected by `city.js` below the topbar on every content page. The active city is stamped on `body[data-city]` so the banner background swaps when the user switches city. Spec: `brand/BRAND.md` § 5 (two-mark rule — one national flag + one lime accent, never the same element). |
| `manifest.webmanifest` | PWA web manifest. References `brand/pwa/*.svg`. Theme color `#055959` (petrol). |
| `_headers` / `_redirects` | Cloudflare Pages config. `_headers` sets HSTS / CSP / cache rules; `_redirects` handles wanderalt.com → wanderalt.app 301, www → apex, and pretty-URL aliases (`/about` → `/about.html`). |
| `robots.txt` / `sitemap.xml` / `.well-known/security.txt` | SEO + security-contact files. robots.txt blocks GPTBot / ClaudeBot / PerplexityBot etc — curator credit matters more than AI training data. |
| `LAUNCH.md` | Launch-day checklist — DNS, Pages, email, Search Console, OG verification, social handles. Read top-to-bottom on the actual launch day. |

## Visual conventions (Claude cannot infer these)

- Strictly left-aligned. **No centered blocks.**
- No gradients, no box-shadows, max corner radius 4px.
- Section dividers are **1px horizontal rules**, never background changes or large gaps.
- Single primary accent: petrol `#055959` (`--c-accent`) — handles, arrows, hover, focus rings, logo tile, map detail quote bar, locate-fab "on" state, admin pin marker. Signal lime `#d2dc50` (`--c-lime`) is reserved for live/active state highlights (Tonight badge, active segment count, logo diamond). The older oxblood `#8a2a1a` accent has been fully retired from app code (May 2026 sweep — the legacy `map-world.js` that held the last references is deleted).
- Background: `--c-paper` = `#ffffff` (pure white). Earlier builds used warm newsprint `#f6f3ec`; the design evolved to clean white with `--c-paper-deep: #fafaf9` for recessed surfaces (search box, tonight quote bg). The map style still uses newsprint cream for land tiles — that is separate from the app background.
- **Curator quote is the largest element on every screen** — larger than venue name or photo. Voice is the product.
- **Editorial redesign (May 2026):** Today / Discover / Saved / Profile share one editorial language. Today's Tonight hero is flat (no surface card): lime `TONIGHT` signal → kind + neighborhood line → title → display-italic quote with a lime rule → actions. Discover uses a `1fr / 1.18fr` list/map split, a static filter rail with mono eyebrow legends, and an **immersive AI concierge mode** — a solid-petrol panel keyed purely on `body.discover-ai-mode` (collapses filters/map). Saved's Going/Reading/Past switcher and Discover's Events|Places toggle are the same compact ink-fill segmented control (lime = active/live count only). Profile uses a flat petrol avatar with a lime initial + a real toggle switch. All deltas live in the "EDITORIAL REDESIGN" block at the end of `styles.css` and reuse existing `:root` tokens — do not add new variables.
- All tokens live in `:root` in `styles.css`. Do not introduce new CSS variables without asking.
- Real photos via `image_url` when available, CSS halftone fallback otherwise. Never use external image URLs that bypass the `image_url` flow. Real photos (`.thumb--has-img`) get a **petrol duotone** (a `mix-blend-mode: color` overlay at 0.62) so disparate venue/event photos read as one editorial treatment — no second hue (the duotone IS petrol on newsprint). Tunable via that opacity.
- Perf: long lists (`.list-row` on Discover/Saved/venue) use `content-visibility: auto` + `contain-intrinsic-size` to skip off-screen render. Fonts self-hosted (see HANDOFF). Both no-build.

## Motion conventions (May 2026)

Restrained on purpose — editorial voice, not product flash. Two tokens, no bounce, no parallax, no scroll-driven choreography:

- `--t-fast: 120ms ease` — color / border / background swaps (hover, focus, mood-chip on-state). Used in ~30+ rules across the file.
- `--t-mid: 280ms cubic-bezier(.2,.8,.2,1)` — entrances, state changes, hover micro-lifts. Out-cubic, no overshoot.

Five entrance surfaces share one `@starting-style` rule so motion is consistent across every tab and every paint path (server-rendered + JS-appended): `.pick`, `.tonight`, `.match-card`, `.profile-section`, `.about-section`. Each rises 8px and fades in over `--t-mid`. `transition-behavior: allow-discrete` keeps the entrance visible past the discrete-property hop.

Cross-document View Transitions are enabled globally (`@view-transition { navigation: auto }`). The `.topbar` and `.nav` carry `view-transition-name` so chrome morphs instead of cross-fading — pages without VT support fall back to instant nav.

Bookmark click is a smooth fill transition (no scale pop), bookmark hover is `scale(1.06)`. Desktop `.pick:hover` lifts 1px (hover-capable pointers only).

`@media (prefers-reduced-motion: reduce)` cancels all of the above with `transition: none !important` + an explicit `@starting-style` override that zeros the entrance offset + `::view-transition-*` `animation: none`.

**Do not add new keyframes, parallax, or bouncy easings.** If you need new motion, pick `--t-fast` or `--t-mid` and reuse the existing entrance selector list.

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
- **Do not introduce a third color.** Two-tone for a reason. `--c-accent` (petrol) is the only accent; `--c-lime` is signal-only (live/active). Map pins are uniform petrol (`WA.MAP_CAT` in `map-venues.js`) — category is differentiated by the per-kind **glyph**, not hue (The-Economist discipline: a muted multi-hue pin palette was trialled June 2026 and reverted as too "app" for a two-tone editorial brand). Lime marks the active/live pin state only.

## Domain + page architecture (May 2026)

- **Single domain.** `wanderalt.app` is the primary. `wanderalt.com`
  is registered as brand-defense and 301-redirects via the rules in
  `_redirects` (Cloudflare Pages handles it; no DNS code in this
  repo). Both domains are registered at spaceship.com; nameservers
  point to Cloudflare for DNS + Email Routing + Pages.
- **Hosting target: Cloudflare Pages**, NOT Vercel. Reasons in
  `README.md` § Domain. Pages config lives in `_headers` (security
  + cache) and `_redirects` (apex/www + legacy URL aliases).
- **Everything lives at `/`.** Marketing, app, account, legal —
  all on the same domain. The split-domain pattern (Stripe-style
  marketing.com + dashboard.com) was unwound across the industry by
  ~2024; single-domain wins on SEO, share-link continuity, and
  auth complexity.
- **No separate Terms / Privacy / Support pages.** The single
  `about.html` carries the editorial mission, curator pitch, venue
  contact, privacy notice (we don't track), and email — five sections,
  one scroll. Anything more legalistic would clash with the
  back-page-of-a-newsletter voice.
- **No cookie banner.** We use only strictly-necessary localStorage
  (auth session, bookmarks, preferences). No analytics, no ads, no
  third-party scripts. Document this clearly in `about.html` and
  don't add tracking without adding consent UI first.

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

- **Bottom nav:** 4 items — Today · Discover · Saved · Profile. All five HTML pages share this nav. (The home tab's visible label is "Today"; its internal id stays `data-page="briefing"` / `briefing.js`.)
- **Events vs Places scope switch:** a segmented control at the top of Discover toggles `state.type` between `events` (picks) and `places` (venues). Mode-first, then filters narrow within it (a category means event-categories in Events, venue-kinds in Places). The permanent thing (venue) and the dated thing (event) are different objects — this is a scoped toggle, not a facet (RA / Google Maps pattern). Places shows all alt-culture venues by default (no "empty until filtered" gate, since a finite venue set is scannable), and hides the mood strip + AI link (both pick-only). Events mode is unchanged. Both modes use the list + map split.
- **Places data:** `WA.venues` / `WA._venuesAll` (supabase.js fetches the `venues` table, filtered client-side to `WA.VENUE_KINDS` = record store, bookshop, gallery, club, thrift, arts centre, cinema, community — generic bars/museums/libraries excluded to protect the curated identity). Static seed in `catalog.js` is the offline fallback. Venues carry `website` / `facebook` / `instagram` (OSM `contact:*` tags via ingest-osm v10; nullable). Venue cards carry no curator quote (places aren't picks) — name + kind + neighborhood + a row of minimalist social glyphs (website/FB/IG, shown only when present).
- **Places map:** `WA.MapView.setPlaces(venues)` switches the map to a venue-pin layer (clears `placesMode` again on the next `setFilters`). `discover.js runPlaces()` pushes the filtered venue set to the map every render; pins use the same overlay/clustering as events. Pin tap opens a venue-specific detail panel (`venueDetailHTML` — name + kind + neighborhood + social, no quote/bookmark/"I'm going"). Unlike Events, Places shows pins immediately (no empty-until-filtered gate).
- **URL schema:** `?type=events|places&q=&view=list|map&time=tonight|thisweek|all&cat=music,drink&nhood=Kalamaja&within=5|15|30&sort=…&id=<pick-id>&ai=<prompt>&mode=match`
  - `within` = the walking-radius filter (minutes). A "Distance" control (Any/5/15/30 min walk) requests geolocation once, then a shared haversine (`~80 m/min`) filters both the list and the map pins in Events **and** Places. Falls back to unfiltered (with a note) if location is declined.
  - `?type=places` scopes to venues; absent/`events` is the default.
  - **Sort** is mode-aware and trimmed: Events → `relevance` (default) / `newest` (labelled "Soonest"); Places → `featured` (default) / `nearest` (geolocation). A→Z and by-curator were dropped (curator is a browse section).
  - `?id=` is the active pin — written on pin tap, restored on load, persists across filter changes.
  - `#mood=…` is owned by `mood-chips.js` (hash, not search param) — do not unify. Mood only applies in Events mode.
- **Basemap:** MapLibre GL JS + OpenFreeMap (free, no API key, OSM vector tiles). Custom editorial style at `map-style.json`. Pins are positioned by projecting `picks.lat/lng` to container pixels via `WA.MapTiles.project(lng, lat)`. Picks without lat/lng don't render on the map but still appear in the list pane.
- **Empty by default:** the map renders NO pins when no filter is active. UX decision — at city zoom 100+ pins is unscannable. Picking Tonight / This week / Free / a category / a mood / a search term immediately populates pins. The `#map-empty-hint` overlay communicates the empty state.
- **Pick coords:** stored on `picks.lat` / `picks.lng`. `picks.address` is the postal address (used as a secondary check + shown in the detail panel). `picks.coords_source` ∈ {`nominatim`, `google_places`, `venue_join`, `manual`}. `picks.coords_locked = true` means admin overrode the coords; the nightly cron skips locked rows.
- **`geocode-picks` cron** (`wa-geocode-picks`, hourly at :20): calls the `geocode-picks` edge function. It selects picks with NULL lat/lng OR NULL address and either forward-geocodes (Nominatim → Google Places fallback) or reverse-geocodes coords-only rows. Skips locked rows. Filters out non-spatial venue names (`%various%`, `%multiple%`, `%online%`, `%popup%`).
- **`geocode-picks` reverse action** (v4+): `POST {action: 'reverse', lat, lng}` returns the resolved postal address. Admin pin editor calls this so the browser never hits Nominatim directly — single User-Agent identity, OSM usage policy respected, editor IPs hidden.
- **`enrich-pick-images` cron** (`wa-enrich-pick-images`, hourly at :40): for each active pick with NULL `image_url`, calls Google Places API Text Search to find the venue, then fetches a CDN photo URL via the Places media endpoint. ~$0.039 per unique venue. Skips "Various venues" / "Multiple" / "Online" / "Popup" entries (no fixed location → no representative photo).
- **Admin pin editor** (`admin.html` pick modal): MapLibre mini-map with a draggable petrol marker. Dragend writes lat/lng to the form; reverse-geocoded address is displayed for sanity checking. "Lock coords" checkbox sets `coords_locked = true` so cron doesn't undo manual placements.
- **WA.MapView API** (exposed by `map.js`):
  - `setFilters({ q, time, cats, mood, nhoods })` — Events layer: syncs all 5 filter dimensions into the map engine (also resets `placesMode`).
  - `setPlaces(venues)` — Places layer: renders an already-filtered venue set as pins (sets `placesMode`). Call it even before the map is ready — it stashes the state the map reads on its own `onReady` boot.
  - `render()`, `fitView()`, `focusPin(id)`, `closeDetail()`, `isReady()`.
- **WA.MapTiles API** (exposed by `map-tiles.js`):
  - `init(containerId, opts)`, `project(lng, lat) → {x,y}`, `unproject(x, y) → {lng,lat}`.
  - `fitToPicks(entries)`, `flyTo(lng, lat, zoom)`.
  - `on(event, cb)`, `onReady(cb)`, `resize()`, `isReady()`, `getMap()`.
- **Custom events:**
  - `wa:map-pin-changed` — fired by `map.js` when a pin is tapped or focused; `detail.id` is the pick id (empty string on deselect). `discover.js` listens to scroll+highlight the card and update `?id=`.
  - `wa:mood-changed` — fired by `mood-chips.js` when mood selection changes.
- **Desktop split view:** ≥1024px CSS grid, list left / map fills right. `view` param ignored on desktop.
- **Filters:** the `#discover-sheet` lives inside the list pane. Mobile = fixed bottom sheet opened by "+ Filters" (Apply commits; `openSheet` flips map→list first so the fixed sheet isn't trapped in a `display:none` pane). Desktop ≥1024px = persistent left-rail atop the list column, always visible, "+ Filters"/Apply hidden, changes apply live (`liveApply()`). Active pills/chips carry a leading "✓" (WCAG 1.4.1); sort is a radio list, not a `<select>`.
- **Category icons:** filter chips are text-only (text-forward brand); category glyphs live on **map pins** — event pins use category-bucket glyphs, Places pins use per-venue-kind Lucide glyphs (`VENUE_PIN_ICONS` in `map.js`).
- **Mobile:** list or map, toggled by FAB. `view=map` in URL shows map pane.
- **popstate:** `discover.js` has a `popstate` listener — browser back/forward fully restores state without a page reload.

## Live data sources & ingest pipeline (May 2026)

Sources live in the `public.sources` table; each row has `kind`, `channel`, `city`, `curator_handle`, `enabled`, `feed_url`. **Crons own the schedule** (see `cron.job`) — read-only here, only touch if asked.

**Active source matrix (24 rows · 20 enabled · 4 intentionally disabled):**

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
| telegram | helsinki | helsinkievents | `@helsinkievents` | `wa-ingest-telegram` (02:15 UTC) | ✅ live (May 2026) |
| telegram | helsinki | otaniemievents | `@otaniemievents` | same | ✅ live (May 2026) |
| telegram | helsinki | ayyevents | `@ayyevents` | same | ✅ live (May 2026) |
| web | helsinki | hel-linkedevents | `@hel_today` | `wa-ingest-hel-linkedevents` (03:50 UTC) | ✅ live (May 2026) |
| telegram | riga | notboring_riga | `@notboring_riga` | `wa-ingest-telegram` (02:15 UTC) | ✅ live |
| telegram | riga | udgstriga | `@udgstriga` | — | ❌ channel exists but dormant since July 2024 |
| telegram | riga | AfishaRiga | `@AfishaRiga` | `wa-ingest-telegram` (02:15 UTC) | ✅ live (May 2026) — RU aggregator, ~200 subs |
| web | riga | kinobize | `@kinobize` | `wa-ingest-kinobize` (03:30 UTC) | ✅ live |
| web | riga | splendidpalace | `@splendidpalace` | `wa-ingest-splendidpalace` (03:35 UTC) | ✅ live |
| web | riga | hanzasperons | `@hanzasperons` | `wa-ingest-hanzas-perons` (03:50 UTC) | ✅ live (May 2026) — major contemporary venue, hosts Skaņu Mežs; ~2 upcoming events publicly listed at a time |
| web | riga | echogonewrong | `@echogonewrong` | `wa-ingest-echo-gone-wrong` (03:55 UTC) | ✅ live (May 2026) — Baltic art press RSS, filtered to Latvia categories; ~5-10 Riga items/week |
| telegram | vilnius | afishavilnius | `@afishavilnius` | `wa-ingest-telegram` (02:15 UTC) | ✅ live (May 2026) — RU aggregator |
| web | vilnius | ra-vilnius | `@ra_vilnius` | `ingest-ra` (no cron yet — see Vilnius note) | ⚠️ deployed + validated, cron pending RA-ToS call |
| (osm) | tallinn + riga + helsinki + vilnius | — | — | `wa-ingest-osm` (Mon 03:30 UTC) | ✅ live — multi-city since v8 (Vilnius added v11) |

**Riga — May 2026 curator-voice round (notes for next session):**
- **`@kseniakamikaza` curator added (no source row, no automated feed).** Ksenia Kamikaza (DJ, founder of UNDER Festival + Platz Für Tanz label, host of "Intelligent Beats" on Radio Naba since 2003) is the closest equivalent to `@sigmundtells`. She confirmed she's too busy organising events to personally curate a channel. Every alternative data source in her orbit was investigated (May 2026) and found not viable — see below. Admin-panel manual seeding is the only path for now.
- **Echo Gone Wrong RSS quirk**: the feed at `echogonewrong.com/feed/` returns HTTP 403 to default user-agents (Cloudflare) but answers fine with a real desktop Safari UA. `ingest-echo-gone-wrong` v1 sets that UA explicitly. If another scraper needs this, copy the `BROWSER_UA` constant pattern from that function.
- **KKC (kanepes.lv) investigated and skipped.** The site is a React SPA backed by WordPress; the WP REST API exposes a `pasakumi` post type but the latest event entry is from December 2024 — KKC's events database has been silent for ~5 months. Their React frontend likely reads from Facebook Events now. Re-evaluate if/when kanepes.lv publishes a fresh event again. For now, admin-panel manual seeding is the recommended path for KKC picks.
- **All remaining Riga automated sources fully investigated (May 2026) — none viable:**
  - `naba.lv` (Radio Naba): No RSS feed (`/feed/` → 404). Weekly schedule is on `naba.lsm.lv` which returns HTTP 403. Radio shows are broadcast events, not physical events with venues — wrong data model for WanderAlt.
  - `underfestival.com` (UNDER Festival): 2025 editions (March Liepāja, May Riga) are past; 2026 not announced. No RSS or API.
  - `skanumezs.lv` (Skaņu Mežs festival): Returns HTTP 406; already covered by Hanzas Perons ingest anyway.
  - `lcca.lv` (Latvian Centre for Contemporary Art): Good content (Survival Kit 17, Aug–Sep 2026 in Riga) but JS-rendered pages — no machine-readable feed. Re-evaluate if LCCA adds an RSS feed.
  - `rigamusicweek.lv` (Riga Music Week): November 2026, programme TBD, no RSS/API. Industry conference + showcase, not underground alt-culture.
  - `kamikaza.info/radioshow/` (Ksenia's radio show archive): No schedule data, no feed.
  - The three sources wired this session — `@AfishaRiga` (Telegram), `@hanzasperons` (web), `@echogonewrong` (RSS) — are the practical ceiling for automated Riga ingest until new sources emerge.

**Vilnius — unlocked for internal testing (May 2026):**
Front-end: city plate SVG (`assets/vilnius-overview.svg`), city.js entry (`status: 'live'`), static venue seed in `catalog.js` (offline fallback). The city is now **selectable** in the dropdown so the team can dogfood it. This is an internal-testing unlock, **not a public launch**. Vilnius runs on **WanderAlt's in-house editorial desk** rather than a resident human curator (none exists yet — see item 2 below): Events/Today are populated from the city's source feeds (`@ra_vilnius`, `@afishavilnius`), filtered by the standard `process-staging` Gemini/Groq pass, and **attributed per-feed on the cards** (no fabricated single voice). Today carries an honest umbrella note under the standfirst (`briefing.js` `renderEditorialDeskNote`, gated on `HOUSE_DESK_CITIES`) stating the arrangement plainly and inviting a resident curator. Discover's **Places** mode is also populated (~410 OSM venues). If a city genuinely has 0 picks, Today still falls back to the graceful empty states (Tonight "curators are warming up" line + city-plate This Week card). Revert to `status: 'coming'` if Vilnius needs hiding before a public launch.

**DONE (cloud, May 2026):**
- `ingest-osm` **v11** — Vilnius added to the `CITIES` map (bbox `54.63,25.17,54.74,25.38`, core cultural districts). Backfill run seeded **410 venues** (~138 in the curated `VENUE_KINDS`: Loftas, Kablys, Opium, Tamsta, Smala, Užupis art incubator, Menų spaustuvė, Atletika, Vinyloteka, Skalvija, Pasaka, AV17/Vartai/Prospekto, …). Nightly cron now covers 4 cities.
- `sources` rows inserted: **id 25** `afishavilnius` (telegram, curator `@afishavilnius` "Afisha Vilnius", enabled — picked up by the nightly `ingest-telegram` cron) and **id 26** `ra-vilnius` (web, curator `@ra_vilnius` "Resident Advisor", enabled).
- `ingest-ra` **v1** deployed — pulls Vilnius electronic events from RA's GraphQL (`https://ra.co/graphql`, area **561**, browser-like headers; HTML frontend is Cloudflare-gated but the API answers from a datacenter IP). Validated once: **24 events** staged (Paviljonas, Utopija, Sodas 2123, Vasaros Terasa, …).
- **`process-staging` v35 — Vilnius (and any non-Tallinn/Riga city) was silently mis-classified.** `CITY_CONTEXT` only held `tallinn` + `riga`; Vilnius fell back to the Tallinn context, so the classifier was told it was editing *Tallinn* and rejected every Vilnius post as "not Tallinn". 0 Vilnius picks ever reached the table despite 80+ staged RA/Afisha messages. v35 adds a `vilnius` entry (neighborhoods: Senamiestis, Naujamiestis, Užupis, Šnipiškės, Žvėrynas, Antakalnis). **Helsinki has the same gap** (no `CITY_CONTEXT` entry → falls back to Tallinn → its 4 picks are all hand-seeded); add a `helsinki` entry the same way to fix it.
- **Migration `drop_dead_world_coord_autopin` — fleet-wide insert breakage fixed.** A leftover `picks_autopin_trigger` (BEFORE INSERT/UPDATE → `wa_pick_autopin()`) still referenced `picks.world_x`/`world_y`, columns dropped in the May 2026 map-world.js sweep. It crashed **every** pick insert with `record "new" has no field "world_x"` — the real reason auto-generated picks stopped landing in all cities. Dropped the trigger + its dead helpers (`wa_pick_autopin`, `wa_pick_world_coords`, the SQL `wa_geocode_picks` — distinct from the live `geocode-picks` *edge function*). The live map uses `picks.lat`/`lng` + `WA.MapTiles.project()`, not world coords.
- **Backfill drained once:** the staged RA/Afisha backlog was requeued (`in_progress`/wrongly-`rejected` → `new`, Vilnius-scoped) and `process-staging` fired once. First batch produced **10 real Vilnius picks** (Sodas 2123, Utopija, Smala, Paviljonas, …). The rest drain on the normal 30-min cron — do not poll.

**REMAINING (gated):**
1. **RA recurring cron — NOT scheduled (deliberate).** Resident Advisor's ToS prohibits automated collection. The function exists + works, but no `cron.job` invokes it. Decide on the ToS question before adding a nightly cron (e.g. `select cron.schedule('wa-ingest-ra','30 3 * * *', $$ select net.http_post('…/functions/v1/ingest-ra', …, '{"city":"vilnius"}') $$);`). Until then RA only ingests when invoked by hand.
2. **Editorial curator voice — still missing.** Research (May 2026, LT/EN/RU) found NO single-voice underground curator Telegram channel for Vilnius (the equivalent of `@sigmundtells`). The scene lives on Instagram: **@smala.art** (arts/club space, best voice fit), **@discotag** (electronic record shop), **Partyzanai** (rave net-label, partyzanai.com), **@raveinlt** (IG ~16k; its Telegram is a dead stub). `@afishavilnius` is a RU mainstream aggregator, not an editorial voice. Options: adopt an IG account as the voice (pipeline treats IG as secondary), or recruit a scene figure (Smala/Manfredas crew, Partyzanai, or journalist Daina Dubauskaitė) to run a curated Telegram channel — verify any handle via `t.me/s/<name>` before inserting a `sources` row. Do NOT fabricate a handle.
3. **Public launch** — the `city.js` flag is already `'live'` for internal testing. Before a real public launch, settle a curator voice (item 2) and confirm reviewed picks exist so Events/Today aren't empty.

**Other verified sources (researched, NOT yet wired — scrape-only, mirror `ingest-telliskivi`/`ingest-kinobize`):** `echogonewrong.com` (Baltic art press, likely `/feed/` RSS), venue sites `menufabrikas.lt` / `opiumclub.lt` / `cac.lt`, festivals `kinopavasaris.lt` / `sirenos.lt` / `vilniusfestivals.lt` (GAIDA), editorial `vna.lt` / `neakivaizdinisvilnius.lt`. Excluded: **Lizdas** (Kaunas + closing). Not staged: `allevents.lt` (inbound provider feed, mainstream), `vilnius-events.lt` (Go Vilnius tourism, no feed). No public ICS calendars found on any source.

**Pipeline flow:**
`ingest-* → staging_messages → process-staging (every 30m) → picks → enrich-pick-images → geocode-picks → enrich-venues → classify-moods → embed-picks → rotate-tonight (daily 04:05)`

**`ingest-osm` v10 (May 2026):** loops over a `CITIES` map (Tallinn, Riga, Helsinki) and ingests venues from each Overpass bounding box in one cron tick. Per-city try/catch so a 504 on one city doesn't abort the others — each city's outcome is reported separately in `ingest_log.detail.cities`. Accepts `{city: "..."}` body for ad-hoc backfills; with no body it runs all three. v10 captures `contact:facebook` / `contact:instagram` (bare handles normalised to full URLs) plus `contact:website`/`website` into the `venues.facebook` / `instagram` / `website` columns, powering the Places social glyphs. Social coverage is sparse (OSM tagging is spotty — ~20 FB / ~12 IG live) and degrades gracefully. Overpass is rate-limited; the cron retries next tick.

**`ingest-hel-linkedevents` v2 (May 2026):** wraps the official **Helsinki Linked Events API** at `api.hel.fi/linkedevents/v1/event/`. Same data source as `tapahtumat.hel.fi`, `myhelsinki.fi/helsinki-event-calendar`, and `helsinki.today` — going to the API directly is more reliable than scraping any of those JS-driven frontends, and the schema is rich (multilingual name + description + location + keywords). Pre-filters at fetch time: `type_id='General'`, `event_status` ∈ {`EventScheduled`,`EventRescheduled`}, next 30 days, English/Finnish name present, blacklist for children/library/government-bureaucracy patterns (`lapsille`, `perheelle`, `koululaisille`, `satutuokio`, `kaupunginvaltuusto`, …). v2 dropped the bare `lapsi` pattern after it false-positived on Finnish compounds. Anything passing lands in `staging_messages` tagged `@hel_today` and goes through the standard `process-staging` Gemini filter. `ingest_log.detail.reasons` carries per-pattern rejection tallies for tuning.

**Adding a new source:** insert a row into `sources` (set `enabled=true`, fill `feed_url`/`channel`/`curator_handle`). The cron picks it up on the next tick. No code change required for telegram/rss/fienta — each ingest function reads the `sources` table on every run.

## LLM model policy (do not deviate)

- **Gemini:** `gemini-3.5-flash` (GA May 19 2026) is the current text model. `gemini-2.5-flash` still works as a fallback; `-pro` and `gemini-2.0-flash` return 404 — never use them. Embeddings stay on `gemini-embedding-001` (do not "upgrade" embeddings to a flash model).
  - URL pattern: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_KEY}`
- **Groq:** primary `meta-llama/llama-4-scout-17b-16e-instruct`, fallback `llama-3.3-70b-versatile`. Used in `match-pick` and as fallback in `process-staging`.
- Current per-function status:
  - `process-staging` → Groq llama-4-scout primary (v34+) + Gemini 3.5 Flash fallback (no thinkingConfig — 3.5 classifies accurately without it). JSON output via `responseMimeType`. **v35** adds Vilnius to `CITY_CONTEXT` (see Vilnius notes); per-city neighborhood lists drive classification, so a missing city silently degrades to the Tallinn context.
  - `draft-column` (v12) and `generate-context` (v9) → Gemini 3.5 Flash **+ Search grounding** (`tools: [{ googleSearch: {} }]`), so weekly columns and per-pick "why this matters" reference real current context. `generate-context` only grounds picks with `context_md IS NULL`, so cost tracks daily ingest volume, not the whole catalogue.
  - `send-digest` (v9) → Gemini 3.5 Flash (weekly email intro, no grounding)
  - `enrich-venues` → **no LLM** — Wikidata + Nominatim + Google Places (venue facts/photos/closure), not a Gemini function
  - `embed-picks` / `match-pick` → embeddings on `gemini-embedding-001`; `match-pick` does ranking on Groq only (v8 — always `find_many`, topK=5; `find_one` mode removed)
  - `geocode-picks` → Nominatim primary, Google Places fallback. Backfills `picks.lat/lng` for any active pick missing coords. Invoke ad-hoc: `POST /functions/v1/geocode-picks {"city":"tallinn","limit":50}`. Inherently location-less picks (`venue ILIKE '%various%'`) should be nulled manually after — they geocode to a meaningless point.

## Cloud-session notes

This repo is designed to run identically locally and in Claude Code on the web:

- No setup script needed — open any `.html` in a browser or run `npm start`.
- `local-secrets.js` is gitignored. Cloud sessions need the same secrets set as **environment variables** in the cloud env settings (not in code).
- `.claude/settings.local.json` is gitignored — its permissions are machine-local and don't transfer.
- Reference assets (wireframes, market-research PDF) live in `docs/archive/` which is gitignored to keep cloud clones light.
