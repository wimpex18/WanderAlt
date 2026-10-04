-- A picked place with no note gets one drafted by a free model from its own words
-- (pipeline/place-notes.ts). pick_note_source says who wrote the note; the run writes only into
-- an empty note, so a note written by hand is never replaced. note_checked_at spaces the asks.
alter table public.places
  add column pick_note_source text,
  add column note_checked_at timestamptz,
  add constraint places_pick_note_source_check check (pick_note_source is null or pick_note_source in ('manual', 'model'));
comment on column public.places.pick_note_source is 'manual (or null): written by hand; model: drafted from the place''s own words by place-notes.ts and checked against them.';
comment on column public.places.note_checked_at is 'When place-notes.ts last asked for a note for this picked place.';
