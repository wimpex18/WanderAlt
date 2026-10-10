-- Supabase MCP execute_sql, after migrations; every fixture rolls back.
-- review_decisions: service-only; apply_review_decision changes a row only from the state it was decided
-- from, never a person's decision, and records every change it makes.
begin;
do $$
declare v bigint;
begin
  assert not has_table_privilege('anon', 'public.review_decisions', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.review_decisions', 'SELECT');
  assert not has_table_privilege('anon', 'public.review_decisions', 'INSERT');
  assert (select relrowsecurity from pg_class where oid = 'public.review_decisions'::regclass);
  assert not has_function_privilege('anon', 'public.apply_review_decision(text, text, text, text, text, jsonb)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.apply_review_decision(text, text, text, text, text, jsonb)', 'EXECUTE');
  assert not exists (select 1 from public.events where status_note = 'manual review: date and time read from Instagram poster' and status = 'review');

  insert into public.events(id, city, title, starts_at, has_time, status, status_note)
    values ('qa-decide-1', 'qa-decide', 'Sip & Paint', now() + interval '2 days', true, 'review', 'rule: hobby class (sip & paint)'),
           ('qa-decide-2', 'qa-decide', 'A held gig', now() + interval '2 days', true, 'review', 'borderline fit 0.50'),
           ('qa-decide-3', 'qa-decide', 'A person kept it', now() + interval '2 days', true, 'rejected', 'manual reject');

  -- A decision changes the row and is recorded with its quote and the state before.
  v := public.apply_review_decision('qa-decide-1', 'review', 'rule: hobby class (sip & paint)', 'rejected', 'auto reject: a hobby class',
    '{"reason":"hobby","quote":"Sip & Paint","quote_in":"title","why":"A hobby class.","engine":"claude:test"}');
  assert v is not null;
  assert (select status = 'rejected' and status_note = 'auto reject: a hobby class' from public.events where id = 'qa-decide-1');
  assert (select outcome = 'rejected' and before_status = 'review' and before_note = 'rule: hobby class (sip & paint)' and quote = 'Sip & Paint'
            from public.review_decisions where id = v);
  -- Decided from a state the row is no longer in: nothing changes, nothing is recorded.
  assert public.apply_review_decision('qa-decide-1', 'review', 'rule: hobby class (sip & paint)', 'published', 'auto publish: fits the guide',
    '{"reason":"fits","quote":"Sip & Paint"}') is null;
  assert (select status = 'rejected' from public.events where id = 'qa-decide-1');
  -- A person's decision is never changed, and the pipeline cannot write one.
  assert public.apply_review_decision('qa-decide-3', 'rejected', 'manual reject', 'published', 'auto publish: fits the guide', '{"reason":"fits","quote":"x"}') is null;
  assert (select status = 'rejected' and status_note = 'manual reject' from public.events where id = 'qa-decide-3');
  assert public.apply_review_decision('qa-decide-2', 'review', 'borderline fit 0.50', 'published', 'manual publish', '{"reason":"fits","quote":"A held gig"}') is null;
  -- A run without a checked answer is recorded as waiting and leaves the row as it was.
  v := public.apply_review_decision('qa-decide-2', 'review', 'borderline fit 0.50', 'review', 'borderline fit 0.50', '{"reason":"unclear"}');
  assert (select outcome = 'waits' and quote is null from public.review_decisions where id = v);
  assert (select status = 'review' and status_note = 'borderline fit 0.50' from public.events where id = 'qa-decide-2');
  -- A change always carries its quote.
  begin
    perform public.apply_review_decision('qa-decide-2', 'review', 'borderline fit 0.50', 'published', 'auto publish: fits the guide', '{"reason":"fits"}');
    assert false, 'a decision without a quote is refused';
  exception when check_violation then null;
  end;
  set local role anon;
  begin
    perform 1 from public.review_decisions;
    assert false, 'anon cannot read review decisions';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$$;
rollback;
