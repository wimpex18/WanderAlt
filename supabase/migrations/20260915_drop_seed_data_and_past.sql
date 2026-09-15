-- Curator-era fixtures: hand-written picks under handles that were never
-- sources, still shown as live listings. No bookmarks or list items.
delete from public.picks where auto_generated = false;

-- `past` had no writer; its three rows were April fixtures.
drop table if exists public.past;

-- The Substack source carried a curator handle from the old seed.
update public.sources set curator_handle = '@giadafromgamma' where channel = 'giadafromgamma';
update public.picks   set handle = '@giadafromgamma' where handle = '@raul.reads';

-- Disabled seed channels with no messages.
delete from public.sources where enabled = false;

-- Log rows from retired functions, and runs that never finished.
delete from public.ingest_log
 where fn in ('classify-moods', 'discover-venues', 'draft-column', 'embed-picks')
    or (status = 'running' and started_at < now() - interval '1 day');
