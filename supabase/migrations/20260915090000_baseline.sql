-- WanderAlt schema baseline. Replaces the earlier migration journal; built
-- from the live catalog of project aqnsmmbrspkbfcvougeh on 2026-09-15.
-- Assumes a Supabase project (auth.users, the anon/authenticated roles and
-- their default table grants already exist).

-- ── Roles ────────────────────────────────────────────────────
alter role anon          set statement_timeout = '3s';
alter role anon          set search_path = public, extensions;
alter role authenticated set statement_timeout = '8s';
alter role authenticated set search_path = public, extensions;

-- ── Catalogue: read-only to the public ──────────────────────
create table public.venues (
  id             text not null,
  city           text default 'tallinn' not null,
  name           text not null,
  neighborhood   text,
  kind           text,
  lat            double precision,
  lng            double precision,
  image_url      text,
  image_attr     text,
  image_source   text,
  website        text,
  facebook       text,
  instagram      text,
  opening_hours  text,
  status         text default 'active' not null,
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null,
  constraint venues_pkey primary key (id)
);
create index venues_city_idx on public.venues (city);

create table public.venue_details (
  id               uuid default gen_random_uuid() not null,
  city             text not null,
  venue_key        text not null,
  display_name     text,
  website          text,
  address          text,
  lat              double precision,
  lng              double precision,
  short_desc       text,
  wikidata_id      text,
  opening_hours    text,
  is_closed        boolean default false not null,
  business_status  text,
  phone            text,
  facebook         text,
  instagram        text,
  constraint venue_details_pkey primary key (id),
  constraint venue_details_city_venue_key_key unique (city, venue_key)
);
create index venue_details_city_key on public.venue_details (city, venue_key);

create table public.picks (
  id             text not null,
  city           text default 'tallinn' not null,
  title          text not null,
  venue          text not null,
  neighborhood   text not null,
  kind           text not null,
  day            text,
  "time"         text,
  quote          text not null,
  handle         text not null,
  tonight        boolean default false not null,
  this_week      boolean default false not null,
  sort_order     smallint default 0 not null,
  created_at     timestamptz default now() not null,
  venue_id       text,
  valid_until    timestamptz,
  archived_at    timestamptz,
  image_url      text,
  image_attr     text,
  image_source   text,
  lat            double precision,
  lng            double precision,
  address        text,
  coords_source  text,
  coords_locked  boolean default false not null,
  last_seen_at   timestamptz default now(),
  source_url     text,
  description    text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  ticket_url     text,
  is_free        boolean,
  price_min      numeric(10,2),
  price_max      numeric(10,2),
  currency       text,
  links          jsonb,
  entities       jsonb,
  constraint picks_pkey primary key (id),
  constraint picks_venue_id_fkey foreign key (venue_id) references public.venues (id) on delete set null
);
create index picks_city_idx        on public.picks (city);
create index picks_venue_idx       on public.picks (venue_id);
create index picks_tonight_idx     on public.picks (city, tonight)   where tonight = true;
create index picks_this_week_idx   on public.picks (city, this_week) where this_week = true;
create index picks_starts_at_idx   on public.picks (starts_at)       where archived_at is null;
create index picks_valid_until_idx on public.picks (valid_until)     where archived_at is null;

alter table public.venues        enable row level security;
alter table public.venue_details enable row level security;
alter table public.picks         enable row level security;

create policy venues_read                 on public.venues        for select using (true);
create policy "public read venue_details" on public.venue_details for select using (true);
create policy public_read                 on public.picks         for select using (true);

-- Image URLs: prefer the Wikimedia CDN host, refuse stock libraries.
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
      new.image_source := null;
    end if;
  end if;
  return new;
end;
$function$;

create trigger wa_normalise_image_url before insert or update of image_url on public.picks
  for each row execute function public.wa_normalise_image_url();
create trigger wa_normalise_image_url before insert or update of image_url on public.venues
  for each row execute function public.wa_normalise_image_url();

-- ── Saves: each row belongs to its user ─────────────────────
create table public.bookmarks (
  user_id     uuid default auth.uid() not null,
  pick_id     text not null,
  city        text default 'tallinn' not null,
  created_at  timestamptz default now() not null,
  constraint bookmarks_pkey primary key (user_id, pick_id),
  constraint bookmarks_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

create table public.saved_lists (
  user_id     uuid not null,
  id          text not null,
  name        text not null,
  city        text not null,
  created_at  timestamptz default now() not null,
  constraint saved_lists_pkey primary key (user_id, id),
  constraint saved_lists_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

create table public.saved_list_items (
  user_id     uuid not null,
  list_id     text not null,
  pick_id     text not null,
  created_at  timestamptz default now() not null,
  constraint saved_list_items_pkey primary key (user_id, list_id, pick_id),
  constraint saved_list_items_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);
create index saved_list_items_list_idx on public.saved_list_items (user_id, list_id);

alter table public.bookmarks        enable row level security;
alter table public.saved_lists      enable row level security;
alter table public.saved_list_items enable row level security;

-- (select auth.uid()) is evaluated once per statement, not per row.
create policy select_own_bookmarks        on public.bookmarks        for select using ((select auth.uid()) = user_id);
create policy insert_own_bookmarks        on public.bookmarks        for insert with check ((select auth.uid()) = user_id);
create policy delete_own_bookmarks        on public.bookmarks        for delete using ((select auth.uid()) = user_id);
create policy select_own_saved_lists      on public.saved_lists      for select using ((select auth.uid()) = user_id);
create policy insert_own_saved_lists      on public.saved_lists      for insert with check ((select auth.uid()) = user_id);
create policy delete_own_saved_lists      on public.saved_lists      for delete using ((select auth.uid()) = user_id);
create policy select_own_saved_list_items on public.saved_list_items for select using ((select auth.uid()) = user_id);
create policy insert_own_saved_list_items on public.saved_list_items for insert with check ((select auth.uid()) = user_id);
create policy delete_own_saved_list_items on public.saved_list_items for delete using ((select auth.uid()) = user_id);
