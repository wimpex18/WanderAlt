# WanderAlt

Static site for underground culture in Tallinn, Helsinki and Riga (live) and Vilnius (internal testing). Pre-release: no production users, and a full rewrite is planned, so retired code and data are deleted rather than kept. A decision surface, not a publication: **a time and a walking distance on every row**, and provenance (the venue or feed a listing came from) instead of a named curator.

Stack: plain HTML/CSS/vanilla JS at the repo root · Supabase (Postgres, REST, Edge Functions, pg_cron; project `aqnsmmbrspkbfcvougeh`, eu-west-1, Postgres 17) · Cloudflare Pages on `wanderalt.app`.

Path-scoped detail loads automatically from `.claude/rules/`: `frontend.md` (pages, `wa.css`, design system) and `supabase.md` (functions, crons, pipeline, images, LLM).

## Commands

Node 24 LTS (`.nvmrc`) for local scripts; `npm install` brings the pinned dev tools (`http-server`, `sharp`, `png-to-ico`).

```bash
npm start              # dev server, http://localhost:5173 (no CSP)
npm run admin          # admin panel on :8080 (service-role key kept in localStorage)
npm run catalog        # regenerate static fallback catalog.js from live Supabase
npm run build:icons    # rasterise PNG icons from brand/ SVG masters
```

## Map

- Pages: `index.html` Explore · `discover.html` Tonight · `saved.html` · `detail.html` (events and places) · `source.html` · `profile.html` · `walk.html` · `about.html` · `admin.html` · `404.html`. Each has a matching `.js`. Filenames of the first two stay unchanged for links in the wild; `_redirects` maps retired pages.
- `wa.css` is the whole design system. `admin.css` / `admin-tokens.css` load on admin only.
- `supabase.js` — data access + public anon key; falls back to `catalog.js` on fetch failure. Venues are kind-filtered (`VENUE_KINDS`) and paged past PostgREST's 1000-row cap.
- `ui-helpers.js` — `WA.UI`: `esc`, `safeUrl`, `priceLabel`, `descriptionOr`, `passwordField`.
- `geo.js` (`WA.Geo`), `hours.js` (`WA.Hours`), `when.js` — distance, opening hours, time parsing.
- `bookmark.js` + `lists.js` — one saves store, localStorage-first, cloud sync on sign-in. `auth.js` — Supabase REST auth, no SDK.
- `sw.js` + `offline.js` — service worker and offline banner. `marks.js` — image fallback and small-image handling.
- `functions/_middleware.js` — Pages Function rewriting OG meta. `functions/img/wm/[[path]].js` — Pages Function proxying Wikimedia images on `/img/wm/*` (raster only, no cookies).
- `vendor/` — self-hosted MapLibre GL 6.9.0 (ESM only: `maplibre-gl.mjs`, `-shared.mjs`, `-worker.mjs`, `.css`), byte-identical to the npm release. `maplibre-loader.js` `import()`s it after first paint on `discover.html` and `admin.html`, sets `window.maplibregl`, and fires `wa:maplibre-ready`; upgrade = swap the four files. `fonts/` — self-hosted faces.
- `supabase/functions/` — edge function sources (live functions only); `supabase/migrations/` — migration journal.
- `walks.json` — three hand-written routes.

## Hard rules

- **No build step, ever.** No framework, bundler or runtime dependencies. devDependencies for tooling only.
- **No inline `<script>` or inline handlers** — strict CSP.
- **No analytics, no third-party scripts, no cookie banner.**
- **Free tier only.** Mistral, NVIDIA and OpenRouter free tiers, Nominatim (staggered, never concurrent). Google Cloud billing is gone.
- **Never add a bare→`.html` redirect to `_redirects`** — infinite loop.
- **No automated tests or CI.** Don't add a test framework unless asked.
- **Don't add CSS variables without asking.**
- A visual change means that change only. Open PRs ready for review, not drafts. Keep README.md current when scope changes.

## Security

- **The anon key in `supabase.js` is public on purpose.** RLS is SELECT-only, with INSERT on `bookmarks` and `digest_opt_ins`. The service-role key is never committed; cloud sessions read `SUPABASE_SERVICE_ROLE_KEY`.
- **Every SECURITY DEFINER function in `public` is an anon-callable RPC** (`/rest/v1/rpc/…`). Revoke EXECUTE from `anon, authenticated, public` in the same migration. pg_cron runs as job owner and is unaffected.
- **`verify_jwt` is not an auth gate** — the anon key is public. Before deploying, ask what an unauthenticated stranger could make the function do; gate anything outward-facing (mail, writes, LLM calls) on the service-role key in code.
- `anon`/`authenticated` have `search_path = public, extensions`. `pg_net` is non-relocatable and stays in `public`; EXECUTE on `net.*` is revoked from `anon`.
- Pipeline-internal tables (`sources`, `ingest_log`, `pick_changes`, `staging_messages`, `pipeline_config`, `venue_images`) have no anon/authenticated access — intended deny-all. Edge functions and `admin.js` use the service-role key.
- Cron-only SQL functions (`wa_*`, `reset_tonight`) have EXECUTE revoked from API roles. Own-row policies use `(select auth.uid())`.
- `digest_opt_ins` INSERT policy requires a plausible email, one of the four cities, and `user_id` null or your own.
- Open: leaked-password protection is off (dashboard toggle under Auth).

### Rendering untrusted content

Pick, venue and source text is scraped and LLM-processed — treat it as attacker-controlled.
- Wrap every interpolated field in `WA.UI.esc()`, including inside `aria-label`, `title`, `data-*`, and values built by meta-line helpers.
- Every DB-sourced URL in `href`/`src` goes through `WA.UI.safeUrl()` (http(s) and relative only). `esc()` does not stop `javascript:`.
- The dev server sends no CSP, so escaping is the first line of defence.

## Deploy

- **Pages**: GitHub-connected, preset None, build command empty, output `/`. `_headers` and `_redirects` apply automatically. `wanderalt.com` 301s to `wanderalt.app`.
- **Edge functions**: only via the Supabase MCP `deploy_edge_function` tool — no `supabase` CLI. Committing does not deploy. Change a function → deploy it in the same session → say so in the commit.
- **`deploy_edge_function` defaults `verify_jwt` to true.** Always pass the function's existing value explicitly; flipping it breaks callers.
- **Crons calling `verify_jwt:true` functions go through `public.invoke_wa_fn(fn)`**, which supplies the Authorization header. A raw `net.http_post` without it 401s silently.
- **The repo cannot tell you what is deployed.** Deleting a directory does not undeploy a function; after retiring anything, curl the URL. Retired functions stay deployed as 410 tombstones with no source in the repo: `check-secrets`, `classify-moods`, `discover-venues`, `draft-column`, `embed-picks`, `generate-context`, `import-pick-photos`, `load-places-index`, `match-pick`. Commits that touch a function without changing its behaviour carry a `No-Deploy: comment-only` trailer.
- **Share surface fails open silently**: `functions/_middleware.js` and the `og-image` function both return a valid 200 card on failure. Judge the rendered card; `og-image?…&debug=1` returns the error instead of the fallback. Satori rejects elements without an explicit `display`.

## Pipeline and data

Tables: `picks` (events), `venues` (OSM places), `venue_details` (enrichment by venue name), `venue_images` (photo cache), `sources`, `staging_messages`, `ingest_log`, `pick_changes`, `pipeline_config`, `bookmarks`, `saved_lists`, `saved_list_items`, `profiles`, `digest_opt_ins`; view `image_health`.

```
ingest-* → staging_messages → process-staging → picks
         → enrich-images / enrich-pick-images → geocode-picks → enrich-venues
         → enrich-venue-images → verify-images
         → rotate-tonight → archive-stale → dedup → purge
```

- Sources are rows in `sources`. Telegram, RSS and Fienta sources need no code.
- **Staging upserts must carry `?on_conflict=channel,message_id`** or repeats 409 and `bumpSeen()` never runs.
- **A new city needs entries in `CITY_CONTEXT` (`process-staging`) and `CITY_CENTER` (`geocode-picks`)** or it silently falls back / 400s.
- Every pick comes from a source (`auto_generated`); there are no hand-written fixtures. `sources.handle` is the provenance shown as `via @handle`.
- `process-staging` enforces the kind list and rejects `"null"` strings; the prompt alone does not.
- `claim_staging_message()` claims from the least recently claimed source (its oldest message) and first rejects past events: feed rows by `payload.ends_at`/`starts_at`, Telegram/RSS posts older than 14 days. FIFO let `hel-linkedevents` (~80% of the queue) starve every other city. Throughput is 10 messages per hourly run.
- App reads picks `WHERE archived_at IS NULL`. Pick id is `channel-message_id`. Archived picks hard-delete after 14 days; venue absence from OSM counts after 90.
- `process-staging` copies facts verbatim from `staging_messages.payload`; the LLM supplies only English title, one sentence, kind. `saysSomething()` blanks restatements.
- `picks.price` is effectively empty; `is_free` is the only money signal with coverage. `picks.venue_id` is almost never set: picks, `venues` and `venue_details` join on lowercased venue name.
- **Never poll the pipeline.** Fire, say "draining, check back in ~10 minutes", end the turn. Health = one-shot SQL on `staging_messages` status counts, `picks WHERE archived_at IS NULL`, tail of `ingest_log`.
- **`cron.job_run_details` does not show whether a cron worked** — use `net._http_response` (`status_code`, `timed_out`, `error_msg`) by request id.
- **A venue or event photo is looked up by identity, never guessed from a name.** A wrong photo is worse than none; no photo draws the category mark. Trigger `wa_normalise_image_url` (venues, picks, venue_images) rewrites `thumb.wikimedia.org` to `upload.wikimedia.org` and refuses stock-library URLs.

## LLM

- Lanes, tried in order in `process-staging` and `send-digest`; each is skipped while its secret is unset. All free tiers.
  - Mistral `mistral-small-2603` (`MISTRAL_API_KEY`), `response_format: json_object`.
  - NVIDIA `nvidia/nemotron-3.5-lightning-30b-a3b` (`NVIDIA_API_KEY`), 40 RPM, prototyping terms. Sent `chat_template_kwargs: {enable_thinking: false}`; without it the model reasons and one call can outlive the worker.
  - OpenRouter `nvidia/nemotron-3-super-120b-a12b:free` (`OPENROUTER_API_KEY`, currently unset; `OPENROUTER_MODEL` overrides with no deploy).
- `translate-picks` uses Mistral then NVIDIA. In `process-staging` an unparseable answer falls through to the next lane.
- Edge workers are killed at 150s and pg_net stops waiting at 60s: every LLM call carries an `AbortSignal.timeout`, and `process-staging` stops taking messages at 90s (30s per call, hard stop 130s).
- **Pin models by exact id and confirm the id is in the provider's `/v1/models` before changing it.** `:free` ids vanish while the paid id remains.
- Secret presence can't be checked from here (`check-secrets` is a tombstone); look in the dashboard.

## Environment

Edge-function secrets: `MISTRAL_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`. Cloud sessions also read `SUPABASE_SERVICE_ROLE_KEY`.

## Voice

Source handles start with `@` and match the Telegram slug. Metadata reads `Neighborhood · type · day + time`. No em-dashes in headlines, no exclamation marks, never "discover" as a verb, no "No results found", no marketing register — the back page of a newsletter.
