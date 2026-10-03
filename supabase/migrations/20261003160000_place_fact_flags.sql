-- Differences between what a venue says about itself (its Instagram bio: a new address, new hours,
-- "we have moved") and what we hold, found by pipeline/drift.ts about once a month per place.
-- A person reviews them; the pipeline never changes the stored fact. The same finding is not
-- written twice, so a dismissed one stays dismissed. Service role only.
alter table public.places add column facts_checked_at timestamptz;
comment on column public.places.facts_checked_at is 'When the pipeline last compared the venue''s Instagram bio with the stored facts.';

create table public.place_fact_flags (
  id bigint generated always as identity primary key,
  place_id text not null references public.places(id) on delete cascade,
  field text not null check (field in ('address', 'hours', 'closure')),
  stored text,
  found text not null,
  source text not null default 'instagram',
  state text not null default 'open' check (state in ('open', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (place_id, field, found)
);
alter table public.place_fact_flags enable row level security;
revoke all on public.place_fact_flags from anon, authenticated;
grant all on public.place_fact_flags to service_role;
