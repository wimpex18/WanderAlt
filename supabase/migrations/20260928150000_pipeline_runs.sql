-- One row per pipeline run: what it spent and what it wrote. The daily
-- Workers AI budget is read from here (the free allocation is per day and
-- per Cloudflare account), and it doubles as a run history. Service role
-- only.
create table public.pipeline_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  neurons      real not null default 0,
  model_calls  integer not null default 0,
  events_new   integer not null default 0,
  events_seen  integer not null default 0,
  ok           boolean
);
create index pipeline_runs_started_idx on public.pipeline_runs (started_at);
alter table public.pipeline_runs enable row level security;
revoke all on public.pipeline_runs from anon, authenticated;
