-- In-app inbox. The alert job (pipeline/digest.ts) writes a short row here for
-- a signed-in reader when an event they saved or marked going is cancelled or
-- postponed, and once a week when something is on at a place, source or search
-- they follow. A reader sees only their own rows, can mark them read and clear
-- them; only the service role writes. One row per (reader, dedupe key), so a
-- change or a week is told once however often the job runs.

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  kind        text not null check (kind in ('change', 'week')),
  title       text not null check (char_length(title) between 1 and 200),
  body        text not null default '' check (char_length(body) <= 600),
  url         text not null check (url like '/%' and url not like '//%' and char_length(url) <= 200),
  dedupe      text not null check (char_length(dedupe) <= 120),
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  constraint notifications_user_dedupe_key unique (user_id, dedupe),
  constraint notifications_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy notifications_update_own on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy notifications_delete_own on public.notifications for delete to authenticated using ((select auth.uid()) = user_id);

-- A reader marks rows read or clears them; nothing else.
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
