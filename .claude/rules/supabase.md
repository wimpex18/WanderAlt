---
paths:
  - "supabase/**"
  - "functions/**"
  - "admin.js"
---

# Supabase: schema, functions, images

## Schema

- `supabase/migrations/20260915090000_baseline.sql` is the whole schema and the project's only recorded migration. Add changes as new, later-dated files.
- Tables: `picks` (events), `venues` (places), `venue_details` (per-venue details keyed by `city` + lowercased `venue_key`) — public SELECT, all empty; `bookmarks`, `saved_lists`, `saved_list_items` — own rows only.
- Picks, venues and venue details join on lowercased venue name; `picks.venue_id` is optional.
- Trigger `wa_normalise_image_url` (picks, venues) rewrites `thumb.wikimedia.org` to `upload.wikimedia.org` and clears stock-library image URLs. It is the only SQL function in `public`.
- A migration that drops a column must grep `pg_proc`, `pg_policies` and triggers for it first: SQL functions break at run time, not at migration time.
- No cron jobs; `pg_cron` and `pg_net` are not installed.

## Edge functions

With source in `supabase/functions/`:

| Function | `verify_jwt` | Called by |
| --- | --- | --- |
| `og-image` | false | `functions/_middleware.js` (share cards; satori 0.33.4 + resvg-wasm 2.6.2) |
| `calendar-feed` | false | About page calendar subscription |

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
