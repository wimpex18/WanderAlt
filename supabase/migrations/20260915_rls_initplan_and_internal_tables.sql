-- Own-row policies: evaluate auth.uid() once per statement, not per row
-- (Supabase lint auth_rls_initplan). Same predicates, same roles.
do $$
declare t text;
begin
  foreach t in array array['bookmarks', 'saved_lists', 'saved_list_items'] loop
    execute format('drop policy if exists select_own_%1$s on public.%1$I', t);
    execute format('drop policy if exists insert_own_%1$s on public.%1$I', t);
    execute format('drop policy if exists delete_own_%1$s on public.%1$I', t);
    execute format('create policy select_own_%1$s on public.%1$I for select using ((select auth.uid()) = user_id)', t);
    execute format('create policy insert_own_%1$s on public.%1$I for insert with check ((select auth.uid()) = user_id)', t);
    execute format('create policy delete_own_%1$s on public.%1$I for delete using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_self_insert on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_select on public.profiles for select using ((select auth.uid()) = user_id);
create policy profiles_self_insert on public.profiles for insert with check ((select auth.uid()) = user_id);
create policy profiles_self_update on public.profiles for update using ((select auth.uid()) = user_id);

drop policy if exists public_insert on public.digest_opt_ins;
create policy public_insert on public.digest_opt_ins for insert with check (
  (user_id is null or user_id = (select auth.uid()))
  and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'
  and length(email) between 6 and 254
  and city = any (array['tallinn', 'helsinki', 'riga', 'vilnius'])
);

-- service_role bypasses RLS; these only added a per-row check.
drop policy if exists profiles_service_select on public.profiles;
drop policy if exists service_read on public.digest_opt_ins;
drop policy if exists service_all on public.venue_images;

-- Pipeline-internal: read only by service-role edge functions.
drop policy if exists pipeline_config_read on public.pipeline_config;
drop policy if exists anon_select on public.venue_images;
revoke all on public.pipeline_config, public.venue_images from anon, authenticated;

-- Covering indexes for foreign keys (lint unindexed_foreign_keys).
create index if not exists staging_messages_source_id_idx on public.staging_messages (source_id);
create index if not exists staging_messages_pick_id_idx   on public.staging_messages (pick_id);
create index if not exists picks_source_message_id_idx    on public.picks (source_message_id);
create index if not exists digest_opt_ins_user_id_idx     on public.digest_opt_ins (user_id);
