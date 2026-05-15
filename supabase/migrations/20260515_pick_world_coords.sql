-- ============================================================
-- wa_pick_world_coords()
-- Map (neighborhood, lat, lng) → (world_x, world_y) for the illustrated
-- Tallinn SVG (1800×1200). The map is stylized — Old Town is enlarged
-- in the centre, Pirita squished to the east — so a pure affine fit
-- doesn't match the artistic placements.
--
-- Strategy:
--   1. Neighborhood centroid lookup (hand-tuned against the SVG labels)
--   2. lat/lng linear fallback when neighborhood is unrecognized
--   3. Last-resort: drop in the city centre with wide jitter
-- A deterministic per-pick jitter (~±60 px) prevents pin stacking.
-- ============================================================
CREATE OR REPLACE FUNCTION wa_pick_world_coords(
  neighborhood text,
  lat double precision DEFAULT NULL,
  lng double precision DEFAULT NULL,
  seed text DEFAULT ''
)
RETURNS TABLE (world_x integer, world_y integer)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cx int;
  cy int;
  jitter_x int;
  jitter_y int;
  n_lower text;
BEGIN
  n_lower := lower(coalesce(neighborhood, ''));

  -- 1. Neighborhood centroid lookup
  SELECT v.cx, v.cy INTO cx, cy FROM (VALUES
    ('vanalinn',         1100,  720),
    ('old town',         1100,  720),
    ('kalamaja',          450,  550),
    ('telliskivi',        700,  480),
    ('põhja-tallinn',     450,  380),
    ('pohja-tallinn',     450,  380),
    ('north tallinn',     450,  380),
    ('kadriorg',         1430,  650),
    ('noblessner',        700,  280),
    ('rotermann',        1180,  740),
    ('pirita',           1700,  620),
    ('mustamäe',          350,  980),
    ('mustamae',          350,  980),
    ('lasnamäe',         1700,  950),
    ('lasnamae',         1700,  950),
    ('ülemiste',         1500, 1000),
    ('ulemiste',         1500, 1000),
    ('kristiine',         550,  800),
    ('haabersti',         150,  700),
    ('nõmme',             450, 1100),
    ('nomme',             450, 1100)
  ) AS v(n, cx, cy)
  WHERE v.n = n_lower
  LIMIT 1;

  IF cx IS NOT NULL THEN
    jitter_x := (abs(hashtext(seed || 'x')) % 121) - 60;
    jitter_y := (abs(hashtext(seed || 'y')) % 121) - 60;
    world_x := cx + jitter_x;
    world_y := cy + jitter_y;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 2. Linear fallback from lat/lng
  IF lat IS NOT NULL AND lng IS NOT NULL THEN
    world_x := GREATEST(100, LEAST(1700, ((lng - 24.65) / 0.22 * 1500 + 200)::int));
    world_y := GREATEST(100, LEAST(1100, ((59.475 - lat) / 0.07 * 850 + 200)::int));
    RETURN NEXT;
    RETURN;
  END IF;

  -- 3. Last resort: city centre with wide jitter (unmapped picks)
  jitter_x := (abs(hashtext(seed || 'x')) % 401) - 200;
  jitter_y := (abs(hashtext(seed || 'y')) % 401) - 200;
  world_x := 900 + jitter_x;
  world_y := 700 + jitter_y;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION wa_pick_world_coords(text, double precision, double precision, text)
  TO anon, authenticated, service_role;
