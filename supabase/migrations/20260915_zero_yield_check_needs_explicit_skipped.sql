-- The zero-yield check read a missing detail.skipped as 0, so ingests that
-- do not log it (telliskivi: every event already staged) and cursor-based
-- feeds (rss, telegram: no new posts) raised false "dead parser" warnings.
-- A run counts as zero only when it reports skipped = 0 explicitly; a
-- scraper that parses nothing logs status 'error' itself.
create or replace function public.wa_ingest_zero_yield_check()
returns void
language plpgsql
set search_path to 'public', 'extensions'
as $function$
declare
  offenders jsonb;
begin
  with ranked as (
    select fn, inserted,
           (detail->>'skipped')::int as skipped,
           finished_at,
           row_number() over (partition by fn order by finished_at desc) as rn
    from ingest_log
    where fn like 'ingest-%'
      and status = 'ok'
      and finished_at > now() - interval '14 days'
  ),
  last3 as (
    select fn,
           count(*) as runs,
           max(finished_at) as newest,
           bool_and(inserted = 0 and skipped = 0) as all_zero
    from ranked
    where rn <= 3
    group by fn
  )
  select coalesce(jsonb_agg(jsonb_build_object('fn', fn, 'runs', runs, 'newest', newest)), '[]'::jsonb)
    into offenders
  from last3
  where runs >= 3 and all_zero;

  insert into ingest_log (fn, finished_at, status, inserted, rejected, detail)
  values (
    'ingest-health',
    now(),
    case when jsonb_array_length(offenders) > 0 then 'warn' else 'ok' end,
    0, 0,
    jsonb_build_object(
      'check', 'zero_yield',
      'note',  'fns whose 3 most recent ok-runs logged 0 inserted and skipped = 0 (possible dead parser)',
      'offenders', offenders
    )
  );
end;
$function$;

revoke execute on function public.wa_ingest_zero_yield_check() from public, anon, authenticated;
