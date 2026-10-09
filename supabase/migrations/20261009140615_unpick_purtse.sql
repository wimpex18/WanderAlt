-- Purtse resto is a restaurant first and hosts no listings; the guide's picks are places for events and
-- craft beer, not restaurants (owner's curation rule, 9 Oct 2026). Reverses 20261003151841_pick_purtse.
update public.places set picked = false where id = 'tallinn-purtse-resto' and picked;
