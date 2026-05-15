-- user_match_history: per-user pick feedback (likes/dislikes) + seen log.
-- Synced from localStorage by taste.js when a session is present.

create table if not exists public.user_match_history (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  pick_id    text        not null,
  vote       text        check (vote in ('like', 'dislike')),
  seen_at    timestamptz not null default now(),
  constraint user_match_history_user_pick unique (user_id, pick_id)
);

alter table public.user_match_history enable row level security;

-- Users can only see and mutate their own rows.
create policy "user_match_history_select"
  on public.user_match_history for select
  using (user_id = auth.uid());

create policy "user_match_history_insert"
  on public.user_match_history for insert
  with check (user_id = auth.uid());

create policy "user_match_history_update"
  on public.user_match_history for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_match_history_delete"
  on public.user_match_history for delete
  using (user_id = auth.uid());

-- Index for fast per-user lookups ordered by recency.
create index if not exists idx_umh_user_seen
  on public.user_match_history (user_id, seen_at desc);
