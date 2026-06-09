# WanderAlt

A static, mobile-first website for discovering **alternative / underground culture in European cities**: vinyl shops, art squats, small music venues, craft bars, experimental gigs, political talks. Every item is vouched for by a human curator — the curator's voice is the product.

Live cities: **Tallinn · Helsinki · Riga**. **Vilnius** is unlocked for internal testing (Places populated; Events/Today pending a curator). First screen: **Briefing** (the default landing).

---

## Structure

```
.
├── index.html            # Briefing — editorial landing page (Tonight + This Week). No filter UI.
├── discover.html         # Discover — unified search + filter + map surface (replaces map + search)
├── map.html              # Redirect stub → discover.html?view=map (preserves legacy ?id, ?day params)
├── search.html           # Redirect stub → discover.html (preserves legacy ?q, ?mode=match params)
├── saved.html            # Saved — Going / Reading / Past segments
├── venue.html            # Pick (event) detail — curator quote hero, venue block, context, more from curator
├── place.html            # Standalone Places (venue) detail — name, kind, neighborhood, socials, upcoming picks
├── curator.html          # Curator profile — handle, tagline, bio, all picks
├── profile.html          # User account — bookmarks, digest, export, delete account
├── admin.html            # Admin panel — pick/venue CRUD, pipeline monitor, column approval
├── about.html            # About / Curators / Venues / Privacy / Contact — one editorial page
├── 404.html              # 404 page — matches site aesthetic
├── styles.css            # All styles, CSS variables in :root for easy tuning
├── catalog.js            # Static fallback catalog — used when Supabase is unreachable
├── supabase.js           # Live data layer — fetches from Supabase, fires wa:catalog-ready
├── auth.js               # Email/password + Google OAuth + password reset
├── bookmark.js           # Bookmark store — localStorage primary + Supabase cloud sync
├── briefing.js           # Briefing renderer — Tonight hero + This Week list
├── discover.js           # Discover orchestrator — URL state, filters, list render, AI mode, popstate
├── discover-redirect.js  # Legacy URL mapper — loaded by the map/search redirect stubs
├── map.js                # Pan/zoom map engine — exposes window.WA.MapView API; embedded in Discover
├── map-venues.js         # Category definitions (WA.MAP_CATEGORIES) shared by map + discover
├── map-tiles.js          # MapLibre GL basemap (WA.MapTiles API) — OpenFreeMap tiles + custom style
├── map-style.json        # Custom MapLibre style — newsprint land, muted petrol water, off-white roads
├── saved.js              # Saved renderer — injects bookmarked rows from catalog
├── venue.js              # Pick detail renderer — back-link returns to full Discover URL
├── place.js              # Places detail renderer — reads ?id=, lists upcoming picks at the venue
├── curator.js            # Curator profile renderer — reads ?handle=
├── profile.js            # Profile renderer — stats, export, digest, delete account
├── admin.js              # Admin panel logic
├── taste.js              # Taste-profile onboarding (energy/company/money axes)
├── city.js               # City switcher (multi-city scaffold)
├── mood-chips.js         # Mood-tag filter chips; writes to #mood= hash
├── assets/               # SVG icons / static assets
├── brand/                # Beacon brand kit — tile + wordmark masters, favicons, PWA/iOS/Android icons,
│                         #   social cards, BRAND.md (palette/type/lockup spec), IMPLEMENTATION.md
├── manifest.webmanifest  # PWA web manifest — references brand/pwa/*.svg, theme color #055959
├── docs/archive/         # Wireframes + market research (gitignored, local only)
├── CLAUDE.md             # Claude Code instructions (file map, conventions, API keys, LLM policy)
├── HANDOFF.md            # Engineering reference — tokens, components, state matrices
└── README.md
```

No build step. **Open `index.html` directly in a browser** to view, or run `npm start` for a local dev server at `http://localhost:5173`.

Canonical mobile design width: **390px**. Responsive up to desktop with a constrained **1024px reading column** applied uniformly to every page so edges line up across navigation (briefing, discover, saved, profile, venue, curator, admin all share the same max-width).

---

## Voice-first hierarchy

Across every screen the **curator's quote is the loudest element** — larger than the venue name, larger than any photo. Everything else serves that voice:

- The Tonight hero leads with a lime `TONIGHT` signal, a kind + neighborhood line and the title, then the curator quote in display italic with a lime rule. Actions (I'm going / Save) sit beneath.
- Metadata (neighborhood · type · time · curator handle) is set in monospace to read as a "filing system" — deliberately quiet next to the serif quote.
- Section dividers are **1px horizontal rules**, not background changes or gaps.
- Strict left alignment. No centered text blocks. No shadows (except floating map controls). No gradients. Corners max ~12px.

The aesthetic reference is **a printed cultural weekly** (*The Gentlewoman*, *Apartamento*, a good city arts newspaper) translated into a web interface — not Airbnb, not Eventbrite.

---

## Typography

Three typefaces, **self-hosted** as `woff2` in `fonts/` (no Google Fonts request — faster, privacy-clean, CSP-friendly):

| Family | Role | Why |
|---|---|---|
| **Geist** | Body + titles — event names, headings, nav, buttons | A clean, contemporary grotesque that stays quiet so the curator quote dominates. Loaded 400/500/600/700. |
| **DM Serif Display** *(italic)* | Display — the curator pull-quote, the loudest element on every screen | A high-contrast magazine display cut with a genuinely beautiful italic; gives the "printed cultural weekly" feel instantly. |
| **Geist Mono** | Metadata — neighborhood · type · time, curator handles, eyebrows, counts, pills | A modern monospace that reads as a filing system next to the body type — exactly the tension we want. Loaded 400/500. |

The hero quote scales with `--fs-quote` (32px → 44px → 52px ≥1100px). Self-hosted weights are preloaded above the fold on Briefing and Discover to avoid layout shift.

---

## CSS tokens

All design decisions live in `:root` in [`styles.css`](styles.css). The main groups:

- `--c-*` — color palette (paper white, deep ink, **Beacon** brand: petrol `#055959` accent + signal lime `#d2dc50`)
- `--ff-*` — font families
- `--fs-*` — type scale
- `--lh-*` — leading
- `--s-1` through `--s-10` — 4px-based space scale
- `--gutter`, `--reading-max`, `--radius`, `--rule-w`, `--nav-h` — layout

Change the accent, the paper tone, or the quote size in one place and the whole screen re-tunes.

---

## Responsive behavior

- **< 768px (mobile, canonical 390px):** single column at full width with 20px gutter, bottom nav fixed at the viewport bottom with safe-area padding.
- **≥ 768px (tablet / desktop):** content column caps at 1024px and centers (same value on every page so navigation feels continuous). Hero quote grows (`--fs-quote` goes from 32px → 44px → 52px at ≥1100px). **Bottom nav becomes a sticky top nav bar** under the wordmark — a thin row of masthead-style links. Rationale: a side rail would compete with the single-column editorial read; a persistent bottom bar on desktop feels too app-y; a masthead nav reinforces the "cultural weekly" metaphor.
- **`prefers-reduced-motion`** respected. Cross-document View Transitions fade the body between pages; `.topbar` and `.nav` carry `view-transition-name` so chrome doesn't flicker. Primary surfaces (`.pick`, `.tonight`, `.match-card`, `.profile-section`, `.about-section`) enter via `@starting-style` fade-up over `--t-mid` (280ms). See CLAUDE.md § Motion conventions.
- **Safe-area insets** handled on iOS (bottom nav, body padding).

---

## Accessibility notes (first pass)

- Landmarks: `<header role="banner">`, `<main>`, `<nav aria-label="Primary">`.
- Skip link to `#tonight` for keyboard users.
- Every link/button has a descriptive accessible name.
- Active nav item uses `aria-current="page"` and a color contrast shift, not color alone.
- Focus-visible outlines on interactive controls.
- Color contrast for ink-on-paper passes WCAG AA at all body and metadata sizes.

Not yet: real image `alt` text (placeholders only this pass).

---

## Domain

WanderAlt is a single-domain product. The whole site — Briefing,
Discover, About, account, legal — lives at **`wanderalt.app`**.

The split-domain pattern (marketing-site + app-subdomain à la
Stripe / Supabase) peaked around 2018–2022 and has reversed across
the industry by 2024; single-domain wins on SEO consolidation,
share-link continuity, and auth simplicity. WanderAlt is editorial
in nature — the Briefing page itself is the marketing — so the
classic argument for splitting (separate IA for buyers vs users)
doesn't apply.

`wanderalt.com` is also registered as brand-defense. The 301 redirect
to `wanderalt.app` is configured in `_redirects` (the Cloudflare Pages
config file at repo root) — when both domains are attached to the same
Pages project, the rule fires automatically.

**Hosting target: Cloudflare Pages**, not Vercel. Cloudflare Pages was
chosen over Vercel for this site because (a) bandwidth is unlimited on
the free tier vs Vercel Hobby's 100 GB/mo cap, (b) the edge network is
3-4× denser, which matters for our EU audience, and (c) using
Cloudflare for hosting + DNS + email routing keeps the operational
surface to one dashboard. See `LAUNCH.md` for the step-by-step setup
when you're ready to flip the domain live.

## Deploying (Cloudflare Pages)

1. Push this directory to a GitHub repo.
2. In Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select the repo. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
4. Deploy. You get a `*.pages.dev` URL immediately; add a custom domain from the project settings.

`_headers` (security headers + cache rules) and `_redirects` (apex/www + the `wanderalt.com → wanderalt.app` 301 + pretty-URL aliases) are read automatically by Pages. See `LAUNCH.md` for the full go-live checklist.

---

## Roadmap

**Built:**
- **Content catalog** (`catalog.js`) — static fallback catalog (a small seed of Tallinn venues + past entries + fictional curator bios). Used only when the Supabase fetch fails; live data lives in the `picks`, `venues`, `curators` tables.
- **Supabase data layer** (`supabase.js`) — live data from Supabase REST API with 2-second timeout and graceful `Promise.allSettled` fallback to `catalog.js`. Exposes `WA.BASE_URL` and `WA.ANON_KEY` for auth and bookmarks.
- **Auth** (`auth.js`) — email/password + Google OAuth + password reset via Supabase REST (no SDK). JWT decoded client-side. Session stored in localStorage. Dispatches `wa:signed-in` / `wa:signed-out`.
- **Cloud bookmarks** (`bookmark.js`) — localStorage primary store with Supabase `bookmarks` table sync on sign-in. `wa:bookmarks-synced` event triggers Briefing and Saved re-render.
- **Briefing** — Tonight hero + This Week list rendered from catalog; bookmark toggles persist via `localStorage`; curator handles link to profile pages. Thumbnails show real `image_url` photos when available, CSS halftone placeholder otherwise.
- **Map** — MapLibre GL basemap (`map-tiles.js` + custom `map-style.json`, OpenFreeMap vector tiles, no API key). Pins are projected from real `picks.lat/lng` via `WA.MapTiles.project()` and clustered; tapping one opens a detail panel. The `geocode-picks` cron backfills coordinates nightly. Embedded inside Discover's split view (`WA.MapView`), not a standalone page.
- **Discover** (`discover.html`) — unified search + filter + map surface. Replaces the old standalone Search and Map pages. **Events | Places scope switch** at the top toggles between curated events (picks) and permanent venues (alt-culture places — record stores, bookshops, galleries, clubs, flea markets, arts centres, indie cinemas, community spaces). Mode-first, then filters narrow within it. Mobile-first (list default, Map FAB to toggle). Desktop ≥1024px splits list left / map right; both modes render pins. Mode-aware quick pills + bottom-sheet (categories/venue-kinds, neighborhoods, sort) with a live "Show N" apply count and a removable applied-filters row. Sort is trimmed and intent-based (Events: Relevance/Soonest · Places: Featured/Nearest). Venue cards/detail show website/Facebook/Instagram glyphs when present. AI concierge mode (Events only) — toggling it turns the search surface into an immersive solid-petrol panel while the filters and map collapse, so the matched curator quote owns the screen. `?type=` and `?id=` deep-link and survive back/forward. Legacy `map.html?…` and `search.html?…` URLs redirect via `discover-redirect.js`.
- **Saved** — Going / Reading / Past segments via a compact ink-fill segmented control (CSS-only `:checked` switching) that matches Discover's Events|Places toggle. Going/Reading rows are photo-forward cards; the undated Reading list carries the taste nudge. Rows link to detail (events → `venue.html`); re-renders on `wa:bookmarks-synced`.
- **Venue detail** (`venue.html`) — full pick detail: curator quote hero, venue block + bookmark, "More from @handle" section, expandable "Why this matters" context (auto-generated by `generate-context`, hidden until content exists). Action row carries **I'm going · Add to calendar · Share** — Add to calendar builds an `.ics` client-side for dated picks (no dependency), Share uses the native OS share sheet with a clipboard fallback (`share.js`). Linked from every result surface.
- **Curator profiles** (`curator.html`) — handle, tagline, bio, and all picks by that curator (photo-forward cards + taste nudge). Linked from every handle across the site.
- **Places detail** (`place.html`) — standalone venue page: name, kind, neighborhood, social glyphs, map links, and an "Events here" list of picks at that venue (photo-forward cards).
- **Photo-forward cards everywhere** — Discover events, Saved (Going/Reading), Curator picks, venue "more from curator", and place "Events here" all share one `.list-row--card` (full-colour venue photo · body), with the staggered entrance and the card→hero View Transition into a detail page's `.detail-hero`.
- **On-device taste nudge** (`taste.js`) — a 3-question taste profile (energy/company/money) gently re-orders four surfaces (Today's This Week, Discover Relevance, Saved Reading, Curator picks) as a *secondary* stable-sort signal — curation stays primary, nothing leaves the device, no per-card badges. Surfaced as one quiet "· tuned to you" cue linking back to the taste check.
- **CI structural gate** (`.github/workflows/verify.yml`) — `npm run verify` runs on every PR + push to main (no overflow / no console errors / 44px tap targets across every public page × 390/768/1440).
- **404 page** (`404.html`) — matches site aesthetic; static, no JS.
- **AI search: Match me** — natural-language pick finder powered by `match-pick` v8 (Groq, primary model `meta-llama/llama-4-scout-17b-16e-instruct`, fallback `llama-3.3-70b-versatile`). Always returns up to 5 ranked hits (`find_many`). Accessible via the "ask in plain English →" link on Discover.
- **Link previews** — per-pick / per-curator Open Graph rewritten server-side by the Cloudflare Pages middleware (`functions/_middleware.js`): `og:image` is the real venue photo (`=w1200`) for picks with a photo, else the branded `og-image` card (1200×630, Satori + @resvg/resvg-wasm, cached 24 h).
- **Curator's column** — weekly editorial draft auto-generated by `draft-column` (Groq `llama-4-scout`, Gemini `2.5-flash-lite` fallback), approved in admin panel, rendered on Briefing page.
- **Autonomous content pipeline** (Supabase Edge Functions + pg_cron) — Deno functions on cron schedules, no manual entry:
  - `ingest-osm` — pulls cultural venues from OpenStreetMap Overpass into `venues`.
  - `ingest-telegram` — nightly 02:15 UTC: fetches public-channel HTML, upserts into `staging_messages`.
  - `process-staging` — every 30 min: synthesises staging into structured picks (Groq `llama-4-scout` primary, Gemini `2.5-flash` fallback, gated by `pipeline_config.gemini_fallback_enabled`).
  - `generate-context` — nightly 02:30 UTC: 2-paragraph curator-voice context into `picks.context_md`.
  - `enrich-venues` — nightly 03:30 UTC: Wikidata + Nominatim enrichment into `venue_details` (website, address, coords, short_desc), mirrors images to `venue_images`. Respects `manual_lock`.
  - `draft-column` — weekly Mon 08:00 UTC: drafts curator's column pending admin approval.
  - `send-digest` — Saturday 09:00 UTC: sends opted-in users a 5-pick briefing email via Resend.
  - `match-pick` — real-time AI pick matching for Discover's AI concierge mode (Groq, synchronous).
  - `og-image` — 1200×630 PNG fallback cards for picks/curators via Satori + @resvg/resvg-wasm. Cached 24 h. (Picks with a photo use the real venue image instead — see Link previews.)
  - **LLM policy:** Groq-first across all text functions (`llama-4-scout` primary, `llama-3.3-70b` fallback); Gemini (`2.5-flash`/`-lite`) only as a gated fallback, no Search grounding; embeddings on `gemini-embedding-001`. See CLAUDE.md → "LLM model policy".
  - Schedules observable via `ingest_log`.
- **Email digest** — weekly briefing email (Saturday 09:00 UTC). Opt-in toggle on `profile.html`.
- **Profile page** (`profile.html`) — bookmark count, export as JSON, change password, digest opt-in, sign out, delete account (two-step confirmation).
- **Admin panel** (`admin.html`) — paginated pick and venue CRUD; pipeline monitor (staging queue depth + ingest log); draft column approval; venue enrichment (Wikidata/Nominatim) with per-venue lock to protect manual edits. Requires a Supabase service role key.

**One-time setup remaining:**
- **Supabase Auth redirect URL** — configure in Supabase Dashboard → Auth → URL Configuration to point to the deployed domain.
- **Allow user account deletion** — Supabase Dashboard → Authentication → Settings → "Allow users to delete their own accounts".
- **Vilnius public launch** — the city is unlocked for internal testing (`status: 'live'`). It now runs on WanderAlt's **in-house editorial desk**: Events/Today are populated from the `@ra_vilnius` + `@afishavilnius` feeds via `process-staging` (attributed per-feed, with an honest umbrella note on Today), and Places is populated from ~410 OSM venues. Still pending before a real public launch: a **resident curator voice** (no single-voice underground channel exists yet) and the **RA recurring cron** (deliberately unscheduled on ToS grounds — RA only ingests when invoked by hand). See CLAUDE.md → Vilnius notes.

---

## Running in Claude Code

The repo is cloud-ready:

- **Local:** open any HTML in a browser, or `npm start` for a dev server at `http://localhost:5173`. `npm run admin` serves the admin panel at `:8080`.
- **Claude Code on the web:** push to GitHub and connect from [claude.ai/code](https://claude.ai/code). No setup script needed — sessions can run `npm start` directly. Set `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, and `RESEND_API_KEY` as environment variables in the cloud environment settings, not in code.
- **Conventions** for both: see [CLAUDE.md](CLAUDE.md) (token-efficient pipeline rules, LLM model policy, visual conventions).

See [HANDOFF.md](HANDOFF.md) for the engineering reference.
