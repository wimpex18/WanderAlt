// An exhibition that opened before today is still on until it closes. A model-read page (a gallery's
// programme, read by extractEvents in llm.ts) gives it as one listing from its opening to its closing
// day, and every listing whose start was more than six hours ago was dropped there, so a show that
// opened last week and runs into December never reached the guide. Structured readers (kai.ts) already
// keep such a run with its own opening as the start and its closing as the end; the app reads a listing
// whose start is before today and whose end is not yet past as a run that is on (render.js runningSpan,
// joinable: an exhibition takes visitors in while it is on), so nothing is moved or invented here.
//
// Two narrow checks, for the two places the rule belongs (neither file is changed here):
//   stillOn: in extractEvents, before a model's listing is dropped for a passed start: kept when it is
//     a run with a stated end on a later day that has not passed. Nothing is known of its kind yet.
//   keepStarted: after classification, for model-read sources only: of those runs, an exhibition stays;
//     a film season, a festival or anything else that has started is dropped as before.

import { tallinnDay } from '../time.ts';

/** How long after its start a listing still counts as ahead (llm.ts and the structured readers). */
export const STARTED_MS = 6 * 3600_000;

/** A listing that started more than STARTED_MS ago: is it a run that is still on? A stated end on a later
 *  Tallinn day than the start, not yet over; an end at local midnight is a date and means that whole day. */
export function stillOn(startsAt: string, endsAt: string | null | undefined, now = Date.now()): boolean {
  const start = Date.parse(startsAt), end = Date.parse(endsAt ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  if (tallinnDay(new Date(end).toISOString()) <= tallinnDay(new Date(start).toISOString())) return false;
  const dateOnly = tallinnDay(new Date(end).toISOString()) !== tallinnDay(new Date(end - 1).toISOString());
  return (dateOnly ? end + 86_400_000 : end) > now;
}

/** After classification: a listing whose start has passed stays only as an exhibition that is still on. */
export function keepStarted(c: { starts_at: string; ends_at?: string | null }, kind: string, now = Date.now()): boolean {
  const start = Date.parse(c.starts_at);
  if (!Number.isFinite(start) || start >= now - STARTED_MS) return true;
  return kind === 'exhibition' && stillOn(c.starts_at, c.ends_at, now);
}
