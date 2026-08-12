-- ============================================================
-- Pin search_path on the 15 functions that had none.
--
-- A function with no search_path resolves unqualified names using the
-- CALLER's path, so a caller who can create objects can shadow a table
-- or an operator and have this code run against theirs instead.
--
-- The fix that is usually recommended -- SET search_path = '' with every
-- name fully qualified -- would break this database, and it is worth
-- writing down why. `vector`, `pg_trgm` and `pg_net` are installed in
-- PUBLIC here, not in `extensions`. So `public` is not merely where the
-- tables live, it is where the `<=>` operator, the `%` operator and the
-- vector type resolve from. An empty path would leave search_picks_hybrid
-- unable to find its own distance operator.
--
-- `public, extensions` is therefore the correct pin: everything these
-- functions already used stays reachable, and the path stops depending
-- on whoever calls them. `extensions` is included because pgcrypto and
-- uuid-ossp live there and a future function will reach for one.
--
-- pg_temp is deliberately absent. Being implicitly searched is the
-- actual attack this warning is about.
--
-- Nothing here is SECURITY DEFINER and nothing referenced another
-- schema, which is what makes this safe to do in one pass. Two of them
-- are TRIGGERS on picks (picks_search_vector_update, wa_log_pick_change)
-- and one is a trigger on profiles (set_updated_at) -- if those broke,
-- every pipeline insert would fail, so all three were re-verified
-- against a real insert and update before this was committed.
-- ============================================================

alter function public.assign_column_issue()                             set search_path = public, extensions;
alter function public.cleanup_match_cache()                             set search_path = public, extensions;
alter function public.picks_search_vector_update()                      set search_path = public, extensions;
alter function public.reset_tonight()                                   set search_path = public, extensions;
alter function public.search_picks_hybrid(text, vector, text, integer, boolean)
                                                                        set search_path = public, extensions;
alter function public.set_updated_at()                                  set search_path = public, extensions;
alter function public.wa_dedup_active_picks()                           set search_path = public, extensions;
alter function public.wa_ingest_zero_yield_check()                      set search_path = public, extensions;
alter function public.wa_is_generic_venue(text)                         set search_path = public, extensions;
alter function public.wa_log_pick_change()                              set search_path = public, extensions;
alter function public.wa_picks_missing_embeddings(text, integer)        set search_path = public, extensions;
alter function public.wa_purge_old_archived()                           set search_path = public, extensions;
alter function public.wa_purge_old_pick_changes()                       set search_path = public, extensions;
alter function public.wa_reconcile_absent_picks(boolean, integer)       set search_path = public, extensions;
alter function public.wa_search_places_index(text, text, text[], integer)
                                                                        set search_path = public, extensions;
