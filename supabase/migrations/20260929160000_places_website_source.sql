-- Where a place's website came from, so a wrong one can be traced and
-- undone. Null for the ones OpenStreetMap or Wikidata supplied earlier.
alter table public.places add column website_source text;
