-- wa_dedup_active_picks ordered by picks.context_md, dropped in
-- 20260914_drop_embeddings_and_dead_columns.sql; the wa-dedup-picks cron
-- has failed since. Rank without it.
create or replace function public.wa_dedup_active_picks()
returns integer
language plpgsql
set search_path to 'public', 'extensions'
as $function$
declare n integer;
begin
  with ranked as (
    select p.id,
      row_number() over (
        partition by lower(p.city), lower(coalesce(p.venue,'')), lower(p.title),
                     coalesce(p.day,''), coalesce(p.time,'')
        order by
          (exists (select 1 from bookmarks b where b.pick_id = p.id)) desc,
          (p.image_url is not null) desc,
          p.created_at desc,
          p.id desc
      ) as rn
    from picks p
    where p.archived_at is null
  )
  update picks p
     set archived_at = now(), archive_reason = 'duplicate',
         tonight = false, this_week = false
    from ranked r
   where p.id = r.id and r.rn > 1;
  get diagnostics n = row_count;
  return n;
end $function$;

-- Cron-only housekeeping functions: pg_cron runs them as the job owner,
-- so no API role needs EXECUTE.
revoke execute on function
  public.reset_tonight(),
  public.wa_dedup_active_picks(),
  public.wa_ingest_zero_yield_check(),
  public.wa_purge_old_archived(),
  public.wa_purge_old_pick_changes(),
  public.wa_reconcile_absent_picks(boolean, integer)
from public, anon, authenticated;
