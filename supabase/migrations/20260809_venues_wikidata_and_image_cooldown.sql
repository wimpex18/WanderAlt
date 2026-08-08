-- ============================================================
-- Two columns that let a venue photo be looked up by IDENTITY rather
-- than guessed from its name.
--
-- `wikidata` is the QID OpenStreetMap already carries on the venue node.
-- ingest-osm fetches every tag (`out center tags`) and has been throwing
-- this one away. 48 of Tallinn's 496 culture venues have it, including
-- Fotografiska, Kino Sõprus, Von Krahli, Kumu and Rahvusooper Estonia.
-- A QID is an identifier, so it resolves a venue called "D3" or "Hall"
-- exactly as well as one called "Estonian National Opera" -- which is
-- the whole problem with matching on names.
--
-- `image_enrich_failed_at` mirrors the column picks already has: a venue
-- with no findable photo is skipped for a cooldown rather than re-probed
-- on every run.
-- ============================================================

alter table venues add column if not exists wikidata text;
alter table venues add column if not exists image_enrich_failed_at timestamptz;

create index if not exists venues_wikidata_idx
  on venues (wikidata) where wikidata is not null;

create index if not exists venues_need_image_idx
  on venues (city) where image_url is null;

comment on column venues.wikidata is
  'OSM wikidata=* tag (QID). Lets enrich-venue-images resolve a photo by identifier instead of fuzzy name search.';
