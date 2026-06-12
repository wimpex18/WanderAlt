-- ============================================================
-- Fix two crons that 401'd — restores Helsinki ingestion + nightly context
-- ------------------------------------------------------------
-- Applied 2026-06-12. Found while validating the reconcile: edge-function
-- logs showed `ingest-hel-linkedevents` and `generate-context` returning
-- 401. Root cause: both crons POST with `headers := {'Content-Type': ...}`
-- and NO Authorization header, against functions deployed `verify_jwt:true`.
-- The healthy crons go through `public.invoke_wa_fn(fn)`, which sends the
-- anon Bearer. Fix = give these two the same auth (no function redeploy,
-- no verify_jwt change).
--
-- Symptom this masked: Helsinki had been silently not ingesting, and
-- `generate-context` (the "Why this matters" blurbs) had stopped running.
-- ============================================================

-- hel-linkedevents expects an empty body, so the standard helper fits.
SELECT cron.schedule('wa-ingest-hel-linkedevents', '50 3 * * *',
  $$SELECT public.invoke_wa_fn('ingest-hel-linkedevents')$$);

-- generate-context needs its {"limit":20} body, so keep a raw post but add
-- the Bearer the helper uses.
SELECT cron.schedule('generate-context-nightly', '30 2 * * *', $cron$
  SELECT net.http_post(
    url := 'https://aqnsmmbrspkbfcvougeh.supabase.co/functions/v1/generate-context',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA'
    ),
    body := '{"limit":20}'::jsonb,
    timeout_milliseconds := 60000
  )
$cron$);

-- NOTE: the better long-term fix is to make invoke_wa_fn accept an optional
-- body and route ALL crons through it, so no cron ever hand-rolls auth again.
-- Tracked as a follow-up; this migration just stops the active 401s.
