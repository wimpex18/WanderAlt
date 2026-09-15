---
paths:
  - "supabase/**"
  - "functions/**"
  - "admin.js"
---

# Supabase: schema, functions, deploy

## Schema

- Tables: `picks` (events), `venues` (places), `venue_details` (per-venue details keyed by `city` + lowercased `venue_key`), `pick_changes` (day/time journal written by trigger `picks_log_change`), `bookmarks`, `saved_lists`, `saved_list_items`, `profiles`, `digest_opt_ins`. All catalogue tables are empty.
- Picks, venues and venue details join on lowercased venue name; `picks.venue_id` is rarely set.
- Trigger `wa_normalise_image_url` (picks, venues) rewrites `thumb.wikimedia.org` to `upload.wikimedia.org` and clears stock-library image URLs.
- SQL functions: `invoke_wa_fn(fn[, body])` (SECURITY DEFINER; posts to an edge function with the anon key), `set_updated_at`, `wa_log_pick_change`, `wa_normalise_image_url`.
- A migration that drops a column must grep `pg_proc`, `pg_policies` and triggers for it first: SQL functions break at run time, not at migration time.
- No cron jobs. `supabase/migrations/20260915_drop_ingestion_pipeline.sql` lists the 18 event sources the retired pipeline read.

## Edge functions

Live, with source in `supabase/functions/`:

| Function | `verify_jwt` | Called by |
| --- | --- | --- |
| `og-image` | false | `functions/_middleware.js` (share cards; satori 0.33.4 + resvg-wasm 2.6.2) |
| `calendar-feed` | false | About page calendar subscription |
| `unsubscribe-digest` | false | links in digest emails |
| `send-digest` | true | by hand: `select public.invoke_wa_fn('send-digest')` |

Retired, deployed as 410 stubs with no source here (delete them in the dashboard when convenient): `archive-stale`, `backfill-pick-facts`, `check-secrets`, `classify-moods`, `discover-venues`, `draft-column`, `embed-picks`, `enrich-images`, `enrich-pick-images`, `enrich-venue-images`, `enrich-venues`, `generate-context`, `geocode-picks`, `import-pick-photos`, `ingest-echo-gone-wrong`, `ingest-fienta`, `ingest-hanzas-perons`, `ingest-hel-linkedevents`, `ingest-kinobize`, `ingest-osm`, `ingest-ra`, `ingest-rss`, `ingest-splendidpalace`, `ingest-telegram`, `ingest-telliskivi`, `load-places-index`, `match-pick`, `process-staging`, `resolve-links`, `rotate-tonight`, `translate-picks`, `verify-images`, `verify-venues`.

- `invoke_wa_fn` returns a pg_net request id; the real result is `net._http_response` (`status_code`, `timed_out`, `error_msg`). pg_net stops waiting at 60s while the function keeps running.
- Edge workers are killed at 150s: give every outbound call an `AbortSignal.timeout`.

## Deploy drift

Compare `list_edge_functions` `updated_at` (milliseconds) with the last behaviour-changing commit per directory (commits with a `No-Deploy:` trailer are skipped):

```bash
for d in supabase/functions/*/; do echo "$(basename "$d") $(git log -1 --format=%ct --invert-grep --grep='^No-Deploy:' -- "$d")"; done | sort
```

## Images

- Commons photos are stored as `upload.wikimedia.org` URLs (a file narrower than the requested width has no `/thumb/` rendition). Never store `Special:FilePath` URLs.
- Wikimedia URLs are served through the Pages Function `functions/img/wm/[[path]].js` on `/img/wm/*`: allowlisted hosts, raster types only (an SVG on our origin is active content), cookies stripped, 24h edge cache.
- An event with no photo borrows its venue's, downward only, relabelled "the venue, not the event" (`supabase.js`).
