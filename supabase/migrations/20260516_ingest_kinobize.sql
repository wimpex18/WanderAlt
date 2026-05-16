-- ingest-kinobize source + cron
-- Kino Bize is Riga's leading art-house cinema. Server-side rendered HTML
-- at kinobize.lv/en/repertoire. Scraped daily, pushed to staging_messages.

insert into public.curators (handle, name, tagline, bio, city)
values (
  '@kinobize',
  'Kino Bize',
  'Art-house in the heart of Riga.',
  'Riga''s leading art-house cinema. Baltic docs, Central European cinema, retrospectives, festival films, and the occasional midnight oddity.',
  'riga'
)
on conflict (handle) do nothing;

insert into public.sources (kind, channel, curator_handle, city, enabled, feed_url)
values (
  'web',
  'kinobize',
  '@kinobize',
  'riga',
  true,
  'https://kinobize.lv/en/repertoire'
)
on conflict do nothing;

-- Schedule ingest-kinobize daily at 03:30 UTC (slot freed by removed enrich-venues-tallinn).
do $$
declare existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname = 'wa-ingest-kinobize';
  if existing_id is not null then
    perform cron.unschedule(existing_id);
  end if;
end $$;

select cron.schedule(
  'wa-ingest-kinobize',
  '30 3 * * *',
  $$select public.invoke_wa_fn('ingest-kinobize');$$
);
