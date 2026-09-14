-- Image URL housekeeping and retired-feature crons.
--
-- 1. Remaining Wikimedia Special:FilePath URLs become upload.wikimedia.org
--    CDN URLs (resolved via the Commons imageinfo API, each checked 200).
-- 2. The imageinfo API now returns thumb.wikimedia.org, which the
--    wikimedia-proxy Worker does not allow; a trigger rewrites that host
--    to upload.wikimedia.org (same path) for every writer.
-- 3. The same trigger refuses stock-library photos: not a picture of the
--    place or the event.
-- 4. Crons for retired functions are unscheduled.

create temporary table wa_filepath_map (old_url text primary key, new_url text not null) on commit drop;
insert into wa_filepath_map values
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Eesti_Draamateater.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/d/dc/Eesti_Draamateater.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Kanuti_Gildi_Saal1.JPG?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Kanuti_Gildi_Saal1.JPG/960px-Kanuti_Gildi_Saal1.JPG'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Linnahall_(by_Pudelek).JPG?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Linnahall_%28by_Pudelek%29.JPG/960px-Linnahall_%28by_Pudelek%29.JPG'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Le_KUMU%2C_mus%C3%A9e_dart_estonien_%28Tallinn%29_%287643108702%29.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Le_KUMU%2C_mus%C3%A9e_dart_estonien_%28Tallinn%29_%287643108702%29.jpg/960px-Le_KUMU%2C_mus%C3%A9e_dart_estonien_%28Tallinn%29_%287643108702%29.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Lennusadam_2015.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Lennusadam_2015.jpg/960px-Lennusadam_2015.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Noblessner.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Noblessner.jpg/960px-Noblessner.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Eesti_Rahvusraamatukogu.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Eesti_Rahvusraamatukogu.jpg/960px-Eesti_Rahvusraamatukogu.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg/960px-Fotografiska_tallinn_telliskivi_exterior1_-_2019.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Kai_art_center_noblessner_tallinn_exterior1_-_2019.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Kai_art_center_noblessner_tallinn_exterior1_-_2019.jpg/960px-Kai_art_center_noblessner_tallinn_exterior1_-_2019.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Telliskivi_Loomelinnak_2021_3.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Telliskivi_Loomelinnak_2021_3.jpg/960px-Telliskivi_Loomelinnak_2021_3.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Tallinn_Sveta_Baar_(48521360232).jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Tallinn_Sveta_Baar_%2848521360232%29.jpg/960px-Tallinn_Sveta_Baar_%2848521360232%29.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/MuBa_Tallinna_Muusika-_ja_Balletikool.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/MuBa_Tallinna_Muusika-_ja_Balletikool.jpg/960px-MuBa_Tallinna_Muusika-_ja_Balletikool.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/2024_Tallinn_Kino_S%C3%B5prus.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/2024_Tallinn_Kino_S%C3%B5prus.jpg/960px-2024_Tallinn_Kino_S%C3%B5prus.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Vene_teater_-_S%C3%BCdalinna_teater.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Vene_teater_-_S%C3%BCdalinna_teater.jpg/960px-Vene_teater_-_S%C3%BCdalinna_teater.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Tallinn_Kultuurikatel.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Tallinn_Kultuurikatel.jpg/960px-Tallinn_Kultuurikatel.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/2019_December_Lindakivi_Cultural_Center%2C_New_year_concert.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/2019_December_Lindakivi_Cultural_Center%2C_New_year_concert.jpg/960px-2019_December_Lindakivi_Cultural_Center%2C_New_year_concert.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/R%C4%ABga._Cinema_%22R%C4%ABga%22_(1924)_-_panoramio.jpg?width=800',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/R%C4%ABga._Cinema_%22R%C4%ABga%22_%281924%29_-_panoramio.jpg/960px-R%C4%ABga._Cinema_%22R%C4%ABga%22_%281924%29_-_panoramio.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Superfjord_-_%C3%84%C3%A4niwalli_2020-11-21_09.jpg?width=800',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Superfjord_-_%C3%84%C3%A4niwalli_2020-11-21_09.jpg/960px-Superfjord_-_%C3%84%C3%A4niwalli_2020-11-21_09.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Latvijas_Nacion%C4%81lais_m%C4%81kslas_muzejs.jpg',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Latvijas_Nacion%C4%81lais_m%C4%81kslas_muzejs.jpg/960px-Latvijas_Nacion%C4%81lais_m%C4%81kslas_muzejs.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Latvijas_Fotogr%C4%81fijas_muzejs_2.JPG',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Latvijas_Fotogr%C4%81fijas_muzejs_2.JPG/960px-Latvijas_Fotogr%C4%81fijas_muzejs_2.JPG'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Vallisaari.JPG?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Vallisaari.JPG/960px-Vallisaari.JPG'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Bolsa_de_Riga%2C_Letonia%2C_2012-08-07%2C_DD_01.JPG',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Bolsa_de_Riga%2C_Letonia%2C_2012-08-07%2C_DD_01.JPG/960px-Bolsa_de_Riga%2C_Letonia%2C_2012-08-07%2C_DD_01.JPG'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Mercado_Central%2C_Riga%2C_Letonia%2C_2012-08-07%2C_DD_01.JPG',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Mercado_Central%2C_Riga%2C_Letonia%2C_2012-08-07%2C_DD_01.JPG/960px-Mercado_Central%2C_Riga%2C_Letonia%2C_2012-08-07%2C_DD_01.JPG'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Eesti_Vaba%C3%B5humuuseum_13.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Eesti_Vaba%C3%B5humuuseum_13.jpg/960px-Eesti_Vaba%C3%B5humuuseum_13.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Nacion%C4%81l%C4%81_Opera_-_panoramio.jpg',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Nacion%C4%81l%C4%81_Opera_-_panoramio.jpg/960px-Nacion%C4%81l%C4%81_Opera_-_panoramio.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Lastemuuseum_Miiamilla.jpg?width=600',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Lastemuuseum_Miiamilla.jpg/960px-Lastemuuseum_Miiamilla.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/National_Bibliothek_Lettlands_1.jpg',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/National_Bibliothek_Lettlands_1.jpg/960px-National_Bibliothek_Lettlands_1.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Hanzas_perons_(2).jpg',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Hanzas_perons_%282%29.jpg/960px-Hanzas_perons_%282%29.jpg'),
  ('https://commons.wikimedia.org/wiki/Special:FilePath/Museum_of_the_Occupation_of_Latvia_(09.09.2022).jpg',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Museum_of_the_Occupation_of_Latvia_%2809.09.2022%29.jpg/960px-Museum_of_the_Occupation_of_Latvia_%2809.09.2022%29.jpg');

update venue_images t set image_url = m.new_url from wa_filepath_map m where t.image_url = m.old_url;
update picks        t set image_url = m.new_url from wa_filepath_map m where t.image_url = m.old_url;
update venues       t set image_url = m.new_url from wa_filepath_map m where t.image_url = m.old_url;

create or replace function public.wa_normalise_image_url()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.image_url is not null then
    new.image_url := replace(new.image_url, '://thumb.wikimedia.org/', '://upload.wikimedia.org/');
    if new.image_url ~* '(unsplash|pexels|pixabay|shutterstock|istockphoto|gettyimages|depositphotos|dreamstime)' then
      new.image_url := null;
      if tg_table_name in ('venues', 'picks') then
        new.image_attr := null;
        new.image_source := null;
        new.image_enrich_failed_at := now();
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.wa_normalise_image_url() from anon, authenticated, public;

drop trigger if exists wa_normalise_image_url on public.venues;
create trigger wa_normalise_image_url before insert or update of image_url on public.venues
  for each row execute function public.wa_normalise_image_url();
drop trigger if exists wa_normalise_image_url on public.picks;
create trigger wa_normalise_image_url before insert or update of image_url on public.picks
  for each row execute function public.wa_normalise_image_url();
drop trigger if exists wa_normalise_image_url on public.venue_images;
create trigger wa_normalise_image_url before insert or update of image_url on public.venue_images
  for each row execute function public.wa_normalise_image_url();

delete from venue_images where image_url ~* '(unsplash|pexels|pixabay|shutterstock|istockphoto|gettyimages|depositphotos|dreamstime)';
update venue_images set image_url = replace(image_url, '://thumb.wikimedia.org/', '://upload.wikimedia.org/')
  where image_url like '%://thumb.wikimedia.org/%';
update venues set image_url = image_url where image_url ~* '(unsplash|pexels|pixabay|shutterstock|istockphoto|gettyimages|depositphotos|dreamstime)|://thumb\.wikimedia\.org/';
update picks  set image_url = image_url where image_url ~* '(unsplash|pexels|pixabay|shutterstock|istockphoto|gettyimages|depositphotos|dreamstime)|://thumb\.wikimedia\.org/';

select cron.unschedule(jobname) from cron.job
 where jobname in ('cleanup-match-cache', 'generate-context-nightly');
revoke execute on function public.cleanup_match_cache() from anon, authenticated, public;
