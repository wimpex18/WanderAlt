-- Web push. A signed-in reader who allows notifications on a device stores that
-- device's push subscription (own rows only); two more switches on digest_prefs,
-- both off until turned on: push (change notes also arrive as a notification on
-- their devices) and tonight (one notification at 16:00 when something at a place,
-- source or saved search they follow starts today). pipeline/digest.ts sends with
-- the service-role key. No SECURITY DEFINER function is added.

create table public.push_subscriptions (
  user_id     uuid default auth.uid() not null,
  endpoint    text not null check (endpoint like 'https://%' and char_length(endpoint) <= 800),
  p256dh      text not null check (char_length(p256dh) between 80 and 100),
  auth        text not null check (char_length(auth) between 20 and 30),
  created_at  timestamptz not null default now(),
  constraint push_subscriptions_pkey primary key (user_id, endpoint),
  constraint push_subscriptions_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, delete on public.push_subscriptions to authenticated;

alter table public.digest_prefs
  add column push boolean not null default false,
  add column tonight boolean not null default false,
  add column last_tonight_on date;
grant insert (push, tonight) on public.digest_prefs to authenticated;
grant update (push, tonight) on public.digest_prefs to authenticated;
