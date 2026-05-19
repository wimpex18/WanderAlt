# WanderAlt

A static, mobile-first website for discovering **alternative / underground culture in European cities**: vinyl shops, art squats, small music venues, craft bars, experimental gigs, political talks. Every item is vouched for by a human curator — the curator's voice is the product.

First city: **Tallinn**. First screen: **Briefing** (the default landing).

---

## Structure

```
.
├── index.html            # Briefing — editorial landing page (Tonight + This Week). No filter UI.
├── discover.html         # Discover — unified search + filter + map surface (replaces map + search)
├── map.html              # Redirect stub → discover.html?view=map (preserves legacy ?id, ?day params)
├── search.html           # Redirect stub → discover.html (preserves legacy ?q, ?mode=match params)
├── saved.html            # Saved — Going / Reading / Past segments
├── venue.html            # Venue detail — curator quote hero, venue block, context, more from curator
├── curator.html          # Curator profile — handle, tagline, bio, all picks
├── profile.html          # User account — bookmarks, digest, export, delete account
├── admin.html            # Admin panel — pick/venue CRUD, pipeline monitor, column approval
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
├── map-world.js          # SVG city-plane renderer and category colour palette
├── saved.js              # Saved renderer — injects bookmarked rows from catalog
├── venue.js              # Venue detail renderer — back-link returns to full Discover URL
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

Canonical mobile design width: **390px**. Responsive up to desktop with a constrained **680px reading column** (editorial feel — prevents the content from sprawling on large screens).

---

## Voice-first hierarchy

The Briefing screen is designed around Version B of the visual direction: the **curator's quote is the loudest thing on the page** — larger than the venue photo, larger than the venue name. Everything else serves that voice:

- The venue block sits beneath the quote as the "what they meant" payoff, signalled by a small **"THEY MEAN →"** transition label.
- Metadata (neighborhood · type · time · curator handle) is set in monospace to read as "filing system" — deliberately quiet next to the serif quote.
- Section dividers are **1px horizontal rules**, not background changes or gaps.
- Strict left alignment. No centered text blocks. No shadows. No gradients. Corners max 4px.

The aesthetic reference is **a printed cultural weekly** (*The Gentlewoman*, *Apartamento*, a good city arts newspaper) translated into a web interface — not Airbnb, not Eventbrite.

---

## Typography

Three typefaces, all free via Google Fonts:

| Family | Role | Why |
|---|---|---|
| **Instrument Serif** | Display — the hero quote, section headlines, wordmark | Magazine-style display cut with a genuinely beautiful italic. Designed for large sizes; gives the "printed cultural weekly" feel instantly. |
| **Source Serif 4** | Body — event names, longer running text | Readable at small sizes, has real optical sizes, pairs naturally with Instrument Serif. Both are restrained and editorial rather than startup-corporate. |
| **JetBrains Mono** | Metadata — neighborhood · type · time, curator handles, nav labels, eyebrow labels | Clean modern monospace with a distinctive italic. Reads as a filing system next to the serifs, which is exactly the tension we want. |

Weights actually loaded: Source Serif 4 400/500/600 (+ italic 400), Instrument Serif regular/italic, JetBrains Mono 400/500 (+ italic 400). Kept the subset minimal to stay fast.

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
- **≥ 768px (tablet / desktop):** content column caps at 680px and centers. Hero quote grows (`--fs-quote` goes from 32px → 44px → 52px at ≥1100px). **Bottom nav becomes a sticky top nav bar** under the wordmark — a thin row of masthead-style links. Rationale: a side rail would compete with the single-column editorial read; a persistent bottom bar on desktop feels too app-y; a masthead nav reinforces the "cultural weekly" metaphor.
- **`prefers-reduced-motion`** respected.
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

## Deploying for free

### Cloudflare Pages

1. Push this directory to a GitHub repo.
2. In Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select the repo. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
4. Deploy. You get a `*.pages.dev` URL immediately; add a custom domain from the project settings.

### Netlify

Easiest — drag-and-drop:

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag the project folder into the browser.
3. Done. Claim the site to attach a custom domain.

Or Git-connected:

1. Push to GitHub.
2. Netlify → **Add new site** → **Import an existing project** → pick repo.
3. Build command: *(empty)*. Publish directory: `.`.
4. Deploy.

---

## Roadmap

**Built:**
- **Content catalog** (`catalog.js`) — static fallback catalog (a small seed of Tallinn venues + past entries + fictional curator bios). Used only when the Supabase fetch fails; live data lives in the `picks`, `venues`, `curators` tables.
- **Supabase data layer** (`supabase.js`) — live data from Supabase REST API with 2-second timeout and graceful `Promise.allSettled` fallback to `catalog.js`. Exposes `WA.BASE_URL` and `WA.ANON_KEY` for auth and bookmarks.
- **Auth** (`auth.js`) — email/password + Google OAuth + password reset via Supabase REST (no SDK). JWT decoded client-side. Session stored in localStorage. Dispatches `wa:signed-in` / `wa:signed-out`.
- **Cloud bookmarks** (`bookmark.js`) — localStorage primary store with Supabase `bookmarks` table sync on sign-in. `wa:bookmarks-synced` event triggers Briefing and Saved re-render.
- **Briefing** — Tonight hero + This Week list rendered from catalog; bookmark toggles persist via `localStorage`; curator handles link to profile pages. Thumbnails show real `image_url` photos when available, CSS halftone placeholder otherwise.
- **Map** — full-bleed hand-drawn plane, dynamic pins from live catalog (`pin_num/left/top`), peek bottom sheet with **drag-expand** (pointer events, snap to peek/60 vh). **Filter chips** (Tonight / This week / Places) show and hide pins; `01/07` pos counter tracks the filtered set.
- **Discover** (`discover.html`) — unified search + filter + map surface. Replaces the old standalone Search and Map pages. Mobile-first (list default, Map FAB to toggle). Desktop ≥1024px splits list left / map right. Shared filter state across both panes (q, time, category, neighborhood, mood). Filter pill row + bottom-sheet ("All filters") for categories, neighborhoods, sort. AI "ask in plain English" mode (`match-pick`, always `find_many`). `?id=` deep-links to an open pin — survives filter changes and browser back/forward. Legacy `map.html?…` and `search.html?…` URLs redirect to Discover via `discover-redirect.js`.
- **Saved** — Going / Reading / Past segments with CSS-only tab switching. Going and Reading rows link to venue detail; re-renders on `wa:bookmarks-synced`.
- **Venue detail** (`venue.html`) — full pick detail: curator quote hero, venue block + bookmark, "More from @handle" section, expandable "Why this matters" context (auto-generated by `generate-context`, hidden until content exists). Linked from every result surface.
- **Curator profiles** (`curator.html`) — handle, tagline, bio, and all picks by that curator. Linked from every handle across the site.
- **404 page** (`404.html`) — matches site aesthetic; static, no JS.
- **AI search: Match me** — natural-language pick finder powered by `match-pick` v8 (Groq, primary model `meta-llama/llama-4-scout-17b-16e-instruct`, fallback `llama-3.3-70b-versatile`). Always returns up to 5 ranked hits (`find_many`). Accessible via the "ask in plain English →" link on Discover.
- **OG images** (`og-image` edge function) — 1200×630 PNG cards for picks and curator pages via Satori + @resvg/resvg-wasm. Cached 24 h.
- **Curator's column** — weekly editorial draft auto-generated by `draft-column` (Gemini 2.5 Flash, Mondays 08:00 UTC), approved in admin panel, rendered on Briefing page.
- **Autonomous content pipeline** (Supabase Edge Functions + pg_cron) — Deno functions on cron schedules, no manual entry:
  - `ingest-osm` — pulls cultural venues from OpenStreetMap Overpass into `venues`.
  - `ingest-telegram` — nightly 02:15 UTC: fetches public-channel HTML, upserts into `staging_messages`.
  - `process-staging` — every 30 min: synthesises staging into structured picks (Gemini 2.5 Flash, Groq fallback).
  - `generate-context` — nightly 02:30 UTC: 2-paragraph curator-voice context into `picks.context_md`.
  - `enrich-venues` — nightly 03:30 UTC: Wikidata + Nominatim enrichment into `venue_details` (website, address, coords, short_desc), mirrors images to `venue_images`. Respects `manual_lock`.
  - `draft-column` — weekly Mon 08:00 UTC: drafts curator's column pending admin approval.
  - `send-digest` — Saturday 09:00 UTC: sends opted-in users a 5-pick briefing email via Resend.
  - `match-pick` — real-time AI pick matching for the Search page (Groq, synchronous).
  - `og-image` — 1200×630 PNG cards for picks/curators via Satori + @resvg/resvg-wasm. Cached 24 h.
  - Schedules observable via `ingest_log`.
- **Email digest** — weekly briefing email (Saturday 09:00 UTC). Opt-in toggle on `profile.html`.
- **Profile page** (`profile.html`) — bookmark count, export as JSON, change password, digest opt-in, sign out, delete account (two-step confirmation).
- **Admin panel** (`admin.html`) — paginated pick and venue CRUD; pipeline monitor (staging queue depth + ingest log); draft column approval; venue enrichment (Wikidata/Nominatim) with per-venue lock to protect manual edits. Requires a Supabase service role key.

**One-time setup remaining:**
- **Real Telegram channels** — `sources` rows 2–5 have placeholder slugs and are disabled. To go live: `UPDATE sources SET channel = '<real-slug>', enabled = true WHERE id = <N>`.
- **Supabase Auth redirect URL** — configure in Supabase Dashboard → Auth → URL Configuration to point to the deployed domain.
- **Allow user account deletion** — Supabase Dashboard → Authentication → Settings → "Allow users to delete their own accounts".
- **City selector** — data model supports multiple cities; UI is a placeholder.

---

## Running in Claude Code

The repo is cloud-ready:

- **Local:** open any HTML in a browser, or `npm start` for a dev server at `http://localhost:5173`. `npm run admin` serves the admin panel at `:8080`.
- **Claude Code on the web:** push to GitHub and connect from [claude.ai/code](https://claude.ai/code). No setup script needed — sessions can run `npm start` directly. Set `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, and `RESEND_API_KEY` as environment variables in the cloud environment settings, not in code.
- **Conventions** for both: see [CLAUDE.md](CLAUDE.md) (token-efficient pipeline rules, LLM model policy, visual conventions).

See [HANDOFF.md](HANDOFF.md) for the engineering reference.
