# WanderAlt — Database schema reference (generated June 2026)

Generated from production via MCP on 2026-06-11. Regenerate when schema changes; do not hand-edit values. Canonical for: tables/columns/RLS/triggers/SQL functions/crons. (ROADMAP §4 item 1.)

Project: `aqnsmmbrspkbfcvougeh` (eu-central-1). Schema: `public`. 17 tables · 24 RLS policies · 3 triggers · 12 SQL functions · 30 cron jobs.

---

## Tables

All tables have RLS **enabled**. Three tables (`sources`, `staging_messages`, `ingest_log`) have RLS enabled but **no policies** — they are service-role-only (anon/authenticated get no access).

### picks (~1,928 rows)

PK: `id`. FKs: `handle → curators.handle`, `venue_id → venues.id`, `source_message_id → staging_messages.id`. Referenced by: `staging_messages.pick_id`, `pick_embeddings.pick_id`.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| city | text | no | `'tallinn'` | |
| title | text | no | — | |
| venue | text | no | — | venue name as text (see also `venue_id`) |
| neighborhood | text | no | — | |
| kind | text | no | — | |
| day | text | yes | — | |
| time | text | yes | — | |
| quote | text | no | — | curator quote |
| handle | text | no | — | FK → curators |
| thumb_initials | text | no | — | initials-tile fallback |
| tonight | boolean | no | `false` | Tonight hero flag |
| this_week | boolean | no | `false` | |
| pin_num | smallint | yes | — | legacy pin fields |
| pin_left | text | yes | — | |
| pin_top | text | yes | — | |
| pin_eyebrow | text | yes | — | |
| sort_order | smallint | no | `0` | |
| created_at | timestamptz | no | `now()` | |
| venue_id | text | yes | — | FK → venues |
| source_message_id | bigint | yes | — | FK → staging_messages |
| auto_generated | boolean | no | `false` | true for pipeline-created picks |
| valid_until | timestamptz | yes | — | expiry for archive-stale |
| **archived_at** | timestamptz | yes | — | **Lifecycle:** soft-archive timestamp; app reads `archived_at IS NULL` |
| mood_tags | text[] | yes | `'{}'` | set by classify-moods |
| context_md | text | yes | — | auto-generated "why this matters" copy, curator voice (generate-context) |
| image_url | text | yes | — | full HTTPS image URL; thumbnail across Briefing/Map/Match |
| image_attr | text | yes | — | licence attribution string |
| pending_review | boolean | no | `false` | |
| discovery_source | text | yes | — | |
| discovery_query | text | yes | — | |
| search_vector | tsvector | yes | — | maintained by `picks_search_vector_trigger` |
| lat | double precision | yes | — | WGS84; used by MapLibre map |
| lng | double precision | yes | — | WGS84 |
| address | text | yes | — | postal address from geocode-picks (Nominatim); `google_places` is a legacy value on old rows |
| coords_source | text | yes | — | `nominatim` \| `google_places` (legacy) \| `venue_join` \| `manual` |
| **coords_locked** | boolean | no | `false` | **Lifecycle:** true = admin pin override; geocode-picks skips the row |
| **archive_reason** | text | yes | — | **Lifecycle:** why archived — e.g. `duplicate` (wa_dedup_active_picks), `source_absent` (wa_reconcile_absent_picks) |
| **last_seen_at** | timestamptz | yes | `now()` | **Lifecycle:** bumped by snapshot scrapers each crawl; staleness signal for absence reconciliation |
| **title_original** | text | yes | — | **Lifecycle/provenance:** source-language title before English translation (NULL if already English) |
| geocode_failed_at | timestamptz | yes | — | set by geocode-picks when Nominatim can't resolve the venue; skipped for 14 days rather than retried every tick |
| image_enrich_failed_at | timestamptz | yes | — | set by enrich-images when Wikidata has no photo for the venue; skipped for 14 days rather than retried every run |

### curators (26 rows)

PK: `handle`. Referenced by: `picks.handle`, `sources.curator_handle`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| handle | text | no | — (PK) |
| city | text | no | `'tallinn'` |
| tagline | text | no | `''` |
| pick_count | integer | no | `0` |
| created_at | timestamptz | no | `now()` |
| name | text | no | `''` |
| bio | text | no | `''` |
| source_channel | text | yes | — |

### venues (~2,558 rows)

PK: `id`. Referenced by: `picks.venue_id`.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| city | text | no | `'tallinn'` | |
| name | text | no | — | |
| neighborhood | text | yes | — | |
| kind | text | yes | — | venue kind (record store, gallery, club, …) |
| lat | double precision | yes | — | |
| lng | double precision | yes | — | |
| osm_id | bigint | yes | — | OSM provenance |
| image_url | text | yes | — | |
| image_attr | text | yes | — | |
| website | text | yes | — | from OSM contact/website tags |
| created_at | timestamptz | no | `now()` | |
| updated_at | timestamptz | no | `now()` | |
| status | text | no | `'active'` | |
| last_seen_at | timestamptz | yes | `now()` | |
| closed_at | timestamptz | yes | — | set when venue confirmed closed/demolished; picks there excluded from active feeds |
| facebook | text | yes | — | Facebook page URL (OSM `contact:facebook`) |
| instagram | text | yes | — | Instagram profile URL (OSM `contact:instagram`) |

### sources (23 rows) — service-role only (no RLS policies)

PK: `id`. FK: `curator_handle → curators.handle`. Referenced by: `staging_messages.source_id`.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | bigint | no | `nextval('sources_id_seq')` | PK |
| kind | text | no | `'telegram'` | telegram \| rss \| fienta \| web |
| channel | text | no | — | |
| curator_handle | text | yes | — | FK → curators |
| city | text | no | `'tallinn'` | |
| enabled | boolean | no | `true` | |
| last_scraped_at | timestamptz | yes | — | |
| last_message_id | bigint | yes | — | |
| created_at | timestamptz | no | `now()` | |
| feed_url | text | yes | — | |
| reconcile_absences | boolean | no | `false` | true only for full-snapshot crawls considered by `wa_reconcile_absent_picks` |

### staging_messages (~4,349 rows) — service-role only (no RLS policies)

PK: `id`. FKs: `source_id → sources.id`, `pick_id → picks.id`. Referenced by: `picks.source_message_id`.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | bigint | no | `nextval('staging_messages_id_seq')` | PK |
| source_id | bigint | no | — | FK → sources |
| channel | text | no | — | |
| message_id | bigint | no | — | |
| text | text | no | — | raw message body |
| posted_at | timestamptz | yes | — | |
| permalink | text | yes | — | |
| status | text | no | `'new'` | new \| in_progress \| rejected \| … (pipeline state) |
| rejection | text | yes | — | rejection reason |
| pick_id | text | yes | — | FK → picks (set when promoted) |
| created_at | timestamptz | no | `now()` | |
| processed_at | timestamptz | yes | — | |

### ingest_log (~2,552 rows) — service-role only (no RLS policies)

PK: `id`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | bigint | no | `nextval('ingest_log_id_seq')` (PK) |
| fn | text | no | — |
| started_at | timestamptz | no | `now()` |
| finished_at | timestamptz | yes | — |
| status | text | no | `'running'` |
| inserted | integer | no | `0` |
| updated | integer | no | `0` |
| rejected | integer | no | `0` |
| error | text | yes | — |
| detail | jsonb | yes | — |

### columns (15 rows)

PK: `id`. Weekly curator columns.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| curator_handle | text | no | — | |
| city | text | no | `'tallinn'` | |
| body_md | text | no | `''` | |
| status | text | no | `'draft'` | CHECK: `draft` \| `published` \| `rejected` |
| issue_num | integer | yes | — | assigned by `columns_assign_issue` trigger |
| week_of | date | no | — | |
| created_at | timestamptz | no | `now()` | |
| approved_at | timestamptz | yes | — | |

### bookmarks (0 rows)

PK: (`user_id`, `pick_id`). FK: `user_id → auth.users.id`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| user_id | uuid | no | `auth.uid()` |
| pick_id | text | no | — |
| city | text | no | `'tallinn'` |
| created_at | timestamptz | no | `now()` |

### profiles (0 rows)

PK: `user_id`. FK: `user_id → auth.users.id`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| user_id | uuid | no | — (PK) |
| city | text | no | `'tallinn'` |
| digest_enabled | boolean | no | `false` |
| created_at | timestamptz | no | `now()` |
| updated_at | timestamptz | no | `now()` (maintained by `profiles_updated_at` trigger) |

### venue_images (38 rows)

PK: `id`. Keyed by (`city`, `venue_key`) text key, not FK.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` (PK) |
| city | text | no | — |
| venue_key | text | no | — |
| image_url | text | no | — |
| image_attr | text | no | — |
| source | text | no | `'manual'` |
| verified_at | timestamptz | no | `now()` |

### venue_details (98 rows)

PK: `id`. Enrichment facts keyed by (`city`, `venue_key`); populated by enrich-venues (Wikidata/Nominatim/homepage scrape — Google Places was dropped Jul 2026, see `docs/backend-and-pipeline.md`).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| city | text | no | — | |
| venue_key | text | no | — | |
| display_name | text | yes | — | |
| website | text | yes | — | |
| address | text | yes | — | |
| lat | double precision | yes | — | |
| lng | double precision | yes | — | |
| short_desc | text | yes | — | |
| wikidata_id | text | yes | — | |
| osm_id | bigint | yes | — | |
| opening_hours | text | yes | — | legacy — JSON array from Google Places, no longer written |
| source | text | no | `'wikidata'` | |
| manual_lock | boolean | no | `false` | |
| enriched_at | timestamptz | no | `now()` | |
| is_closed | boolean | no | `false` | |
| google_place_id | text | yes | — | legacy — Places (New) ID, no longer written |
| business_status | text | yes | — | legacy — no longer written (closure now Wikidata P576 only) |
| phone | text | yes | — | legacy — no longer written |

### digest_opt_ins (0 rows)

PK: `id`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` (PK) |
| email | text | no | — |
| city | text | no | `'tallinn'` |
| created_at | timestamptz | yes | `now()` |

### pick_embeddings (295 rows)

PK: `pick_id`. FK: `pick_id → picks.id`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| pick_id | text | no | — (PK) |
| embedding | vector | no | — |
| embedded_text | text | no | — |
| model | text | no | `'text-embedding-005'` |
| updated_at | timestamptz | no | `now()` |

### match_cache (0 rows)

PK: `query_hash`. Match-me response cache.

| Column | Type | Nullable | Default |
|---|---|---|---|
| query_hash | text | no | — (PK) |
| query_normalized | text | no | — |
| city | text | no | — |
| response | jsonb | no | — |
| created_at | timestamptz | no | `now()` |
| stale_after | timestamptz | no | — |
| expire_after | timestamptz | no | — |

### user_match_history (0 rows)

PK: `id`. FK: `user_id → auth.users.id`.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| user_id | uuid | no | — | FK → auth.users |
| pick_id | text | no | — | |
| vote | text | yes | — | CHECK: `like` \| `dislike` |
| seen_at | timestamptz | no | `now()` | |

### pipeline_config (4 rows)

PK: `key`. Key/value pipeline settings (e.g. `skip_keywords`, `gemini_fallback_enabled`).

| Column | Type | Nullable | Default |
|---|---|---|---|
| key | text | no | — (PK) |
| value | jsonb | no | — |
| notes | text | yes | — |
| updated_at | timestamptz | no | `now()` |

### past (3 rows)

PK: `id`. Legacy "past events" list.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | text | no | — (PK) |
| city | text | no | `'tallinn'` |
| title | text | no | — |
| date | text | no | — |
| created_at | timestamptz | no | `now()` |

---

## RLS policies

24 policies. Tables not listed (`sources`, `staging_messages`, `ingest_log`) have RLS enabled with zero policies — service-role only.

| Table | Policy | Cmd | Roles | USING (qual) | WITH CHECK |
|---|---|---|---|---|---|
| bookmarks | `delete_own_bookmarks` | DELETE | public | `(auth.uid() = user_id)` | — |
| bookmarks | `insert_own_bookmarks` | INSERT | public | — | `(auth.uid() = user_id)` |
| bookmarks | `select_own_bookmarks` | SELECT | public | `(auth.uid() = user_id)` | — |
| columns | `columns_select_published` | SELECT | public | `(status = 'published'::text)` | — |
| curators | `public_read` | SELECT | public | `true` | — |
| digest_opt_ins | `public_insert` | INSERT | public | — | `true` |
| digest_opt_ins | `service_read` | SELECT | public | `(auth.role() = 'service_role'::text)` | — |
| match_cache | `match_cache_read` | SELECT | public | `true` | — |
| past | `public_read` | SELECT | public | `true` | — |
| pick_embeddings | `pick_embeddings_read` | SELECT | public | `true` | — |
| picks | `public_read` | SELECT | public | `true` | — |
| pipeline_config | `pipeline_config_read` | SELECT | public | `true` | — |
| profiles | `profiles_self_insert` | INSERT | public | — | `(auth.uid() = user_id)` |
| profiles | `profiles_self_select` | SELECT | public | `(auth.uid() = user_id)` | — |
| profiles | `profiles_self_update` | UPDATE | public | `(auth.uid() = user_id)` | — |
| profiles | `profiles_service_select` | SELECT | public | `(auth.role() = 'service_role'::text)` | — |
| user_match_history | `user_match_history_delete` | DELETE | public | `(user_id = auth.uid())` | — |
| user_match_history | `user_match_history_insert` | INSERT | public | — | `(user_id = auth.uid())` |
| user_match_history | `user_match_history_select` | SELECT | public | `(user_id = auth.uid())` | — |
| user_match_history | `user_match_history_update` | UPDATE | public | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| venue_details | `public read venue_details` | SELECT | public | `true` | — |
| venue_images | `anon_select` | SELECT | anon | `true` | — |
| venue_images | `service_all` | ALL | service_role | `true` | — |
| venues | `venues_read` | SELECT | public | `true` | — |

---

## Triggers

3 triggers (the picks trigger fires on both INSERT and UPDATE).

| Table | Trigger | Timing | Events | Action |
|---|---|---|---|---|
| columns | `columns_assign_issue` | BEFORE | UPDATE | `EXECUTE FUNCTION assign_column_issue()` |
| picks | `picks_search_vector_trigger` | BEFORE | INSERT, UPDATE | `EXECUTE FUNCTION picks_search_vector_update()` |
| profiles | `profiles_updated_at` | BEFORE | UPDATE | `EXECUTE FUNCTION set_updated_at()` |

Note: the former `picks_autopin_trigger` (referencing dropped `world_x`/`world_y` columns) was removed in the May 2026 `drop_dead_world_coord_autopin` migration — it no longer exists.

---

## SQL functions

`wa_*` family plus the pipeline/trigger helpers referenced by crons and triggers. (No comments are set in the database; purposes inferred from names and project docs.)

| Function | Args | Purpose |
|---|---|---|
| `claim_staging_message` | — | Atomically claims the next staging message for processing (used by process-staging). |
| `wa_dedup_active_picks` | — | Archives exact-duplicate active picks (same city·venue·title·day·time), keeping the richest/bookmarked twin; sets `archive_reason='duplicate'`. |
| `wa_is_generic_venue` | `v text` | Returns true for non-spatial venue names ("various", "multiple", "online", …). |
| `wa_purge_old_archived` | — | Deletes picks archived more than 90 days ago. |
| `wa_reconcile_absent_picks` | `p_enforce boolean, p_grace_days integer` | Flags future-dated picks gone stale on snapshot sources (`last_seen_at`-based); archives with `archive_reason='source_absent'` when `p_enforce=true`, dry-run logging otherwise. Only considers sources with `reconcile_absences=true`. |
| `wa_ingest_zero_yield_check` | — | Daily ingest health check — detects sources/functions yielding zero results. |
| `invoke_wa_fn` | `fn text` | Helper that POSTs to the named edge function (used by most cron jobs). |
| `assign_column_issue` | — | Trigger fn: assigns `issue_num` on column update. |
| `picks_search_vector_update` | — | Trigger fn: maintains `picks.search_vector`. |
| `set_updated_at` | — | Trigger fn: bumps `updated_at` on profiles. |
| `reset_tonight` | — | Clears/resets the `tonight` flag daily. |
| `cleanup_match_cache` | — | Purges expired `match_cache` rows. |

---

## Cron jobs

30 jobs in `cron.job` (all times UTC). Most call `public.invoke_wa_fn('<edge-fn>')`; the rest call SQL functions directly or `net.http_post` with an inline body (those commands embed the public anon key, omitted here).

| Job | Schedule | What it does |
|---|---|---|
| archive-stale-daily | `0 4 * * *` | `net.http_post` → edge fn `archive-stale` (expired picks → `archived_at`). |
| cleanup-match-cache | `5 4 * * *` | `SELECT cleanup_match_cache();` |
| draft-column-weekly | `0 8 * * MON` | `net.http_post` → edge fn `draft-column` (weekly 140-word column). |
| embed-picks-auto | `*/30 * * * *` | `SELECT public.invoke_wa_fn('embed-picks');` |
| enrich-images-auto | `5,35 * * * *` | `net.http_post` → edge fn `enrich-images`, body `{"city":"tallinn","limit":20}`. |
| generate-context-nightly | `30 2 * * *` | `net.http_post` → edge fn `generate-context`, body `{"limit":20}`. |
| reset-tonight | `5 0 * * *` | `SELECT reset_tonight()` |
| rotate-tonight-daily | `5 4 * * *` | `net.http_post` → edge fn `rotate-tonight`. |
| send-digest-saturday | `0 9 * * SAT` | `net.http_post` → edge fn `send-digest`, body `{"city":"tallinn"}`. |
| wa-dedup-picks | `30 4 * * *` | `SELECT wa_dedup_active_picks()` |
| wa-enrich-pick-images | `40 * * * *` | `SELECT public.invoke_wa_fn('enrich-pick-images');` |
| wa-enrich-venues-day | `15 10 * * *` | `SELECT public.invoke_wa_fn('enrich-venues');` |
| wa-enrich-venues-night | `0 3 * * *` | `SELECT public.invoke_wa_fn('enrich-venues');` |
| wa-enrich-venues-osm | `0 4 * * 1` | `SELECT public.invoke_wa_fn('enrich-venues');` (weekly, Mondays) |
| wa-geocode-picks | `20 * * * *` | `SELECT public.invoke_wa_fn('geocode-picks');` |
| wa-ingest-echo-gone-wrong | `55 3 * * *` | `SELECT public.invoke_wa_fn('ingest-echo-gone-wrong')` |
| wa-ingest-fienta | `0 4 * * *` | `SELECT public.invoke_wa_fn('ingest-fienta');` |
| wa-ingest-hanzas-perons | `50 3 * * *` | `SELECT public.invoke_wa_fn('ingest-hanzas-perons')` |
| wa-ingest-health | `10 6 * * *` | `SELECT wa_ingest_zero_yield_check()` |
| wa-ingest-hel-linkedevents | `50 3 * * *` | `net.http_post` → edge fn `ingest-hel-linkedevents` (60s timeout). |
| wa-ingest-kinobize | `30 3 * * *` | `select public.invoke_wa_fn('ingest-kinobize');` |
| wa-ingest-osm | `30 3 * * 1` | `SELECT public.invoke_wa_fn('ingest-osm');` (weekly, Mondays) |
| wa-ingest-rss-evening | `0 17 * * *` | `SELECT public.invoke_wa_fn('ingest-rss');` |
| wa-ingest-rss-morning | `0 9 * * *` | `SELECT public.invoke_wa_fn('ingest-rss');` |
| wa-ingest-splendidpalace | `35 3 * * *` | `select public.invoke_wa_fn('ingest-splendidpalace');` |
| wa-ingest-telegram | `15 2 * * *` | `SELECT public.invoke_wa_fn('ingest-telegram');` |
| wa-ingest-telliskivi | `45 3 * * *` | `select public.invoke_wa_fn('ingest-telliskivi');` |
| wa-process-staging | `*/30 * * * *` | `SELECT public.invoke_wa_fn('process-staging');` |
| wa-purge-archived | `45 4 * * *` | `SELECT wa_purge_old_archived()` |
| wa-reconcile-absent | `0 5 * * *` | `SELECT wa_reconcile_absent_picks(false, 3)` — **dry-run** (enforce=false, 3-day grace). |
