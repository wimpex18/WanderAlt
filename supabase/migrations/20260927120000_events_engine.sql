-- The events engine: sources → raw items → events and places, with
-- provenance. Replaces the hand-entered catalogue (picks, venues,
-- venue_details), which held no rows. The site keeps reading `picks` and
-- `venues`, now read-only views over the new tables.

drop table if exists public.picks cascade;
drop table if exists public.venues cascade;
drop table if exists public.venue_details cascade;

-- ── Sources: where listings come from ──────────────────────
-- Written only by the pipeline (service role). The public may read the
-- columns a provenance line needs, nothing about health or config.
create table public.sources (
  id                   text primary key,               -- 'fienta-tallinn', 'tg-sigmundtells'
  city                 text not null default 'tallinn',
  kind                 text not null check (kind in ('fienta', 'jsonld', 'telegram', 'rss', 'html')),
  url                  text not null,
  handle               text not null,                  -- '@sigmundtells', shown as "via @sigmundtells"
  label                text not null,
  curated              boolean not null default false, -- true: everything it lists belongs here
  active               boolean not null default true,
  config               jsonb not null default '{}'::jsonb,
  last_run_at          timestamptz,
  last_ok_at           timestamptz,
  last_yield           integer,
  consecutive_failures integer not null default 0,
  last_error           text,
  created_at           timestamptz not null default now()
);

-- ── Raw items: exactly what a source said, once ────────────
create table public.raw_items (
  id           bigint generated always as identity primary key,
  source_id    text not null references public.sources (id) on delete cascade,
  external_id  text not null,                          -- the source's own id or URL
  url          text,
  content_hash text not null,
  payload      jsonb not null,
  fetched_at   timestamptz not null default now(),
  status       text not null default 'new' check (status in ('new', 'done', 'skipped', 'error')),
  note         text,                                   -- why it was skipped, or the error
  attempts     smallint not null default 0,
  unique (source_id, external_id)
);
create index raw_items_pending_idx on public.raw_items (fetched_at) where status = 'new';

-- ── Places ─────────────────────────────────────────────────
create table public.places (
  id             text primary key,                     -- 'tallinn-kino-soprus'
  city           text not null default 'tallinn',
  name           text not null,
  aliases        text[] not null default '{}',         -- lowercased names sources use for it
  kind           text,
  neighborhood   text,
  address        text,
  lat            double precision,
  lng            double precision,
  osm_id         text,                                 -- 'node/123', the identity photos and hours hang off
  wikidata_id    text,
  website        text,
  instagram      text,
  opening_hours  text,                                 -- OSM syntax
  image_url      text,
  image_attr     text,
  image_source   text,
  status         text not null default 'active' check (status in ('active', 'closed', 'hidden')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index places_city_idx on public.places (city);
create index places_aliases_idx on public.places using gin (aliases);

-- ── Events ─────────────────────────────────────────────────
-- One row per dated occurrence. `series_key` groups repeats of one show.
create table public.events (
  id            text primary key,                      -- stable hash of source + external id
  city          text not null default 'tallinn',
  title         text not null,                         -- as the source wrote it
  title_en      text,                                  -- English, when the source was not
  summary_en    text,                                  -- one sentence, from the source's own text
  description   text,                                  -- the source's text, plain
  kind          text not null default 'other'
                check (kind in ('gig', 'club', 'film', 'exhibition', 'talk', 'theatre', 'market', 'workshop', 'festival', 'other')),
  tags          text[] not null default '{}',
  place_id      text references public.places (id) on delete set null,
  venue_name    text,                                  -- as the source wrote it
  address       text,
  lat           double precision,
  lng           double precision,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  has_time      boolean not null default true,         -- false: the source gave a date only
  is_free       boolean,
  price_min     numeric(10,2),
  price_max     numeric(10,2),
  currency      text,
  ticket_url    text,
  url           text,                                  -- the listing's own page
  image_url     text,
  image_attr    text,
  language      text,                                  -- of the source text: et, en, ru, fi
  series_key    text,
  relevance     real,                                  -- 0..1: how well it fits "alternative culture"
  status        text not null default 'review' check (status in ('published', 'review', 'rejected')),
  status_note   text,
  engine        text,                                  -- which extractor or model produced it
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  archived_at   timestamptz
);
create index events_city_start_idx on public.events (city, starts_at) where status = 'published' and archived_at is null;
create index events_place_idx on public.events (place_id);
create index events_review_idx on public.events (first_seen_at) where status = 'review';

-- ── Provenance: every source that listed an event ──────────
create table public.event_sources (
  event_id    text not null references public.events (id) on delete cascade,
  source_id   text not null references public.sources (id) on delete cascade,
  raw_item_id bigint references public.raw_items (id) on delete set null,
  url         text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (event_id, source_id)
);

-- ── Image URLs: prefer the Wikimedia CDN host, refuse stock libraries ──
create or replace function public.wa_normalise_image_url()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.image_url is not null then
    new.image_url := replace(new.image_url, '://thumb.wikimedia.org/', '://upload.wikimedia.org/');
    if new.image_url ~* '(unsplash|pexels|pixabay|shutterstock|istockphoto|gettyimages|depositphotos|dreamstime)' then
      new.image_url := null;
      new.image_attr := null;
    end if;
  end if;
  return new;
end;
$function$;
revoke execute on function public.wa_normalise_image_url() from anon, authenticated, public;

create trigger wa_normalise_image_url before insert or update of image_url on public.events
  for each row execute function public.wa_normalise_image_url();
create trigger wa_normalise_image_url before insert or update of image_url on public.places
  for each row execute function public.wa_normalise_image_url();

-- ── Access ─────────────────────────────────────────────────
alter table public.sources       enable row level security;
alter table public.raw_items     enable row level security;
alter table public.places        enable row level security;
alter table public.events        enable row level security;
alter table public.event_sources enable row level security;

-- raw_items: no policy, so only the service role reads or writes it.
revoke all on public.raw_items from anon, authenticated;

revoke all on public.sources from anon, authenticated;
grant select (id, city, kind, url, handle, label) on public.sources to anon, authenticated;
create policy sources_read on public.sources for select using (active);

create policy places_read on public.places for select using (status <> 'hidden');
create policy events_read on public.events for select using (status = 'published');
create policy event_sources_read on public.event_sources for select using (true);

-- ── The site's current read surface ────────────────────────
-- Shaped like the old tables so pages, the OG middleware, og-image and
-- calendar-feed keep working until the front end is rebuilt. Invoker
-- rights, so the policies above apply.
create view public.picks with (security_invoker = true) as
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
  e.archived_at
from public.events e
left join public.places p on p.id = e.place_id;

create view public.venues with (security_invoker = true) as
select id, city, name, neighborhood, kind, lat, lng, image_url, image_attr, image_source,
       website, null::text as facebook, instagram, opening_hours,
       case when status = 'active' then 'active' else 'closed' end as status,
       created_at, updated_at
from public.places;

grant select on public.picks, public.venues to anon, authenticated;
