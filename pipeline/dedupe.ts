// Two sources describing one show rarely agree on its title ("Screening at
// Kai Cinema: Sisters" on Fienta, "Sisters" on the venue's page), so an
// exact id is not enough. A candidate joins an existing event when both
// happen at the same place within half an hour and their titles share
// most of their words.

import { nameKey } from './util.ts';

export interface Known {
  id: string;
  title: string;
  where: string;       // place id, or the venue name key when there is no place
  start: number;       // epoch ms
}

const words = (s: string) => new Set(nameKey(s).split(' ').filter(w => w.length > 1));

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

  constructor(known: Known[] = []) {
    for (const k of known) this.add(k);
  }

  add(k: Known) {
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
}

export interface StoredEvent {
  id: string; title: string; place_id: string | null; starts_at: string;
  first_seen_at: string; status: string; has_time: boolean;
}

/** Reconcile old copies after their venue ids become canonical. Same
 *  title/time thresholds as ingestion; published/oldest ids win. */
export function duplicateEvents(events: StoredEvent[], separate = new Set<string>()): { duplicate: StoredEvent; canonical: StoredEvent }[] {
  const sorted = events.slice().sort((a, b) => Number(b.status === 'published') - Number(a.status === 'published') ||
    a.first_seen_at.localeCompare(b.first_seen_at) || a.id.localeCompare(b.id));
  const seen = new Seen(), byId = new Map<string, StoredEvent>(), out: { duplicate: StoredEvent; canonical: StoredEvent }[] = [];
  for (const e of sorted) {
    if (!e.place_id) continue;
    // Date-only listings cannot prove they describe a timed occurrence.
    const where = `${e.place_id}|${e.has_time}`;
    const matched = seen.match(e.title, where, Date.parse(e.starts_at));
    if (matched && !separate.has([matched, e.id].sort().join('|'))) out.push({ duplicate: e, canonical: byId.get(matched)! });
    else { seen.add({ id: e.id, title: e.title, where, start: Date.parse(e.starts_at) }); byId.set(e.id, e); }
  }
  return out;
}
