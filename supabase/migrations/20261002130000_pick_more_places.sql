-- More hand-picked places. Each note is one English sentence drawn from the place's own text or checked public facts; edit them in the Table Editor.
update public.places p set picked=true, pick_note=v.note
from (values
  ('tallinn-biit-me-record-store', 'Record shop for good music and new talent from Estonia and abroad; vinyl and CDs.'),
  ('tallinn-vinyl-records', 'Vinyl shop on Väike-Karja, in the Old Town.'),
  ('tallinn-raamatukoi', 'Says it is the largest bookshop in Estonia: new and second-hand books at low prices.'),
  ('tallinn-read-raamatupood-kohvik', 'Mostly second-hand books, some new ones, in a bookshop and café in Kopli.'),
  ('tallinn-allecto', 'Bookshop for books in English, French, German and Spanish.'),
  ('tallinn-tutar-gallery', 'Contemporary art gallery in Kalamaja.'),
  ('tallinn-studio-gallery-k28-kentmanni-galerii', 'Contemporary art gallery and studio with exhibitions, workshops and art for sale.'),
  ('tallinn-fotografiska-tallinn', 'Photography museum and gallery in the Telliskivi quarter.'),
  ('tallinn-juhan-kuusi-dokfoto-keskus', 'Documentary photography centre in the Krulli quarter.'),
  ('tallinn-ekkm', 'Artist-run contemporary art museum, free to enter; it has opened seasonally, April to December.'),
  ('tallinn-kai-art-center', 'Cinema, café-bar, galleries and event rooms in one Noblessner building.'),
  ('tallinn-paavli-kultuurivabrik', 'Concert and event hall, club and a garden in the middle of the city.'),
  ('tallinn-kultuurikatel', 'Creative and event centre in Kalamaja.'),
  ('tallinn-salme-kultuurikeskuse-vaba-lava-black-box-3-korrusel', 'Vaba Lava, a performing-arts centre making international theatre projects; the black box is on the third floor.'),
  ('tallinn-kino-soprus', 'Estonia''s oldest arthouse cinema, opened in 1955. Films are subtitled, never dubbed.'),
  ('tallinn-kino-sopruse-kai-saal', 'The cinema room at Kai: special programmes for people who care what a film says as well as how it looks.'),
  ('tallinn-uus-laine', 'Social club and bar in Kalamaja with bands, DJ nights and quizzes.'),
  ('tallinn-helitehas', 'Warehouse-style hall for concerts and club nights in an old industrial quarter; two balconies and four bars.'),
  ('tallinn-techno-club-hall', 'Techno club in Noblessner.'),
  ('tallinn-heldeke', 'Kalamaja bar with stand-up and vinyl sessions.'),
  ('tallinn-philly-joe-s-jazz-club', 'Jazz club on Vabaduse väljak, in the Old Town.'),
  ('tallinn-the-krypt-spooky-bar-stage', 'Bar with a stage for live gigs, on Pärnu maantee.'),
  ('tallinn-fort-bar-live-music', 'Live-music bar in the Old Town, with signature cocktails.'),
  ('tallinn-kanuti-gildi-saal', 'Contemporary performing-arts centre in the Old Town, in the Saint Canute Guild House.'),
  ('tallinn-von-krahli-teater', 'Theatre on Telliskivi street, in the Kalamaja creative quarter.'),
  ('tallinn-cabaret-volta', 'Creative space and gallery in the old Volta factory quarter; room for about 100.'),
  ('tallinn-metsvintage', 'Second-hand clothes shop in the Old Town, with an online shop.'),
  ('tallinn-telliskivi-kirbukas', 'Consignment flea shop in Pelgulinn: bring what you no longer use and they sell it.'),
  ('tallinn-riisaikel', 'Second-hand clothes shop on Tatari street; it also buys used clothes.')
) as v(id, note)
where p.id=v.id and p.status='active' and p.merged_into is null;
