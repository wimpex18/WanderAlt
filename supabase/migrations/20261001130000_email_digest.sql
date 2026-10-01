-- Email alerts. A signed-in reader's follows sync here (own rows only) and two
-- switches, both off until they turn them on: a weekly digest of what is new at
-- the venues and sources they follow, and a note when an event they saved or
-- marked going is cancelled or postponed. The sender is pipeline/digest.ts on
-- GitHub Actions with the service-role key; nothing here is callable by the
-- public, and no SECURITY DEFINER function is added.

create table public.follows (
  user_id     uuid default auth.uid() not null,
  follow_id   text not null check (char_length(follow_id) between 3 and 120),
  label       text check (label is null or char_length(label) <= 80),
  city        text not null default 'tallinn',
  created_at  timestamptz not null default now(),
  constraint follows_pkey primary key (user_id, follow_id),
  constraint follows_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);
alter table public.follows enable row level security;
create policy follows_select_own on public.follows for select to authenticated using ((select auth.uid()) = user_id);
create policy follows_insert_own on public.follows for insert to authenticated with check ((select auth.uid()) = user_id);
create policy follows_delete_own on public.follows for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, delete on public.follows to authenticated;

create table public.digest_prefs (
  user_id            uuid default auth.uid() primary key,
  weekly             boolean not null default false,
  changes            boolean not null default false,
  unsubscribe_token  uuid not null default gen_random_uuid() unique,
  last_weekly_at     timestamptz,
  updated_at         timestamptz not null default now(),
  constraint digest_prefs_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);
alter table public.digest_prefs enable row level security;
create policy digest_prefs_select_own on public.digest_prefs for select to authenticated using ((select auth.uid()) = user_id);
create policy digest_prefs_insert_own on public.digest_prefs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy digest_prefs_update_own on public.digest_prefs for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- A reader sets the two switches and nothing else; the token and the send
-- clock belong to the sender.
revoke all on public.digest_prefs from anon, authenticated;
grant select on public.digest_prefs to authenticated;
grant insert (weekly, changes) on public.digest_prefs to authenticated;
grant update (weekly, changes, updated_at) on public.digest_prefs to authenticated;

-- One row per change already told to a reader, so a flag is mentioned once.
-- No policies and no grants: only the service role reads or writes it.
create table public.change_notices (
  user_id  uuid not null,
  pick_id  text not null,
  flag     text not null check (flag in ('cancelled', 'postponed')),
  sent_at  timestamptz not null default now(),
  constraint change_notices_pkey primary key (user_id, pick_id, flag),
  constraint change_notices_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);
alter table public.change_notices enable row level security;
revoke all on public.change_notices from anon, authenticated;
