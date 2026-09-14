-- process-staging no longer writes these, and nothing reads them.
-- thumb_initials was NOT NULL, so new picks failed to insert until it went.
alter table public.picks
  drop column if exists thumb_initials,
  drop column if exists mood_tags;
