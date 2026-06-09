-- ============================================================
-- Reconcile refinement — per-source opt-in (sources.reconcile_absences)
-- ------------------------------------------------------------
-- Applied 2026-06-09. Replaces the broad `kind IN ('web','fienta')` filter
-- in wa_reconcile_absent_picks with an explicit per-source flag.
--
-- Rationale: a source only qualifies for absence-based cancellation
-- detection if EACH crawl returns the COMPLETE current listing (so a missing
-- event genuinely means removed). `echogonewrong` is kind='web' but a
-- recent-items RSS feed — items age off the feed naturally, which the old
-- filter would misread as cancellations. `ra-vilnius` is hand-invoke-only
-- (no scheduled crawl). New sources default false (safe: never reconciled
-- until explicitly opted in).
-- ============================================================

ALTER TABLE sources ADD COLUMN IF NOT EXISTS reconcile_absences boolean NOT NULL DEFAULT false;

-- The genuine full-snapshot sources: web venue pages that list the whole
-- upcoming programme each crawl, plus Fienta (full org event list).
UPDATE sources SET reconcile_absences = true
 WHERE channel IN ('telliskivi','kinobize','splendidpalace','hanzasperons','hel-linkedevents')
    OR kind = 'fienta';

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
    AND src.reconcile_absences = true;

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
