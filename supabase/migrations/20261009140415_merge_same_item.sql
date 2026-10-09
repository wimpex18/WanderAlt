-- One source item can leave two rows of one show. The pipeline made a second row when an item came back
-- with a moved start (the event id hashes the start: Fienta 208107, 10:00 → 12:30), and a model reading a
-- post can give a date alone and, read again, its time. merge_events refused any pair more than half an hour
-- apart or of different date-only/timed kind, so these rows stayed. When both rows were listed from one
-- source item (a shared event_sources.raw_item_id) those two checks are waived; the city, venue-or-page,
-- canonical-place and not-yet-merged checks stay. pipeline/dedupe.ts (sameItemEvents) decides which pairs are
-- one show: never two timed rows of a source whose item can list several shows.
--
-- The canonical keeps its id, which saves and links hold, and takes the occurrence (start, date-only or timed,
-- end) and the venue of the source's latest listing: the row first seen later, a tie going to the one seen
-- later, counting an earlier merge from the same item that already moved the canonical. When one row is
-- date-only and the other timed on the same Tallinn day, the timed row's listing is kept: a date alone cannot
-- contradict a time on its own day. Every other merge works as before. undo_event_merge restores those fields
-- too, under its existing rule (a field changed since the merge stays as it is).
--
-- refresh_source_seen also moves events.last_seen_at for the rows whose provenance it refreshes, so
-- picks.last_seen_at agrees with the event page's "Checked" line (the newest event_sources.last_seen_at).

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
    or (cardinality(items) = 0 and (abs(extract(epoch from d.starts_at-c.starts_at)) > 1800 or d.has_time <> c.has_time)) then
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
    ends_at = case when cardinality(items) = 0 then coalesce(c.ends_at,d.ends_at)
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

create or replace function public.undo_event_merge(p_merge bigint)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  m public.event_merge_log; c public.events; r public.events;
  values_now jsonb; k text; prov jsonb; old_prov jsonb; current_prov jsonb; es public.event_sources;
begin
  perform pg_advisory_xact_lock(72419, 2);
  select * into strict m from public.event_merge_log where id = p_merge for update;
  if m.reverted_at is not null then raise exception 'Merge already undone'; end if;
  perform id from public.events where id in (m.duplicate_id,m.canonical_id) order by id for update;
  select * into strict c from public.events where id = m.canonical_id;
  if c.merged_into is not null or exists(select 1 from public.event_merge_log l where l.id > m.id
    and l.reverted_at is null and l.canonical_id = c.id) then raise exception 'Undo later merges first'; end if;
  values_now := to_jsonb(c);
  foreach k in array array['starts_at','has_time','place_id','venue_name','address','lat','lng',
    'title_en','summary_en','description','ends_at','ticket_url','is_free','price_min','price_max','currency','image_url','image_attr','flag'] loop
    if values_now -> k = m.canonical_after -> k then values_now := jsonb_set(values_now,array[k],m.canonical_before -> k); end if;
  end loop;
  r := jsonb_populate_record(null::public.events,values_now);
  -- A venue removed since the merge cannot come back; the current one stays.
  if r.place_id is distinct from c.place_id and not exists(select 1 from public.places p where p.id = r.place_id) then
    r.place_id := c.place_id; r.venue_name := c.venue_name; r.address := c.address; r.lat := c.lat; r.lng := c.lng;
  end if;
  update public.events set starts_at=r.starts_at, has_time=r.has_time, place_id=r.place_id, venue_name=r.venue_name,
    address=r.address, lat=r.lat, lng=r.lng,
    title_en=r.title_en, summary_en=r.summary_en, description=r.description, ends_at=r.ends_at,
    ticket_url=r.ticket_url, is_free=r.is_free, price_min=r.price_min, price_max=r.price_max, currency=r.currency,
    image_url=r.image_url, image_attr=r.image_attr, flag=r.flag where id=c.id;
  update public.events set merged_into=null, archived_at=(m.duplicate_before->>'archived_at')::timestamptz where id=m.duplicate_id;
  delete from public.event_redirects where id=m.duplicate_id;
  for prov in select value from jsonb_array_elements(m.provenance_after) loop
    select to_jsonb(s) into current_prov from public.event_sources s where event_id=c.id and source_id=prov->>'source_id';
    if current_prov = prov then
      select value into old_prov from jsonb_array_elements(m.provenance_before) where value->>'source_id'=prov->>'source_id';
      if old_prov is null then delete from public.event_sources where event_id=c.id and source_id=prov->>'source_id';
      else
        es := jsonb_populate_record(null::public.event_sources,old_prov);
        update public.event_sources set raw_item_id=es.raw_item_id,url=es.url,first_seen_at=es.first_seen_at,last_seen_at=es.last_seen_at,flag=es.flag
          where event_id=c.id and source_id=es.source_id;
      end if;
    end if;
  end loop;
  update public.event_merge_log set reverted_at=now() where id=m.id;
end;
$$;
revoke execute on function public.undo_event_merge(bigint) from anon, authenticated, public;
grant execute on function public.undo_event_merge(bigint) to service_role;

-- Only exact items actually seen again can refresh old provenance, and the rows they listed with it.
-- Returns the number of provenance rows refreshed, as before.
create or replace function public.refresh_source_seen(p_source text, p_external_ids text[])
returns integer language plpgsql security invoker set search_path = '' as $$
declare total integer;
begin
  with touched as (
    update public.event_sources es set last_seen_at=now()
    from public.raw_items r where es.raw_item_id=r.id and es.source_id=p_source
      and r.source_id=p_source and r.external_id=any(p_external_ids) and r.status='done'
    returning es.event_id
  ), listed as (
    update public.events e set last_seen_at=now() where e.id in (select event_id from touched)
  )
  select count(*) into total from touched;
  return total;
end;
$$;
revoke execute on function public.refresh_source_seen(text,text[]) from anon, authenticated, public;
grant execute on function public.refresh_source_seen(text,text[]) to service_role;
