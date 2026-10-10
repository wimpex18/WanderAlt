-- Public bucket for event pictures the pipeline copies from a venue's own records when their address
-- expires (pipeline/event-art.ts: Paavli's Facebook event covers). Only the service role writes;
-- everyone can read a public object.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-art', 'event-art', true, 2000000, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
