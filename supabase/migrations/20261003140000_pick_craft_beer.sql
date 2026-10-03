-- Craft beer: a new place kind, 'taproom', and nine picks for the Drink mood. Facts come from each
-- place's own page where it could be read (Põhjala, Põhja Konn, Pudel, Tuletorn) and from OpenStreetMap
-- (address, coordinates, hours; Pudel's hours are from its own page, read 3 October 2026). The pipeline's
-- osm source lists the same references (config.craft_beer), so the next catalogue read matches these rows by osm_id.
insert into public.places (id, city, name, aliases, address, lat, lng, osm_id, osm_ids, website, facebook, opening_hours, hours_source, kind, picked, pick_note)
select v.id, v.city, v.name, array[lower(v.name)], v.address, v.lat, v.lng, v.osm_id, array[v.osm_id], v.website, v.facebook, v.opening_hours, v.hours_source, 'taproom', true, v.pick_note
from (values
('tallinn-hell-hunt', 'tallinn', 'Hell Hunt', 'Pikk 39/1, Tallinn', 59.4393982, 24.7466853, 'node/436177124', null, null, null, null, 'Pub on Pikk in the Old Town that pours Estonian craft beer alongside European bottles.'),
('tallinn-koht', 'tallinn', 'Koht', 'Lai 8, Tallinn', 59.4382284, 24.743982, 'node/1837843613', null, 'http://www.facebook.com/tubakas', 'Su-Th 17:00-03:00; Fr-Sa 17:00-06:00', 'osm', 'Estonian craft beer in an Old Town cellar bar at Lai 8; the door is in the courtyard.'),
('tallinn-pohja-konn', 'tallinn', 'Põhja Konn', 'Telliskivi 60B, Tallinn', 59.4389156, 24.7284175, 'node/2408088880', null, null, 'Su-Th 14:00-24:00, Fr,Sa 14:00-02:00', 'osm', 'Twenty taps of Põhjala and other small Estonian brewers in Telliskivi, indoors and out, with DJ nights and live music.'),
('tallinn-uba-ja-humal', 'tallinn', 'Uba ja Humal', 'Võrgu 3, Tallinn', 59.4450375, 24.7480095, 'node/4097949863', 'https://www.ubajahumal.ee/', null, 'Mo, Tu 10:00-20:00; We, Th 10:00-22:00; Fr, Sa 10:00-00:00; Su 10:00-18:00', 'osm', 'Craft beer shop and taproom by Kalasadama; guest-brewer tastings are listed on Untappd.'),
('tallinn-puhaste-taproom', 'tallinn', 'Pühaste Taproom', 'Rotermanni 2, Tallinn', 59.4386697, 24.7581287, 'node/4841070221', 'https://puhastebeer.com/taproom-1', null, 'Mo 17:00-23:00; Tu-Th 17:00-01:00; Fr-Sa 14:00-02:00', 'osm', 'Taproom of Pühaste, the Tartu craft brewery, in the Rotermanni quarter.'),
('tallinn-pohjala-brewery-tap-room', 'tallinn', 'Põhjala Brewery & Tap Room', 'Peetri 5, Tallinn', 59.4502108, 24.7271596, 'node/6180784703', 'https://pohjalabeer.com/taproom', null, 'Tu-Th 12:00-24:00, Fr,Sa 12:00-01:00, Su 10:00-17:00; Mo off', 'osm', '24 taps of Põhjala''s own beer and guests, in a converted submarine factory at Noblessner. Brewery tours and a Texas-style kitchen.'),
('tallinn-pudel', 'tallinn', 'Pudel', 'Telliskivi 60a, Tallinn', 59.4405618, 24.7319121, 'node/10560458975', 'https://pudel.ee/', null, 'Mo-We 17:30-24:00; Th 17:30-02:00; Fr 17:00-02:00; Sa 14:00-02:00; Su 14:00-24:00', 'manual', 'Estonia’s first craft beer bar, open since 2013 in Telliskivi, with local and international craft beer and traditional English cask ale.'),
('tallinn-brewklyn-craft-beer-cafe', 'tallinn', 'Brewklyn Craft Beer Cafe', 'Vesilennuki 22, Tallinn', 59.4524831, 24.7320874, 'node/11465700066', null, null, 'We-Fr 17:00-23:00; Sa 13:00-23:00; Su 13:00-19:00', 'osm', 'Craft beer café-bar in Noblessner with a long list of American and European beers and ciders, many in cans and bottles.'),
('tallinn-tuletorn-brewing', 'tallinn', 'Tuletorn Brewing', 'Ankru 10, Tallinn', 59.4551075, 24.6755861, 'node/11975356084', 'https://tuletorn.beer/', null, 'We 17:00-23:00, Th,Fr 17:00-24:00, Sa 14:00-24:00, Su 13:00-18:00', 'osm', 'Brewery taproom in Kopli beside the brewhouse, with a glass wall onto the production hall.')
) as v(id, city, name, address, lat, lng, osm_id, website, facebook, opening_hours, hours_source, pick_note)
on conflict (id) do update set kind = 'taproom', picked = true, pick_note = excluded.pick_note,
  opening_hours = coalesce(public.places.opening_hours, excluded.opening_hours),
  hours_source = case when public.places.opening_hours is null then excluded.hours_source else public.places.hours_source end,
  lat = coalesce(public.places.lat, excluded.lat), lng = coalesce(public.places.lng, excluded.lng),
  address = coalesce(public.places.address, excluded.address),
  osm_id = coalesce(public.places.osm_id, excluded.osm_id),
  website = coalesce(public.places.website, excluded.website);
