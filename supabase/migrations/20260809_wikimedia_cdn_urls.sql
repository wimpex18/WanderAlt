-- ============================================================
-- Serve Wikimedia photos from the CDN, not from the wiki.
--
-- Every Commons photo was stored as
--   commons.wikimedia.org/wiki/Special:FilePath/<File>?width=N
-- which is the MediaWiki APP LAYER. It 302s to the real file, and it is
-- rate-limited: the first verification sweep came back with a third of
-- the catalogue marked "transient", and when the sweep was made to
-- report WHY, every single one was `http 429`. Not one dead link in the
-- set -- the checker was being throttled, and a checker that deletes on
-- a 4xx would have wiped the entire library.
--
-- The reader pays the same cost. Every visitor's browser was fetching
-- venue photos through a throttled redirect on the wiki's own servers.
--
-- These are the upload.wikimedia.org equivalents, resolved once through
-- the Commons imageinfo API (thumburl, utm_* tracking params stripped).
-- Direct CDN, no redirect hop, no app layer.
--
-- One thing learned in the doing, and worth keeping: upload.wikimedia.org
-- 429s too, but only on a thumbnail size that has never been rendered --
-- it is GENERATION that is throttled, not fetching. 15 of these 33 files
-- 429'd on first request and all 33 served 200 on the two passes after,
-- because the render is cached from then on. So a fresh Commons image is
-- expected to fail its first check and pass its second; that is why
-- verify-images retries a transient rather than trusting one answer.
-- All 33 were warmed and verified 200 twice before this ran.
-- ============================================================

update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Latvijas_Fotogr%C4%81fijas_muzejs_2.JPG/960px-Latvijas_Fotogr%C4%81fijas_muzejs_2.JPG' where id = 'latvian-museum-of-photography-12465076866';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/National_Bibliothek_Lettlands_1.jpg/960px-National_Bibliothek_Lettlands_1.jpg' where id = 'national-library-of-latvia-159024970';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/N%C3%A4itus_%22M%C3%BCstiline_%C3%BCrgmeri%22.jpg/960px-N%C3%A4itus_%22M%C3%BCstiline_%C3%BCrgmeri%22.jpg' where id = 'estonian-museum-of-natural-history-687057023';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Assauwe_torn_Myyrivahe_t%C3%A4naval%2C_vaade_Harju_t%C3%A4nava_poolt%2C_8._august_2011.jpg/960px-Assauwe_torn_Myyrivahe_t%C3%A4naval%2C_vaade_Harju_t%C3%A4nava_poolt%2C_8._august_2011.jpg' where id = 'estonian-theatre-and-music-museum-687057397';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Eesti_Pank_Museum_%28Banco_Estonio%29%2C_Tallin%2C_Estonia%2C_2012-08-05%2C_DD_03.JPG/960px-Eesti_Pank_Museum_%28Banco_Estonio%29%2C_Tallin%2C_Estonia%2C_2012-08-05%2C_DD_03.JPG' where id = 'eesti-pank-museum-687057400';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Museo_Estonio_de_Historia%2C_Tallin%2C_Estonia%2C_2012-08-05%2C_DD_05.JPG/960px-Museo_Estonio_de_Historia%2C_Tallin%2C_Estonia%2C_2012-08-05%2C_DD_05.JPG' where id = 'estonian-history-museum-687057447';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Gran_Puerta_Costera%2C_Tallinn%2C_Estonia%2C_2012-08-05%2C_DD_08.JPG/960px-Gran_Puerta_Costera%2C_Tallinn%2C_Estonia%2C_2012-08-05%2C_DD_08.JPG' where id = 'estonian-maritime-museum-687057482';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/2024_Tallinn_Kino_S%C3%B5prus.jpg/960px-2024_Tallinn_Kino_S%C3%B5prus.jpg' where id = 'kino-soprus-746742784';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Institut_Fran%C3%A7ais_%287952214084%29.jpg/960px-Institut_Fran%C3%A7ais_%287952214084%29.jpg' where id = 'prantsuse-instituut-2677040237';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg/960px-Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg' where id = 'fotografiska-6685135686';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Kai_art_center_noblessner_tallinn_exterior1_-_2019.jpg/960px-Kai_art_center_noblessner_tallinn_exterior1_-_2019.jpg' where id = 'kai-art-center-7264876385';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Kanuti_Gildi_Saal1.JPG/960px-Kanuti_Gildi_Saal1.JPG' where id = 'kanuti-gildi-saal-508576935';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/2019_December_Lindakivi_Cultural_Center%2C_New_year_concert.jpg/960px-2019_December_Lindakivi_Cultural_Center%2C_New_year_concert.jpg' where id = 'lindakivi-kultuurikeskus-26887816';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Tallinn_asv2022-04_img47_Architecture_Museum.jpg/960px-Tallinn_asv2022-04_img47_Architecture_Museum.jpg' where id = 'museum-of-estonian-architecture-687057487';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/A._Weizenbergi_28%2C_Kadrioru_lossi_k%C3%B6%C3%B6gihoone.jpg/960px-A._Weizenbergi_28%2C_Kadrioru_lossi_k%C3%B6%C3%B6gihoone.jpg' where id = 'mikkel-museum-687057496';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Lastemuuseum_Miiamilla.jpg/960px-Lastemuuseum_Miiamilla.jpg' where id = 'cildrens-museum-miiamilla-687057497';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Viimsi_m%C3%B5is.jpg/960px-Viimsi_m%C3%B5is.jpg' where id = 'estonian-war-museum-687057502';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Adamson-Ericu_muuseum_%28L%C3%BChike_jalg_3%29_20120929_by_Ahsoous.jpg/960px-Adamson-Ericu_muuseum_%28L%C3%BChike_jalg_3%29_20120929_by_Ahsoous.jpg' where id = 'adamson-eric-museum-687057445';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Le_KUMU%2C_mus%C3%A9e_dart_estonien_%28Tallinn%29_%287643108702%29.jpg/960px-Le_KUMU%2C_mus%C3%A9e_dart_estonien_%28Tallinn%29_%287643108702%29.jpg' where id = 'kumu-art-museum-26882906';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/d/dc/Eesti_Draamateater.jpg' where id = 'estonian-drama-theatre-266576421';
update venues set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Museum_of_the_Occupation_of_Latvia_%2809.09.2022%29.jpg/960px-Museum_of_the_Occupation_of_Latvia_%2809.09.2022%29.jpg' where id = 'museum-of-the-occupation-of-latvia-638498822';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Hanzas_perons_%282%29.jpg/960px-Hanzas_perons_%282%29.jpg' where id = 'echogonewrong-3297795739882212';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Tennispalatsi_Helsinki.jpg/960px-Tennispalatsi_Helsinki.jpg' where id = 'helsinkievents-4034-tove-jansson-birthday';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Tennispalatsi_Helsinki.jpg/960px-Tennispalatsi_Helsinki.jpg' where id = 'helsinkievents-4034-tove-jansson-music';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Tennispalatsi_Helsinki.jpg/960px-Tennispalatsi_Helsinki.jpg' where id = 'helsinkievents-4034-skidit-disko-outdoor-party';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg/960px-Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg' where id = 'telliskivi-4683700199228185';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg/960px-Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg' where id = 'telliskivi-3884561722283796';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg/960px-Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg' where id = 'telliskivi-6264509210754550';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Vene_teater_-_S%C3%BCdalinna_teater.jpg/960px-Vene_teater_-_S%C3%BCdalinna_teater.jpg' where id = 'sigmundtells-2626-andrei-makarevich-live';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/2024_Tallinn_Kino_S%C3%B5prus.jpg/960px-2024_Tallinn_Kino_S%C3%B5prus.jpg' where id = 'sigmundtells-2626-s-prus-cinema-tour';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg/960px-Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg' where id = 'sigmundtells-2632';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Tallinn_Sveta_Baar_%2848521360232%29.jpg/960px-Tallinn_Sveta_Baar_%2848521360232%29.jpg' where id = 'sigmundtells-2636-art-lecture';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Kallion_kirjasto_2008.jpg/960px-Kallion_kirjasto_2008.jpg' where id = 'hel-linkedevents-5697809399967812';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Maunula_Library_-_Mets%C3%A4purontie_4%2C_Helsinki_-_4.jpg/960px-Maunula_Library_-_Mets%C3%A4purontie_4%2C_Helsinki_-_4.jpg' where id = 'hel-linkedevents-928604816845586';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg/960px-Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg' where id = 'sigmundtells-2558-exhibition-photography-in-powe';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Le_KUMU%2C_mus%C3%A9e_dart_estonien_%28Tallinn%29_%287643108702%29.jpg/960px-Le_KUMU%2C_mus%C3%A9e_dart_estonien_%28Tallinn%29_%287643108702%29.jpg' where id = 'feminine-power';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Maunula_Library_-_Mets%C3%A4purontie_4%2C_Helsinki_-_4.jpg/960px-Maunula_Library_-_Mets%C3%A4purontie_4%2C_Helsinki_-_4.jpg' where id = 'hel-linkedevents-4548982967661388';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg/960px-Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg' where id = 'telliskivi-7080554474233883';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Kallion_kirjasto_2008.jpg/960px-Kallion_kirjasto_2008.jpg' where id = 'hel-linkedevents-6114612094344140';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Kallion_kirjasto_2008.jpg/960px-Kallion_kirjasto_2008.jpg' where id = 'hel-linkedevents-8702932515848814';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Oulunkyl%C3%A4n_seurahuone_C_IMG_6795.jpg/960px-Oulunkyl%C3%A4n_seurahuone_C_IMG_6795.jpg' where id = 'hel-linkedevents-2666466347765115';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Punavuori.jpg/960px-Punavuori.jpg' where id = 'hel-linkedevents-1787803522284838';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Kanuti_Gildi_Saal1.JPG/960px-Kanuti_Gildi_Saal1.JPG' where id = 'sigmundtells-2567-domestic-anarchism-dance-perfo';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/2024_Tallinn_Kino_S%C3%B5prus.jpg/960px-2024_Tallinn_Kino_S%C3%B5prus.jpg' where id = 'sigmundtells-2567-film-screening-titan';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Telliskivi_Loomelinnak_2021_3.jpg/960px-Telliskivi_Loomelinnak_2021_3.jpg' where id = 'sigmundtells-2567-red-bull-summer-vibes-festival';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Le_KUMU%2C_mus%C3%A9e_dart_estonien_%28Tallinn%29_%287643108702%29.jpg/960px-Le_KUMU%2C_mus%C3%A9e_dart_estonien_%28Tallinn%29_%287643108702%29.jpg' where id = 'giadafromgamma-1779854438-art-walk-kumu';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Hanzas_perons_%282%29.jpg/960px-Hanzas_perons_%282%29.jpg' where id = 'hanzasperons-7119234582737105';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Hanzas_perons_%282%29.jpg/960px-Hanzas_perons_%282%29.jpg' where id = 'hanzasperons-7120334094365316';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Punavuori.jpg/960px-Punavuori.jpg' where id = 'hel-linkedevents-414067639950803';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Kaapelitehdas_Helsinki_Finland_2007.jpg/960px-Kaapelitehdas_Helsinki_Finland_2007.jpg' where id = 'kaapelitehdas-vinyl';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Vene_teater_-_S%C3%BCdalinna_teater.jpg/960px-Vene_teater_-_S%C3%BCdalinna_teater.jpg' where id = 'proeesti-4831';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/2024_Tallinn_Kino_S%C3%B5prus.jpg/960px-2024_Tallinn_Kino_S%C3%B5prus.jpg' where id = 'sigmundtells-2567-film-screening-lady-bird';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/2024_Tallinn_Kino_S%C3%B5prus.jpg/960px-2024_Tallinn_Kino_S%C3%B5prus.jpg' where id = 'sigmundtells-2567-film-screening-some-like-it-ho';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/2024_Tallinn_Kino_S%C3%B5prus.jpg/960px-2024_Tallinn_Kino_S%C3%B5prus.jpg' where id = 'sigmundtells-2633';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Lasipalatsi.jpg/960px-Lasipalatsi.jpg' where id = 'helsinkievents-3953-free-outdoor-dance-floor-at-am';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Kiasmamodernartmuseum.JPG/960px-Kiasmamodernartmuseum.JPG' where id = 'kiasma-koho';
update picks set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Hanzas_perons_%282%29.jpg/960px-Hanzas_perons_%282%29.jpg' where id = 'hanzas-perons-chamber';
