# Reconcile-enforce runbook — silent-cancellation archiver

How to validate and flip `wa_reconcile_absent_picks` from **dry-run** to **enforce**, and how to roll back. This is the one open item from ROADMAP → P2. Read the silent-cancellation design first: `CLAUDE.md` → "Pick lifecycle", and migrations `20260609_last_seen_and_absence_reconcile.sql` + `20260609_reconcile_absences_per_source.sql`.

## What it does

`picks.last_seen_at` is bumped every crawl, for every event a snapshot source still lists, by each scraper's `bumpSeen()`. A future-dated pick whose `last_seen_at` goes stale (default 3 days) is a **candidate** for silent cancellation. `wa_reconcile_absent_picks(p_enforce, p_grace_days)` runs daily (`wa-reconcile-absent`, 05:00 UTC):

- **Dry-run** (`p_enforce=false`, current): logs the candidate count + a 50-id sample to `ingest_log (fn='reconcile-absent')`. **Archives nothing.**
- **Enforce** (`p_enforce=true`): archives candidates with `archived_at=now(), archive_reason='source_absent'`. Reversible.

Only sources with `sources.reconcile_absences = true` are considered (the genuine full-snapshot crawls). `echogonewrong` (RSS) and `ra-vilnius` (hand-invoke) are deliberately excluded.

## Validation — the dry-run has converged

The candidate count fell as the scrapers started feeding `last_seen`, exactly as designed:

| Date | Candidates | Note |
|---|---|---|
| Jun 9 | 233 | initial baseline — `last_seen_at` just backfilled to `created_at`, so everything looks stale |
| Jun 9 | 220 | after the per-source opt-in (echogonewrong excluded) |
| Jun 10 | 116 | scrapers bumping `last_seen` on their first instrumented crawls |
| Jun 11 | **8** | converged |
| Jun 12 | **8** | stable — 2 consecutive days |

This is the proof the signal works: had this been in enforce mode on Jun 9 it would have wrongly archived 233 live events.

## Before you flip — the Fienta caveat (do not skip)

As of Jun 12 **all 8 stable candidates are Fienta** (paavli-kultuurivabrik 5, Von Krahl `15` 3); **zero** are from the web scrapers. Two readings:

1. The web scrapers' `last_seen` bump is working — good.
2. **Fienta events can leave the org feed for reasons other than cancellation** — sales window closed, sold out, or the event moved orgs. Absence there is a weaker cancellation signal than a venue's "all events" page dropping a row.

So **do not blanket-enforce yet.** Two safe paths:

- **Recommended — web-first enforce.** Enforce only the venue-page scrapers (where absence ≈ removed), keep Fienta in dry-run until its absence semantics are confirmed:
  ```sql
  -- temporarily narrow to web snapshot sources, then enforce
  -- (verify the list first: SELECT channel,kind,reconcile_absences FROM sources WHERE reconcile_absences;)
  ```
  The cleanest implementation is a `p_kinds` guard or a second flag; until that's added, web sources currently produce 0 candidates anyway, so enforcing as-is would archive only the 8 Fienta rows — which is exactly what we're NOT sure about. **Therefore: confirm Fienta first.**
- **Confirm Fienta, then enforce all.** Open the 8 candidate Fienta events on fienta.com (ids in the latest `reconcile-absent` `sample_ids`). If they 404 / show cancelled → absence = cancellation, enforce is safe. If they're live but off the org feed → Fienta needs a different signal; leave it in dry-run and set `reconcile_absences=false` on the two Fienta channels.

## Flip to enforce

Decision gate (all must hold):
1. Candidate count stable (±small) for **≥3 consecutive days** — currently 2 (Jun 11–12). Wait one more day.
2. The latest `sample_ids` spot-checked against the live sources and confirmed actually gone.
3. Fienta caveat resolved (above).

Then re-point the cron from dry-run to enforce:

```sql
SELECT cron.schedule('wa-reconcile-absent', '0 5 * * *',
                     $$SELECT wa_reconcile_absent_picks(true, 3)$$);
```

Run once by hand first and read the result before trusting the cron:

```sql
SELECT wa_reconcile_absent_picks(true, 3);   -- returns the number archived
```

## Rollback

`source_absent` archival is fully reversible — un-archive everything it touched:

```sql
UPDATE picks
   SET archived_at = NULL, archive_reason = NULL
 WHERE archive_reason = 'source_absent';

-- and return the cron to dry-run
SELECT cron.schedule('wa-reconcile-absent', '0 5 * * *',
                     $$SELECT wa_reconcile_absent_picks(false, 3)$$);
```

(Re-archiving by `valid_until` still happens normally via `archive-stale`; this only undoes the absence-based archival.)

## Monitor after enforce

- `ingest_log (fn='reconcile-absent')` — `inserted` is now the number archived per run. A sudden spike means a scraper broke (its events stopped being seen) — investigate the scraper, don't trust the archival. Cross-check against `wa-ingest-health` (`fn='ingest-health'`, the zero-yield check).
- Watch for "my saved event vanished" reports: a `source_absent` pick a user bookmarked will surface in Saved as a "no longer listed" gone-row (correct behaviour, but a false positive here means a scraper regression).

## Who / cadence

Owner's call to flip. Re-read this file at the flip; update the table above if the count drifts before then.
