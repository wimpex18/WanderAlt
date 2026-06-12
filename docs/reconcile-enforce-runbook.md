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

## Current status — ENFORCE (web sources only), since Jun 12 2026

The cron runs `wa_reconcile_absent_picks(true, 3)`. **Fienta is excluded** (`reconcile_absences=false` on both Fienta channels). Web-source candidate set was 0 at flip, so nothing was archived on enable — the machinery is live and will archive genuine web-venue cancellations going forward.

### Why Fienta was excluded (the investigation that flipped the decision)

All 8 stable candidates were Fienta, and spot-checking them against the live `fienta.com/o/…?format=json` feed showed the absence signal is **unreliable**:

| Candidate | Live feed | Verdict |
|---|---|---|
| Nikki Nair, EYEHATEGOD, Drew McDowall (paavli) | absent | genuinely gone ✓ |
| **Starbenders** (paavli, Jul 2) | **present** | **false positive** ✗ |
| **Napalm Death** (paavli, Nov 17) | **present** | **false positive** ✗ |

The false positives have `last_seen_at` stuck at their May-16 creation date despite being listed — because **`ingest-fienta` is under-processing the feed** (logs `status='ok'` but only ~2 events ingested per run vs ~13+ in each org feed). Until that scraper bug is fixed, Fienta absence ≠ cancellation. **Do not re-enable `reconcile_absences` on Fienta until `ingest-fienta` reliably bumps `last_seen` for every listed event** (verify: after a run, `SELECT count(*) FROM picks p JOIN … WHERE src.kind='fienta' AND last_seen_at::date=now()::date` should ≈ the number of active Fienta picks still in the feed, not 2).

The 8 stale Fienta candidates were **not** archived (2+ are live). They have `day=null` + a synthetic `valid_until=2026-08-14`; they'll expire via `archive-stale` then, or get cleaned when ingest-fienta is fixed.

### To re-enable a source for enforce later

```sql
UPDATE sources SET reconcile_absences = true WHERE channel = '<channel>';
-- then watch one dry-run-equivalent: temporarily SELECT wa_reconcile_absent_picks(false, 3)
-- and spot-check the sample_ids before trusting the enforcing cron.
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
