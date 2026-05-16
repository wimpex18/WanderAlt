-- pipeline_config: key/value store for filter rules read by process-staging
-- and any future ingest-* function. Updating a row takes effect on the next
-- cron tick — no edge function redeploy needed.
create table if not exists public.pipeline_config (
  key        text primary key,
  value      jsonb not null,
  notes      text,
  updated_at timestamptz not null default now()
);

alter table public.pipeline_config enable row level security;

drop policy if exists pipeline_config_read on public.pipeline_config;
create policy pipeline_config_read on public.pipeline_config
  for select using (true);

-- Seed the three rule sets from DATA_SOURCES.md
insert into public.pipeline_config (key, value, notes) values
  ('venue_whitelist',
   '["Paavli Kultuurivabrik","Von Krahl","Telliskivi","Sveta Baar","Uus Laine","Hotbox","Fotografiska","Kai Art Center","Nullpunkt","Ülase12","HALL","Helitehas","Biit Me","Pudel Baar","Kanuti Gildi SAAL","EKKM","Lugemik","Kaņepes","KKC","Splendid Palace","Kino Bize","Depo","Laska","1983","Vagonu","Aleponija","M Darbnīca","Underground Station"]'::jsonb,
   'Substring match against venue / title. Hit = auto-approve to staging with source_trust = high.'),
  ('skip_keywords',
   '["tribute band","cover band","coverband","eurovision","chart-topping","top 40","vip table","bottle service","arena tour","stadium","karaoke night"]'::jsonb,
   'Case-insensitive substring. Hit = reject pick during process-staging.'),
  ('keep_signals',
   '["experimental","avant-garde","art house","arthouse","DIY","underground","basement","cellar","noise","improv","free jazz","post-rock","flea market","vintage","antiques","poetry","readings","gallery opening","vernissage","social center","community space"]'::jsonb,
   'Bias Gemini toward keeping a borderline pick when these terms appear.')
on conflict (key) do update set
  value = excluded.value,
  notes = excluded.notes,
  updated_at = now();

-- New Riga Telegram source (Underground Station, electronic underground).
insert into public.curators (handle, name, tagline, bio, city)
values ('@udgstriga', 'Underground Station', 'Forward-thinking electronic music in Riga.',
        'Riga collective broadcasting parties, raves, and DIY electronic events from the city''s underground.',
        'riga')
on conflict (handle) do nothing;

insert into public.sources (kind, channel, curator_handle, city, enabled)
values ('telegram', 'udgstriga', '@udgstriga', 'riga', true)
on conflict do nothing;

-- Disable rows 2-5 (placeholder curator handles, never scraped).
update public.sources set enabled = false
 where id in (2, 3, 4, 5) and last_scraped_at is null;

-- Fienta sources for the two Tallinn venues that route through Fienta.
insert into public.curators (handle, name, tagline, bio, city) values
  ('@paavli',   'Paavli Kultuurivabrik', 'Loud, weird, excellent.',
   'Former industrial space in Põhja-Tallinn turned into a venue for punk, metal, electronic, and experimental music. Programme via Fienta.',
   'tallinn'),
  ('@vonkrahl', 'Von Krahl Theatre',     'Experimental theatre, since 1992.',
   'Tallinn''s longest-running independent theatre. Avant-garde productions, TMW events, alternative performances. Programme via Fienta.',
   'tallinn')
on conflict (handle) do nothing;

insert into public.sources (kind, channel, curator_handle, city, enabled, feed_url) values
  ('fienta', 'paavli-kultuurivabrik', '@paavli',   'tallinn', true,
   'https://fienta.com/o/paavli-kultuurivabrik?format=json'),
  ('fienta', '15',                    '@vonkrahl', 'tallinn', true,
   'https://fienta.com/o/15?format=json')
on conflict do nothing;

-- Schedule ingest-fienta daily at 04:00 UTC (after enrich-venues).
-- Idempotent: drop old job with same name, then schedule new.
do $$
declare existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname = 'wa-ingest-fienta';
  if existing_id is not null then
    perform cron.unschedule(existing_id);
  end if;
end $$;

select cron.schedule(
  'wa-ingest-fienta',
  '0 4 * * *',
  $$select public.invoke_wa_fn('ingest-fienta');$$
);
