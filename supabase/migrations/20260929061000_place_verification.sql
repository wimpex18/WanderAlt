-- Map presence and undated hours cannot verify a business is operating.
alter table public.places
  add column verification_state text not null default 'unverified' check (verification_state in ('unverified','verified','review','closed')),
  add column verification_checked_at timestamptz,
  add column website_checked_at timestamptz,
  add column verified_at timestamptz,
  add column verification_source text check (verification_source in ('manual','event','website','osm')),
  add column verification_url text,
  add column verification_note text;
create index places_verification_due_idx on public.places(verification_checked_at,id) where merged_into is null and status='active';
update public.places set verification_state='closed',verification_source=case when osm_closed_by_check then 'osm' else 'manual' end
  where status='closed';

create function public.record_place_verification(p_id text,p_state text,p_source text,p_url text,p_note text,p_observed_at timestamptz default now())
returns void language plpgsql security invoker set search_path='' as $$
declare p public.places; after_check jsonb; keep_verified boolean;
begin
  select * into strict p from public.places where id=p_id for update;
  if p.merged_into is not null then raise exception 'Verify the canonical venue'; end if;
  if p_state is null or p_source is null or p_state not in ('unverified','verified','review','closed') or p_source not in ('manual','event','website') then raise exception 'Invalid verification'; end if;
  if nullif(btrim(p_note),'') is null then raise exception 'Verification needs evidence'; end if;
  if p_url is not null and p_url !~ '^https?://' then raise exception 'Evidence URL must be HTTP(S)'; end if;
  if p_observed_at is null or p_observed_at>now()+interval '1 minute' then raise exception 'Invalid observation time'; end if;
  if p_state='closed' and p_source<>'manual' then raise exception 'Confirm permanent closure manually'; end if;
  -- Only an explicit admin decision can reopen a retained closed row.
  if p_source<>'manual' and p.status in ('closed','hidden') then return; end if;
  if p_source<>'manual' and p.verification_source='manual' and (p.verification_state='review'
    or (p.verification_state='verified' and p.verified_at>=now()-interval '90 days')) then return; end if;
  -- An undated homepage does not erase stronger recent activity evidence.
  keep_verified:=p_state='unverified' and p.verification_state='verified' and p.verified_at>=now()-interval '90 days';
  update public.places set
    status=case when p.status='hidden' then 'hidden' when p_state='closed' then 'closed'
      when p_source='manual' and p_state='verified' then 'active' else p.status end,
    verification_state=case when keep_verified then p.verification_state else p_state end,verification_checked_at=now(),
    website_checked_at=case when p_source='website' then now() else p.website_checked_at end,
    verified_at=case when p_state='verified' then p_observed_at else p.verified_at end,
    verification_source=case when keep_verified then p.verification_source else p_source end,
    verification_url=case when keep_verified then p.verification_url else p_url end,
    verification_note=case when keep_verified then p.verification_note else left(p_note,500) end,
    osm_closed_by_check=case when p_source='manual' and p_state in ('closed','verified') then false else p.osm_closed_by_check end,
    osm_auto_close=case when p_source='manual' and p_state='closed' then false else p.osm_auto_close end,
    updated_at=now()
  where id=p.id returning to_jsonb(places.*) into after_check;
  insert into public.place_liveness_log(place_id,before_check,after_check)
    values(p.id,to_jsonb(p),after_check || jsonb_build_object('_check_kind','operating','_observed_state',p_state,'_observed_note',left(p_note,500)));
end;
$$;
revoke execute on function public.record_place_verification(text,text,text,text,text,timestamptz) from anon,authenticated,public;
grant execute on function public.record_place_verification(text,text,text,text,text,timestamptz) to service_role;

-- Only exact items actually seen again can refresh old provenance. An
-- unchanged source does not cost another extraction/classification call.
create function public.refresh_source_seen(p_source text,p_external_ids text[])
returns integer language plpgsql security invoker set search_path='' as $$
declare total integer;
begin
  update public.event_sources es set last_seen_at=now()
  from public.raw_items r where es.raw_item_id=r.id and es.source_id=p_source
    and r.source_id=p_source and r.external_id=any(p_external_ids) and r.status='done';
  get diagnostics total=row_count;
  return total;
end;
$$;
revoke execute on function public.refresh_source_seen(text,text[]) from anon,authenticated,public;
grant execute on function public.refresh_source_seen(text,text[]) to service_role;

create function public.verify_event_places(p_city text)
returns integer language plpgsql security invoker set search_path='' as $$
declare evidence record; total integer:=0;
begin
  for evidence in
    select distinct on(p.id) p.id,es.url,es.last_seen_at
    from public.places p join public.events e on e.place_id=p.id
      join public.event_sources es on es.event_id=e.id join public.sources s on s.id=es.source_id
    where p.city=p_city and p.status='active' and p.merged_into is null
      and e.status='published' and e.merged_into is null and e.archived_at is null
      and e.flag is distinct from 'cancelled' and e.flag is distinct from 'postponed'
      and e.starts_at between now()-interval '30 days' and now()+interval '90 days'
      and es.last_seen_at>=now()-interval '7 days' and s.active
      and (s.curated or (s.kind='fienta' and e.status_note like 'trusted source%'))
      and not coalesce(p.verification_source='manual' and p.verification_state='verified' and p.verified_at>=now()-interval '90 days',false)
      and not coalesce(p.verification_source='manual' and p.verification_state='review',false)
      and not coalesce(p.verification_source='website' and p.verification_state='review' and p.verification_checked_at>=es.last_seen_at,false)
      and (p.verification_state<>'verified' or p.verified_at is null or p.verified_at<es.last_seen_at)
    order by p.id,es.last_seen_at desc,e.id
  loop
    perform public.record_place_verification(evidence.id,'verified','event',evidence.url,'Recently observed dated listing from a trusted event source at this venue.',evidence.last_seen_at);
    total:=total+1;
  end loop;
  return total;
end;
$$;
revoke execute on function public.verify_event_places(text) from anon,authenticated,public;
grant execute on function public.verify_event_places(text) to service_role;

create or replace function public.check_place_liveness(p_id text,p_patch jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare p public.places; after_check jsonb;
begin
  select * into strict p from public.places where id=p_id for update;
  if p.merged_into is not null then raise exception 'Check the canonical venue'; end if;
  if coalesce(p_patch->>'osm_state','') not in ('present','closed','missing','review') then raise exception 'Invalid OSM state'; end if;
  update public.places set
    osm_checked_at=(p_patch->>'osm_checked_at')::timestamptz,
    osm_last_seen_at=coalesce((p_patch->>'osm_last_seen_at')::timestamptz,p.osm_last_seen_at),
    osm_missing_count=coalesce((p_patch->>'osm_missing_count')::integer,p.osm_missing_count),
    osm_state=p_patch->>'osm_state',osm_note=p_patch->>'osm_note',
    status=case when p_patch->>'osm_state'='closed' and p.status='active' and p.osm_auto_close then 'closed' else p.status end,
    verification_state=case when p_patch->>'osm_state'='closed' and p.status='active' and p.osm_auto_close then 'closed' else p.verification_state end,
    osm_closed_by_check=case when p_patch->>'osm_state'='closed' and p.status='active' and p.osm_auto_close then true else p.osm_closed_by_check end,
    updated_at=now()
  where id=p.id returning to_jsonb(places.*) into after_check;
  insert into public.place_liveness_log(place_id,before_check,after_check) values(p.id,to_jsonb(p),after_check);
end;
$$;
revoke execute on function public.check_place_liveness(text,jsonb) from anon,authenticated,public;
grant execute on function public.check_place_liveness(text,jsonb) to service_role;

-- A merge cannot discard an existing closure through an active target.
create function public.guard_closed_place_merge()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.status='closed' and old.merged_into is null and new.merged_into is not null
    and exists(select 1 from public.places where id=new.merged_into and status<>'closed') then
    raise exception 'Review closure before merging into an active venue';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_closed_place_merge() from anon,authenticated,public;
grant execute on function public.guard_closed_place_merge() to service_role;
create trigger guard_closed_place_merge before update of merged_into on public.places for each row execute function public.guard_closed_place_merge();

-- Compatibility clients already select status=active. Preserve retained
-- detail records while recommending only freshly verified businesses.
create or replace view public.venues with(security_invoker=true) as
select id,city,name,neighborhood,kind,address,lat,lng,image_url,image_attr,image_source,
       website,facebook,instagram,opening_hours,description,osm_id,wikidata_id,
       case when status='active' and verification_state='verified' and verified_at>=now()-interval '90 days' then 'active'
         when status='active' then 'unverified' else 'closed' end as status,
       created_at,updated_at
from public.places;

create view public.place_verification_reviews with(security_invoker=true) as
select id,city,name,kind,website,verification_state,verification_checked_at,verified_at,
       verification_source,verification_url,verification_note,osm_state,osm_note
from public.places where merged_into is null and status='active'
  and (verification_state<>'verified' or verified_at is null or verified_at<now()-interval '90 days');
revoke all on public.place_verification_reviews from anon,authenticated,public;
grant select on public.place_verification_reviews to service_role;

drop policy events_read on public.events;
create policy events_read on public.events for select using(status='published' and merged_into is null
  and not exists(select 1 from public.places p where p.id=events.place_id and p.status='closed'));
