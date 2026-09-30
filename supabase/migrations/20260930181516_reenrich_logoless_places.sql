-- Logo discovery now reads a header logo linked to the homepage, Cargo sites'
-- home media item, declared icons of 128 px and up, and a Facebook page
-- picture. Places that have a link and still no picture are looked at again
-- at the next run instead of waiting out the retry window.
update public.places
   set enriched_at = null
 where status = 'active'
   and image_url is null
   and (website is not null or facebook is not null);
