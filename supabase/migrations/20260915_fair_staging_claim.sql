-- claim_staging_message was FIFO by id, so one high-volume feed
-- (hel-linkedevents: ~83% of the queue) starved every other source for
-- weeks. Claim from the source least recently claimed instead (its oldest
-- message). Expired leases come after new work, and past events are
-- rejected before claiming.
create or replace function public.claim_staging_message()
returns setof staging_messages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  lease constant interval := interval '15 minutes';
  cand bigint;
begin
  -- Events that ended before they were processed are not worth a model
  -- call. Feed rows carry the event time in payload; Telegram and RSS
  -- posts do not, so a post older than 14 days counts as stale.
  update staging_messages
     set status = 'rejected', rejection = 'expired before processing', processed_at = now()
   where status = 'new'
     and ((case when coalesce(payload->>'ends_at', payload->>'starts_at') ~ '^\d{4}-\d{2}-\d{2}'
                then coalesce(payload->>'ends_at', payload->>'starts_at')::timestamptz end) < now() - interval '1 day'
          or (payload is null and posted_at < now() - interval '14 days'));

  for cand in
    -- Each source's oldest new message, sources least recently claimed first.
    with heads as (
      select distinct on (source_id) id, source_id
      from staging_messages
      where status = 'new'
      order by source_id, id
    ), touched as (
      select source_id, max(claimed_at) as last_claim
      from staging_messages
      where claimed_at is not null
      group by source_id
    )
    select * from (
      select h.id from heads h left join touched t using (source_id)
      order by t.last_claim nulls first, h.id
      limit 25
    ) fair
    union all
    select * from (
      select id from staging_messages
      where status = 'in_progress' and (claimed_at is null or claimed_at < now() - lease)
      order by id
      limit 5
    ) stale
  loop
    return query
    update staging_messages
       set status = 'in_progress', claimed_at = now()
     where id = cand
       and (status = 'new'
            or (status = 'in_progress' and (claimed_at is null or claimed_at < now() - lease)))
    returning *;
    if found then return; end if;
  end loop;
end;
$function$;

revoke execute on function public.claim_staging_message() from public, anon, authenticated;

