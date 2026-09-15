# WanderAlt

Static site for underground culture in Tallinn, Helsinki and Riga (live) and Vilnius (internal testing). No production users. The database holds no venues or events, so every page shows its empty state. A decision surface, not a publication: **a time and a walking distance on every row**, and provenance (the venue or feed a listing came from) on every listing.

Stack: plain HTML/CSS/vanilla JS at the repo root · Supabase (Postgres 17, REST, Edge Functions; project `aqnsmmbrspkbfcvougeh`, eu-west-1) · Cloudflare Pages on `wanderalt.app`.

Path-scoped detail loads automatically from `.claude/rules/`: `frontend.md` (pages, `wa.css`, design system) and `supabase.md` (schema, edge functions, images).

## Commands

Node 24 LTS (`.nvmrc`); `npm install` brings the dev tools (`http-server`, `sharp`, `png-to-ico`).

```bash
npm start              # dev server, http://localhost:5173 (no CSP)
npm run admin          # admin panel on :8080 (service-role key kept in localStorage)
npm run build:icons    # rasterise PNG icons from brand/ SVG masters
```

## Map

- Pages: `index.html` Explore · `discover.html` Tonight · `saved.html` · `detail.html` (events and places) · `source.html` · `profile.html` · `about.html` · `admin.html` · `404.html`. Each has a matching `.js`.
- `wa.css` is the whole design system. `admin.css` / `admin-tokens.css` load on admin only.
- `supabase.js` — data access + public anon key; the lists stay empty on fetch failure. Venues are kind-filtered (`VENUE_KINDS`) and paged past PostgREST's 1000-row cap.
- `ui-helpers.js` — `WA.UI`: `esc`, `safeUrl`, `priceLabel`, `descriptionOr`, `passwordField`.
- `geo.js` (`WA.Geo`), `hours.js` (`WA.Hours`), `when.js` — distance, opening hours, time parsing.
- `bookmark.js` + `lists.js` — one saves store, localStorage-first, cloud sync on sign-in. `auth.js` — Supabase REST auth, no SDK.
- `sw.js` + `offline.js` — service worker and offline banner. `marks.js` — image fallback and small-image handling.
- `functions/_middleware.js` — Pages Function rewriting OG meta. `functions/img/wm/[[path]].js` — Pages Function proxying Wikimedia images on `/img/wm/*`.
- `vendor/` — self-hosted MapLibre GL 6.9.0 (ESM: `maplibre-gl.mjs`, `-shared.mjs`, `-worker.mjs`, `.css`), identical to the npm release. `maplibre-loader.js` `import()`s it after first paint on `discover.html` and `admin.html`, sets `window.maplibregl` and fires `wa:maplibre-ready`; upgrade = swap the four files. `fonts/` — self-hosted faces.
- `_redirects` folds `wanderalt.com` and `www` onto `wanderalt.app`.
- `supabase/functions/` — edge function sources; `supabase/migrations/` — the schema.

## Hard rules

- **No build step.** No framework, bundler or runtime dependencies. devDependencies for tooling only.
- **No inline `<script>` or inline handlers** — strict CSP.
- **No analytics, no third-party scripts, no cookie banner.**
- **Free tiers only.** No paid APIs.
- **Never add a bare→`.html` redirect to `_redirects`** — Pages already serves pretty URLs, so it loops.
- **No automated tests or CI.** Don't add a test framework unless asked.
- **Don't add CSS variables without asking.**
- A visual change means that change only. Open PRs ready for review, not drafts. Keep README.md current when scope changes.

## Security

- **The anon key in `supabase.js` is public on purpose.** RLS is SELECT-only on the catalogue; users read, insert and delete only their own saves. The service-role key is never committed; cloud sessions read `SUPABASE_SERVICE_ROLE_KEY`, and `admin.js` writes with it.
- **Every SECURITY DEFINER function in `public` is an anon-callable RPC** (`/rest/v1/rpc/…`). Revoke EXECUTE from `anon, authenticated, public` in the same migration.
- **`verify_jwt` is not an auth gate** — the anon key is public. Before deploying, ask what an unauthenticated stranger could make the function do; gate writes and outbound calls on the service-role key in code.
- `anon`/`authenticated` have `search_path = public, extensions`. Own-row policies use `(select auth.uid())`.
- `pg_net` is not installed and must stay that way: Supabase grants `anon` EXECUTE on `net.http_*` through a grant our role cannot revoke.
- Leaked-password protection is off (Auth settings in the dashboard).

### Rendering untrusted content

Pick, venue and source text comes from outside sources — treat it as attacker-controlled.
- Wrap every interpolated field in `WA.UI.esc()`, including inside `aria-label`, `title`, `data-*`, and values built by meta-line helpers.
- Every DB-sourced URL in `href`/`src` goes through `WA.UI.safeUrl()` (http(s) and relative only). `esc()` does not stop `javascript:`.
- The dev server sends no CSP, so escaping is the first line of defence.

## Deploy

- **Pages**: GitHub-connected, preset None, build command empty, output `/`. `_headers`, `_redirects` and `functions/` deploy with every push.
- **Edge functions**: only via the Supabase MCP `deploy_edge_function` tool. Committing does not deploy; change a function → deploy it in the same session → say so in the commit.
- **`deploy_edge_function` defaults `verify_jwt` to true.** Always pass the function's existing value explicitly.
- **The repo cannot tell you what is deployed.** Deleting a function's directory does not undeploy it; delete it in the dashboard too. Commits that touch a function without changing its behaviour carry a `No-Deploy: comment-only` trailer.
- **The share surface fails open silently**: `functions/_middleware.js` and `og-image` both return a valid 200 card on failure. Judge the rendered card; `og-image?…&debug=1` returns the error instead of the fallback. Satori rejects elements without an explicit `display`.

## Data

- The site reads `picks WHERE archived_at IS NULL`, active `venues` of the kinds in `VENUE_KINDS`, and `venue_details`; all are empty. The admin panel adds picks and venues by hand.
- Provenance is `picks.handle`, shown as `via @handle`. Money is `is_free` plus `price_min`/`price_max`/`currency`.
- **A venue or event photo is looked up by identity, never guessed from a name.** A wrong photo is worse than none; no photo draws the category mark.

## Environment

The edge functions read only Supabase's built-in variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

## Voice

Handles start with `@`. Metadata reads `Neighborhood · type · day + time`. No em-dashes in headlines, no exclamation marks, never "discover" as a verb, no "No results found", no marketing register — the back page of a newsletter.
