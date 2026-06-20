-- enrich-venues v12 captures venue social links (Facebook / Instagram) from
-- Wikidata (P2013 / P2003) or the venue homepage scrape. Store them next to
-- the existing website column so the detail page can surface them. Additive.
ALTER TABLE public.venue_details ADD COLUMN IF NOT EXISTS facebook  text;
ALTER TABLE public.venue_details ADD COLUMN IF NOT EXISTS instagram text;

COMMENT ON COLUMN public.venue_details.facebook  IS 'Venue Facebook URL (Wikidata P2013 or scraped from the venue website).';
COMMENT ON COLUMN public.venue_details.instagram IS 'Venue Instagram URL (Wikidata P2003 or scraped from the venue website).';
