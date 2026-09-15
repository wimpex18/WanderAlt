-- Pre-rewrite reset: venue and event data is outdated and the next
-- backend will source it differently. Accounts, saves, digest opt-ins and
-- the source list are kept; nothing runs on a schedule.
select cron.unschedule(jobid) from cron.job;

truncate public.picks, public.pick_changes, public.staging_messages,
         public.venues, public.venue_details, public.venue_images,
         public.ingest_log;

delete from public.pipeline_config;

update public.sources set last_message_id = null, last_scraped_at = null;
