-- ============================================================
-- Close what the anon key can actually reach.
--
-- Supabase's advisor called two of these ERRORS and two WARNINGS, and it
-- has the order backwards for this project. The two "errors" leak a
-- backup of URLs we already deleted and an aggregate count of photos.
-- The two "warnings" are the ones that matter: invoke_wa_fn is SECURITY
-- DEFINER and EXECUTE is granted to anon, so a POST to
-- /rest/v1/rpc/invoke_wa_fn with the PUBLIC anon key invokes ANY edge
-- function -- with the Authorization header the function supplies
-- itself. That defeats every verify_jwt:true set on 9 Aug in one call.
-- Verified by exploiting it before writing this: returned request id
-- 11608, HTTP 200, with nothing but the key that ships in supabase.js.
-- ============================================================

-- 1. The backup table (advisor ERROR: rls_disabled_in_public).
--    anon had SELECT, INSERT, UPDATE and DELETE on it -- confirmed by
--    reading two rows over the wire. It is the pre-deletion snapshot of
--    the Unsplash image URLs, kept as a safety net and read by nothing.
--    RLS with NO policies denies every role except service_role, which
--    bypasses RLS by design -- so the net stays, unreachable.
alter table public.venues_image_backup_20260809 enable row level security;
revoke all on public.venues_image_backup_20260809 from anon, authenticated;

-- 2. image_health (advisor ERROR: security_definer_view).
--    Postgres 15+ makes a view SECURITY DEFINER unless told otherwise,
--    so this one ran as its creator and bypassed RLS for whoever asked.
--    It is an internal audit surface -- `select * from image_health` is
--    run from a SQL console, never by the app -- so it becomes
--    security_invoker AND loses its public grants. Both, because
--    invoker alone would still expose it wherever venues are readable.
alter view public.image_health set (security_invoker = on);
revoke all on public.image_health from anon, authenticated;

-- 3. invoke_wa_fn (advisor WARNING -- actually the worst of the four).
--    Only pg_cron calls this, and cron jobs run as the job owner, not
--    as anon. Nothing in the browser has ever called it: the app talks
--    to /functions/v1/* directly, never to /rest/v1/rpc/.
revoke execute on function public.invoke_wa_fn(text)        from anon, authenticated, public;
revoke execute on function public.invoke_wa_fn(text, jsonb) from anon, authenticated, public;

-- 4. claim_staging_message (advisor WARNING).
--    SECURITY DEFINER, anon-executable, and it MUTATES: it flips a row
--    to 'in_progress' with a 15-minute lease and returns the raw scraped
--    row. Anyone could have walked the queue, stalling ingestion 15
--    minutes per row and reading the unprocessed feed. Only
--    process-staging needs it, and that holds the service role key.
revoke execute on function public.claim_staging_message() from anon, authenticated, public;
