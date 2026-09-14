-- Drop tables and functions that nothing reads or writes any more.
--
--   curators            curator profiles; the product has no curators.
--                       picks.handle and sources.curator_handle stay as
--                       provenance text, so only their foreign keys go.
--   columns             drafts of the retired weekly editorial column.
--   match_cache,
--   user_match_history  the retired Concierge (match-pick).
--   places_index,
--   wa_search_places_index
--                       Overture venue index, read only by the retired
--                       discover-venues.
--   cleanup_match_cache the retired Concierge's cache sweep.
--
-- No CASCADE: an unexpected dependent makes this fail rather than
-- silently taking something else with it.

alter table public.picks   drop constraint if exists picks_handle_fkey;
alter table public.sources drop constraint if exists sources_curator_handle_fkey;

drop function if exists public.cleanup_match_cache();
drop function if exists public.wa_search_places_index(text, text, text[], integer);

drop table if exists public.match_cache;
drop table if exists public.user_match_history;
drop table if exists public.places_index;
drop table if exists public.columns;
drop table if exists public.curators;
