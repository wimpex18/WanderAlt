-- ============================================================
-- Auto-geocoding for picks
-- - Trigger: BEFORE INSERT/UPDATE on picks fills world_x/y when null,
--   using venue_details.lat/lng + wa_pick_world_coords().
-- - Catchup function: re-runs auto-pinning for picks left null after
--   their venue was enriched later. Driven by an hourly cron.
-- - Generic placeholder venues ("Various venues" etc.) are skipped:
--   no real location → no pin.
-- ============================================================

CREATE OR REPLACE FUNCTION wa_is_generic_venue(v text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(trim(v), '') = ''
      OR lower(trim(v)) ~ '^(various|various venues|multiple|tbd|tba|tonight|see telegram|unknown)\.*$';
$$;

CREATE OR REPLACE FUNCTION wa_pick_autopin() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_lat double precision;
  v_lng double precision;
BEGIN
  IF NEW.world_x IS NOT NULL AND NEW.world_y IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF wa_is_generic_venue(NEW.venue) THEN
    RETURN NEW;
  END IF;

  SELECT lat, lng INTO v_lat, v_lng
  FROM venue_details
  WHERE city = NEW.city
    AND lower(trim(venue_key)) = lower(trim(NEW.venue))
  LIMIT 1;

  SELECT w.world_x, w.world_y INTO NEW.world_x, NEW.world_y
  FROM wa_pick_world_coords(NEW.neighborhood, v_lat, v_lng, NEW.id) w;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS picks_autopin_trigger ON picks;
CREATE TRIGGER picks_autopin_trigger
  BEFORE INSERT OR UPDATE OF venue, neighborhood ON picks
  FOR EACH ROW EXECUTE FUNCTION wa_pick_autopin();

CREATE OR REPLACE FUNCTION wa_geocode_picks(batch_size int DEFAULT 200)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  pinned int := 0;
BEGIN
  WITH targets AS (
    SELECT p.id, p.neighborhood, vd.lat AS vd_lat, vd.lng AS vd_lng
    FROM picks p
    LEFT JOIN venue_details vd
      ON vd.city = p.city
     AND lower(trim(vd.venue_key)) = lower(trim(p.venue))
    WHERE p.archived_at IS NULL
      AND (p.world_x IS NULL OR p.world_y IS NULL)
      AND NOT wa_is_generic_venue(p.venue)
    LIMIT batch_size
  ),
  updates AS (
    SELECT t.id, w.world_x, w.world_y
    FROM targets t,
         LATERAL wa_pick_world_coords(t.neighborhood, t.vd_lat, t.vd_lng, t.id) w
  )
  UPDATE picks p
  SET world_x = u.world_x, world_y = u.world_y
  FROM updates u
  WHERE p.id = u.id;

  GET DIAGNOSTICS pinned = ROW_COUNT;
  RETURN pinned;
END;
$$;

SELECT cron.schedule('wa-geocode-picks-hourly', '15 * * * *',
  $$ SELECT wa_geocode_picks(); $$);

GRANT EXECUTE ON FUNCTION wa_is_generic_venue(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION wa_geocode_picks(int)     TO authenticated, service_role;
