# Data and pipeline

Supabase project `aqnsmmbrspkbfcvougeh` (eu-west-1, Postgres 17). The schema is `supabase/migrations/`: `20260915090000_baseline.sql` (saves, and the first catalogue tables, since replaced) and `20260927120000_events_engine.sql` (everything below) and `20260927140000_provenance_visibility.sql`. Add changes as new, later-dated migration files.

## Tables

| Table | Holds | Public read |
|---|---|---|
| `sources` | Where listings come from, plus each source's health (`last_ok_at`, `last_yield`, `consecutive_failures`, `last_error`) | `id, city, kind, url, handle, label` only |
| `raw_items` | Exactly what a source said, once per `(source_id, external_id)`, with a content hash and a processing `status` | no |
| `places` | Venues: name, `aliases` (lowercased names sources use), coordinates, OSM identity, `kind`, neighbourhood | yes, unless `hidden` |
| `events` | One row per dated occurrence: source facts, `title_en`/`summary_en`, `kind`, `tags`, `relevance`, `status` | `published` only |
| `event_sources` | Provenance: every source that listed an event | for published events, without `raw_item_id` |
| `bookmarks`, `saved_lists`, `saved_list_items` | Each user's saves | own rows only |

`picks` and `venues` are read-only views shaped like the old tables, so the current pages, `functions/_middleware.js`, `og-image` and `calendar-feed` read the new data unchanged. They go away with the front-end rebuild.

"Tonight" and "this week" are never stored; they are computed from `starts_at` in Europe/Tallinn.

## Pipeline

`pipeline/run.ts`, plain TypeScript that Node 24 runs directly. GitHub Actions runs it every three hours (`.github/workflows/pipeline.yml`) and on demand from the Actions tab.

1. Sync `pipeline/sources.tallinn.json` into `sources`. The JSON file is the source of truth; add a source by PR. A source removed from the file is marked inactive, which also hides it publicly.
2. Collect each source; store only new or changed items in `raw_items` (compared by content hash).
3. Read pending items into candidates: Fienta and JSON-LD are parsed; Telegram, HTML pages and RSS go to a model (`docs/models.md`). An item that fails is retried on the next runs and parked as `error` after three attempts. Prose items wait as `new` while no model is available.
4. Classify candidates in batches.
5. Resolve venues to `places` and write `events` and `event_sources` (details below).
6. Classify earlier events that were written without a model, archive ended events, delete processed raw items older than 60 days, record source health.

A run exits non-zero when a source fails or returns nothing, which turns the Actions run red. A prose source whose items are fetched but yield no events is logged, since that usually means the page was redesigned.

### Venues

A venue name is matched against every place's name and `aliases` (lowercased, accents folded). A new name becomes a place and is geocoded through Nominatim, first by its address reduced to what OpenStreetMap matches ("Kentmanni tänav 28, 10116 Tallinn" becomes "Kentmanni 28, Tallinn"), then by name. The OSM id and a `kind` from its tags are kept only when OSM's name agrees with ours, because an address can land on a different venue in the same building. Places still without coordinates get retried, ten per run. Up to 25 lookups a run, one a second, as Nominatim's policy asks.

The site's Places tab lists only places whose `kind` is one of `VENUE_KINDS` in `supabase.js` (record store, bookshop, gallery, club, thrift, arts centre, cinema, community). OSM supplies a kind for some places; set the rest in the Table Editor.

To merge two spellings of one venue, add the second as an alias of the first and repoint its events.

### Duplicates

Each event id is a hash of city, title, Tallinn date and time, and place. Because two sources rarely title a show the same way, a candidate also joins an existing upcoming event when both are at the same place within 30 minutes and at least 60% of the shorter title's words appear in the other (`pipeline/dedupe.ts`). Every source that listed it gets an `event_sources` row.

### Status

| Source | Fit (`relevance`) | Status |
|---|---|---|
| Trusted (`curated`, or a Fienta organiser in `trusted_organizer_ids`) | ≥ 0.3 or not yet classified | `published` |
| Trusted | < 0.3 | `review` |
| Other | ≥ 0.6 | `published` |
| Other | 0.35 to 0.6, or not yet classified | `review` |
| Other | < 0.35 | `rejected` |

Once written, an event keeps its status; later runs refresh its facts only, and a run without a model leaves the earlier classification alone. To publish or reject by hand, edit `status` in the Supabase Table Editor and start `status_note` with `manual`.

Model output decides publication for untrusted sources, and listing text is written by strangers, so a crafted post could talk its way to a high fit score. The prompts tell the model to ignore instructions in the text; the review queue is the backstop.

### Sources (Tallinn)

| id | Kind | Notes |
|---|---|---|
| `fienta-tallinn` | Fienta public API | Every public Tallinn event on Fienta. Organiser email and phone are dropped at collection. |
| `kino-soprus` | JSON-LD | `ScreeningEvent` markup on the full schedule page (`/kinokava/`), 45 days ahead. |
| `elektriteater` | HTML → model | Arthouse cinema programme. |
| `telliskivi`, `kultuurikatel` | HTML → model | Event pages of two creative hubs. |
| `tg-sigmundtells` | Telegram → model | Public channel preview, `t.me/s/…`, no API key. |

Instagram has no free way to read public posts, so it is not a source.

### Running it

```bash
npm run pipeline:dry                          # read everything, print, write nothing
node pipeline/run.ts --dry-run --source kino-soprus --out /tmp/x.json
npm run pipeline                              # needs SUPABASE_SERVICE_ROLE_KEY
npm test && npm run typecheck
```

Keys come from the environment or a git-ignored `.env`: `SUPABASE_SERVICE_ROLE_KEY` (required to write) and the model keys in `docs/models.md`. In GitHub they are repository secrets of the same names.

GitHub pauses scheduled workflows in a public repository after 60 days without a commit. If the pipeline stops, re-enable it on the Actions tab; the first 36 events were loaded by hand on 27 September 2026 and are ordinary rows.

## Security

- The anon key in `supabase.js` is public on purpose. RLS: catalogue tables are SELECT-only for the public, `raw_items` is service-role only, users touch only their own saves.
- The service-role key lives only in the Actions secret and local `.env`; it never reaches the browser.
- Every SECURITY DEFINER function in `public` is an anon-callable RPC: revoke EXECUTE from `anon, authenticated, public` in the same migration.
- `pg_net` is not installed and must stay that way (Supabase grants `anon` EXECUTE on `net.http_*` through a grant we cannot revoke).
- Listing text is written by strangers. Pages escape every field with `WA.UI.esc()` and pass every DB-sourced URL through `WA.UI.safeUrl()`; the pipeline only stores http(s) URLs.

## Edge functions

| Function | `verify_jwt` | Used by |
|---|---|---|
| `og-image` | false | `functions/_middleware.js` share cards (satori 0.33.4, resvg-wasm 2.6.2) |
| `calendar-feed` | false | the About page's calendar subscription. Reads `picks` with the anon key, so only published events appear, with their real `starts_at`/`ends_at` for the next 30 days. |

Deploy only through the Supabase MCP `deploy_edge_function` tool, always passing the function's existing `verify_jwt` (the tool defaults it to true). Committing does not deploy, and deleting a directory does not undeploy. The share surface fails open with a valid card, so judge the rendered card; `og-image?…&debug=1` returns the error instead.

## Images

A venue or event photo is looked up by identity, never guessed from a name; no photo draws the category mark. Wikimedia images are served through `functions/img/wm/[[path]].js` (allowlisted hosts, raster only, cookies stripped). A trigger rewrites `thumb.wikimedia.org` to `upload.wikimedia.org` and clears stock-library URLs.
