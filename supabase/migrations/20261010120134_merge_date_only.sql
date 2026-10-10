-- A show one source lists with its time and another only by its date (a roundup's "Pantheon, 12.10" and the
-- theatre's "Pantheon, 19:00") was two rows: merge_events refused a date-only row from another source item.
-- It now lets that row join the timed row of its show on the same Tallinn day, at the same place or page. The
-- canonical keeps its own time and end. Which pairs are one show is the pipeline's to decide (dedupe.ts
-- dateOnlyJoins: titles that agree, exactly one start that day, the timed row published); every merge is
-- logged and undo_event_merge reverses it.

create or replace function public.merge_events(p_duplicate text, p_canonical text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  d public.events; c public.events; o public.events; after_merge jsonb;
  prov_before jsonb; prov_after jsonb; log_id bigint;
  items bigint[]; c_listed timestamptz;
begin
  perform pg_advisory_xact_lock(72419, 2);
  perform id from public.events where id in (p_duplicate,p_canonical) order by id for update;
  select * into strict d from public.events where id = p_duplicate;
  select * into strict c from public.events where id = p_canonical;
  -- The source items both rows were listed from.
  select coalesce(array_agg(distinct ds.raw_item_id), '{}') into items
    from public.event_sources ds join public.event_sources cs on cs.raw_item_id = ds.raw_item_id
    where ds.event_id = d.id and cs.event_id = c.id;
  if d.id = c.id or d.city <> c.city or (d.place_id is distinct from c.place_id and (d.url is null or d.url is distinct from c.url)) or c.place_id is null
    or d.merged_into is not null or c.merged_into is not null
    or (cardinality(items) = 0
      and not (d.has_time = c.has_time and abs(extract(epoch from d.starts_at-c.starts_at)) <= 1800)
      -- A date-only listing from another source joins the timed row of its show on that Tallinn day.
      and not (not d.has_time and c.has_time
        and (d.starts_at at time zone 'Europe/Tallinn')::date = (c.starts_at at time zone 'Europe/Tallinn')::date)) then
    raise exception 'Events need the same canonical venue and occurrence';
  end if;
  if exists(select 1 from public.event_redirects where canonical_id = d.id) then
    raise exception 'Merge into the existing canonical event';
  end if;
  -- o: the row whose occurrence and venue the canonical carries after the merge.
  o := c;
  if cardinality(items) > 0 then
    if d.has_time <> c.has_time
      and (d.starts_at at time zone 'Europe/Tallinn')::date = (c.starts_at at time zone 'Europe/Tallinn')::date then
      if d.has_time then o := d; end if;
    else
      select greatest(c.first_seen_at, max(m.first_seen_at)) into c_listed from public.events m
        where m.merged_into = c.id and m.starts_at = c.starts_at and m.has_time = c.has_time
          and exists(select 1 from public.event_sources ms where ms.event_id = m.id and ms.raw_item_id = any(items));
      if d.first_seen_at > c_listed or (d.first_seen_at = c_listed and d.last_seen_at > c.last_seen_at) then o := d; end if;
    end if;
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
    starts_at = o.starts_at, has_time = o.has_time,
    -- A same-item merge keeps one listing's end: the other row's end belongs to another start.
    ends_at = case when cardinality(items) = 0 then (case when c.has_time and not d.has_time then c.ends_at else coalesce(c.ends_at,d.ends_at) end)
      else coalesce(o.ends_at, case when d.starts_at = c.starts_at and d.has_time = c.has_time then coalesce(c.ends_at,d.ends_at) end) end,
    place_id = coalesce(o.place_id,c.place_id),
    venue_name = case when o.place_id is null then c.venue_name else o.venue_name end,
    address = case when o.place_id is null then c.address else o.address end,
    lat = case when o.place_id is null then c.lat else o.lat end,
    lng = case when o.place_id is null then c.lng else o.lng end,
    title_en = coalesce(c.title_en,d.title_en), summary_en = coalesce(c.summary_en,d.summary_en),
    description = coalesce(c.description,d.description),
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
revoke execute on function public.merge_events(text,text) from anon, authenticated, public;
grant execute on function public.merge_events(text,text) to service_role;
