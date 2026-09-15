-- Picks written before process-staging enforced its kind list and rejected
-- "null" strings (v56).
update public.picks set archived_at = now(), archive_reason = 'invalid', tonight = false, this_week = false
 where archived_at is null
   and (kind not in ('gig','talk','exhibition','club','place','bookshop','record store','gallery','thrift',
                     'lecture','noise','theatre','cinema','library','bar','museum','arts centre')
        or venue = 'null' or neighborhood = 'null' or title = 'null');
