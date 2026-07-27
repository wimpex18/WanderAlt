-- 1. Turn the zero-yield guard back on.
--
-- wa_ingest_zero_yield_check() flags any ingest whose 3 most recent ok-runs
-- all yielded 0 inserted + 0 skipped. ingest-splendidpalace and
-- ingest-kinobize sat in exactly that state for ~47 runs each and nobody
-- saw it, because this cron was disabled. It is pure SQL over ingest_log —
-- no HTTP, no LLM, no spend — so it does not belong in the frozen set.
select cron.alter_job(jobid, active => true)
from cron.job where jobname = 'wa-ingest-health';

-- 2. Define a cron for ingest-ra, but leave it DISABLED.
--
-- ingest-ra is deployed, has a live source row (ra-vilnius →
-- ra.co/events/lt/vilnius) and works — a manual run just staged 12 events.
-- It had no cron entry at all, which is a different problem from being
-- deliberately frozen: there was nothing to switch on. This creates the
-- schedule so it sits alongside every other ingest, still off, one
-- alter_job away. Goes through invoke_wa_fn like the healthy crons.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'wa-ingest-ra') then
    perform cron.schedule(
      'wa-ingest-ra',
      '40 3 * * *',
      $cron$ SELECT public.invoke_wa_fn('ingest-ra'); $cron$
    );
    perform cron.alter_job(jobid, active => false)
      from cron.job where jobname = 'wa-ingest-ra';
  end if;
end $$;
