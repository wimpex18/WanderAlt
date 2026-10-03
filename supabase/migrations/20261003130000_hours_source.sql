-- Where a place's opening hours came from, and when we last looked for them.
-- Hours were read from OpenStreetMap only until now, so every stored value is 'osm'. The
-- pipeline (pipeline/hours-sources.ts) fills the rest from the venue's own site, its Facebook
-- Page or its Instagram bio and says which in hours_source.
alter table public.places
  add column hours_source text,
  add column hours_checked_at timestamptz,
  add constraint places_hours_source_check check (hours_source is null or hours_source in ('osm', 'site', 'facebook', 'instagram', 'manual'));

comment on column public.places.hours_source is 'osm, site, facebook, instagram or manual: where opening_hours came from.';
comment on column public.places.hours_checked_at is 'When the pipeline last looked for hours for a place that had none.';

update public.places set hours_source = 'osm' where opening_hours is not null and hours_source is null;

-- Appended column keeps the view compatible with existing clients.
create or replace view public.venues with(security_invoker=true) as
select id,city,name,neighborhood,kind,address,lat,lng,image_url,image_attr,image_source,
       website,facebook,instagram,opening_hours,description,osm_id,wikidata_id,
       case when status='active' and verification_state<>'closed' and merged_into is null
              and (picked or (verification_state='verified' and verified_at>=now()-interval '90 days')) then 'active'
         when status='active' then 'unverified' else 'closed' end as status,
       created_at,updated_at,picked,pick_note,hours_source
from public.places;
