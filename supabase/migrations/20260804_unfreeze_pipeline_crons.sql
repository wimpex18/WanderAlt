-- Unfreeze the pipeline. Owner decision, 4 Aug 2026.
--
-- The ingest and LLM crons were disabled pre-release ("no users, no
-- spend"). The consequence showed up as the empty Tonight list: nothing
-- had reached picks since 2 Jul, and 49 staging rows sat unprocessed.
-- Turning them back on is what makes the catalogue self-sustaining.
--
-- Cost surface, stated rather than assumed:
--   ingests            HTTP scrapes only. Free.
--   process-staging    Groq llama-3.3-70b-versatile (free tier), then
--                      OpenRouter :free. Gemini stays gated off via
--                      pipeline_config.gemini_fallback_enabled.
--   generate-context   same provider ladder.
--   embed-picks        Cloudflare Workers AI bge-m3. Free tier.
--   geocode-picks      Nominatim. Free, rate-limited — the schedules
--   enrich-venues      are staggered and none run concurrently, which
--                      keeps us inside its usage policy.
--   enrich-images      Wikimedia. Free.
--
-- Two stay OFF deliberately, and neither is an oversight:
--   send-digest-saturday  its deployed code predates the XSS escaping
--                         fix (commit f3ed3bf) — scraped pick titles go
--                         unescaped into subscriber inboxes. Enabling an
--                         email cron on that would be the wrong order.
--                         Turn on once the function is deployed.
--   draft-column-weekly   its deployed code still pins the decommissioned
--                         meta-llama/llama-4-scout-17b-16e-instruct, so
--                         every run would 404 through to a hard failure.

do $$
declare
  j text;
  on_list text[] := array[
    -- ingest: pure HTTP, no spend
    'wa-ingest-fienta', 'wa-ingest-telliskivi', 'wa-ingest-kinobize',
    'wa-ingest-splendidpalace', 'wa-ingest-ra', 'wa-ingest-hanzas-perons',
    'wa-ingest-hel-linkedevents', 'wa-ingest-echo-gone-wrong',
    'wa-ingest-rss-morning', 'wa-ingest-rss-evening', 'wa-ingest-telegram',
    -- the queue drain, hourly
    'wa-process-staging',
    -- enrichment
    'wa-geocode-picks', 'embed-picks-auto', 'generate-context-nightly',
    'enrich-images-auto', 'wa-enrich-venues-night', 'wa-enrich-venues-day',
    'wa-enrich-venues-osm',
    -- lifecycle housekeeping, pure SQL
    'wa-reconcile-absent', 'wa-purge-pick-changes', 'cleanup-match-cache'
  ];
begin
  foreach j in array on_list loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.alter_job(jobid, active => true) from cron.job where jobname = j;
    else
      raise notice 'cron job % not found, skipped', j;
    end if;
  end loop;
end $$;
