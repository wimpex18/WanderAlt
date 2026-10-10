-- Held listings are settled by the pipeline (pipeline/review-decider.ts), not by a person. Every automatic
-- decision is a row here: what held the listing, what was decided and why, the listing's own words it rests
-- on (checked to be there), and the status before, so any decision can be reversed. Nothing is deleted.
-- A person's decision in review.html (a status note starting "manual") always wins; apply_review_decision
-- refuses to touch such a row. Written by the scheduled run with the service role; read by review.html
-- with the secret key. Nobody else reads or writes it.

create table public.review_decisions (
  id bigint generated always as identity primary key,
  event_id text not null references public.events(id) on delete cascade,
  decided_at timestamptz not null default now(),
  -- 'waits': no answer could be checked this run; the listing stays as it was.
  outcome text not null check (outcome in ('published', 'rejected', 'waits')),
  reason text not null,
  why text,
  -- The listing's own words the decision rests on, and where they were found.
  quote text,
  quote_in text check (quote_in in ('title', 'venue', 'address', 'text', 'page', 'caption', 'rule', 'source')),
  held_by text,
  before_status text not null check (before_status in ('published', 'review', 'rejected')),
  before_note text,
  evidence jsonb not null default '{}',
  engine text,
  check (outcome = 'waits' or quote is not null)
);
create index review_decisions_event on public.review_decisions (event_id, decided_at desc);
create index review_decisions_recent on public.review_decisions (decided_at desc);

alter table public.review_decisions enable row level security;
revoke all on public.review_decisions from anon, authenticated, public;
grant all on public.review_decisions to service_role;

-- One decision, applied and recorded together. The row changes only while it still has the status and note
-- the decision was made from, and never when a person has decided it: a review.html decision made meanwhile
-- wins. Returns the decision's id, or null when nothing was changed or recorded.
create or replace function public.apply_review_decision(
  p_event text, p_before_status text, p_before_note text, p_status text, p_note text, p_decision jsonb
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_status not in ('published', 'review', 'rejected') then raise exception 'Invalid status %', p_status; end if;
  update public.events e
     set status = p_status, status_note = p_note
   where e.id = p_event
     and e.status = p_before_status
     and e.status_note is not distinct from p_before_note
     and (e.status_note is null or e.status_note not like 'manual%')
     and (p_note is null or p_note not like 'manual%');
  if not found then return null; end if;
  insert into public.review_decisions (event_id, outcome, reason, why, quote, quote_in, held_by, before_status, before_note, evidence, engine)
  values (p_event,
          case when p_status = p_before_status and p_note is not distinct from p_before_note then 'waits' else p_status end,
          coalesce(p_decision->>'reason', 'unknown'), p_decision->>'why', p_decision->>'quote', p_decision->>'quote_in',
          p_decision->>'held_by', p_before_status, p_before_note, coalesce(p_decision->'evidence', '{}'::jsonb), p_decision->>'engine')
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.apply_review_decision(text, text, text, text, text, jsonb) from anon, authenticated, public;
grant execute on function public.apply_review_decision(text, text, text, text, text, jsonb) to service_role;

-- The poster hold was written "manual review: …", which reads as a person's decision and so could never be
-- settled automatically. It is the pipeline's own hold: from now on "manual" means a person decided.
update public.events
   set status_note = 'poster: date and time read from Instagram poster'
 where status = 'review' and status_note = 'manual review: date and time read from Instagram poster';
