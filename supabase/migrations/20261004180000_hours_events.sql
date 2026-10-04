-- A venue whose own site says it opens only for its events ("on concert evenings") has no weekly
-- hours to file; hours_source 'events' records that it said so, and pages read "Open for events".
alter table public.places drop constraint places_hours_source_check;
alter table public.places
  add constraint places_hours_source_check check (hours_source is null or hours_source in ('osm', 'site', 'facebook', 'instagram', 'manual', 'events'));
comment on column public.places.hours_source is 'osm, site, facebook, instagram or manual: where opening_hours came from; events: the venue says it opens only for its events, with no hours.';
