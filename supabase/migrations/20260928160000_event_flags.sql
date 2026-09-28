-- What a source says about an event's state: cancelled, postponed, sold
-- out, or few tickets left. Null means nothing is wrong. The pipeline
-- sets it every time it reads the event, so it clears when the source does.
alter table public.events add column flag text
  check (flag in ('cancelled', 'postponed', 'sold_out', 'few_left'));

-- Descriptions stored before the pipeline scrubbed contact details.
update public.events
   set description = nullif(btrim(regexp_replace(regexp_replace(description,
         '\s*\(mailto:[^)]*\)', '', 'gi'), '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}', '', 'gi')), '')
 where description ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}';

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
  e.flag
from public.events e
left join public.places p on p.id = e.place_id;
