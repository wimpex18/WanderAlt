# Data and pipeline

Supabase project `aqnsmmbrspkbfcvougeh` (eu-west-1, Postgres 17). The schema is `supabase/migrations/`: `20260915090000_baseline.sql` (saves, and the first catalogue tables, since replaced) and `20260927120000_events_engine.sql` (everything below). Add changes as new, later-dated migration files.

## Tables

| Table | Holds | Public read |
|---|---|---|
| `sources` | Where listings come from, plus each source's health (`last_ok_at`, `last_yield`, `consecutive_failures`, `last_error`) | `id, city, kind, url, handle, label` only |
| `raw_items` | Exactly what a source said, once per `(source_id, external_id)`, with a content hash and a processing `status` | no |
| `places` | Venues: name, `aliases` (lowercased names sources use), coordinates, OSM identity, neighbourhood | yes, unless `hidden` |
| `events` | One row per dated occurrence: source facts, `title_en`/`summary_en`, `kind`, `tags`, `relevance`, `status` | `published` only |
| `event_sources` | Provenance: every source that listed an event | yes |
| `bookmarks`, `saved_lists`, `saved_list_items` | Each user's saves | own rows only |

`picks` and `venues` are read-only views shaped like the old tables, so the current pages, `functions/_middleware.js`, `og-image` and `calendar-feed` read the new data unchanged. They go away with the front-end rebuild.

"Tonight" and "this week" are never stored; they are computed from `starts_at` in Europe/Tallinn.

## Pipeline

`pipeline/run.ts`, plain TypeScript that Node 24 runs directly. GitHub Actions runs it every three hours (`.github/workflows/pipeline.yml`) and on demand from the Actions tab.

1. Sync `pipeline/sources.tallinn.json` into `sources`. The JSON file is the source of truth; add a source by PR.
2. Collect each source; store only new or changed items in `raw_items`.
3. Read items into candidates: Fienta and JSON-LD are parsed; Telegram, HTML pages and RSS go to a model (`docs/models.md`).
4. Classify candidates in batches.
5. Resolve venues to `places` (new names geocoded once through Nominatim; the OSM id is kept only when the names agree), write `events` and `event_sources`.
6. Classify earlier events that were written without a model, archive ended events, record source health.

A run exits non-zero when a source fails or returns nothing, which turns the Actions run red.

### Status

| Source | Fit (`relevance`) | Status |
|---|---|---|
| Trusted (`curated`, or a Fienta organiser in `trusted_organizer_ids`) | ≥ 0.3 or not yet classified | `published` |
| Trusted | < 0.3 | `review` |
| Other | ≥ 0.6 | `published` |
| Other | 0.35 to 0.6, or not yet classified | `review` |
| Other | < 0.35 | `rejected` |

Once written, an event keeps its status; later runs refresh its facts only. To publish or reject by hand, edit `status` in the Supabase Table Editor and start `status_note` with `manual`.

### Sources (Tallinn)

| id | Kind | Notes |
|---|---|---|
| `fienta-tallinn` | Fienta public API | Every public Tallinn event on Fienta. Organiser email and phone are dropped at collection. |
| `kino-soprus` | JSON-LD | `ScreeningEvent` markup on the homepage. |
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
| `calendar-feed` | false | the About page's calendar subscription |

Deploy only through the Supabase MCP `deploy_edge_function` tool, always passing the function's existing `verify_jwt` (the tool defaults it to true). Committing does not deploy, and deleting a directory does not undeploy. The share surface fails open with a valid card, so judge the rendered card; `og-image?…&debug=1` returns the error instead.

## Images

A venue or event photo is looked up by identity, never guessed from a name; no photo draws the category mark. Wikimedia images are served through `functions/img/wm/[[path]].js` (allowlisted hosts, raster only, cookies stripped). A trigger rewrites `thumb.wikimedia.org` to `upload.wikimedia.org` and clears stock-library URLs.
