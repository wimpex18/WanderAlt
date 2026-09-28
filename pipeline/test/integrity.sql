-- Run with Supabase MCP execute_sql after the migration. Nothing commits.
begin;
do $$
declare pm bigint; pm2 bigint; em bigint;
begin
  assert not has_function_privilege('anon','public.merge_places(text,text,text,jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','public.check_place_liveness(text,jsonb)','EXECUTE');
  assert not has_table_privilege('anon','public.place_merge_log','SELECT');
  assert not has_table_privilege('anon','public.place_liveness_log','SELECT');
  assert not has_table_privilege('anon','public.event_merge_log','SELECT');

  insert into public.places(id,city,name,aliases,kind,status,osm_id,osm_ids,website)
    values('qa-integrity-a','tallinn','CatHouse',array['cathouse'],'club','active','node/1',array['node/1'],'https://a.example'),
          ('qa-integrity-b','tallinn','CatHouse Club',array['cathouse club'],'club','active','node/2',array['node/2'],'https://b.example');
  insert into public.events(id,city,title,place_id,starts_at,status,flag,ticket_url)
    values('qa-integrity-e1','tallinn','Murdja','qa-integrity-a','2026-10-01 16:00Z','published',null,null),
          ('qa-integrity-e2','tallinn','Murdja','qa-integrity-b','2026-10-01 16:00Z','published','cancelled','https://tickets.example/show');
  insert into public.sources(id,city,kind,url,handle,label) values
    ('qa-integrity-s1','tallinn','html','https://a.example','@a','A'),
    ('qa-integrity-s2','tallinn','html','https://b.example','@b','B');
  insert into public.event_sources(event_id,source_id,url,flag) values
    ('qa-integrity-e1','qa-integrity-s1','https://a.example/show',null),
    ('qa-integrity-e2','qa-integrity-s2','https://b.example/show','cancelled');

  pm := public.merge_places('qa-integrity-b','qa-integrity-a','test, same venue');
  assert (select place_id='qa-integrity-a' from public.events where id='qa-integrity-e2');
  assert (select merged_into='qa-integrity-a' and status='hidden' from public.places where id='qa-integrity-b');
  assert (select osm_ids @> array['node/1','node/2'] and website='https://a.example' from public.places where id='qa-integrity-a');

  em := public.merge_events('qa-integrity-e2','qa-integrity-e1');
  assert (select count(*)=2 from public.event_sources where event_id='qa-integrity-e1');
  assert (select flag='cancelled' and ticket_url='https://tickets.example/show' from public.events where id='qa-integrity-e1');
  assert (select archived_at is not null and merged_into='qa-integrity-e1' from public.events where id='qa-integrity-e2');
  assert (select canonical_id='qa-integrity-e1' from public.catalogue_redirects where id='qa-integrity-e2');
  perform public.refresh_event_flags(array['qa-integrity-e1']);
  assert (select flag='cancelled' from public.events where id='qa-integrity-e1');
  update public.event_sources set flag=null where event_id='qa-integrity-e1';
  perform public.refresh_event_flags(array['qa-integrity-e1']);
  assert (select flag is null from public.events where id='qa-integrity-e1');
  update public.event_sources set flag='cancelled' where event_id='qa-integrity-e1' and source_id='qa-integrity-s2';
  perform public.refresh_event_flags(array['qa-integrity-e1']);
  assert (select flag='cancelled' from public.events where id='qa-integrity-e1');

  perform public.undo_event_merge(em);
  assert (select merged_into is null and archived_at is null from public.events where id='qa-integrity-e2');
  assert (select count(*)=1 from public.event_sources where event_id='qa-integrity-e1');
  assert (select flag is null and ticket_url is null from public.events where id='qa-integrity-e1');
  update public.places set website='https://later.example' where id='qa-integrity-a';
  perform public.undo_place_merge(pm);
  assert (select place_id='qa-integrity-b' from public.events where id='qa-integrity-e2');
  assert (select merged_into is null and status='active' from public.places where id='qa-integrity-b');
  assert (select website='https://later.example' and osm_ids=array['node/1'] from public.places where id='qa-integrity-a');
  assert (select state='separate' from public.place_match_reviews where place_a='qa-integrity-a' and place_b='qa-integrity-b');

  perform public.check_place_liveness('qa-integrity-a','{"osm_state":"closed","osm_checked_at":"2026-09-28T12:00:00Z","osm_last_seen_at":"2026-09-28T12:00:00Z","osm_note":"disused:amenity=nightclub","osm_missing_count":0}');
  assert (select status='closed' and osm_closed_by_check from public.places where id='qa-integrity-a');
  perform public.check_place_liveness('qa-integrity-a','{"osm_state":"missing","osm_checked_at":"2026-09-28T13:00:00Z","osm_missing_count":1}');
  assert (select status='closed' from public.places where id='qa-integrity-a');
  perform public.check_place_liveness('qa-integrity-a','{"osm_state":"present","osm_checked_at":"2026-09-28T14:00:00Z","osm_missing_count":0}');
  assert (select status='active' and not osm_closed_by_check from public.places where id='qa-integrity-a');
  update public.places set status='closed', osm_closed_by_check=false where id='qa-integrity-a';
  perform public.check_place_liveness('qa-integrity-a','{"osm_state":"present","osm_checked_at":"2026-09-28T15:00:00Z"}');
  assert (select status='closed' from public.places where id='qa-integrity-a');
  assert (select count(*)=4 from public.place_liveness_log where place_id='qa-integrity-a');

  -- A canonical place can later become an alias of another. Undo in
  -- reverse order restores its flattened redirects and moved events.
  insert into public.places(id,city,name,status) values('qa-integrity-c','tallinn','CatHouse venue','active');
  pm := public.merge_places('qa-integrity-b','qa-integrity-a','QA chain');
  pm2 := public.merge_places('qa-integrity-a','qa-integrity-c','QA chain');
  assert (select canonical_id='qa-integrity-c' from public.place_redirects where id='qa-integrity-b');
  begin
    perform public.undo_place_merge(pm);
    raise exception 'Dependent merge should block undo';
  exception when others then
    assert sqlerrm like 'Undo later dependent merges first%';
  end;
  perform public.undo_place_merge(pm2);
  assert (select canonical_id='qa-integrity-a' from public.place_redirects where id='qa-integrity-b');
  perform public.undo_place_merge(pm);
  assert (select place_id='qa-integrity-b' from public.events where id='qa-integrity-e2');
  assert (select count(*)=0 from public.place_redirects where id in ('qa-integrity-a','qa-integrity-b'));
end;
$$;
rollback;
