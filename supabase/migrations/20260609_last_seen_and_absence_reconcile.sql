-- ============================================================
-- Silent-cancellation detection — last_seen_at + dry-run reconcile
-- ------------------------------------------------------------
-- Applied 2026-06-09. Companion to the snapshot-scraper change that bumps
-- picks.last_seen_at every crawl for every event a source still lists
-- (ingest-telliskivi/kinobize/splendidpalace/fienta + the deployed-only
-- hanzasperons/echogonewrong/hel-linkedevents).
--
-- A future-dated pick from a full-snapshot source (web/fienta) whose
-- last_seen_at goes stale is likely silently cancelled/removed.
--
-- The reconcile ships DRY-RUN (p_enforce=false): it only logs candidates to
-- ingest_log, archives nothing — so the last_seen signal can be validated
-- for ~a week before it ever hides a live event. Flip to enforce later by
-- scheduling wa_reconcile_absent_picks(true, …). Telegram/RSS are append
-- streams (absence is meaningless) and are excluded by the web/fienta filter.
-- ============================================================

ALTER TABLE picks ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
UPDATE picks SET last_seen_at = coalesce(created_at, now()) WHERE last_seen_at IS NULL;
ALTER TABLE picks ALTER COLUMN last_seen_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION wa_reconcile_absent_picks(
  p_enforce boolean DEFAULT false,
  p_grace_days int DEFAULT 3
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE cand_ids text[]; n integer;
BEGIN
  SELECT array_agg(p.id) INTO cand_ids
  FROM picks p
  JOIN staging_messages s ON s.id = p.source_message_id
  JOIN sources src        ON src.id = s.source_id
  WHERE p.archived_at IS NULL
    AND p.auto_generated IS TRUE
    AND p.valid_until > now()
    AND p.last_seen_at < now() - (p_grace_days || ' days')::interval
    AND src.kind IN ('web','fienta');

  n := coalesce(array_length(cand_ids, 1), 0);

  INSERT INTO ingest_log(fn, status, inserted, detail, finished_at)
  VALUES ('reconcile-absent', 'ok',
          CASE WHEN p_enforce THEN n ELSE 0 END,
          jsonb_build_object('enforce', p_enforce, 'grace_days', p_grace_days,
                             'candidates', n, 'sample_ids', to_jsonb(cand_ids[1:50])),
          now());

  IF p_enforce AND n > 0 THEN
    UPDATE picks SET archived_at = now(), archive_reason = 'source_absent',
                     tonight = false, this_week = false
     WHERE id = ANY(cand_ids);
  END IF;

  RETURN n;
END $$;

-- Daily, DRY-RUN, 3-day grace. cron.schedule upserts by name.
SELECT cron.schedule('wa-reconcile-absent', '0 5 * * *',
                     $$SELECT wa_reconcile_absent_picks(false, 3)$$);
