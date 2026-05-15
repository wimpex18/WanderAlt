-- Schedule embed-picks every 30 min so newly created/updated picks get vectors
-- without manual intervention. The function skips already-embedded picks.
SELECT cron.schedule(
  'embed-picks-auto',
  '*/30 * * * *',
  $$ SELECT public.invoke_wa_fn('embed-picks'); $$
);
