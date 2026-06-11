-- ============================================================
-- Zero-yield ingest alerting (ROADMAP P2, June 2026).
-- "A dead source looks identical to a quiet week": a scraper whose
-- target markup changed parses zero events but still logs status='ok'.
-- This check runs centrally (no per-scraper redeploys): once a day it
-- scans ingest_log for ingest-% functions whose THREE most recent runs
-- all yielded inserted=0 and skipped=0, and writes ONE summary row
-- (fn='ingest-health', status='warn') listing the offenders — which
-- the admin pipeline panel surfaces like any other ingest_log row.
-- No offenders → a quiet 'ok' row.
-- Journal entry — applied to production 2026-06-11 via MCP as
-- migration `ingest_zero_yield_health_check`; cron `wa-ingest-health`
-- scheduled daily 06:10 UTC (after the night's ingest crons).
-- ============================================================
CREATE OR REPLACE FUNCTION wa_ingest_zero_yield_check()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  offenders jsonb;
BEGIN
  WITH ranked AS (
    SELECT fn, inserted,
           COALESCE((detail->>'skipped')::int, 0) AS skipped,
           finished_at,
           ROW_NUMBER() OVER (PARTITION BY fn ORDER BY finished_at DESC) AS rn
    FROM ingest_log
    WHERE fn LIKE 'ingest-%'
      AND status = 'ok'
      AND finished_at > now() - interval '14 days'
  ),
  last3 AS (
    SELECT fn,
           COUNT(*) AS runs,
           MAX(finished_at) AS newest,
           BOOL_AND(inserted = 0 AND skipped = 0) AS all_zero
    FROM ranked
    WHERE rn <= 3
    GROUP BY fn
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('fn', fn, 'runs', runs, 'newest', newest)), '[]'::jsonb)
    INTO offenders
  FROM last3
  WHERE runs >= 3 AND all_zero;

  INSERT INTO ingest_log (fn, finished_at, status, inserted, rejected, detail)
  VALUES (
    'ingest-health',
    now(),
    CASE WHEN jsonb_array_length(offenders) > 0 THEN 'warn' ELSE 'ok' END,
    0, 0,
    jsonb_build_object(
      'check', 'zero_yield',
      'note',  'fns whose 3 most recent ok-runs all yielded 0 inserted + 0 skipped (possible dead parser)',
      'offenders', offenders
    )
  );
END;
$$;

SELECT cron.schedule('wa-ingest-health', '10 6 * * *', 'SELECT wa_ingest_zero_yield_check()');
