-- The source's provenance handle, named for the curators it once was.
alter table public.sources rename column curator_handle to handle;
