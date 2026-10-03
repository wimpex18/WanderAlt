-- Evenings composed by the pipeline: two to four stops on foot around one
-- listing, with a plain title and one sentence on why they go together. The
-- pipeline writes them with the service role every run; the site only reads.
-- A route is its stops (ids and minutes); names, hours and walks are worked
-- out in the page from the same catalogue, so a stale route is dropped there.
create table public.routes (
  id          text primary key check (char_length(id) between 3 and 120),
  city        text not null,
  day         date not null,
  area        text,
  title       text not null check (char_length(title) between 3 and 80),
  blurb       text check (blurb is null or char_length(blurb) <= 200),
  stops       jsonb not null check (jsonb_typeof(stops) = 'array' and jsonb_array_length(stops) between 2 and 5),
  score       real not null default 0,
  engine      text not null,
  created_at  timestamptz not null default now()
);
create index routes_city_day on public.routes (city, day, score desc);
alter table public.routes enable row level security;
create policy routes_read on public.routes for select to anon, authenticated using (true);
revoke all on public.routes from anon, authenticated;
grant select on public.routes to anon, authenticated;
