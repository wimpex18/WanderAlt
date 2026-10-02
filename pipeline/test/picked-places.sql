-- Supabase MCP execute_sql, after migrations; every fixture rolls back.
begin;
do $$
begin
  insert into public.places(id,city,name,kind,status,picked,pick_note) values
    ('qa-pick-1','qa-pick','QA Picked Records','record store','active',true,'Worth the walk.'),
    ('qa-pick-2','qa-pick','QA Plain Records','record store','active',false,null),
    ('qa-pick-3','qa-pick','QA Picked Closed','record store','closed',true,null),
    ('qa-pick-4','qa-pick','QA Picked Reviewed','bookshop','active',true,null);
  perform public.record_place_verification('qa-pick-4','closed','manual',null,'QA closure');
  -- A picked place shows without any verification; an unpicked one does not.
  assert (select status='active' and picked and pick_note='Worth the walk.' from public.venues where id='qa-pick-1');
  assert (select status='unverified' and not picked from public.venues where id='qa-pick-2');
  -- Picking never reopens a closed place, however it was closed.
  assert (select status='closed' from public.venues where id='qa-pick-3');
  assert (select status<>'active' from public.venues where id='qa-pick-4');
  -- The note stays short.
  begin
    update public.places set pick_note=repeat('x',201) where id='qa-pick-1';
    raise exception 'a 201-character note was accepted';
  exception when check_violation then null;
  end;
end $$;
rollback;
