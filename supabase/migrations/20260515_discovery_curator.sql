-- Add @discovery system curator for AI-found picks pending editorial review.
-- discover-venues sets handle='@discovery' on auto-saved picks; the FK on
-- picks.handle → curators.handle requires this row to exist.

INSERT INTO curators (handle, city, name, tagline, bio, pick_count) VALUES
  ('@discovery', 'tallinn', 'Discovery',
   'Surfaced by external search — not yet curated.',
   'Picks marked with @discovery come from external searches (Google Places). They are not vouched for by a curator and stay hidden from the main feed until an editor reviews them.',
   0)
ON CONFLICT (handle) DO NOTHING;
