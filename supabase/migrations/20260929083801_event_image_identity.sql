-- Roundup photos identify the post, not each event it announces.
-- Match source identities and URLs so this repair is repeatable.
with roundups as (
  select es.raw_item_id
  from event_sources es
  join events e on e.id = es.event_id
  join sources s on s.id = es.source_id
  where s.kind = 'telegram' and es.raw_item_id is not null
  group by es.raw_item_id
  having count(distinct lower(regexp_replace(e.title, '[^[:alnum:]]', '', 'g'))) > 1
)
update events e set image_url = null, image_attr = null
from event_sources es, raw_items r, roundups x
where es.event_id = e.id and r.id = es.raw_item_id
  and x.raw_item_id = r.id and r.payload->'photos' ? e.image_url;

-- Verified on each official page: matching og:url, title and event artwork.
with artwork(page, image) as (values
  ('https://www.disainioo.ee/2026-program/exhibition-of-product-design-award-bruno-2026',
   'https://www.disainioo.ee/photos/BRUNO%202026%20Lohnarahn_3_Kertin_Vasser_.jpg'),
  ('https://www.disainioo.ee/2026-program/mauricio-zelaya-photo-exhibition-estonia-elsewhere',
   'https://www.disainioo.ee/photos/%20Mauricio%20Zelaya.webp'),
  ('https://www.disainioo.ee/2026-program/design-street',
   'https://www.disainioo.ee/photos/Disainit%C3%A4nav_Sander_Hallaste-1.jpg')
)
update events e set image_url = a.image, image_attr = 'Image from disainioo.ee'
from event_sources es, artwork a
where es.event_id = e.id and es.url = a.page;

-- Homepage logos: retain identity, use the existing labelled logo treatment.
update places set image_source = 'logo',
  image_attr = 'Logo from ' || regexp_replace(regexp_replace(website, '^https?://(www\.)?', ''), '/.*$', '')
where image_source = 'website' and (
  image_url ~* 'logo'
  or image_url in (
    'https://i0.wp.com/allagallery.com/wp-content/uploads/2020/07/AGL-1.png?fit=1600%2C900&ssl=1',
    'https://punctumgallery.com/photos/Punctum_Share_pic.jpg',
    'http://rovshannur.com/cdn/shop/files/ChatGPT_Image_Sep_13_2026_06_01_38_PM.png?v=1789308334'
  )
);

-- Individually inspected homepage previews: adverts, performers, unrelated
-- artwork, a stock placeholder and a dead URL. None identifies the venue.
update places set image_url = null, image_attr = null, image_source = null
where image_source = 'website' and image_url in (
  'https://www.d-3.ee/wp-content/uploads/2026/06/728255172_1011990887898969_1298306725193836492_n.jpg',
  'https://dokfoto.ee/wp-content/themes/www/img/og.png',
  'https://kellerteater.ee/photos/imago_centre_kellerteater_large.jpg',
  'https://metsvintage.com/wp-content/uploads/2022/10/vintage-3.jpg',
  'https://piipjatuut.ee/photos/PjaT_reklaam_12hooaega_koduleht_large.jpg',
  'https://cdn2.editmysite.com/images/site/footer/og-image-placeholder-blank.png',
  'https://retrodisko.ee/wp-content/uploads/2023/05/TP_32.jpg',
  'https://krulli.fra1.digitaloceanspaces.com/uploads/85823838a24fbabe3aee926e4b12dff5.png',
  'https://tallinnakoda.ee/wp-content/uploads/2026/03/Ounapuuoksad-1.png',
  'https://telliskivikirbukas.wordpress.com/wp-content/uploads/2016/11/header.png'
);
