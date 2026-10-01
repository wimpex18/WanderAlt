-- Flag a problem: any visitor can tell us a listing is wrong. Insert only;
-- nobody reads the table through the public API, the reviewer reads it with
-- the secret key at /review. A short fixed reason and a 280 character note,
-- so there is nothing to moderate and nothing worth abusing.

create table public.problem_reports (
  id          bigint generated always as identity primary key,
  pick_id     text not null check (char_length(pick_id) between 1 and 80),
  reason      text not null check (reason in ('time', 'venue', 'cancelled', 'duplicate', 'other')),
  note        text check (note is null or char_length(note) <= 280),
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
  status      text not null default 'open' check (status in ('open', 'fixed', 'dismissed')),
  created_at  timestamptz not null default now()
);
create index problem_reports_open_idx on public.problem_reports (created_at) where status = 'open';
alter table public.problem_reports enable row level security;
create policy problem_reports_insert on public.problem_reports for insert to anon, authenticated
  with check (status = 'open' and char_length(coalesce(note, '')) <= 280);
grant insert on public.problem_reports to anon, authenticated;
