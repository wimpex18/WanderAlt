-- The venue's own logo or photo, beside the event's, so a listing without
-- artwork can show its venue's picture. Columns are appended: existing
-- readers are unaffected.
create or replace view public.picks with (security_invoker = true) as
 SELECT e.id,
    e.city,
    COALESCE(e.title_en, e.title) AS title,
    COALESCE(p.name, e.venue_name, ''::text) AS venue,
    e.place_id AS venue_id,
    COALESCE(p.neighborhood, ''::text) AS neighborhood,
    e.kind,
    to_char((e.starts_at AT TIME ZONE 'Europe/Tallinn'::text), 'Dy'::text) AS day,
        CASE
            WHEN e.has_time THEN to_char((e.starts_at AT TIME ZONE 'Europe/Tallinn'::text), 'HH24:MI'::text)
            ELSE NULL::text
        END AS "time",
    COALESCE(e.summary_en, ''::text) AS quote,
    COALESCE(( SELECT s.handle
           FROM event_sources es
             JOIN sources s ON s.id = es.source_id
          WHERE es.event_id = e.id
          ORDER BY es.first_seen_at
         LIMIT 1), ''::text) AS handle,
    false AS tonight,
    false AS this_week,
    e.image_url,
    e.image_attr,
    COALESCE(e.lat, p.lat) AS lat,
    COALESCE(e.lng, p.lng) AS lng,
    COALESCE(e.address, p.address) AS address,
    e.url AS source_url,
    e.description,
    e.starts_at,
    e.ends_at,
    e.ticket_url,
    e.is_free,
    e.price_min,
    e.price_max,
    e.currency,
    NULL::jsonb AS links,
    NULL::jsonb AS entities,
    e.last_seen_at,
    e.first_seen_at AS created_at,
    e.archived_at,
    "left"(e.description, 300) AS teaser,
    e.title AS original_title,
    e.tags,
    e.flag,
    e.event_languages,
    e.original_language,
    e.original_url,
    COALESCE(e.original_excerpt, "left"(e.description, 2000)) AS original_excerpt,
    e.language AS title_language,
    p.image_url AS venue_image_url,
    p.image_attr AS venue_image_attr,
    p.image_source AS venue_image_source
   FROM events e
     LEFT JOIN places p ON p.id = e.place_id;
