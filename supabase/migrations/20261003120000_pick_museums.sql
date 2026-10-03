-- Daytime places for the Guide: three museums, each note one English sentence drawn from the
-- place's own words or a page that states it (Kumu's Wikipedia article, the Tallinn City
-- Museum's site, the Architecture Museum's own description). None carries filed hours, so the
-- Guide says "hours not filed" rather than guessing. Edit the notes in the Table Editor.
update public.places p set picked=true, pick_note=v.note
from (values
  ('tallinn-kumu', 'Estonian art from the 18th century on, and temporary shows of modern and contemporary art.'),
  ('tallinn-kiek-in-de-kok-fortifications-museum', 'An artillery tower with the history of Tallinn''s defence, and underground bastion passages.'),
  ('tallinn-eesti-arhitektuurimuuseum', 'Shows the history of Estonian architecture; its own words say it suits specialists, locals, tourists and schoolchildren alike.')
) as v(id, note)
where p.id=v.id and p.status='active' and p.merged_into is null;
