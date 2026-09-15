-- Retire the ingestion pipeline ahead of the backend rewrite. Kept: the
-- tables the site reads (picks, venues, venue_details), accounts, saves,
-- the digest (pick_changes, digest_opt_ins, profiles) and invoke_wa_fn.
--
-- Sources as they were, for whoever builds the next pipeline:
--   city     kind      channel                  handle             feed
--   helsinki telegram  ayyevents                @ayyevents
--   helsinki telegram  helsinkievents           @helsinkievents
--   helsinki telegram  otaniemievents           @otaniemievents
--   helsinki web       hel-linkedevents         @hel_today         https://api.hel.fi/linkedevents/v1/event/
--   riga     telegram  AfishaRiga               @AfishaRiga
--   riga     telegram  notboring_riga           @notboring_riga
--   riga     web       echogonewrong            @echogonewrong
--   riga     web       hanzasperons             @hanzasperons
--   riga     web       kinobize                 @kinobize          https://kinobize.lv/en/repertoire
--   riga     web       splendidpalace           @splendidpalace    https://splendidpalace.lv/lv/pasakumi
--   tallinn  fienta    15                       @vonkrahl          https://fienta.com/o/15?format=json
--   tallinn  fienta    paavli-kultuurivabrik    @paavli            https://fienta.com/o/paavli-kultuurivabrik?format=json
--   tallinn  rss       giadafromgamma           @giadafromgamma    https://giadafromgamma.substack.com/feed
--   tallinn  telegram  proEesti                 @proeesti
--   tallinn  telegram  sigmundtells             @sigmundtells
--   tallinn  web       telliskivi               @telliskivi        https://telliskivi.cc/en/events/
--   vilnius  telegram  afishavilnius            @afishavilnius
--   vilnius  web       ra-vilnius               @ra_vilnius        https://ra.co/events/lt/vilnius

drop view if exists public.image_health;

drop function if exists public.claim_staging_message();
drop function if exists public.wa_dedup_active_picks();
drop function if exists public.wa_ingest_zero_yield_check();
drop function if exists public.wa_purge_old_archived();
drop function if exists public.wa_purge_old_pick_changes();
drop function if exists public.wa_reconcile_absent_picks(boolean, integer);
drop function if exists public.reset_tonight();

alter table public.picks drop column if exists source_message_id;
drop table if exists public.staging_messages, public.ingest_log, public.pipeline_config,
                     public.sources, public.venue_images;

-- Columns only the pipeline read or wrote.
alter table public.picks
  drop column if exists auto_generated,
  drop column if exists archive_reason,
  drop column if exists title_original,
  drop column if exists geocode_failed_at,
  drop column if exists image_enrich_failed_at,
  drop column if exists links_resolved_at,
  drop column if exists image_checked_at;

alter table public.venues
  drop column if exists osm_id,
  drop column if exists last_seen_at,
  drop column if exists closed_at,
  drop column if exists wikidata,
  drop column if exists image_enrich_failed_at,
  drop column if exists image_checked_at;

alter table public.venue_details
  drop column if exists osm_id,
  drop column if exists source,
  drop column if exists enriched_at,
  drop column if exists manual_lock;

-- The image-URL trigger stamped image_enrich_failed_at, dropped above.
create or replace function public.wa_normalise_image_url()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.image_url is not null then
    new.image_url := replace(new.image_url, '://thumb.wikimedia.org/', '://upload.wikimedia.org/');
    if new.image_url ~* '(unsplash|pexels|pixabay|shutterstock|istockphoto|gettyimages|depositphotos|dreamstime)' then
      new.image_url := null;
      new.image_attr := null;
      new.image_source := null;
    end if;
  end if;
  return new;
end;
$function$;
