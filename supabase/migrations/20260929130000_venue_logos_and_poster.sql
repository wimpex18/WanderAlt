-- Three pictures the owner collected from the venues' own sites, served from
-- wanderalt.app/assets (immutable, so a changed file gets a new name).
-- Fills only rows with no picture yet; a stored photo is never replaced.
update public.places set
  image_url = 'https://wanderalt.app/assets/venues/sudalinna-teater-logo.svg',
  image_attr = 'Logo from sudalinnateater.ee', image_source = 'logo'
where id = 'tallinn-sudalinna-teater' and image_url is null;

update public.places set
  image_url = 'https://wanderalt.app/assets/venues/philly-joes-logo.webp',
  image_attr = 'Logo from the venue''s website', image_source = 'logo'
where id = 'tallinn-philly-joe-s' and image_url is null;

-- COSMODOLPHINS at Südalinna Teater; the poster is the one on the theatre's
-- own event page, https://www.sudalinnateater.ee/et/repertuaar/cosmodolphins/865
update public.events set
  image_url = 'https://wanderalt.app/assets/events/cosmodolphins-sudalinna-teater.webp',
  image_attr = 'Image from sudalinnateater.ee'
where id = 'ev_735b43e1b4b2f458' and place_id = 'tallinn-sudalinna-teater' and image_url is null;
