-- Supabase MCP execute_sql, after migrations; every fixture rolls back.
-- place_checks: service-only, one row a question, an answer only when answered.
begin;
do $$
begin
  assert not has_table_privilege('anon', 'public.place_checks', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.place_checks', 'SELECT');
  assert not has_table_privilege('anon', 'public.place_checks', 'INSERT');
  assert (select relrowsecurity from pg_class where oid = 'public.place_checks'::regclass);

  insert into public.place_checks(question, subject, city, state, answer, note, tries, next_at)
    values ('locate', 'qa-checks-1', 'qa-checks', 'answered', 'located', 'two sources agree', 1, now()),
           ('pair', 'qa-checks-a|qa-checks-b', 'qa-checks', 'open', null, 'one source only', 1, now() + interval '3 days');
  -- One row a question: asking again updates it.
  insert into public.place_checks(question, subject, city, tries) values ('locate', 'qa-checks-1', 'qa-checks', 2)
    on conflict (question, subject) do update set tries = excluded.tries;
  assert (select tries = 2 from public.place_checks where question = 'locate' and subject = 'qa-checks-1');
  -- An answer only with the answered state, and only a known answer.
  begin
    insert into public.place_checks(question, subject, city, state, answer) values ('locate', 'qa-checks-2', 'qa-checks', 'open', 'located');
    assert false, 'an open question cannot carry an answer';
  exception when check_violation then null;
  end;
  begin
    insert into public.place_checks(question, subject, city, state, answer) values ('pair', 'qa-checks-c|qa-checks-d', 'qa-checks', 'answered', 'maybe');
    assert false, 'an unknown answer is refused';
  exception when check_violation then null;
  end;
  set local role anon;
  begin
    perform 1 from public.place_checks;
    assert false, 'anon cannot read place checks';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$$;
rollback;
