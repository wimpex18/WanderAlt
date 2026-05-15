-- Purge expired match_cache rows daily at 04:05 UTC — just after archive-stale
-- (04:00) so the cache is cleared against the freshest pick set.
SELECT cron.schedule(
  'cleanup-match-cache',
  '5 4 * * *',
  $$ SELECT cleanup_match_cache(); $$
);
