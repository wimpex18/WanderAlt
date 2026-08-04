-- venues.opening_hours — the field the whole redesign hangs on.
--
-- Every screen in the Aug 2026 direction prints "open now" or "closes at"
-- next to a walking distance. Measured before writing a line of it:
--
--   venue_details.opening_hours joined to the 937 public Places venues
--     → 1 row. 0.1%.
--   venue_details rows carrying hours at all
--     → 58 of 204, and nearly all are bars and restaurants, a kind the
--       public Places whitelist deliberately excludes.
--   what writes them today
--     → nothing. No edge function sets the column. The 58 are Google
--       weekday_text from a retired enrichment, hand-editable in admin.js.
--
-- Meanwhile ingest-osm has been fetching the answer and throwing it away
-- for months: its Overpass query ends `out center tags;`, so every element
-- arrives with its full tag set, and the row mapping just never read
-- t.opening_hours. Measured against Overpass for the Places-whitelist
-- kinds only (club, cinema, arts centre, community, bookshop, record
-- store, thrift, gallery):
--
--   tallinn  102/184  55%
--   riga      88/202  44%
--   helsinki 239/514  47%
--   vilnius   69/122  57%
--
-- ~47% overall. That is under the ~70% floor the Walks feature needed, so
-- Walks was cut this cycle rather than shipped on top of a promise the data
-- cannot keep. It is still a 470x improvement on one row, and it is free.
--
-- Format is raw OSM opening_hours syntax ("Tu-Sa 12:00-19:00; Su,Mo off"),
-- NOT the Google weekday_text array in venue_details. WA.Hours parses both
-- and says so; the column stays text so neither shape needs a migration.

alter table public.venues
  add column if not exists opening_hours text;

comment on column public.venues.opening_hours is
  'Raw OSM opening_hours syntax, e.g. "Tu-Sa 12:00-19:00; Su,Mo off". '
  'Written by ingest-osm from the Overpass tag of the same name. '
  'Distinct from venue_details.opening_hours, which holds a Google '
  'weekday_text JSON array. WA.Hours (hours.js) parses both shapes.';

-- Partial index: every open-now query filters to rows that actually have
-- hours, and that is under half the table.
create index if not exists venues_opening_hours_present_idx
  on public.venues (city, kind)
  where opening_hours is not null;
