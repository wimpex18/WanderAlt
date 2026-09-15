# WanderAlt

A static, mobile-first guide to alternative and underground culture in European cities: vinyl shops, art squats, small venues, craft bars, experimental gigs, political talks.

It is a decision surface, not a publication. **A time and a walking distance are the loudest things on every row**, and every listing names the venue or feed it came from.

**Cities:** Tallinn · Helsinki · Riga live. Vilnius unlocked for internal testing. Version stamp lives in `package.json`.

**Status:** pre-release with no production users. A full backend and frontend rewrite is planned. The database holds no venues or events and there is no ingestion pipeline, so pages show empty states.

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
- **URLs**: `?q= ?cat= ?time= ?type= ?within= ?sort= ?view=map ?id=` round-trip; `_redirects` maps retired pages onto current ones.

## Deploying

**Site**: Cloudflare Pages, connected to GitHub. Framework preset None, build command empty, output directory `/`. `_headers` and `_redirects` are picked up automatically. Everything lives on `wanderalt.app`; `wanderalt.com` 301s across.

**Edge functions**: deployed by hand through the Supabase MCP `deploy_edge_function` tool (no CLI, no CI). Committing does not deploy. Preserve each function's `verify_jwt`; run `verify_jwt:true` functions by hand through `public.invoke_wa_fn(fn)`. Deleting a function's directory does not undeploy it; retired functions stay deployed as 410 stubs.

## Backend

Supabase project `aqnsmmbrspkbfcvougeh` (eu-west-1): Postgres 17, REST, Edge Functions. RLS allows SELECT only, plus INSERT on `bookmarks` and `digest_opt_ins`. Function sources live in `supabase/functions/`, migrations in `supabase/migrations/`.

- **Tables**: `picks`, `venues`, `venue_details`, `pick_changes`, `bookmarks`, `saved_lists`, `saved_list_items`, `profiles`, `digest_opt_ins`. The catalogue tables are empty.
- **Edge functions**: `og-image` (share cards), `calendar-feed`, `send-digest` (run by hand), `unsubscribe-digest`.
- **LLM**: `send-digest` writes its intro on free tiers: Mistral (`mistral-small-2603`), then NVIDIA (`nemotron-3.5-lightning-30b-a3b`), then OpenRouter when its key is set.
- **Images**: looked up by identity, never guessed from a name. Wikimedia images go through the `/img/wm/*` Pages Function.
- **Scheduling**: none. Run a function with `select public.invoke_wa_fn('<fn>')`.

### Environment

Cloud sessions need, as environment variables only: `SUPABASE_SERVICE_ROLE_KEY`, `MISTRAL_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`.

## Key constraints

- No build step, no framework, no runtime dependencies, no inline scripts (strict CSP).
- No analytics, no third-party scripts, no cookie banner.
- Free tiers only.
- Scraped text is untrusted: escape with `WA.UI.esc()`, filter URLs with `WA.UI.safeUrl()`.

## Open

- Supabase Auth redirect URL → deployed domain (Dashboard → Auth → URL Configuration).
- Self-serve account deletion (Dashboard → Authentication → Settings).
- Leaked-password protection (Dashboard → Auth).
- Delete the 410 stub edge functions and the `pick-images` storage bucket in the dashboard.
- The digest signup (Explore, You, About) promises a Thursday email; `send-digest` is not scheduled.
- Design question: a geometric sans for headlines, with Fraunces kept for timetable rows (owner's aesthetic call).

Conventions for AI coding sessions: [CLAUDE.md](CLAUDE.md) and `.claude/rules/`.
