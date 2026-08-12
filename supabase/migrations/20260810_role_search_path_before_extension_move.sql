-- ============================================================
-- Give the PostgREST roles an explicit search_path BEFORE moving any
-- extension out of public. This ordering is the whole safety of the
-- next migration.
--
-- `anon` and `authenticated` carried only a statement_timeout -- no
-- search_path at all -- so they fell back to the default
-- `"$user", public`. Move `vector` to `extensions` without fixing that
-- first and any query those roles run that names the type or the `<=>`
-- operator unqualified stops resolving. postgres already has exactly
-- this path; newer Supabase projects ship it on the API roles too.
-- ============================================================

alter role anon          set search_path = public, extensions;
alter role authenticated set search_path = public, extensions;
alter role service_role  set search_path = public, extensions;
