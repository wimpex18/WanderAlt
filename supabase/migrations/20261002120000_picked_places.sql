-- A hand-picked place is recommended whether or not the pipeline has a recent
-- sign of life for it. Verification keeps its meaning (a place the pipeline
-- has seen active in the last 90 days) but no longer decides what the guide
-- shows: most record shops, bookshops and galleries never post an event.
alter table public.places
  add column picked boolean not null default false,
  add column pick_note text,
  add constraint places_pick_note_len check (pick_note is null or char_length(pick_note) <= 200);

comment on column public.places.picked is 'Chosen by hand for the guide; shown whether or not verification is fresh.';
comment on column public.places.pick_note is 'One English sentence on why this place is worth the walk (at most 200 characters).';

-- Appended columns keep the view compatible with existing clients.
create or replace view public.venues with(security_invoker=true) as
select id,city,name,neighborhood,kind,address,lat,lng,image_url,image_attr,image_source,
       website,facebook,instagram,opening_hours,description,osm_id,wikidata_id,
       case when status='active' and verification_state<>'closed' and merged_into is null
              and (picked or (verification_state='verified' and verified_at>=now()-interval '90 days')) then 'active'
         when status='active' then 'unverified' else 'closed' end as status,
       created_at,updated_at,picked,pick_note
from public.places;

update public.places set picked=true, pick_note='Records, coffee and cocktails, with a jazz jam on the stage.'
  where id='tallinn-terminal';
update public.places set picked=true, pick_note='Record shop on Olevimägi, a short walk from Raamatukoi and Kino Sõprus.'
  where id='tallinn-tallinn-old-town-records';
