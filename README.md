# WanderAlt

A static, mobile-first site for alternative and underground culture in European cities: vinyl shops, art squats, small venues, craft bars, experimental gigs, political talks. Every entry is vouched for by a named human curator, and the curator's voice is the product.

Live cities: **Tallinn · Helsinki · Riga**. **Vilnius** is unlocked for internal testing — venues are populated from OpenStreetMap, events run off an in-house editorial desk, and there is no resident curator voice yet.

**Current version: v0.8.5** (11 July 2026), the Dusk Glass redesign: every public page sits on a scene (a photo, a dark map, or a dusk gradient) under one glass panel recipe, with a Daybreak light twin that switches at each city's civil dusk. Version stamp lives in `package.json`.

## Running it

No build step. Open `index.html` in a browser, or:

```bash
npm start
```

That serves the site at `http://localhost:5173`. `npm run admin` serves the admin panel at `:8080` (the admin panel needs a Supabase service-role key, which it keeps in localStorage on your machine).

### Maintenance scripts

`npm run catalog` regenerates the static fallback `catalog.js` from live Supabase. `npm run build:icons` rasterises the PNG icon ladder from the SVG masters in `brand/` — the only reason `sharp` and `png-to-ico` are here.

### Testing

There isn't any right now. A Puppeteer and Playwright suite (structural sweep, E2E, pixel diff, screenshot captures) was removed in July 2026: it cost two browser engines and ~180 MB of dependencies while reliably missing the things that actually go wrong here — alignment, overlap, control sizes, overlays. It will be rebuilt from scratch rather than patched.

Until then, checking a change means looking at it: `npm start`, then the page at 390 / 768 / 1440. Real venue photos and the duotone treatment only render on the Cloudflare PR preview, not against a local server. For a performance number, `npx lighthouse http://localhost:5173/index.html --view`.

## How it's put together

Every page is a plain `.html` file at the repo root with a matching `.js` renderer, all sharing one `styles.css` where every design decision is a `:root` custom property. Pages: Today (`index.html`), Discover, Saved, pick detail, place detail, curator profile, profile, admin, about, 404. `map.html` and `search.html` are redirect stubs preserving legacy URLs.

Discover lists every pick in the city on load and lets you narrow it. The list is the page and scrolls with the document; the map is a companion — a sticky column beside the list from 1024px up, an overlay you summon below that — and it always shows the currently filtered set. Filters are four facet buttons, each opening its own anchored menu (a bottom sheet below 768). Search filters the list as you type; pressing Enter, or taking the suggestion under the field, hands the same words to the Concierge (`match-pick`: hybrid vector + full-text retrieval, Groq rerank, five picks each with one sentence of why). The answer opens above the list, never replacing it, points the map at what it recommended, and carries its own way out; dismissing it hands the map back to the filters. The Concierge searches picks, not the venue table, so it isn't offered in the Places scope. Today's masthead search is a plain GET into Discover — one results surface — and below 1100px, where the field doesn't fit, a compact search link stands in for it. `?q=` `?cat=` `?nhood=` `?time=` `?type=` `?within=` `?sort=` `?ai=` `?view=map` `?id=` and the `#mood=` hash all round-trip.

Data comes from Supabase through `supabase.js`, which falls back to the static `catalog.js` if the fetch fails, so the site never renders blank. `ui-helpers.js` holds the shared render helpers (`WA.UI`) that every page script reuses. Auth is email/password plus Google OAuth against the Supabase REST API with no SDK. Bookmarks are localStorage-first with cloud sync on sign-in. The map is MapLibre GL over OpenFreeMap vector tiles, no API key, lazy-loaded after first paint.

MapLibre is self-hosted in `vendor/` rather than pulled from a CDN, which is why the CSP has no third-party script origin at all. Upgrading it means swapping the two files there and the pinned tags in `admin.html`.

Canonical mobile width is 390px. Desktop shares one `--reading-max` ladder across every page so edges line up when you navigate: 1100 at ≥768, 1200 at ≥1100, 1280 at ≥1440, 1440 at ≥1680, 1600 at ≥1920. Below 768 the nav is a fixed bottom bar; above it becomes a masthead.

Three self-hosted typefaces in `fonts/` (no Google Fonts request): Fraunces for display and curator quotes, Inter for body, Geist Mono for metadata. Brand assets and the icon masters live in `brand/`.

### localStorage

The app writes `wa:appearance`, `wa:city`, `wa:saved-snapshots`, `wa-taste-*`, `wa-match-*`, `wanderalt:bookmarks:v1`, `wanderalt:session:v1`, and three admin-only `wa-admin-*` keys. New keys take the `wa:` prefix and a `:v1` suffix if they store a structured shape; changing a shape means bumping the suffix and writing a one-shot migration in the owning file.

## Deploying

Cloudflare Pages, connected to the GitHub repo. Framework preset **None**, build command **empty**, output directory **`/`**. `_headers` (security headers and cache rules) and `_redirects` (apex/www, the `wanderalt.com` → `wanderalt.app` 301, and legacy aliases) are picked up automatically.

Everything lives on the single domain `wanderalt.app`; `wanderalt.com` is registered as brand defence and 301s across. Cloudflare was chosen over Vercel for unlimited free-tier bandwidth, a denser EU edge, and keeping hosting, DNS and email routing in one dashboard.

`functions/_middleware.js` is a Pages Function that rewrites per-pick and per-curator Open Graph tags server-side, using the real venue photo where one exists and a generated card otherwise. It fails open and is inert under the local dev server.

## Backend

Supabase project `aqnsmmbrspkbfcvougeh` (eu-central-1): Postgres, REST, Edge Functions, and pg_cron. The anon key in `supabase.js` is public by design — RLS allows SELECT only, plus INSERT on `bookmarks` and `digest_opt_ins`. Edge function sources are mirrored in `supabase/` alongside the migration journal; deploys go through the Supabase MCP tooling, never a CLI.

The app reads picks where `archived_at IS NULL`. A pick's id is `channel-message_id`.

### Pipeline

```
ingest-* → staging_messages → process-staging → picks
         → enrich-images → geocode-picks → enrich-venues
         → classify-moods → embed-picks
         → rotate-tonight → archive-stale → dedup → purge
```

Sources are rows in the `sources` table — Telegram channels, RSS feeds, Fienta org feeds, city event APIs, venue websites, and OpenStreetMap Overpass for venues. Adding a Telegram, RSS or Fienta source needs no code, just a row. Adding a city needs a `CITY_CONTEXT` entry in `process-staging`.

Text generation goes Groq first, OpenRouter `:free` second, with a retired Gemini path still present behind the `pipeline_config.gemini_fallback_enabled` flag. Embeddings run on Cloudflare Workers AI. Google is no longer a live dependency anywhere in the pipeline; the Places API and its billing account are gone, after an uncapped-retry bug produced a surprise ~€45 charge. The functions that once hit it now stamp a cooldown column so an unresolvable row is skipped for 14 days instead of retried every tick.

### Cron posture

**Ingest, LLM, enrichment and digest crons are disabled on purpose.** The site is pre-release with no users, and cron-driven retry loops were what ran up that Google bill. The zero-cost lifecycle crons still run: archive-stale, reset-tonight, rotate-tonight, dedup, purge, and a monthly OSM ping that exists only to keep `last_seen_at` honest. Every disabled function still works when invoked by hand.

To bring everything back at launch:

```sql
select cron.alter_job(jobid, active => true) from cron.job;
```

Three jobs were also dialled down to a reduced cadence and need their schedules restored: `wa-process-staging` to `*/30 * * * *`, `embed-picks-auto` to `*/30 * * * *`, `wa-geocode-picks` to `20 * * * *`.

```sql
select cron.alter_job(jobid, schedule => '<schedule>')
  from cron.job where jobname = '<name>';
```

Events are worthless after they happen, so archived picks hard-delete after 14 days. Venues are stable for years, so absence from OpenStreetMap only counts after 90 days — a shorter window false-flags every venue between monthly pings.

### Silent-cancellation archiver

`wa_reconcile_absent_picks(p_enforce, p_grace_days)` archives future-dated picks whose `last_seen_at` has gone stale, meaning the source stopped listing them. It runs in enforce mode for web sources. Fienta is deliberately excluded: its scraper under-processes the feed, so a Fienta absence does not mean a cancellation. Don't re-enable it until a run bumps `last_seen_at` for roughly every active Fienta pick rather than a handful.

Watch `ingest_log` where `fn='reconcile-absent'`. A spike in archived rows means a scraper broke, not that events were cancelled. The archival is reversible:

```sql
update picks set archived_at = null, archive_reason = null
 where archive_reason = 'source_absent';
```

### The venue index

Admin venue search queries a local `places_index` table (about 1,900 alt-culture venues across the four cities, extracted from the Overture Maps places theme and filtered to our kind vocabulary). No external calls, no keys. The one-shot loader that populated it is deployed as a 410 stub; the procedure for loading a newer Overture release is documented in its source under `supabase/functions/load-places-index/`.

### Environment

Cloud sessions need these as environment variables, never in code: `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `CF_ACCOUNT_ID`, `CF_AI_TOKEN`, `RESEND_API_KEY`. `GEMINI_API_KEY` is legacy — the pipeline is gated off it and its billing account is deleted.

## Still open

- **Supabase Auth redirect URL** needs pointing at the deployed domain (Dashboard → Auth → URL Configuration).
- **Self-serve account deletion** needs enabling (Dashboard → Authentication → Settings).
- **Vilnius public launch** is blocked on a resident curator voice. No single-voice underground Telegram channel exists for the city yet, and the Resident Advisor feed is hand-invoked only, never scheduled, on terms-of-service grounds.

Conventions and constraints for AI coding sessions are in [CLAUDE.md](CLAUDE.md).
