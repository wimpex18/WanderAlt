-- Tokens the pipeline refreshes itself (Threads user tokens last 60 days).
-- Service role only: row level security on, no policy, no grants.
create table if not exists public.social_tokens (
  id text primary key,
  token text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.social_tokens enable row level security;
revoke all on public.social_tokens from anon, authenticated, public;
