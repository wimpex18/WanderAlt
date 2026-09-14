---
paths:
  - "supabase/**"
  - "workers/**"
  - "admin.js"
  - ".scripts/regen-catalog.js"
---

# Supabase: functions, crons, pipeline, images

## Crons

- 30 jobs, all active: every ingest, `wa-process-staging` (`12 * * * *`), `wa-geocode-picks` hourly, the enrichment set (`wa-enrich-pick-images` `35 4 * * *` ahead of `enrich-images-auto` 05:10; `wa-enrich-venue-images` nightly; `wa-verify-images` weekly), lifecycle housekeeping, and `send-digest-thursday` (`0 7 * * THU` = 09:00/10:00 local).
- `archive-stale-daily`, `wa-enrich-venues-day` and `wa-enrich-venues-osm` post raw `net.http_post` with their own `Authorization` header; every other function cron goes through `invoke_wa_fn`. SQL-only jobs: `reset-tonight`, `wa-dedup-picks`, `wa-ingest-health`, `wa-purge-archived`, `wa-purge-pick-changes`, `wa-reconcile-absent`.
- pg_cron has no rename: unschedule + schedule. Change cadence with:
  ```sql
  select cron.alter_job(jobid, schedule => '<schedule>') from cron.job where jobname = '<name>';
  ```
- pg_net gives up at 60s while the function keeps running: `ingest-hel-linkedevents` times out nightly and still inserts its rows.

## Deploy drift

Compare `list_edge_functions` `updated_at` (milliseconds) with the last behaviour-changing commit per directory (commits with a `No-Deploy:` trailer are skipped):

```bash
for d in supabase/functions/*/; do echo "$(basename "$d") $(git log -1 --format=%ct --invert-grep --grep='^No-Deploy:' -- "$d")"; done | sort
```

## Silent-cancellation archiver

`wa_reconcile_absent_picks(p_enforce, p_grace_days)` archives future picks whose `last_seen_at` went stale. Enforce mode for web sources; **Fienta excluded** (its scraper under-bumps `last_seen_at`). A spike in `ingest_log` where `fn='reconcile-absent'` means a scraper broke. Reverse with:

```sql
update picks set archived_at = null, archive_reason = null where archive_reason = 'source_absent';
```

## Links and facts

- `resolve-links`: `picks.entities` → `picks.links` via hubs only (MusicBrainz, Open Library, Wikidata), confidence-gated.
- `backfill-pick-facts`: schema.org JSON-LD from the pick's own `source_url`, no LLM. JSON-LD is a detail-page format here; listing pages and venue homepages rarely carry `Event`.
- `description` is stored verbatim (source blurb); `saysSomething()` guards only generated copy.

## Images

- **Identity, never name.** `enrich-venue-images` lanes in order: OSM `wikidata` → P18 → Commons; the venue's own `og:image`; schema.org JSON-LD; the venue's own mark. If all miss, no photo.
- og:image guards: filename denylist (placeholders, logos) and a dedup check — one image across many venues is rejected.
- `enrich-pick-images` lanes: Linkedevents API by event id (from `tapahtumat.hel.fi` permalinks), then the pick's own `source_url` page. The API lane is exempt from the shared-image guard (one show, many dates); the page lane is not. No logo lane — an aggregator's icon is the platform's brand.
- Event images borrow from the venue downward only, relabelled "the venue, not the event". Linkedevents images are `event_only`: never copied to a venue, never outlive the listing.
- Open upstream gap: `ingest-hel-linkedevents` doesn't carry `images[]` into the payload, and `process-staging` documents `image_url` but never reads it.
- Commons photos are stored as `upload.wikimedia.org` URLs resolved via the imageinfo API (a file narrower than the requested width has no `/thumb/` rendition). Never store `Special:FilePath` URLs. Wikimedia URLs are served via `workers/wikimedia-proxy` (`/img/wm/*`) to strip cookies.
- `verify-images` walks oldest-checked first (`NULLS FIRST`): 404/410/403 or non-image content-type clears the URL; timeout, 5xx and 429 retry once, never delete, but still stamp `image_checked_at`. Fresh Commons thumbnails 429 on first render.
- `image_source` records which mechanism wrote each photo. Audit: `select * from image_health` — `duplicate_rows > 0` is the bad shape.
- **After changing what a fetcher can find, clear `image_enrich_failed_at` for the rows the change could help** — the cooldown otherwise hides the fix for 30 days.
- `enrich-venues` writes venue_details only (socials, coords, short_desc, closure); it writes no images and archives nothing. It uses a Wikidata entity only when a label or alias equals the venue name (normalised) and P131 reaches the city; that entity's P576 sets `is_closed`, which hides the venue's picks in the app.
- Most venue photos sit on kinds Places doesn't draw (museum, theatre, bar, library); they exist to be borrowed by events.
