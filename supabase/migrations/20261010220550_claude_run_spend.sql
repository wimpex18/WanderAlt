-- Claude Haiku 5.5 is the pipeline's one model lane: each run records the dollars it spent on it, and a
-- run's cap is lowered to what is left of the day's (pipeline/run.ts, CLAUDE_DAILY_USD). The neurons
-- column keeps the Workers AI history; nothing writes it any more.
alter table public.pipeline_runs add column if not exists claude_usd real not null default 0;
