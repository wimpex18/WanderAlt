# WanderAlt

A static, mobile-first guide to alternative and underground culture in European cities: vinyl shops, art squats, small venues, craft bars, experimental gigs, political talks.

It is a decision surface, not a publication. **A time and a walking distance are the loudest things on every row**, and every listing names the venue or feed it came from.

**Cities:** Tallinn · Helsinki · Riga live. Vilnius unlocked for internal testing. Version stamp lives in `package.json`.

**Status:** no production users. The database holds no venues or events, so pages show empty states.

## Running it

No build step. Open `index.html`, or:

```bash
npm install   # Node 24 LTS
npm start
```

Serves the site at `http://localhost:5173` (no CSP locally).

| Command | Does |
| --- | --- |
| `npm run admin` | Admin panel on `:8080`; needs a Supabase service-role key, kept in localStorage |
| `npm run build:icons` | Rasterises the PNG icon ladder from `brand/` (the only use of `sharp` / `png-to-ico`) |

There is no automated test suite. Check changes in a browser at 390, 768 and 1440 px, in both themes. The service worker caches static assets stale-while-revalidate, so clear it when debugging.

## How it's put together

Plain `.html` pages at the repo root, each with a matching `.js` renderer, sharing one stylesheet, `wa.css` (tokens, components, day and dusk themes).

| Page | File |
| --- | --- |
| Explore — capsule (Where / When / What), scope tabs (All / Events / Places), carousels | `index.html` |
| Tonight — timetable, seven-day density strip, filter sheet, map mode | `discover.html` |
| Detail — one template for events and places | `detail.html` |
| Source — the venue or feed a listing came from | `source.html` |
| Saved, You, About, Admin, 404 | `saved.html`, `profile.html`, `about.html`, `admin.html`, `404.html` |

- **Data**: `supabase.js` reads Supabase REST with the public anon key and renders empty states if the fetch fails.
- **Auth**: email/password and Google OAuth against Supabase REST, no SDK. Saves and lists are localStorage-first with cloud sync on sign-in.
- **Map**: MapLibre GL 6.9.0 (ES modules), self-hosted in `vendor/`, over OpenFreeMap vector tiles. No API key; lazy-loaded after first paint.
- **Fonts**: self-hosted in `fonts/` — Plus Jakarta Sans (chrome), Fraunces (catalogue voice), Geist Mono (facts).
- **Offline**: `sw.js` precaches the shell and the last picks/venues responses; the banner says how stale they are.
- **Sharing**: `functions/_middleware.js` (Pages Function) rewrites Open Graph tags per pick and source; the `og-image` edge function renders fallback cards.
- **Images**: the Pages Function `functions/img/wm/[[path]].js` serves Wikimedia images from our origin without third-party cookies.
- **URLs**: Tonight round-trips `?date= ?q= ?cat= ?time= ?sort= ?within= ?view=map`; Explore reads `?scope=`; detail and source read `?id=`, `?venue=`, `?handle=`.

## Deploying

**Site**: Cloudflare Pages, connected to GitHub. Framework preset None, build command empty, output directory `/`. `_headers` and `_redirects` are picked up automatically. Everything lives on `wanderalt.app`; `wanderalt.com` 301s across.

**Edge functions**: deployed by hand through the Supabase MCP `deploy_edge_function` tool (no CLI, no CI). Committing does not deploy. Preserve each function's `verify_jwt`. Deleting a function's directory does not undeploy it.

## Backend

Supabase project `aqnsmmbrspkbfcvougeh` (eu-west-1): Postgres 17, REST, Edge Functions. RLS allows SELECT only on the catalogue; users manage only their own saves.

- **Tables**: `picks`, `venues`, `venue_details` (empty), `bookmarks`, `saved_lists`, `saved_list_items`. The schema is `supabase/migrations/20260915090000_baseline.sql`.
- **Edge functions** (`supabase/functions/`): `og-image` (share cards), `calendar-feed`.
- **Images**: looked up by identity, never guessed from a name. Wikimedia images go through the `/img/wm/*` Pages Function.
- **Auth**: leaked-password protection is off.

### Environment

Cloud sessions need `SUPABASE_SERVICE_ROLE_KEY` as an environment variable.

## Key constraints

- No build step, no framework, no runtime dependencies, no inline scripts (strict CSP).
- No analytics, no third-party scripts, no cookie banner.
- Free tiers only.
- Listing text is untrusted: escape with `WA.UI.esc()`, filter URLs with `WA.UI.safeUrl()`.

Conventions for AI coding sessions: [CLAUDE.md](CLAUDE.md) and `.claude/rules/`.
