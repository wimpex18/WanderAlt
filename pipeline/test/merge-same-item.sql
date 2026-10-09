-- Run with Supabase MCP execute_sql after 20261009150000_merge_same_item (README.md, "Deployment and data").
-- Nothing commits.
begin;
do $$
declare raw_show bigint; raw_post bigint; raw_other bigint; raw_else bigint; em1 bigint; em2 bigint; em bigint;
begin
  assert not has_function_privilege('anon','public.merge_events(text,text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.merge_events(text,text)','EXECUTE');
  assert not has_function_privilege('anon','public.undo_event_merge(bigint)','EXECUTE');
  assert not has_function_privilege('authenticated','public.refresh_source_seen(text,text[])','EXECUTE');
  assert has_function_privilege('service_role','public.merge_events(text,text)','EXECUTE');
  assert (select not prosecdef and 'search_path=""' = any(proconfig) from pg_proc where oid='public.merge_events(text,text)'::regprocedure);
  assert (select not prosecdef and 'search_path=""' = any(proconfig) from pg_proc where oid='public.refresh_source_seen(text,text[])'::regprocedure);

  insert into public.sources(id,city,kind,url,handle,label) values
    ('qa-same-item-fienta','qa-same-item','fienta','https://fienta.example','@qa-fienta','QA Fienta'),
    ('qa-same-item-post','qa-same-item','telegram','https://posts.example','@qa-posts','QA posts');
  insert into public.raw_items(source_id,external_id,content_hash,payload,status)
    values('qa-same-item-fienta','qa-show','qa-hash','{}','done') returning id into raw_show;
  insert into public.raw_items(source_id,external_id,content_hash,payload,status)
    values('qa-same-item-post','qa-post','qa-hash','{}','done') returning id into raw_post;
  insert into public.raw_items(source_id,external_id,content_hash,payload,status)
    values('qa-same-item-fienta','qa-other','qa-hash','{}','done') returning id into raw_other;
  insert into public.raw_items(source_id,external_id,content_hash,payload,status)
    values('qa-same-item-fienta','qa-else','qa-hash','{}','done') returning id into raw_else;
  insert into public.places(id,city,name,status) values
    ('qa-same-item-a','qa-same-item','QA Elektron','active'),('qa-same-item-b','qa-same-item','QA Sarle','active');

  -- One Fienta item read three times: 10:00 at Elektron, then 13:00 (rejected), then 12:30 at Sarle.
  insert into public.events(id,city,title,place_id,venue_name,starts_at,ends_at,has_time,status,url,first_seen_at,last_seen_at) values
    ('qa-same-item-s1','qa-same-item','Giving and Receiving Feedback','qa-same-item-a','QA Elektron','2026-10-09 07:00Z','2026-10-09 09:00Z',true,'published','https://fienta.example/feedback','2026-09-30 12:00Z','2026-09-30 12:00Z'),
    ('qa-same-item-s2','qa-same-item','Giving and Receiving Feedback','qa-same-item-b','QA Sarle','2026-10-09 09:30Z',null,true,'published','https://fienta.example/feedback','2026-10-06 18:00Z','2026-10-06 18:00Z'),
    ('qa-same-item-s3','qa-same-item','Giving and Receiving Feedback','qa-same-item-a','QA Elektron','2026-10-09 10:00Z',null,true,'rejected','https://fienta.example/feedback','2026-10-01 00:00Z','2026-10-01 00:00Z'),
    ('qa-same-item-x','qa-same-item','Something else','qa-same-item-a','QA Elektron','2026-10-09 07:00Z',null,true,'published',null,'2026-09-30 12:00Z','2026-09-30 12:00Z');
  insert into public.event_sources(event_id,source_id,raw_item_id,url,first_seen_at,last_seen_at) values
    ('qa-same-item-s1','qa-same-item-fienta',raw_show,'https://fienta.example/feedback','2026-09-30 12:00Z','2026-09-30 12:00Z'),
    ('qa-same-item-s2','qa-same-item-fienta',raw_show,'https://fienta.example/feedback','2026-10-06 18:00Z','2026-10-06 18:00Z'),
    ('qa-same-item-s3','qa-same-item-fienta',raw_show,'https://fienta.example/feedback','2026-10-01 00:00Z','2026-10-01 00:00Z'),
    ('qa-same-item-x','qa-same-item-fienta',raw_else,null,'2026-09-30 12:00Z','2026-09-30 12:00Z');

  -- An item seen again moves its provenance and the rows it listed; others stay.
  assert public.refresh_source_seen('qa-same-item-fienta',array['qa-show'])=3;
  assert (select count(*)=3 from public.events where id in ('qa-same-item-s1','qa-same-item-s2','qa-same-item-s3') and last_seen_at=now());
  assert (select last_seen_at<now() from public.events where id='qa-same-item-x');
  assert public.refresh_source_seen('qa-same-item-post',array['qa-show'])=0;

  -- The newer listing's occurrence and venue; the older id stays, its end is not carried to another start.
  em1 := public.merge_events('qa-same-item-s2','qa-same-item-s1');
  assert (select starts_at='2026-10-09 09:30Z' and has_time and ends_at is null and place_id='qa-same-item-b' and venue_name='QA Sarle'
    from public.events where id='qa-same-item-s1');
  assert (select merged_into='qa-same-item-s1' and archived_at is not null from public.events where id='qa-same-item-s2');
  assert (select canonical_id='qa-same-item-s1' from public.event_redirects where id='qa-same-item-s2');
  assert (select (canonical_before->>'starts_at')::timestamptz='2026-10-09 07:00Z' and (canonical_after->>'starts_at')::timestamptz='2026-10-09 09:30Z'
    and canonical_before->>'place_id'='qa-same-item-a' and canonical_after->>'place_id'='qa-same-item-b'
    from public.event_merge_log where id=em1);
  -- s3 was first seen after s1 but before s2, whose listing s1 now carries: nothing moves back.
  em2 := public.merge_events('qa-same-item-s3','qa-same-item-s1');
  assert (select starts_at='2026-10-09 09:30Z' and place_id='qa-same-item-b' from public.events where id='qa-same-item-s1');
  assert (select status='published' from public.events where id='qa-same-item-s1');
  begin
    perform public.undo_event_merge(em1);
    raise exception 'a later merge into the same row must be undone first';
  exception when others then
    assert sqlerrm like 'Undo later merges first%';
  end;
  perform public.undo_event_merge(em2);
  perform public.undo_event_merge(em1);
  assert (select starts_at='2026-10-09 07:00Z' and ends_at='2026-10-09 09:00Z' and place_id='qa-same-item-a' and venue_name='QA Elektron'
    from public.events where id='qa-same-item-s1');
  assert (select merged_into is null and archived_at is null from public.events where id='qa-same-item-s2');
  assert (select count(*)=0 from public.event_redirects where id in ('qa-same-item-s2','qa-same-item-s3'));

  -- A post read as a date alone, then with its time: the time stays, whichever reading came first.
  insert into public.events(id,city,title,place_id,starts_at,ends_at,has_time,status,url,first_seen_at,last_seen_at) values
    ('qa-same-item-p1','qa-same-item','Viva Verdi','qa-same-item-a','2026-11-01 22:00Z',null,false,'published','https://posts.example/2704','2026-10-07 00:00Z','2026-10-07 00:00Z'),
    ('qa-same-item-p2','qa-same-item','Viva Verdi','qa-same-item-a','2026-11-02 17:00Z','2026-11-02 19:00Z',true,'published','https://posts.example/2704','2026-10-01 00:00Z','2026-10-01 00:00Z');
  insert into public.event_sources(event_id,source_id,raw_item_id,url) values
    ('qa-same-item-p1','qa-same-item-post',raw_post,'https://posts.example/2704'),
    ('qa-same-item-p2','qa-same-item-post',raw_post,'https://posts.example/2704');
  em := public.merge_events('qa-same-item-p2','qa-same-item-p1');
  assert (select has_time and starts_at='2026-11-02 17:00Z' and ends_at='2026-11-02 19:00Z' from public.events where id='qa-same-item-p1');
  perform public.undo_event_merge(em);
  assert (select not has_time and starts_at='2026-11-01 22:00Z' and ends_at is null from public.events where id='qa-same-item-p1');

  -- Rows from different items keep the half-hour and date-only/timed rules, and the canonical's start.
  insert into public.events(id,city,title,place_id,starts_at,has_time,status,first_seen_at) values
    ('qa-same-item-o1','qa-same-item','Murdja','qa-same-item-a','2026-10-23 16:00Z',true,'published','2026-09-28 00:00Z'),
    ('qa-same-item-o2','qa-same-item','Murdja','qa-same-item-a','2026-10-23 17:00Z',true,'published','2026-10-05 00:00Z'),
    ('qa-same-item-o3','qa-same-item','Murdja','qa-same-item-a','2026-10-22 21:00Z',false,'published','2026-10-05 00:00Z'),
    ('qa-same-item-o4','qa-same-item','Murdja','qa-same-item-a','2026-10-23 16:15Z',true,'published','2026-10-05 00:00Z');
  insert into public.event_sources(event_id,source_id,raw_item_id) values
    ('qa-same-item-o1','qa-same-item-fienta',raw_other),('qa-same-item-o2','qa-same-item-fienta',raw_else),
    ('qa-same-item-o3','qa-same-item-post',raw_post),('qa-same-item-o4','qa-same-item-post',raw_post);
  begin
    perform public.merge_events('qa-same-item-o2','qa-same-item-o1');
    raise exception 'different items an hour apart must be refused';
  exception when others then
    assert sqlerrm like 'Events need the same canonical venue and occurrence%';
  end;
  begin
    perform public.merge_events('qa-same-item-o3','qa-same-item-o1');
    raise exception 'a date-only row from another item must be refused';
  exception when others then
    assert sqlerrm like 'Events need the same canonical venue and occurrence%';
  end;
  em := public.merge_events('qa-same-item-o4','qa-same-item-o1');
  assert (select starts_at='2026-10-23 16:00Z' from public.events where id='qa-same-item-o1');
  -- The same item at another venue and on another page is still not one show.
  insert into public.places(id,city,name,status) values('qa-same-item-c','qa-same-item','QA Elsewhere','active');
  update public.events set place_id='qa-same-item-c', url='https://posts.example/other' where id='qa-same-item-p2';
  begin
    perform public.merge_events('qa-same-item-p2','qa-same-item-p1');
    raise exception 'another venue and page must be refused';
  exception when others then
    assert sqlerrm like 'Events need the same canonical venue and occurrence%';
  end;
end;
$$;
rollback;
