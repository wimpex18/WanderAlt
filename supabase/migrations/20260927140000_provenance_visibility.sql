-- Provenance rows are public only for events the public can see, and
-- without the raw item they came from.
drop policy if exists event_sources_read on public.event_sources;
create policy event_sources_read on public.event_sources for select
  using (exists (select 1 from public.events e where e.id = event_id and e.status = 'published'));
revoke all on public.event_sources from anon, authenticated;
grant select (event_id, source_id, url, first_seen_at, last_seen_at) on public.event_sources to anon, authenticated;
