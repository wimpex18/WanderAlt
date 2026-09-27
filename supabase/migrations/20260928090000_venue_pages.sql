-- Venue pages: links, a description and enrichment state on places; two
-- new source kinds (a WordPress events API, and the OpenStreetMap venue
-- catalogue). The venues view gains the new columns for the site.

alter table public.sources drop constraint if exists sources_kind_check;
alter table public.sources add constraint sources_kind_check
  check (kind in ('fienta', 'jsonld', 'wordpress', 'telegram', 'rss', 'html', 'osm'));

alter table public.places add column if not exists facebook    text;
alter table public.places add column if not exists description text;
alter table public.places add column if not exists enriched_at timestamptz;

drop view if exists public.venues;
create view public.venues with (security_invoker = true) as
select id, city, name, neighborhood, kind, address, lat, lng, image_url, image_attr, image_source,
       website, facebook, instagram, opening_hours, description, osm_id, wikidata_id,
       case when status = 'active' then 'active' else 'closed' end as status,
       created_at, updated_at
from public.places;
grant select on public.venues to anon, authenticated;
