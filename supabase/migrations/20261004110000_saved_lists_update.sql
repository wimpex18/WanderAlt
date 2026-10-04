-- A reader can rename/upsert their own lists, without changing ownership.
grant update on public.saved_lists to authenticated;
create policy update_own_saved_lists on public.saved_lists for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
