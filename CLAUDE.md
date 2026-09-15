# WanderAlt

Static site for underground culture in Tallinn, Helsinki and Riga (live) and Vilnius (internal testing). Pre-release: no production users, and a full backend and frontend rewrite is planned, so retired code and data are deleted rather than kept. **The database holds no venues or events, there is no ingestion pipeline and no cron jobs run**; every page shows its empty state. A decision surface, not a publication: **a time and a walking distance on every row**, and provenance (the venue or feed a listing came from) instead of a named curator.

Stack: plain HTML/CSS/vanilla JS at the repo root · Supabase (Postgres, REST, Edge Functions; project `aqnsmmbrspkbfcvougeh`, eu-west-1, Postgres 17) · Cloudflare Pages on `wanderalt.app`.

Path-scoped detail loads automatically from `.claude/rules/`: `frontend.md` (pages, `wa.css`, design system) and `supabase.md` (schema, edge functions, deploy, images).

## Commands

Node 24 LTS (`.nvmrc`) for local scripts; `npm install` brings the pinned dev tools (`http-server`, `sharp`, `png-to-ico`).

```bash
npm start              # dev server, http://localhost:5173 (no CSP)
npm run admin          # admin panel on :8080 (service-role key kept in localStorage)
npm run build:icons    # rasterise PNG icons from brand/ SVG masters
```

## Map

- Pages: `index.html` Explore · `discover.html` Tonight · `saved.html` · `detail.html` (events and places) · `source.html` · `profile.html` · `about.html` · `admin.html` · `404.html`. Each has a matching `.js`. Filenames of the first two stay unchanged for links in the wild; `_redirects` maps retired pages.
- `wa.css` is the whole design system. `admin.css` / `admin-tokens.css` load on admin only.
- `supabase.js` — data access + public anon key; the lists stay empty on fetch failure (no static fallback). Venues are kind-filtered (`VENUE_KINDS`) and paged past PostgREST's 1000-row cap.
- `ui-helpers.js` — `WA.UI`: `esc`, `safeUrl`, `priceLabel`, `descriptionOr`, `passwordField`.
- `geo.js` (`WA.Geo`), `hours.js` (`WA.Hours`), `when.js` — distance, opening hours, time parsing.
- `bookmark.js` + `lists.js` — one saves store, localStorage-first, cloud sync on sign-in. `auth.js` — Supabase REST auth, no SDK.
- `sw.js` + `offline.js` — service worker and offline banner. `marks.js` — image fallback and small-image handling.
- `functions/_middleware.js` — Pages Function rewriting OG meta. `functions/img/wm/[[path]].js` — Pages Function proxying Wikimedia images on `/img/wm/*` (raster only, no cookies).
- `vendor/` — self-hosted MapLibre GL 6.9.0 (ESM only: `maplibre-gl.mjs`, `-shared.mjs`, `-worker.mjs`, `.css`), byte-identical to the npm release. `maplibre-loader.js` `import()`s it after first paint on `discover.html` and `admin.html`, sets `window.maplibregl`, and fires `wa:maplibre-ready`; upgrade = swap the four files. `fonts/` — self-hosted faces.
- `supabase/functions/` — edge function sources (live functions only); `supabase/migrations/` — one baseline of the current schema (`20260915090000_baseline.sql`); new changes go in new migration files after it.

## Hard rules

- **No build step, ever.** No framework, bundler or runtime dependencies. devDependencies for tooling only.
- **No inline `<script>` or inline handlers** — strict CSP.
- **No analytics, no third-party scripts, no cookie banner.**
- **Free tier only.** No paid APIs; Google Cloud billing is gone.
- **Never add a bare→`.html` redirect to `_redirects`** — infinite loop.
- **No automated tests or CI.** Don't add a test framework unless asked.
- **Don't add CSS variables without asking.**
- A visual change means that change only. Open PRs ready for review, not drafts. Keep README.md current when scope changes.

## Security

- **The anon key in `supabase.js` is public on purpose.** RLS is SELECT-only on the catalogue; users read, insert and delete only their own saves. The service-role key is never committed; cloud sessions read `SUPABASE_SERVICE_ROLE_KEY`.
- **Every SECURITY DEFINER function in `public` is an anon-callable RPC** (`/rest/v1/rpc/…`). Revoke EXECUTE from `anon, authenticated, public` in the same migration.
- **`verify_jwt` is not an auth gate** — the anon key is public. Before deploying, ask what an unauthenticated stranger could make the function do; gate anything outward-facing (mail, writes, LLM calls) on the service-role key in code.
- `anon`/`authenticated` have `search_path = public, extensions`. `admin.js` writes with the service-role key. Own-row policies use `(select auth.uid())`.
- Extensions `pg_net` and `pg_cron` are not installed: `net.http_*` is granted to `anon` by Supabase's admin role and cannot be revoked, so installing pg_net again reopens a server-side HTTP client to the public.
- Open: leaked-password protection is off (dashboard toggle under Auth).

### Rendering untrusted content

Pick, venue and source text comes from outside sources — treat it as attacker-controlled.
- Wrap every interpolated field in `WA.UI.esc()`, including inside `aria-label`, `title`, `data-*`, and values built by meta-line helpers.
- Every DB-sourced URL in `href`/`src` goes through `WA.UI.safeUrl()` (http(s) and relative only). `esc()` does not stop `javascript:`.
- The dev server sends no CSP, so escaping is the first line of defence.

## Deploy

- **Pages**: GitHub-connected, preset None, build command empty, output `/`. `_headers` and `_redirects` apply automatically. `wanderalt.com` 301s to `wanderalt.app`.
- **Edge functions**: only via the Supabase MCP `deploy_edge_function` tool — no `supabase` CLI. Committing does not deploy. Change a function → deploy it in the same session → say so in the commit.
- **`deploy_edge_function` defaults `verify_jwt` to true.** Always pass the function's existing value explicitly; flipping it breaks callers.
- **The repo cannot tell you what is deployed.** Deleting a directory does not undeploy a function; after retiring anything, curl the URL. Retired functions stay deployed as 410 stubs (listed in `.claude/rules/supabase.md`). Commits that touch a function without changing its behaviour carry a `No-Deploy: comment-only` trailer.
- **Share surface fails open silently**: `functions/_middleware.js` and the `og-image` function both return a valid 200 card on failure. Judge the rendered card; `og-image?…&debug=1` returns the error instead of the fallback. Satori rejects elements without an explicit `display`.

## Data

- The site reads `picks WHERE archived_at IS NULL`, active `venues` of the kinds in `VENUE_KINDS`, and `venue_details`. All three are empty; the next backend decides how they are filled. The admin panel can add picks and venues by hand.
- Pick id format is `channel-message_id`; provenance is `picks.handle`, shown as `via @handle`.
- Money is `is_free` plus `price_min`/`price_max`/`currency`.
- **A venue or event photo is looked up by identity, never guessed from a name.** A wrong photo is worse than none; no photo draws the category mark.
- When a model writes data, a prompt is a request, not a constraint: enforce allowed values, reject `"null"` strings and drop restatements (`WA.UI.descriptionOr`) in code.

## Environment

The live edge functions read only Supabase's built-in variables. Cloud sessions read `SUPABASE_SERVICE_ROLE_KEY`.

## Voice

Source handles start with `@` and match the Telegram slug. Metadata reads `Neighborhood · type · day + time`. No em-dashes in headlines, no exclamation marks, never "discover" as a verb, no "No results found", no marketing register — the back page of a newsletter.
