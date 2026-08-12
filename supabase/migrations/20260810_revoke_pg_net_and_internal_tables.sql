-- ============================================================
-- Two things the advisor did NOT flag, found while re-examining the
-- three findings it did.
--
-- 1. pg_net's HTTP functions were EXECUTE-able by anon.
--    net.http_post / http_get / http_delete are a server-side HTTP
--    client. Granted to anon, that is a server-side request forgery
--    primitive pointed at anything the database can reach, including
--    the cloud metadata endpoint and every internal Supabase service.
--
--    It is not reachable TODAY -- `net` is not in PostgREST's exposed
--    schema list, so /rest/v1/rpc/http_post is a 404 and Accept-Profile:
--    net is refused. Checked all three before touching anything. But
--    "unreachable" here is one dashboard setting away from "reachable",
--    and the grant has no reason to exist either way. Nothing of ours
--    relies on it: invoke_wa_fn is SECURITY DEFINER so it calls
--    net.http_post as its owner, and pg_cron jobs run as the job owner.
--
-- 2. The five pipeline-internal tables had RLS on with no policies,
--    which already denies anon -- but they still carried SELECT grants.
--    Defence in depth: a policy added carelessly later would open a
--    table that was never meant to be public. Revoking the grant means
--    a future policy alone cannot expose them.
--
--    Checked first that this does not break the admin panel: admin.js
--    reads ingest_log and staging_messages with the SERVICE ROLE key
--    from localStorage (service_role bypasses both RLS and grants), and
--    uses the anon key only for venues, venue_details and picks, none
--    of which are touched here.
-- ============================================================

revoke execute on all functions in schema net from anon, authenticated;

revoke all on public.ingest_log        from anon, authenticated;
revoke all on public.pick_changes      from anon, authenticated;
revoke all on public.places_index      from anon, authenticated;
revoke all on public.sources           from anon, authenticated;
revoke all on public.staging_messages  from anon, authenticated;
