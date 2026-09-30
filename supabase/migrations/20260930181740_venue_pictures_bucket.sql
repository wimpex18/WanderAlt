-- Public bucket for venue pictures the pipeline copies from a venue's own
-- profile (Instagram's signed picture links expire, so the file is kept).
-- Only the service role writes; everyone can read a public object.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('venue-pictures', 'venue-pictures', true, 2000000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
