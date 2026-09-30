-- A source kind for the Instagram accounts of venues we already know.
alter table public.sources drop constraint if exists sources_kind_check;
alter table public.sources add constraint sources_kind_check
  check (kind in ('fienta', 'jsonld', 'wordpress', 'telegram', 'rss', 'html', 'osm', 'instagram'));
