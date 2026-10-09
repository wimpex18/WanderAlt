-- Questions about places that the pipeline answers from evidence (pipeline/place-checks.ts):
-- where a place without coordinates is ('locate'), and whether two places are one ('pair').
-- One row a question: its state, the answer, the evidence it rests on, and when to ask again.
-- Written by the scheduled run with the service role; nobody else reads or writes it.

create table public.place_checks (
  question text not null check (question in ('locate', 'pair')),
  -- A place id, or "a|b" (sorted) for a pair.
  subject text not null,
  city text not null,
  state text not null default 'open' check (state in ('open', 'answered', 'stuck')),
  answer text check (answer in ('located', 'merged', 'separate')),
  note text,
  evidence jsonb not null default '[]',
  tries integer not null default 0 check (tries >= 0),
  checked_at timestamptz,
  next_at timestamptz not null default now(),
  primary key (question, subject),
  check ((state = 'answered') = (answer is not null))
);
create index place_checks_due on public.place_checks (city, next_at) where state <> 'answered';

alter table public.place_checks enable row level security;
revoke all on public.place_checks from anon, authenticated, public;
grant all on public.place_checks to service_role;
