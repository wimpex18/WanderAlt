-- ============================================================
-- Make venue photos a LIFECYCLE rather than a one-shot write.
--
-- The three failures this closes, all of which have actually happened
-- in this project:
--
--  1. Written without verifying. Every image was trusted the moment a
--     URL was produced. Nothing ever fetched it to confirm it was an
--     image, or existed at all.
--  2. Never re-checked. Pick photos from Google place-photos decayed to
--     403 and stayed in the database as dead links (Jul 2026). An image
--     URL is a claim about a remote server, and remote servers change.
--  3. Not attributable to a mechanism. When the Unsplash mess was found
--     there was no way to ask "what wrote this?" -- 100 wrong images and
--     no provenance, so the only way to judge them was to open them.
--
-- image_source answers (3) for everything written from now on.
-- image_checked_at answers (2): a revalidation pass can order by it and
-- never re-check what it just looked at.
-- ============================================================

alter table venues add column if not exists image_source     text;
alter table venues add column if not exists image_checked_at timestamptz;
alter table picks  add column if not exists image_source     text;
alter table picks  add column if not exists image_checked_at timestamptz;

-- Oldest-checked first is the only ordering a revalidation pass needs.
create index if not exists venues_image_recheck_idx
  on venues (image_checked_at nulls first) where image_url is not null;
create index if not exists picks_image_recheck_idx
  on picks (image_checked_at nulls first) where image_url is not null and archived_at is null;

-- Backfill provenance for the rows already written by the two known
-- mechanisms, so the audit view is not blind to its own history.
update venues set image_source = 'wikidata'
 where image_source is null and image_attr like 'Wikimedia%';
update venues set image_source = 'website'
 where image_source is null and image_url is not null;

-- ============================================================
-- One view that answers "is our imagery healthy?" without opening a
-- single photograph. Reused-URL count is the column that would have
-- caught the Unsplash mess on day one: 91 photos across 100 venues,
-- one of them serving seven.
-- ============================================================
create or replace view image_health as
with v as (
  select city, image_url, image_source, image_checked_at
  from venues where image_url is not null
)
select
  city,
  count(*)                                              as images,
  count(distinct image_url)                             as distinct_images,
  count(*) - count(distinct image_url)                  as duplicate_rows,
  count(*) filter (where image_source = 'wikidata')     as from_wikidata,
  count(*) filter (where image_source = 'website')      as from_website,
  count(*) filter (where image_source is null)          as unknown_origin,
  count(*) filter (where image_checked_at is null)      as never_verified,
  min(image_checked_at)                                 as oldest_check
from v group by city order by city;

comment on view image_health is
  'Venue imagery at a glance. duplicate_rows > 0 means one photo is standing in for several places, which is exactly the shape of the Aug 2026 Unsplash problem.';
