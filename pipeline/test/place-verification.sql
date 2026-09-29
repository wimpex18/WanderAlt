-- Supabase MCP execute_sql, after migrations; every fixture rolls back.
begin;
do $$
declare total integer; raw_id bigint; before_count integer;
begin
  assert not has_function_privilege('anon','public.record_place_verification(text,text,text,text,text,timestamptz)','EXECUTE');
  assert not has_function_privilege('authenticated','public.verify_event_places(text)','EXECUTE');
  assert not has_function_privilege('anon','public.refresh_source_seen(text,text[])','EXECUTE');
  assert not has_table_privilege('anon','public.place_verification_reviews','SELECT');
  insert into public.sources(id,city,kind,url,handle,label,curated) values
    ('qa-verification-source','qa-verification','html','https://venue.example','@qa','QA',true),
    ('qa-verification-untrusted','qa-verification','html','https://other.example','@other','QA other',false);
  insert into public.places(id,city,name,status) select 'qa-verification-'||i,'qa-verification','QA Venue '||i,
    case when i=2 then 'closed' else 'active' end from generate_series(1,9) i;
  insert into public.events(id,city,title,place_id,starts_at,status,status_note,flag) select
    'qa-verification-event-'||i,'qa-verification','QA Show '||i,'qa-verification-'||i,
    now()+case when i=9 then interval '120 days' else interval '1 day' end,'published','trusted source',
    case when i=3 then 'cancelled' when i=8 then 'postponed' else null end from generate_series(1,9) i;
  insert into public.event_sources(event_id,source_id,url,last_seen_at) select
    'qa-verification-event-'||i,case when i=5 then 'qa-verification-untrusted' else 'qa-verification-source' end,
    'https://venue.example/show',now()-case when i=4 then interval '8 days' else interval '1 hour' end from generate_series(1,9) i;
  perform public.record_place_verification('qa-verification-6','review','manual',null,'QA uncertain identity');
  perform public.record_place_verification('qa-verification-7','review','website','https://venue.example','QA domain identity changed');
  assert (select status='unverified' from public.venues where id='qa-verification-1');
  total:=public.verify_event_places('qa-verification');
  assert total=1, 'Only a recent trusted, non-cancelled event can verify a venue';
  assert (select status='active' from public.venues where id='qa-verification-1');
  assert (select verification_state='verified' and verification_source='event' from public.places where id='qa-verification-1');
  assert (select count(*)=7 from public.place_verification_reviews where city='qa-verification');
  -- A weak homepage keeps stronger dated evidence, but records the attempt.
  perform public.record_place_verification('qa-verification-1','unverified','website','https://venue.example','QA no dates');
  assert (select verification_state='verified' and verification_source='event' and website_checked_at is not null from public.places where id='qa-verification-1');
  perform public.record_place_verification('qa-verification-1','verified','manual',null,'QA expired confirmation',now()-interval '91 days');
  assert (select status='unverified' from public.venues where id='qa-verification-1');
  assert public.verify_event_places('qa-verification')=1;
  perform public.record_place_verification('qa-verification-1','closed','manual',null,'QA reported permanent closure');
  perform public.record_place_verification('qa-verification-1','verified','website','https://venue.example','QA stale own-site promotion');
  perform public.check_place_liveness('qa-verification-1',jsonb_build_object('osm_state','present','osm_checked_at',now()));
  assert public.verify_event_places('qa-verification')=0;
  assert (select status='closed' and verification_state='closed' and not osm_auto_close from public.places where id='qa-verification-1');
  begin
    perform public.merge_places('qa-verification-1','qa-verification-4','QA conflicting closure');
    raise exception 'Expected closure guard';
  exception when others then
    assert sqlerrm like 'Review closure before merging%';
  end;
  assert (select merged_into is null from public.places where id='qa-verification-1');
  -- Only explicit independent reopening evidence can restore visibility.
  perform public.record_place_verification('qa-verification-1','verified','manual','https://venue.example/new-programme','QA confirmed reopening');
  assert (select status='active' and verification_state='verified' and not osm_closed_by_check from public.places where id='qa-verification-1');
  perform public.record_place_verification('qa-verification-1','review','website','https://other.example','QA redirect');
  assert (select verification_state='verified' and verification_source='manual' from public.places where id='qa-verification-1');
  -- Only exact unchanged items seen by the collector refresh provenance.
  insert into public.raw_items(source_id,external_id,content_hash,payload,status) values
    ('qa-verification-source','qa-item','qa-hash','{}','done') returning id into raw_id;
  update public.event_sources set raw_item_id=raw_id where event_id='qa-verification-event-4';
  assert public.refresh_source_seen('qa-verification-source',array['unseen-item'])=0;
  assert public.refresh_source_seen('qa-verification-untrusted',array['qa-item'])=0;
  assert public.refresh_source_seen('qa-verification-source',array['qa-item'])=1;
  assert (select last_seen_at=now() from public.event_sources where event_id='qa-verification-event-4');
  assert public.verify_event_places('qa-verification')=1;
  select count(*) into before_count from public.place_liveness_log where place_id='qa-verification-1';
  assert before_count>=5;
  -- Existing public clients must see neither closed-place events nor
  -- unverified venues in their active recommendation request.
  set local role anon;
  assert (select count(*)=0 from public.events where id='qa-verification-event-2');
  assert (select count(*)=2 from public.venues where city='qa-verification' and status='active');
  reset role;
end;
$$;
rollback;
