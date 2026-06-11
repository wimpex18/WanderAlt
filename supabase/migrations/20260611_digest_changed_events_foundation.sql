-- ============================================================
-- Digest "your saved events changed" — server-side foundation
-- (June 2026, parked exploration approved by owner).
-- Design decision: the weekly digest is the brand's ONE sanctioned
-- change-notification channel (no push). To compose a per-recipient
-- block the server needs two things it lacked:
--   1. A recipient↔account link: digest_opt_ins carried email only.
--      Adds nullable user_id, captured at opt-in when signed in
--      (anonymous opt-ins keep working; they just get no saved-
--      changes block).
--   2. Change history: day/time edits overwrite in place. A trigger
--      now journals them to pick_changes; "no longer listed" needs
--      no history (archived_at + archive_reason are queryable).
-- send-digest v11 joins: opt_in.user_id → bookmarks → pick_changes
-- in the last 7 days + bookmarked picks archived in the window.
-- Journal entry — applied to production 2026-06-11 via MCP as
-- migration `digest_changed_events_foundation`; cron
-- `wa-purge-pick-changes` scheduled daily 04:50 UTC.
-- ============================================================

ALTER TABLE digest_opt_ins
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS pick_changes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pick_id    text NOT NULL,
  old_day    text,
  new_day    text,
  old_time   text,
  new_time   text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pick_changes_pick_window
  ON pick_changes (pick_id, changed_at DESC);

ALTER TABLE pick_changes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION wa_log_pick_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.day IS DISTINCT FROM OLD.day) OR (NEW.time IS DISTINCT FROM OLD.time) THEN
    INSERT INTO pick_changes (pick_id, old_day, new_day, old_time, new_time)
    VALUES (OLD.id, OLD.day, NEW.day, OLD.time, NEW.time);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS picks_log_change ON picks;
CREATE TRIGGER picks_log_change
  AFTER UPDATE OF day, "time" ON picks
  FOR EACH ROW EXECUTE FUNCTION wa_log_pick_change();

CREATE OR REPLACE FUNCTION wa_purge_old_pick_changes()
RETURNS void LANGUAGE sql AS
$$ DELETE FROM pick_changes WHERE changed_at < now() - interval '60 days' $$;
SELECT cron.schedule('wa-purge-pick-changes', '50 4 * * *', 'SELECT wa_purge_old_pick_changes()');
