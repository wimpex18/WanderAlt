-- English editing is independent of classification; originals remain auditable.
alter table public.events
  add column english_input_hash text,
  add column original_excerpt text check (length(original_excerpt) <= 2000),
  add column original_language text check (original_language ~ '^[a-z]{2}$'),
  add column original_url text check (original_url ~ '^https?://'),
  add column event_languages text[] not null default '{}'
    check (event_languages <@ array['en','et','ru','uk','fi','sv','de','fr','es','it','lv','lt','pl','ja','zh']::text[]);

create or replace view public.picks with (security_invoker = true) as
select
  e.id,
  e.city,
  coalesce(e.title_en, e.title)                                        as title,
  coalesce(p.name, e.venue_name, '')                                   as venue,
  e.place_id                                                           as venue_id,
  coalesce(p.neighborhood, '')                                         as neighborhood,
  e.kind,
  to_char(e.starts_at at time zone 'Europe/Tallinn', 'Dy')             as day,
  case when e.has_time
       then to_char(e.starts_at at time zone 'Europe/Tallinn', 'HH24:MI') end as "time",
  coalesce(e.summary_en, '')                                           as quote,
  coalesce((select s.handle from public.event_sources es
              join public.sources s on s.id = es.source_id
             where es.event_id = e.id
             order by es.first_seen_at limit 1), '')                   as handle,
  false                                                                as tonight,
  false                                                                as this_week,
  e.image_url,
  e.image_attr,
  coalesce(e.lat, p.lat)                                               as lat,
  coalesce(e.lng, p.lng)                                               as lng,
  coalesce(e.address, p.address)                                       as address,
  e.url                                                                as source_url,
  e.description,
  e.starts_at,
  e.ends_at,
  e.ticket_url,
  e.is_free,
  e.price_min,
  e.price_max,
  e.currency,
  null::jsonb                                                          as links,
  null::jsonb                                                          as entities,
  e.last_seen_at,
  e.first_seen_at                                                      as created_at,
  e.archived_at,
  left(e.description, 300)                                             as teaser,
  e.title                                                              as original_title,
  e.tags,
  e.flag,
  e.event_languages,
  e.original_language,
  e.original_url,
  coalesce(e.original_excerpt, left(e.description, 2000)) as original_excerpt
from public.events e
left join public.places p on p.id = e.place_id;
