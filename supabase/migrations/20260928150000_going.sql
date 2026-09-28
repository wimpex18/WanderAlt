-- Going: a signed-in visitor marks an event they plan to attend. Rows are
-- private (own-row policies); the public sees only a count per event,
-- kept in going_counts by a trigger so no client-callable SECURITY
-- DEFINER function is needed.

create table public.going (
  user_id     uuid default auth.uid() not null,
  pick_id     text not null,
  created_at  timestamptz default now() not null,
  constraint going_pkey primary key (user_id, pick_id),
  constraint going_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);
alter table public.going enable row level security;
create policy going_select_own on public.going for select to authenticated using ((select auth.uid()) = user_id);
create policy going_insert_own on public.going for insert to authenticated with check ((select auth.uid()) = user_id);
create policy going_delete_own on public.going for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, delete on public.going to authenticated;

create table public.going_counts (
  pick_id  text primary key,
  n        integer not null default 0 check (n >= 0)
);
alter table public.going_counts enable row level security;
create policy going_counts_read on public.going_counts for select to anon, authenticated using (true);
grant select on public.going_counts to anon, authenticated;

create or replace function public.going_count_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.going_counts (pick_id, n) values (new.pick_id, 1)
    on conflict (pick_id) do update set n = public.going_counts.n + 1;
  elsif tg_op = 'DELETE' then
    update public.going_counts set n = greatest(n - 1, 0) where pick_id = old.pick_id;
  end if;
  return null;
end $$;
revoke execute on function public.going_count_sync() from anon, authenticated, public;

create trigger going_count_sync after insert or delete on public.going
  for each row execute function public.going_count_sync();
