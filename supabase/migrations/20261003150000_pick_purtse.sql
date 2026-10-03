-- Purtse moved: the Telliskivi Tap Room closed and Purtse resto, "Restaurant & taproom in Telliskivi Park",
-- is open at Telliskivi 60/2. Name, address, hours and the one-line note are from its Instagram bio
-- (@purtseresto, pasted by the owner on 3 October 2026); the point is the geocoded building. It is not
-- in OpenStreetMap, so it has no osm_id and is not in the osm source's craft_beer list.
insert into public.places (id, city, name, aliases, address, lat, lng, instagram, opening_hours, hours_source, kind, picked, pick_note)
values ('tallinn-purtse-resto', 'tallinn', 'Purtse resto', array['purtse resto', 'purtse'], 'Telliskivi 60/2, Tallinn', 59.4395353, 24.732987,
  'https://www.instagram.com/purtseresto', 'Tu-Th 12:00-22:00; Fr 12:00-24:00; Sa 14:00-24:00', 'instagram', 'taproom', true,
  'Restaurant and taproom in Telliskivi Park, on the same grounds as Põhja Konn and Pudel.')
on conflict (id) do nothing;
