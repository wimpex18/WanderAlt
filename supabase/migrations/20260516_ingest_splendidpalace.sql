-- ingest-splendidpalace source + cron
-- Splendid Palace: historic 1923 Riga cinema, art-house + special events.
-- Server-rendered HTML at splendidpalace.lv/lv/pasakumi (Latvian content).

insert into public.curators (handle, name, tagline, bio, city)
values (
  '@splendidpalace',
  'Splendid Palace',
  'Riga''s grand art-house, since 1923.',
  'European Film Academy partner. Auteur cinema, festival favourites, Baltic premieres, and the occasional strange event in a very ornate room.',
  'riga'
)
on conflict (handle) do nothing;

insert into public.sources (kind, channel, curator_handle, city, enabled, feed_url)
values (
  'web',
  'splendidpalace',
  '@splendidpalace',
  'riga',
  true,
  'https://splendidpalace.lv/lv/pasakumi'
)
on conflict do nothing;

-- Disable the dead @udgstriga source (channel went inactive).
update public.sources set enabled = false where channel = 'udgstriga';

-- Schedule ingest-splendidpalace daily at 03:35 UTC.
do $$
declare existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname = 'wa-ingest-splendidpalace';
  if existing_id is not null then
    perform cron.unschedule(existing_id);
  end if;
end $$;

select cron.schedule(
  'wa-ingest-splendidpalace',
  '35 3 * * *',
  $$select public.invoke_wa_fn('ingest-splendidpalace');$$
);
