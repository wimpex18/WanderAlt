-- What the Supabase advisors flagged on 10 October 2026.
--
-- Performance: foreign keys without a covering index. event_sources is read by source and by raw item
-- (review-decider.ts, event-art.ts, maintenance), place_match_reviews by its second place, and a user's
-- reports go when the account is deleted.
create index if not exists event_sources_raw_item_idx on public.event_sources (raw_item_id) where raw_item_id is not null;
create index if not exists event_sources_source_idx on public.event_sources (source_id);
create index if not exists place_match_reviews_place_b_idx on public.place_match_reviews (place_b);
create index if not exists problem_reports_user_idx on public.problem_reports (user_id) where user_id is not null;

-- Performance: indexes nothing can use. No query filters places by alias (they are compared in the
-- pipeline's memory); (user_id, list_id) is the start of saved_list_items' primary key; place checks are
-- read whole and never filtered on next_at. Indexes the advisor also lists but that back a query once the
-- tables grow stay: places_osm_identity_idx (merge_places, undo_place_merge), places_verification_due_idx
-- (verify_event_places), problem_reports_open_idx and review_decisions_recent (review.html).
drop index if exists public.places_aliases_idx;
drop index if exists public.saved_list_items_list_idx;
drop index if exists public.place_checks_due;

-- Security (info): tables only the service role reads or writes have RLS on and no grant to anon or
-- authenticated, so no client reaches them; the advisor asks for a policy all the same. Each now says so
-- explicitly: no client role, no row.
do $$
declare t text;
begin
  foreach t in array array['change_notices', 'event_merge_log', 'pipeline_runs', 'place_checks', 'place_fact_flags',
    'place_liveness_log', 'place_match_reviews', 'place_merge_log', 'raw_items', 'review_decisions', 'social_tokens']
  loop
    execute format('create policy %I on public.%I as restrictive for all to anon, authenticated using (false) with check (false)', t || '_no_client', t);
  end loop;
end;
$$;
