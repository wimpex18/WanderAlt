# WanderAlt

A static, mobile-first site for alternative and underground culture in European cities: vinyl shops, art squats, small venues, craft bars, experimental gigs, political talks.

It is a decision surface, not a publication. **A time and a walking distance are the loudest things on every row**, and every listing says where it came from. The Aug 2026 redesign removed curators: there is no named human voice on a pick, and provenance replaced personality.

Live cities: **Tallinn · Helsinki · Riga**. **Vilnius** is unlocked for internal testing — venues are populated from OpenStreetMap and events run off an in-house editorial desk. Dropping curators removed what used to block its public launch.

**Current redesign: Aug 2026.** Flat opaque paper replaces the Dusk Glass scene-under-glass: ink on cream by day, ink on near-black at night, with glass surviving on exactly two elements — the sticky top bar and the bottom tab bar. Day is now the default; night still arrives at each city's civil dusk. Version stamp lives in `package.json`.

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

Until then, checking a change means looking at it: `npm start`, then the page at 390 / 768 / 1440, in both themes. Measure heights and gaps rather than eyeballing them, and check every other instance of a pattern you changed. Photos, the vector basemap and `backdrop-filter` all render correctly against a local server now — the old claim that they needed the Cloudflare preview was about the headless Chromium the deleted suite drove, not about a real browser. The PR preview is still the honest last check for anything CDN- or header-dependent, since the dev server sends no CSP. For a performance number, `npx lighthouse http://localhost:5173/index.html --view`.

## How it's put together

Every page is a plain `.html` file at the repo root with a matching `.js` renderer, all sharing one `wa.css` — 48 tokens, 13 components, two themes, ~1,820 lines, replacing a 9,118-line `styles.css`. Pages: Explore (`index.html`), Tonight (`discover.html`), Saved, detail (`detail.html`), source (`source.html`), profile, admin, about, 404. The filenames of the first two are deliberately unchanged so every shared link in the wild still resolves. `_redirects` maps the retired `venue.html`, `place.html`, `curator.html`, `map.html` and `search.html` onto their replacements.

Explore is a browsing surface. One capsule answers Where / When / What, three scope chips narrow it to All / Tonight / Places, and below that are named carousel sections that each carry a count in the subtitle so a thin section reads as a short row rather than a hole. The Saturday email sits at the foot of the page rather than interrupting the list.

Tonight is the deciding surface: a dense timetable where each row leads with its rail — time, then walking distance. The four facet buttons collapsed into the same capsule plus one filter sheet, and every toggle in that sheet prints its consequence ("9 of tonight's 19 are free") while the primary key states the outcome ("Show 5 gigs"). Map mode is a companion, not a replacement: pins carry time and distance rather than a price, pin and row highlight together, and "search this area" refilters to the viewport. The map states its own coverage gap — "8 of 26 placed" — because a partial pin count next to a full list reads as a map failure instead of the data gap it is.

`?q=` `?cat=` `?time=` `?type=` `?within=` `?sort=` `?view=map` and `?id=` all still round-trip. The retired `?ai=`, `?nhood=` and `#mood=` are parsed and discarded, so an old link renders an unfiltered list rather than a 404 or an empty result. `?within=` accepts metres (≥100) or minutes, so old links keep their meaning.

Both detail pages read the `venue_details` enrichment lane through `WA.UI.fetchVenueDetails` / `venueFacts` and answer in the same shape: three labelled cells, then one primary CTA on its own row, then labelled secondary keys. Fields promoted into a cell are skipped in the long-tail facts block so nothing prints twice, and a cell that has no answer is never rendered rather than showing a placeholder. Enrichment fill is partial (address on 80 of 188 rows, hours on 58, description on 1), so everything here degrades to fewer cells rather than empty ones.

`detail.html` is one template serving two data shapes: an event fills its three cells with doors / entry / walk, a place with closes / entry / walk plus a week strip of opening hours. A missing photo takes the same well with the kind glyph on a petrol tint, never a grey box. Provenance closes every detail page. `source.html` is the venue or feed a listing came from — a source, not a person — and groups that source's picks.

Data comes from Supabase through `supabase.js`, which falls back to the static `catalog.js` if the fetch fails, so the site never renders blank. The venues request is kind-filtered server-side and paged: PostgREST caps a response at 1000 rows, and an unpaged `order=name.asc` over all four cities silently sliced the alphabet at roughly "Ki" — Tallinn saw 42 of its 447 places. `ui-helpers.js` holds the shared render helpers (`WA.UI`) that every page script reuses. Auth is email/password plus Google OAuth against the Supabase REST API with no SDK. Bookmarks are localStorage-first with cloud sync on sign-in. The map is MapLibre GL over OpenFreeMap vector tiles, no API key, lazy-loaded after first paint.

MapLibre is self-hosted in `vendor/` rather than pulled from a CDN, which is why the CSP has no third-party script origin at all. Upgrading it means swapping the two files there and the pinned tags in `admin.html`.

Canonical mobile width is 390px. Desktop shares one `--reading-max` ladder across every page so edges line up when you navigate: 1100 at ≥768, 1200 at ≥1100, 1280 at ≥1440, 1440 at ≥1680, 1600 at ≥1920. Below 768 the nav is a fixed bottom bar; above it becomes a masthead.

Self-hosted typefaces in `fonts/` (no Google Fonts request): Plus Jakarta Sans for chrome (titles, buttons, nav), Fraunces 600 for catalogue voice (pick titles, headlines, the email — never under 17px), Geist Mono for facts. Inter is retired from the token set but its files remain on disk as the interim face until the two Jakarta woff2 files land; `--ff-ui` names Jakarta first and falls through. Brand assets and the icon masters live in `brand/`.

### localStorage

The app writes `wa:appearance`, `wa:city`, `wa:seen:v1`, `wa:follows`, `wa:lists:v1`, `wanderalt:bookmarks:v1`, `wanderalt:session:v1`, and three admin-only `wa-admin-*` keys. `wa-taste-*` and `wa-match-*` went with the taste quiz and the Concierge; `wa:saved-snapshots` went with the old Saved page. (`wa:follows` predates the `:v1` convention below and is the one key that does not follow it.) New keys take the `wa:` prefix and a `:v1` suffix if they store a structured shape; changing a shape means bumping the suffix and writing a one-shot migration in the owning file.

## Deploying

Cloudflare Pages, connected to the GitHub repo. Framework preset **None**, build command **empty**, output directory **`/`**. `_headers` (security headers and cache rules) and `_redirects` (apex/www, the `wanderalt.com` → `wanderalt.app` 301, and legacy aliases) are picked up automatically.

Everything lives on the single domain `wanderalt.app`; `wanderalt.com` is registered as brand defence and 301s across. Cloudflare was chosen over Vercel for unlimited free-tier bandwidth, a denser EU edge, and keeping hosting, DNS and email routing in one dashboard.

### Edge functions currently behind the repo

This section used to say the drift was harmless — *"None of them is broken — all are frozen (cron disabled), so a stale copy changes nothing today."* **That was wrong, and the wrong reassurance is why nobody chased it for a month.** `ingest-fienta` was on that list. Its undeployed commit was the reason the Tonight list was empty: production had no `staging_messages.payload`, so every event arrived with its date only in prose and `process-staging` had no `starts_at` to copy. A frozen cron does not make a stale deploy safe — it only delays the moment you find out.

Deployed during the Aug 2026 audit: `ingest-fienta`, `ingest-ra`, `ingest-kinobize`, `ingest-splendidpalace`, `ingest-osm`.

**Still behind, with severity, in `supabase/functions/DEPLOY-DRIFT.md`** — which also carries the drift check as a shell loop, so this list can be regenerated instead of trusted:

| function | missing | why it matters |
| --- | --- | --- |
| ~~`send-digest`~~ | — | **cleared 5 Aug 2026**: deployed at v16 with the XSS fix, the redesign catch-up, and an open-relay fix. Cron is live. |
| `ingest-hanzas-perons` | payload contract | Riga events land without a timestamp |
| `draft-column` | Groq model repoint | still pinned to the decommissioned `llama-4-scout`; **cron held off** |
| ~~`classify-moods`~~ | — | **retired 5 Aug 2026**: 410 tombstone, `verify_jwt:true`. Delete in the dashboard to finish the job. |
| ~~`match-pick`~~ | — | **retired 5 Aug 2026**: 410 tombstone, `verify_jwt:true`. Delete in the dashboard to finish the job. |

Deploy through the Supabase MCP `deploy_edge_function` tool — there is no `supabase` CLI here — and **preserve each function's existing `verify_jwt`**. It is not uniform, and a `verify_jwt: true` function called by a cron through raw `net.http_post` returns 401, which is why healthy crons go through `public.invoke_wa_fn(fn)`.

`functions/_middleware.js` is a Pages Function that rewrites per-pick and per-source Open Graph tags server-side, using the real venue photo where one exists and a generated card otherwise. It fails open and is inert under the local dev server.

## Backend

Supabase project `aqnsmmbrspkbfcvougeh` (eu-central-1): Postgres, REST, Edge Functions, and pg_cron. The anon key in `supabase.js` is public by design — RLS allows SELECT only, plus INSERT on `bookmarks` and `digest_opt_ins`. Edge function sources are mirrored in `supabase/` alongside the migration journal; deploys go through the Supabase MCP tooling, never a CLI.

The app reads picks where `archived_at IS NULL`. A pick's id is `channel-message_id`.

### Pipeline

```
ingest-* → staging_messages → process-staging → picks
         → enrich-images → geocode-picks → enrich-venues
         → embed-picks
         → rotate-tonight → archive-stale → dedup → purge
```

Sources are rows in the `sources` table — Telegram channels, RSS feeds, Fienta org feeds, city event APIs, venue websites, and OpenStreetMap Overpass for venues. Adding a Telegram, RSS or Fienta source needs no code, just a row.

**Adding a city means touching two per-city tables, not one.** `CITY_CONTEXT` in `process-staging` is the documented one — miss it and the city silently degrades to the Tallinn context. `CITY_CENTER` in `geocode-picks` is the other, and it has the same failure shape: Vilnius was absent from it until Aug 2026, so every geocode request for that city would have 400'd. Grep for the city you already have before adding a new one.

Ingest functions write `staging_messages.payload` — the normalised source object — alongside the prose they hand the model. `process-staging` copies the facts (description, start and end times, ticket URL, price, named artists) from there verbatim and asks the LLM only for what it alone can do: an English title, a one-line description, and the kind. Before this the payload was flattened into one text blob and discarded, so `picks` had nowhere to put a price or a start time and the model was asked to re-derive facts nobody had given it.

**How much schema.org markup is actually out there (audited Jul 2026, so nobody re-runs this hopefully):** of 124 reachable venue websites probed, **3** emit `Event` JSON-LD on their homepage — nuku.ee, kinosoprus.ee and merekeskus.ee, two of them with `offers` (real prices). Probing the usual event subpaths (`/events`, `/programm`, `/kava`, `/pasakumi`, `/renginiai`, …) on 45 more venues found **zero**. The regional ticketing portals — Piletilevi, Biļešu Serviss, Bilietai, Tiketti — emit only `Organization`/`LocalBusiness` on their listing pages, and Piletilevi's listing is JS-rendered so it has no static links to follow. kultuur.info advertises an RSS feed; it is a blog, last posted 2024, not events.

The conclusion is that JSON-LD is a **detail-page** format here, not a listing-page one: an individual Fienta event page carries a full `Event` node with prices, which is exactly why `backfill-pick-facts` works when a pick already has a `source_url`. There is no large untapped seam of structured venue data waiting to be scraped — which makes the Facebook/commercial-scraper question more important, not less.

`resolve-links` turns `picks.entities` into `picks.links`. It integrates hubs, not platforms: MusicBrainz for music (one keyless lookup returns Spotify, SoundCloud, Bandcamp, Mixcloud, Discogs, YouTube and the official site together — Bandcamp has no public metadata API and Mixcloud's is OAuth-only, so this is the only free route to either), Open Library for authors, Wikidata for art, theatre, film and everything else. Matches are confidence-gated and drop out rather than guess. For flea markets, community nights and sports there is no hub at all; those resolve to nothing and the page falls back to the source link and the venue's own socials. `backfill-pick-facts` fills the same columns for older picks by reading schema.org JSON-LD off the pick's own `source_url` — one extractor for every source, no LLM, no keys.

Text generation goes Groq first, OpenRouter `:free` second, with a retired Gemini path still present behind the `pipeline_config.gemini_fallback_enabled` flag. Embeddings run on Cloudflare Workers AI. Google is no longer a live dependency anywhere in the pipeline; the Places API and its billing account are gone, after an uncapped-retry bug produced a surprise ~€45 charge. The functions that once hit it now stamp a cooldown column so an unresolvable row is skipped for 14 days instead of retried every tick.

### Cron posture

**The pipeline runs again (Aug 2026).** 30 of 31 jobs are active: every ingest, `wa-process-staging` hourly, the enrichment set, the lifecycle housekeeping, and the Saturday digest.

They had been frozen pre-release — no users, and cron-driven retry loops were what ran up the Google bill. The freeze did its job on spend and then quietly became the problem: nothing reached `picks` between 2 Jul and 4 Aug, 49 staging rows sat unprocessed, and Tonight was empty because the catalogue had stopped moving.

Cost surface now, stated rather than assumed: ingests are HTTP scrapes only; the LLM lane is Groq's free tier then OpenRouter `:free`, with Gemini still gated off by `pipeline_config.gemini_fallback_enabled`; embeddings are Cloudflare's free tier; Nominatim callers are staggered so no two run at once, which keeps us inside its usage policy. The uncapped-retry shape that caused the €45 charge is gone — the functions that once hit Google stamp a cooldown column instead.

**30 of 31 jobs are active.** `send-digest-saturday` was turned on 5 Aug 2026 once `send-digest` was deployed (see below). One stays off, and it is not an oversight:

| job | blocked on |
| --- | --- |
| `draft-column-weekly` | `draft-column` still pins the decommissioned `llama-4-scout`; every run would 404 through to a hard failure |

Turn it on once its function is deployed:

```sql
select cron.alter_job(jobid, active => true)
  from cron.job where jobname = 'draft-column-weekly';
```

**A cron's command must send an `Authorization` header if its function is `verify_jwt:true`.** `public.invoke_wa_fn(fn)` does; a raw `net.http_post` with only `Content-Type`, or only `apikey`, does not, and gets a silent 401. `send-digest-saturday` was in exactly that state and had to be repointed through `invoke_wa_fn` before it could be enabled. Four jobs still post raw — `enrich-images-auto`, `rotate-tonight-daily`, `draft-column-weekly`, and the `wa-enrich-venues-*` set — which is fine only because their functions are still `verify_jwt:false`.

**Checking a cron actually worked is not `cron.job_run_details`.** That table records that the SQL ran, and `net.http_post` returns a request id instantly, so a job reads `succeeded` while every call 401s. Use `net._http_response` (`status_code`, `timed_out`, `error_msg`). Note pg_net gives up at 60s while the function keeps running: `ingest-hel-linkedevents` times out nightly and still inserts ~1,650 rows, so that timeout is a lost response, not lost work.

Watch it rather than poll it — one-shot SQL against `staging_messages` status counts, `picks where archived_at is null`, and the tail of `ingest_log`.

Three jobs were dialled down to a reduced cadence during the freeze. **`wa-geocode-picks` is back to hourly** (`20 * * * *`, restored Aug 2026) because coordinates are the dependency under walking distance and the Tonight map, and it costs nothing: it is HTTP-only against Nominatim at 20 grouped lookups an hour, comfortably inside their usage policy.

Two still sit at reduced cadence, and restoring them is an owner call rather than an oversight, because both spend from the LLM/embedding lanes the freeze was protecting: `wa-process-staging` is `12 * * * *` (was `*/30 * * * *`) and `embed-picks-auto` is `40 6,12,18,23 * * *` (was `*/30 * * * *`).

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
- **Vilnius public launch** is no longer blocked on a resident curator voice — the redesign removed curators, which removed the blocker. What remains is coverage: the Resident Advisor feed is hand-invoked only, never scheduled, on terms-of-service grounds.

Conventions and constraints for AI coding sessions are in [CLAUDE.md](CLAUDE.md).
