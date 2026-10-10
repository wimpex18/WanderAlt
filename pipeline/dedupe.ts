// Two sources describing one show rarely agree on its title ("Screening at
// Kai Cinema: Sisters" on Fienta, "Sisters" on the venue's page), so an
// exact id is not enough. A candidate joins an existing event when both
// happen at the same place within half an hour and their titles share
// most of their words. One page of the organiser's can also list a show under
// venue names that do not agree ("Põhjala tehas", "Pihjala factory"): the same
// address, the same title and the same start are then one show, whatever the
// venue was called.

import { nameKey } from './util.ts';
import { localDay } from './time.ts';

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

/** Words that say what kind of event it is, not which one: two titles sharing only these are two shows. */
const KIND_WORDS = new Set(['kontsert', 'concert', 'festival', 'jazz', 'live', 'session', 'sessions', 'party', 'night', 'club', 'klubi', 'show',
  'tour', 'band', 'trio', 'quartet', 'quiz', 'open', 'esitleb', 'presents', 'project', 'projekt', 'проект', 'концерт', 'вечеринка', 'джаз',
  'международный', 'tallinn', 'tallinna', 'with', 'from', 'feat', 'plus', 'koos', 'ning', 'the', 'and']);
const marks = (title: string) => new Set(nameKey(title).split(' ').filter(w => w.length >= 4 && !KIND_WORDS.has(w)));

/** Titles of one show: most of the words agree, or two distinctive words are shared ("Toms Rudzinskis" in a
 *  Telegram roundup's Russian title and in the club's own). */
export function sameTitle(a: string, b: string): boolean {
  if (overlap(a, b) >= 0.6) return true;
  const x = marks(a), y = marks(b);
  return [...x].filter(w => y.has(w)).length >= 2;
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

/** A live event as one source item listed it before (event_sources.raw_item_id). */
export interface Listed { id: string; title: string; start: number; has_time: boolean }

/** The row a source item listed before, when the item is one occurrence (Fienta, JSON-LD, WordPress)
 *  and still names the same show: a moved start ("10:00" → "12:30") updates that row instead of
 *  adding a second, and the event id stays the one saves and lists hold. When an earlier move left
 *  several rows, the one with the same date-only or timed shape wins, a timed one before a
 *  date-only one, then the nearest start. */
export function earlierListing(title: string, start: number, hasTime: boolean, listed: Listed[]): string | null {
  const same = listed.filter(k => overlap(k.title, title) >= 0.6);
  same.sort((a, b) => Number(b.has_time === hasTime) - Number(a.has_time === hasTime) || Number(b.has_time) - Number(a.has_time)
    || Math.abs(a.start - start) - Math.abs(b.start - start) || a.id.localeCompare(b.id));
  return same[0]?.id ?? null;
}

export interface StoredEvent {
  id: string; title: string; place_id: string | null; starts_at: string; url?: string | null;
  first_seen_at: string; status: string; has_time: boolean;
}

export type EventPair = { duplicate: StoredEvent; canonical: StoredEvent };

/** Published rows first, then the oldest: the id that saves, links and lists already hold. */
const rank = (a: StoredEvent, b: StoredEvent) => Number(b.status === 'published') - Number(a.status === 'published') ||
  a.first_seen_at.localeCompare(b.first_seen_at) || a.id.localeCompare(b.id);
/** The same, but merge_events needs a canonical with a place: a placed row is preferred over an older unplaced one. */
const prefer = (a: StoredEvent, b: StoredEvent) => Number(b.status === 'published') - Number(a.status === 'published') ||
  Number(!!b.place_id) - Number(!!a.place_id) || rank(a, b);
const pairOf = (a: string, b: string) => [a, b].sort().join('|');

/** A date-only row of a show another source lists with its time, at the same place on the same local day:
 *  "Pantheon" (12.10, no time) from a roundup and "Pantheon / Viimast korda!" at 19:00 from the theatre. The
 *  timed row carries the show, so the date-only one joins it (merge_events keeps the canonical's time).
 *  Only when exactly one start of the show is listed that day (two timed rows are two sessions), never a
 *  published row into an unpublished one, never two unpublished rows, and never a pair a person undid. */
export function dateOnlyJoins(tz: string, events: StoredEvent[], separate = new Set<string>()): EventPair[] {
  const out: EventPair[] = [];
  const timed = events.filter(e => e.has_time && e.place_id);
  for (const d of events) {
    if (d.has_time || !d.place_id) continue;
    const day = localDay(d.starts_at, tz);
    const same = timed.filter(t => t.place_id === d.place_id && localDay(t.starts_at, tz) === day && sameTitle(t.title, d.title));
    if (new Set(same.map(t => Date.parse(t.starts_at))).size !== 1) continue;
    const canonical = [...same].sort(prefer)[0];
    if (canonical.status !== 'published' || separate.has(pairOf(d.id, canonical.id))) continue;
    out.push({ duplicate: d, canonical });
  }
  return out;
}

/** Reconcile old copies after their venue ids become canonical. Same
 *  title/time thresholds as ingestion; published/oldest ids win. With the
 *  source items each row was listed from, rows one item left behind join
 *  too (sameItemEvents), after the pairs above. */
export function duplicateEvents(tz: string, events: StoredEvent[], separate = new Set<string>(), listings: ItemListing[] = []): EventPair[] {
  const sorted = events.slice().sort(rank);
  const seen = new Seen(), byId = new Map<string, StoredEvent>(), out: EventPair[] = [];
  for (const e of sorted) {
    const same = seen.matchUrl(e.title, e.url, Date.parse(e.starts_at));
    const twin = same ? byId.get(same) : undefined;
    // merge_events also needs the canonical row to have a place and the same date-only or timed kind.
    if (twin && twin.place_id && twin.has_time === e.has_time && !separate.has([same!, e.id].sort().join('|'))) { out.push({ duplicate: e, canonical: twin }); continue; }
    if (e.url) { seen.add({ id: e.id, title: e.title, where: '', start: Date.parse(e.starts_at), url: e.url }); byId.set(e.id, e); }
    if (!e.place_id) continue;
    // Date-only listings cannot prove they describe a timed occurrence.
    const where = `${e.place_id}|${e.has_time}`;
    const matched = seen.match(e.title, where, Date.parse(e.starts_at));
    if (matched && !separate.has([matched, e.id].sort().join('|'))) out.push({ duplicate: e, canonical: byId.get(matched)! });
    else { seen.add({ id: e.id, title: e.title, where, start: Date.parse(e.starts_at) }); byId.set(e.id, e); }
  }
  if (!listings.length) return out;
  // merge_events refuses a duplicate that is already another row's canonical.
  const gone = new Set(out.map(p => p.duplicate.id)), kept = new Set(out.map(p => p.canonical.id));
  for (const p of sameItemEvents(tz, events.filter(e => !gone.has(e.id)), listings, separate)) if (!kept.has(p.duplicate.id)) out.push(p);
  return out;
}

/** A row's listing by one source item (event_sources.raw_item_id). `single` says the source's items are
 *  one show each (oneShowPerItem). */
export interface ItemListing { event_id: string; raw_item_id: number; single: boolean }

/** Sources whose every item is one show: a Fienta event, a JSON-LD event node, a WordPress event post
 *  in the default (Kultuurikatel) shape. A Kai post carries every screening of its film; Vaba Lava's
 *  items now are one show each, but their id holds the date and time (a moved start is a new item) and
 *  its first reading made the whole programme page one item; a model reads posts and pages that list
 *  many shows. */
export const oneShowPerItem = (kind: string, shape?: unknown) =>
  kind === 'fienta' || kind === 'jsonld' || (kind === 'wordpress' && !shape);

/** Rows one source item left behind: the pipeline once made a second row when the item came back with
 *  a moved start (the id hashes the start), and a model's reading of a post can give a date alone and,
 *  read again, the time. merge_events lets such a pair differ in start and in date-only or timed kind,
 *  and gives the canonical the occurrence of the newer listing, or of the timed row on a shared day.
 *  - An item of a one-show source (oneShowPerItem): every row that still names the show (titles share
 *    0.6 of their words) is that show, wherever its start went.
 *  - An item of any source: a date-only row and a timed row on the same Tallinn day with that title,
 *    when the item gives that day one time only; two times on one day are two sessions.
 *  - Never two timed rows of a source whose item can list several shows (a post's dates, a film's
 *    screenings), nor rows one reading made together (the same first_seen_at), nor a pair a person
 *    undid (`separate`), nor two rejected rows (nothing a reader or reviewer sees would change).
 *  The canonical is the published, then placed, then oldest row, so saves keep their id and a published
 *  listing is never folded into a rejected one; merge_events needs it to have a place, and the two rows
 *  to share it or their page. */
export function sameItemEvents(tz: string, events: StoredEvent[], listings: ItemListing[], separate = new Set<string>()): EventPair[] {
  const byId = new Map(events.map(e => [e.id, e]));
  const items = new Map<number, { single: boolean; rows: StoredEvent[] }>();
  for (const l of listings) {
    const e = byId.get(l.event_id);
    if (!e) continue;
    const item = items.get(l.raw_item_id) ?? { single: l.single, rows: [] };
    if (!item.rows.includes(e)) item.rows.push(e);
    items.set(l.raw_item_id, item);
  }
  const out: EventPair[] = [], gone = new Set<string>(), kept = new Set<string>();
  const join = (a: StoredEvent, b: StoredEvent) => {
    const [canonical, duplicate] = [a, b].sort(prefer);
    if (gone.has(canonical.id) || gone.has(duplicate.id) || kept.has(duplicate.id)) return false;
    if (!canonical.place_id || (canonical.place_id !== duplicate.place_id && (!duplicate.url || duplicate.url !== canonical.url))) return false;
    if (a.first_seen_at === b.first_seen_at || separate.has(pairOf(a.id, b.id))) return false;
    if (a.status === 'rejected' && b.status === 'rejected') return false;
    out.push({ duplicate, canonical });
    gone.add(duplicate.id); kept.add(canonical.id);
    return true;
  };
  for (const [, item] of [...items].sort((a, b) => a[0] - b[0])) {
    if (item.rows.length < 2) continue;
    const rows = item.rows.slice().sort(prefer);
    if (item.single) {
      const heads: StoredEvent[] = [];
      for (const r of rows) if (!gone.has(r.id) && !heads.some(h => overlap(h.title, r.title) >= 0.6 && join(h, r))) heads.push(r);
    }
    for (const r of rows) {
      if (r.has_time || gone.has(r.id)) continue;
      const day = localDay(r.starts_at, tz);
      const timed = rows.filter(t => t.has_time && !gone.has(t.id) && localDay(t.starts_at, tz) === day && overlap(t.title, r.title) >= 0.6);
      if (new Set(timed.map(t => Date.parse(t.starts_at))).size !== 1) continue;
      for (const t of timed) if (join(t, r)) break;
    }
  }
  return out;
}
