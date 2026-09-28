-- Canonical venues, retained OSM identities, and reversible maintenance.
alter table public.places
  add column merged_into text references public.places(id),
  add column osm_ids text[] not null default '{}',
  add column osm_checked_at timestamptz,
  add column osm_last_seen_at timestamptz,
  add column osm_missing_count integer not null default 0 check (osm_missing_count >= 0),
  add column osm_state text not null default 'unknown' check (osm_state in ('unknown', 'present', 'missing', 'closed', 'review')),
  add column osm_note text,
  add column osm_closed_by_check boolean not null default false,
  add column osm_auto_close boolean not null default true,
  add constraint places_merge_target check (merged_into is null or (merged_into <> id and status = 'hidden'));
update public.places set osm_ids = array[osm_id] where osm_id is not null;
create index places_osm_identity_idx on public.places(city, osm_id) where merged_into is null and osm_id is not null;
create index places_osm_due_idx on public.places(osm_checked_at, id) where merged_into is null;
create index places_merge_target_idx on public.places(merged_into) where merged_into is not null;

-- Only redirects are public. Snapshots and uncertain matches stay private.
create table public.place_redirects (
  id text primary key references public.places(id),
  canonical_id text not null references public.places(id),
  check (id <> canonical_id)
);
create index place_redirects_target_idx on public.place_redirects(canonical_id);
alter table public.place_redirects enable row level security;
revoke all on public.place_redirects from anon, authenticated;
grant select on public.place_redirects to anon, authenticated;
grant all on public.place_redirects to service_role;
create policy place_redirects_read on public.place_redirects for select to anon, authenticated using (true);

create table public.place_match_reviews (
  place_a text not null references public.places(id),
  place_b text not null references public.places(id),
  state text not null default 'pending' check (state in ('pending', 'separate', 'merged')),
  reason text not null,
  evidence jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key(place_a, place_b),
  check (place_a < place_b)
);
alter table public.place_match_reviews enable row level security;
revoke all on public.place_match_reviews from anon, authenticated;
grant all on public.place_match_reviews to service_role;

create table public.place_merge_log (
  id bigint generated always as identity primary key,
  duplicate_id text not null references public.places(id),
  canonical_id text not null references public.places(id),
  reason text not null,
  evidence jsonb not null default '{}',
  duplicate_before jsonb not null,
  canonical_before jsonb not null,
  canonical_after jsonb not null,
  event_ids text[] not null,
  redirect_ids text[] not null,
  merged_at timestamptz not null default now(),
  reverted_at timestamptz
);
create index place_merge_log_duplicate_idx on public.place_merge_log(duplicate_id);
create index place_merge_log_canonical_idx on public.place_merge_log(canonical_id);
alter table public.place_merge_log enable row level security;
revoke all on public.place_merge_log from anon, authenticated;
grant all on public.place_merge_log to service_role;
grant usage, select on sequence public.place_merge_log_id_seq to service_role;

create table public.place_liveness_log (
  id bigint generated always as identity primary key,
  place_id text not null references public.places(id),
  before_check jsonb not null,
  after_check jsonb not null,
  checked_at timestamptz not null default now()
);
create index place_liveness_log_place_idx on public.place_liveness_log(place_id, checked_at);
alter table public.place_liveness_log enable row level security;
revoke all on public.place_liveness_log from anon, authenticated;
grant all on public.place_liveness_log to service_role;
grant usage, select on sequence public.place_liveness_log_id_seq to service_role;

-- Invoker rights and explicit grants: these RPCs are pipeline/admin only.
create function public.merge_places(p_duplicate text, p_canonical text, p_reason text, p_evidence jsonb default '{}')
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  d public.places; c public.places; after_merge jsonb;
  moved text[]; redirects text[]; log_id bigint;
begin
  -- Serialize merges/undo and lock both rows in a consistent order.
  perform pg_advisory_xact_lock(72419, 1);
  perform id from public.places where id in (p_duplicate, p_canonical) order by id for update;
  select * into strict d from public.places where id = p_duplicate;
  select * into strict c from public.places where id = p_canonical;
  if d.id = c.id or d.city <> c.city or d.merged_into is not null or c.merged_into is not null then
    raise exception 'Merge needs two distinct canonical places in the same city';
  end if;
  if c.status = 'hidden' or d.status = 'hidden' then raise exception 'Review manually hidden places before merging'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A merge needs a reason'; end if;
  select coalesce(array_agg(id order by id), '{}') into moved from public.events where place_id = d.id;
  select coalesce(array_agg(id order by id), '{}') into redirects from public.place_redirects where canonical_id = d.id;
  update public.places set
    aliases = array(select distinct v from unnest(c.aliases || d.aliases || array[lower(d.name)]) v order by v),
    osm_ids = array(select distinct v from unnest(c.osm_ids || d.osm_ids || array[c.osm_id, d.osm_id]) v where v is not null order by v),
    kind = coalesce(nullif(c.kind, ''), d.kind), address = coalesce(nullif(c.address, ''), d.address),
    lat = coalesce(c.lat, d.lat), lng = coalesce(c.lng, d.lng), osm_id = coalesce(c.osm_id, d.osm_id),
    neighborhood = coalesce(nullif(c.neighborhood, ''), d.neighborhood),
    website = coalesce(nullif(c.website, ''), d.website), instagram = coalesce(nullif(c.instagram, ''), d.instagram),
    facebook = coalesce(nullif(c.facebook, ''), d.facebook),
    opening_hours = coalesce(nullif(c.opening_hours, ''), d.opening_hours),
    description = coalesce(nullif(c.description, ''), d.description), wikidata_id = coalesce(c.wikidata_id, d.wikidata_id),
    image_url = coalesce(c.image_url, d.image_url),
    image_attr = case when c.image_url is null then d.image_attr else c.image_attr end,
    image_source = case when c.image_url is null then d.image_source else c.image_source end,
    osm_checked_at = null, updated_at = now()
  where id = c.id returning to_jsonb(places.*) into after_merge;
  update public.events set place_id = c.id where place_id = d.id;
  update public.places set merged_into = c.id, status = 'hidden', updated_at = now() where id = d.id;
  update public.place_redirects set canonical_id = c.id where canonical_id = d.id;
  insert into public.place_redirects(id, canonical_id) values(d.id, c.id);
  insert into public.place_merge_log(duplicate_id, canonical_id, reason, evidence,
    duplicate_before, canonical_before, canonical_after, event_ids, redirect_ids)
  values(d.id, c.id, p_reason, p_evidence, to_jsonb(d), to_jsonb(c), after_merge, moved, redirects)
  returning id into log_id;
  insert into public.place_match_reviews(place_a, place_b, state, reason, evidence)
    values(least(d.id,c.id), greatest(d.id,c.id), 'merged', p_reason, p_evidence)
    on conflict(place_a,place_b) do update set state = 'merged', reason = excluded.reason,
      evidence = excluded.evidence, updated_at = now();
  return log_id;
end;
$$;
revoke execute on function public.merge_places(text,text,text,jsonb) from anon, authenticated, public;
grant execute on function public.merge_places(text,text,text,jsonb) to service_role;

create function public.undo_place_merge(p_merge bigint)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  m public.place_merge_log; c public.places; restored public.places;
  values_now jsonb; k text;
begin
  perform pg_advisory_xact_lock(72419, 1);
  select * into strict m from public.place_merge_log where id = p_merge for update;
  if m.reverted_at is not null then raise exception 'Merge already undone'; end if;
  perform id from public.places where id in (m.duplicate_id, m.canonical_id) order by id for update;
  select * into strict c from public.places where id = m.canonical_id;
  if c.merged_into is not null or exists(select 1 from public.place_merge_log l where l.id > m.id
    and l.reverted_at is null and (l.canonical_id in (m.canonical_id,m.duplicate_id) or l.duplicate_id in (m.canonical_id,m.duplicate_id))) then
    raise exception 'Undo later dependent merges first';
  end if;
  values_now := to_jsonb(c);
  -- Restore only values still equal to what the merge wrote; retain later
  -- edits/enrichment. New events remain at their present canonical place.
  foreach k in array array['aliases','osm_ids','kind','address','lat','lng','osm_id','neighborhood',
    'website','instagram','facebook','opening_hours','description','wikidata_id','image_url','image_attr','image_source'] loop
    if values_now -> k = m.canonical_after -> k then
      values_now := jsonb_set(values_now, array[k], m.canonical_before -> k);
    end if;
  end loop;
  restored := jsonb_populate_record(null::public.places, values_now);
  update public.places set aliases = restored.aliases, osm_ids = restored.osm_ids, kind = restored.kind,
    address = restored.address, lat = restored.lat, lng = restored.lng, osm_id = restored.osm_id,
    neighborhood = restored.neighborhood, website = restored.website, instagram = restored.instagram,
    facebook = restored.facebook, opening_hours = restored.opening_hours, description = restored.description,
    wikidata_id = restored.wikidata_id, image_url = restored.image_url, image_attr = restored.image_attr,
    image_source = restored.image_source, osm_checked_at = null, updated_at = now() where id = c.id;
  update public.events set place_id = m.duplicate_id where id = any(m.event_ids) and place_id = c.id;
  update public.places set merged_into = null, status = m.duplicate_before ->> 'status', updated_at = now() where id = m.duplicate_id;
  delete from public.place_redirects where id = m.duplicate_id;
  update public.place_redirects set canonical_id = m.duplicate_id where id = any(m.redirect_ids) and canonical_id = c.id;
  update public.place_merge_log set reverted_at = now() where id = m.id;
  update public.place_match_reviews set state = 'separate', reason = 'merge undone; keep separate', updated_at = now()
    where place_a = least(m.duplicate_id,m.canonical_id) and place_b = greatest(m.duplicate_id,m.canonical_id);
end;
$$;
revoke execute on function public.undo_place_merge(bigint) from anon, authenticated, public;
grant execute on function public.undo_place_merge(bigint) to service_role;

-- Separate switches remain separate from OSM liveness. A manual closed or
-- hidden status is never re-opened by a positive OSM observation.
create function public.check_place_liveness(p_id text, p_patch jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare p public.places; after_check jsonb;
begin
  select * into strict p from public.places where id = p_id for update;
  if p.merged_into is not null then raise exception 'Check the canonical venue'; end if;
  if coalesce(p_patch ->> 'osm_state', '') not in ('present','closed','missing','review') then raise exception 'Invalid OSM state'; end if;
  update public.places set
    osm_checked_at = (p_patch ->> 'osm_checked_at')::timestamptz,
    osm_last_seen_at = coalesce((p_patch ->> 'osm_last_seen_at')::timestamptz, p.osm_last_seen_at),
    osm_missing_count = coalesce((p_patch ->> 'osm_missing_count')::integer, p.osm_missing_count),
    osm_state = p_patch ->> 'osm_state', osm_note = p_patch ->> 'osm_note',
    status = case when p_patch ->> 'osm_state' = 'closed' and p.status = 'active' and p.osm_auto_close then 'closed'
      when p_patch ->> 'osm_state' = 'present' and p.status = 'closed' and p.osm_closed_by_check then 'active' else p.status end,
    osm_closed_by_check = case when p_patch ->> 'osm_state' = 'closed' and p.status = 'active' and p.osm_auto_close then true
      when p_patch ->> 'osm_state' = 'present' and p.osm_closed_by_check then false else p.osm_closed_by_check end,
    updated_at = now()
  where id = p.id returning to_jsonb(places.*) into after_check;
  insert into public.place_liveness_log(place_id, before_check, after_check)
    values(p.id, to_jsonb(p), after_check);
end;
$$;
revoke execute on function public.check_place_liveness(text,jsonb) from anon, authenticated, public;
grant execute on function public.check_place_liveness(text,jsonb) to service_role;

-- The existing invoker views/RLS omit hidden rows, so retained duplicates
-- disappear from every catalogue without losing their private record.

alter table public.events add column merged_into text references public.events(id),
  add constraint events_merge_target check (merged_into is null or (merged_into <> id and archived_at is not null));
create index events_merge_target_idx on public.events(merged_into) where merged_into is not null;
drop policy events_read on public.events;
create policy events_read on public.events for select using (status = 'published' and merged_into is null);

alter table public.event_sources add column flag text check (flag in ('cancelled','postponed','sold_out','few_left'));
-- Conservative baseline for existing observations. Future reads replace
-- each source's own flag, so an unchanged cancellation cannot be cleared
-- by another source refreshing its description.
update public.event_sources es set flag = e.flag from public.events e where e.id = es.event_id and e.flag is not null;

create table public.event_redirects (
  id text primary key references public.events(id),
  canonical_id text not null references public.events(id),
  check (id <> canonical_id)
);
create index event_redirects_target_idx on public.event_redirects(canonical_id);
alter table public.event_redirects enable row level security;
revoke all on public.event_redirects from anon, authenticated;
grant select on public.event_redirects to anon, authenticated;
grant all on public.event_redirects to service_role;
create policy event_redirects_read on public.event_redirects for select to anon, authenticated
  using (exists(select 1 from public.events e where e.id = canonical_id));

create view public.catalogue_redirects with (security_invoker = true) as
  select id, canonical_id from public.place_redirects
  union all select id, canonical_id from public.event_redirects;
grant select on public.catalogue_redirects to anon, authenticated, service_role;

create table public.event_merge_log (
  id bigint generated always as identity primary key,
  duplicate_id text not null references public.events(id),
  canonical_id text not null references public.events(id),
  duplicate_before jsonb not null, canonical_before jsonb not null, canonical_after jsonb not null,
  provenance_before jsonb not null, provenance_after jsonb not null,
  merged_at timestamptz not null default now(), reverted_at timestamptz
);
create index event_merge_log_duplicate_idx on public.event_merge_log(duplicate_id);
create index event_merge_log_canonical_idx on public.event_merge_log(canonical_id);
alter table public.event_merge_log enable row level security;
revoke all on public.event_merge_log from anon, authenticated;
grant all on public.event_merge_log to service_role;
grant usage, select on sequence public.event_merge_log_id_seq to service_role;

create function public.merge_events(p_duplicate text, p_canonical text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  d public.events; c public.events; after_merge jsonb;
  prov_before jsonb; prov_after jsonb; log_id bigint;
begin
  perform pg_advisory_xact_lock(72419, 2);
  perform id from public.events where id in (p_duplicate,p_canonical) order by id for update;
  select * into strict d from public.events where id = p_duplicate;
  select * into strict c from public.events where id = p_canonical;
  if d.id = c.id or d.city <> c.city or d.place_id is distinct from c.place_id or c.place_id is null
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
revoke execute on function public.merge_events(text,text) from anon, authenticated, public;
grant execute on function public.merge_events(text,text) to service_role;

create function public.undo_event_merge(p_merge bigint)
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
  foreach k in array array['title_en','summary_en','description','ends_at','ticket_url','is_free','price_min','price_max','currency','image_url','image_attr','flag'] loop
    if values_now -> k = m.canonical_after -> k then values_now := jsonb_set(values_now,array[k],m.canonical_before -> k); end if;
  end loop;
  r := jsonb_populate_record(null::public.events,values_now);
  update public.events set title_en=r.title_en, summary_en=r.summary_en, description=r.description, ends_at=r.ends_at,
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

create function public.refresh_event_flags(p_ids text[])
returns void language sql security invoker set search_path = '' as $$
  update public.events e set flag = (select es.flag from public.event_sources es where es.event_id=e.id and es.flag is not null
    order by case es.flag when 'cancelled' then 4 when 'postponed' then 3 when 'sold_out' then 2 else 1 end desc limit 1)
    where e.id=any(p_ids) and e.merged_into is null;
$$;
revoke execute on function public.refresh_event_flags(text[]) from anon, authenticated, public;
grant execute on function public.refresh_event_flags(text[]) to service_role;
