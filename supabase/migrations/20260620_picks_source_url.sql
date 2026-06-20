-- Carry the source/ticket permalink from staging_messages onto picks so the
-- detail page (and map popup) can link out to the event/ticket page.
-- Additive + nullable; backfilled from staging_messages.permalink for existing
-- picks (web permalinks only — Telegram curator posts are not event pages).
ALTER TABLE public.picks ADD COLUMN IF NOT EXISTS source_url text;

COMMENT ON COLUMN public.picks.source_url IS
  'External event/ticket page for this pick (sourced from staging_messages.permalink). NULL for picks without a source link.';

-- One-time backfill for picks already in the table.
UPDATE public.picks p
SET    source_url = s.permalink
FROM   public.staging_messages s
WHERE  p.source_message_id = s.id
  AND  p.source_url IS NULL
  AND  s.permalink IS NOT NULL
  AND  s.permalink ~* '^https?://'
  AND  s.permalink !~* '://(www\.)?t\.me/'
  AND  s.permalink !~* 'telegram';
