-- claim_staging_message(): reclaim rows a dead worker left behind.
--
-- The old body only ever selected `status = 'new'`:
--
--   UPDATE staging_messages SET status = 'in_progress'
--   WHERE id = (SELECT id FROM staging_messages
--               WHERE status = 'new' ORDER BY id LIMIT 1
--               FOR UPDATE SKIP LOCKED)
--
-- so a message that reached 'in_progress' and never reached a terminal
-- state had no path back into the queue. process-staging can die
-- mid-message in several ordinary ways — the 60s edge-function wall,
-- an LLM provider timeout, a cold-start kill — and every one of those
-- strands its claimed row permanently.
--
-- 49 rows had been sitting in 'in_progress' since May 2026, invisible:
-- the queue looked drained, ingest kept filing new messages, and nobody
-- saw that a fixed set of listings was never going to be processed.
-- This is also silent under the zero-yield health check, which watches
-- ingests rather than the staging queue.
--
-- Fix: stamp the claim, and let a claim take back anything that has been
-- in_progress longer than the lease. The lease is deliberately longer
-- than the function's own TIME_CAP so a slow-but-alive worker is never
-- overtaken by the next invocation.
--
-- Idempotent: re-running is safe.

alter table public.staging_messages
  add column if not exists claimed_at timestamptz;

comment on column public.staging_messages.claimed_at is
  'Set when claim_staging_message() moves a row to in_progress. A claim '
  'older than the lease (15 min) is treated as abandoned and reclaimed.';

-- Rows stranded before this column existed have no claimed_at, so they
-- are treated as infinitely stale and return to the queue on the next
-- claim. That is the intent: they have been unreachable for months.
create index if not exists staging_messages_claim_idx
  on public.staging_messages (status, claimed_at, id);

create or replace function public.claim_staging_message()
returns setof staging_messages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  lease constant interval := interval '15 minutes';
begin
  return query
  update staging_messages
  set    status = 'in_progress',
         claimed_at = now()
  where  id = (
    select id from staging_messages
    where  status = 'new'
       or (status = 'in_progress'
           and (claimed_at is null or claimed_at < now() - lease))
    /* 'new' first, then the oldest abandoned claim — a fresh listing is
       worth more than a retry of one that has already waited. */
    order by (status <> 'new'), id
    limit 1
    for update skip locked
  )
  returning *;
end;
$function$;
