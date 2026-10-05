-- The interface's other languages for what we write ourselves (pipeline/localize.ts): an event's
-- title and short summary in Estonian and Russian beside the English, written from the original
-- text (the original title kept where it is already in that language), and a picked place's note.
-- The hashes record what each was made from, so a changed listing is done again.
alter table public.events
  add column title_et text,
  add column summary_et text,
  add column title_ru text,
  add column summary_ru text,
  add column local_input_hash text;
alter table public.places
  add column pick_note_et text,
  add column pick_note_ru text,
  add column note_local_hash text;

comment on column public.events.title_et is 'Estonian title (localize.ts): the original title when it is Estonian, else translated from the original.';
comment on column public.events.title_ru is 'Russian title (localize.ts): the original title when it is Russian, else translated from the original.';
comment on column public.places.pick_note_et is 'pick_note in Estonian (localize.ts).';
comment on column public.places.pick_note_ru is 'pick_note in Russian (localize.ts).';

-- Appended columns keep both views compatible with existing clients.
create or replace view public.venues with(security_invoker=true) as
select id,city,name,neighborhood,kind,address,lat,lng,image_url,image_attr,image_source,
       website,facebook,instagram,opening_hours,description,osm_id,wikidata_id,
       case when status='active' and verification_state<>'closed' and merged_into is null
              and (picked or (verification_state='verified' and verified_at>=now()-interval '90 days')) then 'active'
         when status='active' then 'unverified' else 'closed' end as status,
       created_at,updated_at,picked,pick_note,hours_source,image_tone,pick_note_et,pick_note_ru
from public.places;

create or replace view public.picks with(security_invoker=true) as
select e.id, e.city, coalesce(e.title_en, e.title) as title, coalesce(p.name, e.venue_name, '') as venue,
       e.place_id as venue_id, coalesce(p.neighborhood, '') as neighborhood, e.kind,
       to_char(e.starts_at at time zone 'Europe/Tallinn', 'Dy') as day,
       case when e.has_time then to_char(e.starts_at at time zone 'Europe/Tallinn', 'HH24:MI') else null end as "time",
       coalesce(e.summary_en, '') as quote,
       coalesce((select s.handle from event_sources es join sources s on s.id = es.source_id
                 where es.event_id = e.id order by es.first_seen_at limit 1), '') as handle,
       false as tonight, false as this_week, e.image_url, e.image_attr,
       coalesce(e.lat, p.lat) as lat, coalesce(e.lng, p.lng) as lng, coalesce(e.address, p.address) as address,
       e.url as source_url, e.description, e.starts_at, e.ends_at, e.ticket_url, e.is_free, e.price_min, e.price_max, e.currency,
       null::jsonb as links, null::jsonb as entities, e.last_seen_at, e.first_seen_at as created_at, e.archived_at,
       left(e.description, 300) as teaser, e.title as original_title, e.tags, e.flag, e.event_languages,
       e.original_language, e.original_url, coalesce(e.original_excerpt, left(e.description, 2000)) as original_excerpt,
       e.language as title_language, p.image_url as venue_image_url, p.image_attr as venue_image_attr,
       p.image_source as venue_image_source, p.image_tone as venue_image_tone,
       e.title_et, e.summary_et as quote_et, e.title_ru, e.summary_ru as quote_ru
from events e left join places p on p.id = e.place_id;
