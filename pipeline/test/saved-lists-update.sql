-- Run as postgres. All fixtures and edits roll back, including auth users.
begin;
select set_config('wa.qa_owner', gen_random_uuid()::text, true),
       set_config('wa.qa_other', gen_random_uuid()::text, true);
insert into auth.users (id) values (current_setting('wa.qa_owner')::uuid), (current_setting('wa.qa_other')::uuid);
insert into public.saved_lists (user_id, id, name, city) values
  (current_setting('wa.qa_owner')::uuid, 'qa-list', 'Before', 'tallinn'),
  (current_setting('wa.qa_other')::uuid, 'qa-list', 'Other', 'tallinn');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('wa.qa_owner'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n integer;
begin
  update public.saved_lists set name = 'After' where id = 'qa-list';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Own list rename must update exactly one row'; end if;
  if (select count(*) from public.saved_lists where id = 'qa-list' and name = 'After') <> 1 then
    raise exception 'Updated list must be readable';
  end if;
  update public.saved_lists set name = 'Forbidden' where user_id = current_setting('wa.qa_other')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Another account must not be writable'; end if;
  begin
    update public.saved_lists set user_id = current_setting('wa.qa_other')::uuid where id = 'qa-list';
    raise exception 'Ownership change must be rejected';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$
begin
  if exists (select 1 from public.saved_lists where id = 'qa-list') then raise exception 'Guest must not read account lists'; end if;
end $$;
reset role;
rollback;
