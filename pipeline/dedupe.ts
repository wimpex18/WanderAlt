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
    for (const k of this.byWhere.get(where) ?? []) {
      if (Math.abs(k.start - start) <= 30 * 60_000 && overlap(k.title, title) >= 0.6) return k.id;
    }
    return null;
  }
}
