-- ============================================================
-- Pick-lifecycle hygiene — de-duplication (A1) + purge (A3)
-- ------------------------------------------------------------
-- Applied 2026-06-09. Idempotent / re-runnable.
--
-- Context: the picks table had 128 duplicate groups among active rows
-- (sources re-posting the same event, or corrections posted as a NEW
-- message — a fresh `id`, so process-staging's upsert-by-id can't merge
-- them). Re-ingested EDITS to the same source message already update in
-- place (upsert onConflict id); this handles the cross-message duplicates.
--
-- Cancellations where a source SILENTLY drops an event (no new message)
-- are NOT handled here — that needs a per-scraper "last seen in source"
-- signal and is intentionally deferred.
-- ============================================================

-- Auditable archival reason; lets the frontend distinguish duplicate /
-- cancelled / past. Nullable; existing archived rows stay NULL.
ALTER TABLE picks ADD COLUMN IF NOT EXISTS archive_reason text;

-- A1 — archive EXACT-duplicate active picks (same city, venue, title, day
-- AND time, so genuine same-title different-session events are left alone).
-- Keep the single best row per group; archive the rest (reversible:
-- archived_at + archive_reason='duplicate'). Keep-ranking prefers, in order:
-- a bookmarked pick (protects users' Saved), one with a photo, one with
-- curator context, then the newest. Idempotent.
CREATE OR REPLACE FUNCTION wa_dedup_active_picks() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  WITH ranked AS (
    SELECT p.id,
      row_number() OVER (
        PARTITION BY lower(p.city), lower(coalesce(p.venue,'')), lower(p.title),
                     coalesce(p.day,''), coalesce(p.time,'')
        ORDER BY
          (EXISTS (SELECT 1 FROM bookmarks b WHERE b.pick_id = p.id)) DESC,
          (p.image_url IS NOT NULL) DESC,
          (p.context_md IS NOT NULL) DESC,
          p.created_at DESC,
          p.id DESC
      ) AS rn
    FROM picks p
    WHERE p.archived_at IS NULL
  )
  UPDATE picks p
     SET archived_at = now(), archive_reason = 'duplicate',
         tonight = false, this_week = false
    FROM ranked r
   WHERE p.id = r.id AND r.rn > 1;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- A3 — hard-delete picks archived for more than 90 days so the table stays
-- lean. Soft-archive (archived_at) remains the mechanism for the recent
-- "Past" window; this only removes the long tail.
CREATE OR REPLACE FUNCTION wa_purge_old_archived() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  DELETE FROM picks
   WHERE archived_at IS NOT NULL
     AND archived_at < now() - interval '90 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- One-time cleanup of the existing backlog (idempotent on re-run).
SELECT wa_dedup_active_picks();

-- Daily, after archive-stale (04:00) and rotate-tonight (04:05).
-- cron.schedule upserts by jobname, so re-running is safe.
SELECT cron.schedule('wa-dedup-picks',   '30 4 * * *', $$SELECT wa_dedup_active_picks()$$);
SELECT cron.schedule('wa-purge-archived', '45 4 * * *', $$SELECT wa_purge_old_archived()$$);
