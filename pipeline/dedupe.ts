// Two sources describing one show rarely agree on its title ("Screening at
// Kai Cinema: Sisters" on Fienta, "Sisters" on the venue's page), so an
// exact id is not enough. A candidate joins an existing event when both
// happen at the same place within half an hour and their titles share
// most of their words. One page of the organiser's can also list a show under
// venue names that do not agree ("Põhjala tehas", "Pihjala factory"): the same
// address, the same title and the same start are then one show, whatever the
// venue was called.

import { nameKey } from './util.ts';

export interface Known {
  id: string;
  title: string;
  where: string;       // place id, or the venue name key when there is no place
  start: number;       // epoch ms
  url?: string | null; // the page the listing came from
}

/* Repeated screening headers describe the format/room, not the film.
   Otherwise "Screening at Kai Cinema: Sisters" and "…: Nightborn"
   share four of five words and can erase a separate screening. */
const words = (s: string) => new Set(nameKey(s.replace(
  /^(?:(?:special\s+)?screening\s+(?:at|in)\s+[^:]{1,80}|linastus\s+[^:]{1,80})\s*:\s*/i, ''
)).split(' ').filter(w => w.length > 1));

/** Share of the shorter title's words that the longer one also has. */
export function overlap(a: string, b: string): number {
  const [x, y] = [words(a), words(b)].sort((p, q) => p.size - q.size);
  if (!x.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / x.size;
}

export class Seen {
  private byWhere = new Map<string, Known[]>();
  private byUrl = new Map<string, Known[]>();

  constructor(known: Known[] = []) {
    for (const k of known) this.add(k);
  }

  add(k: Known) {
    if (k.url) { const u = this.byUrl.get(k.url) ?? []; u.push(k); this.byUrl.set(k.url, u); }
    if (!k.where) return;
    const list = this.byWhere.get(k.where) ?? [];
    list.push(k);
    this.byWhere.set(k.where, list);
  }

  /** The id of an event this candidate duplicates, if any. */
  match(title: string, where: string, start: number): string | null {
    const matches = (this.byWhere.get(where) ?? []).filter(k => Math.abs(k.start - start) <= 30 * 60_000 && overlap(k.title, title) >= 0.6);
    matches.sort((a, b) => Math.abs(a.start - start) - Math.abs(b.start - start) ||
      overlap(b.title, title) - overlap(a.title, title) || a.id.localeCompare(b.id));
    return matches[0]?.id ?? null;
  }

  /** The same page, the same start and a near-identical title: one show, whatever its venue was called. */
  matchUrl(title: string, url: string | null | undefined, start: number): string | null {
    if (!url) return null;
    const hit = (this.byUrl.get(url) ?? []).filter(k => k.start === start && overlap(k.title, title) >= 0.9).sort((a, b) => a.id.localeCompare(b.id))[0];
    return hit?.id ?? null;
  }
}

export interface StoredEvent {
  id: string; title: string; place_id: string | null; starts_at: string; url?: string | null;
  first_seen_at: string; status: string; has_time: boolean;
}

/** Reconcile old copies after their venue ids become canonical. Same
 *  title/time thresholds as ingestion; published/oldest ids win. */
export function duplicateEvents(events: StoredEvent[], separate = new Set<string>()): { duplicate: StoredEvent; canonical: StoredEvent }[] {
  const sorted = events.slice().sort((a, b) => Number(b.status === 'published') - Number(a.status === 'published') ||
    a.first_seen_at.localeCompare(b.first_seen_at) || a.id.localeCompare(b.id));
  const seen = new Seen(), byId = new Map<string, StoredEvent>(), out: { duplicate: StoredEvent; canonical: StoredEvent }[] = [];
  for (const e of sorted) {
    const same = seen.matchUrl(e.title, e.url, Date.parse(e.starts_at));
    if (same && !separate.has([same, e.id].sort().join('|'))) { out.push({ duplicate: e, canonical: byId.get(same)! }); continue; }
    if (e.url) { seen.add({ id: e.id, title: e.title, where: '', start: Date.parse(e.starts_at), url: e.url }); byId.set(e.id, e); }
    if (!e.place_id) continue;
    // Date-only listings cannot prove they describe a timed occurrence.
    const where = `${e.place_id}|${e.has_time}`;
    const matched = seen.match(e.title, where, Date.parse(e.starts_at));
    if (matched && !separate.has([matched, e.id].sort().join('|'))) out.push({ duplicate: e, canonical: byId.get(matched)! });
    else { seen.add({ id: e.id, title: e.title, where, start: Date.parse(e.starts_at) }); byId.set(e.id, e); }
  }
  return out;
}
