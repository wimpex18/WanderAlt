-- ingest-telliskivi source + cron
-- Telliskivi Creative City events page (server-side rendered HTML).
-- The ingest function scrapes the listing page daily and pushes
-- events to staging_messages for process-staging to curate.

insert into public.curators (handle, name, tagline, bio, city)
values (
  '@telliskivi',
  'Telliskivi Creative City',
  'Where Tallinn gets creative.',
  'Tallinn''s main creative hub: gigs, markets, exhibitions, dance, theatre, film clubs, flea markets. All under one roof in Põhja-Tallinn.',
  'tallinn'
)
on conflict (handle) do nothing;

insert into public.sources (kind, channel, curator_handle, city, enabled, feed_url)
values (
  'web',
  'telliskivi',
  '@telliskivi',
  'tallinn',
  true,
  'https://telliskivi.cc/en/events/'
)
on conflict do nothing;

-- Schedule ingest-telliskivi daily at 03:45 UTC (between enrich-venues and ingest-fienta).
do $$
declare existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname = 'wa-ingest-telliskivi';
  if existing_id is not null then
    perform cron.unschedule(existing_id);
  end if;
end $$;

select cron.schedule(
  'wa-ingest-telliskivi',
  '45 3 * * *',
  $$select public.invoke_wa_fn('ingest-telliskivi');$$
);
