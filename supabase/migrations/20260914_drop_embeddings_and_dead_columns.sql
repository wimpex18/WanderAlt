-- Drop the embeddings chain and columns nothing reads or writes.
--
-- Embeddings fed only the retired Concierge's hybrid search
-- (search_picks_hybrid). embed-picks is a 410 stub and its cron is off.
-- With pick_embeddings gone nothing uses the vector or pg_trgm extensions.
--
-- picks: context_md (retired generate-context), pending_review and
-- discovery_* (retired discover-venues), pin_* (the pre-MapLibre SVG map),
-- search_vector (hybrid search's full-text half) and the mood_tags GIN
-- index (only search read it; the column stays because process-staging
-- still writes it).
-- venue_details.google_place_id: Google Places is gone.
-- assign_column_issue / columns_issue_seq: the dropped columns table.
-- wa_is_generic_venue: no callers.
-- venues_image_backup_20260809: backup of image URLs deleted in August.
--
-- No CASCADE.

drop function if exists public.search_picks_hybrid;
drop function if exists public.wa_picks_missing_embeddings;
drop table if exists public.pick_embeddings;

drop trigger if exists picks_search_vector_trigger on public.picks;
drop function if exists public.picks_search_vector_update();
drop index if exists public.picks_search_vector_idx;
drop index if exists public.picks_mood_tags_gin;

alter table public.picks
  drop column if exists search_vector,
  drop column if exists context_md,
  drop column if exists pending_review,
  drop column if exists discovery_source,
  drop column if exists discovery_query,
  drop column if exists pin_num,
  drop column if exists pin_left,
  drop column if exists pin_top,
  drop column if exists pin_eyebrow;

alter table public.venue_details drop column if exists google_place_id;

drop function if exists public.assign_column_issue();
drop sequence if exists public.columns_issue_seq;
drop function if exists public.wa_is_generic_venue;
drop table if exists public.venues_image_backup_20260809;

drop extension if exists vector;
drop extension if exists pg_trgm;
