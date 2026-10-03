-- One show listed under venue names that disagree (Design Street four ways) is one event when two rows
-- carry the same listing address and the same start. merge_events used to refuse any pair at different
-- places, so the planner's join by address (pipeline/dedupe.ts) failed the whole run. The venue rule stays
-- for every pair that does not share a listing address.
create or replace function public.merge_events(p_duplicate text, p_canonical text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  d public.events; c public.events; after_merge jsonb;
  prov_before jsonb; prov_after jsonb; log_id bigint;
begin
  perform pg_advisory_xact_lock(72419, 2);
  perform id from public.events where id in (p_duplicate,p_canonical) order by id for update;
  select * into strict d from public.events where id = p_duplicate;
  select * into strict c from public.events where id = p_canonical;
  if d.id = c.id or d.city <> c.city or (d.place_id is distinct from c.place_id and (d.url is null or d.url is distinct from c.url)) or c.place_id is null
    or d.merged_into is not null or c.merged_into is not null
    or abs(extract(epoch from d.starts_at-c.starts_at)) > 1800 or d.has_time <> c.has_time then
    raise exception 'Events need the same canonical venue and occurrence';
  end if;
  if exists(select 1 from public.event_redirects where canonical_id = d.id) then
    raise exception 'Merge into the existing canonical event';
  end if;
  select coalesce(jsonb_agg(to_jsonb(es)), '[]') into prov_before from public.event_sources es where event_id = c.id;
  insert into public.event_sources(event_id,source_id,raw_item_id,url,first_seen_at,last_seen_at,flag)
    select c.id,source_id,raw_item_id,url,first_seen_at,last_seen_at,flag from public.event_sources where event_id = d.id
    on conflict(event_id,source_id) do update set
      first_seen_at = least(event_sources.first_seen_at,excluded.first_seen_at),
      last_seen_at = greatest(event_sources.last_seen_at,excluded.last_seen_at),
      url = coalesce(event_sources.url,excluded.url),
      flag = (select f from unnest(array[event_sources.flag,excluded.flag]) f where f is not null
        order by case f when 'cancelled' then 4 when 'postponed' then 3 when 'sold_out' then 2 else 1 end desc limit 1);
  update public.events set
    title_en = coalesce(c.title_en,d.title_en), summary_en = coalesce(c.summary_en,d.summary_en),
    description = coalesce(c.description,d.description), ends_at = coalesce(c.ends_at,d.ends_at),
    ticket_url = coalesce(c.ticket_url,d.ticket_url), is_free = coalesce(c.is_free,d.is_free),
    price_min = coalesce(c.price_min,d.price_min), price_max = coalesce(c.price_max,d.price_max), currency = coalesce(c.currency,d.currency),
    image_url = coalesce(c.image_url,d.image_url), image_attr = case when c.image_url is null then d.image_attr else c.image_attr end,
    flag = (select f from unnest(array[c.flag,d.flag]) f where f is not null
      order by case f when 'cancelled' then 4 when 'postponed' then 3 when 'sold_out' then 2 else 1 end desc limit 1)
    where id = c.id returning to_jsonb(events.*) into after_merge;
  update public.events set merged_into = c.id, archived_at = now() where id = d.id;
  insert into public.event_redirects(id,canonical_id) values(d.id,c.id);
  select coalesce(jsonb_agg(to_jsonb(es)), '[]') into prov_after from public.event_sources es where event_id = c.id;
  insert into public.event_merge_log(duplicate_id,canonical_id,duplicate_before,canonical_before,canonical_after,provenance_before,provenance_after)
    values(d.id,c.id,to_jsonb(d),to_jsonb(c),after_merge,prov_before,prov_after) returning id into log_id;
  return log_id;
end;
$$;
