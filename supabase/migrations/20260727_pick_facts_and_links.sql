-- Stop discarding what the sources already tell us.
--
-- Every ingest function receives a structured payload (Fienta: starts_at,
-- description, url, image_url; RA: startTime, content, artists; Helsinki
-- LinkedEvents: description, start_time, offers) and flattened all of it
-- into staging_messages.text, after which process-staging asked an LLM to
-- reconstruct a subset from prose. These columns give the facts somewhere
-- to live so the model is only ever asked for voice.

alter table staging_messages
  add column if not exists payload jsonb;

comment on column staging_messages.payload is
  'Normalised source object as fetched by the ingest function. Facts are copied from here; the LLM never sees it as authority.';

alter table picks
  -- Source-authored blurb. Distinct from context_md, which is LLM-written.
  add column if not exists description   text,
  -- Real instants. day/time stay as the display strings the UI already uses.
  add column if not exists starts_at     timestamptz,
  add column if not exists ends_at       timestamptz,
  -- Getting in.
  add column if not exists ticket_url    text,
  add column if not exists is_free       boolean,
  add column if not exists price_min     numeric(10,2),
  add column if not exists price_max     numeric(10,2),
  add column if not exists currency      text,
  -- {spotify,soundcloud,bandcamp,mixcloud,discogs,residentadvisor,
  --  openlibrary,wikidata,website,facebook,instagram,...} -> url
  add column if not exists links         jsonb,
  -- Named things the pick is about: artists, authors, films, companies.
  -- [{ name, role }] — the input resolve-links looks up.
  add column if not exists entities      jsonb,
  add column if not exists links_resolved_at timestamptz;

comment on column picks.description is
  'Blurb as written by the source. Never LLM-generated — that is context_md.';
comment on column picks.entities is
  'Named subjects of the pick: [{name, role}] where role is artist|author|film|company|organiser.';
comment on column picks.links is
  'Resolved external links keyed by platform. Written by resolve-links.';

-- resolve-links walks unresolved picks that have something to look up.
create index if not exists picks_links_unresolved_idx
  on picks (links_resolved_at)
  where archived_at is null and links_resolved_at is null;

-- Chronological queries (This Week, rotate-tonight) once starts_at fills in.
create index if not exists picks_starts_at_idx
  on picks (starts_at)
  where archived_at is null;
