// Cancelled, postponed, sold out, few left: what a source says about an
// event's state, from its structured fields or its own words. Prose is
// read narrowly, because refund policies and "tickets sell out fast"
// mention the same words: a phrase counts in the title, or on a short
// line of the description where it is shouted (upper case) or leads.

import type { Flag } from './types.ts';

const RANK: Flag[] = ['cancelled', 'postponed', 'sold_out', 'few_left'];

/** The more serious of two flags. */
export const worse = (a: Flag | null | undefined, b: Flag | null | undefined): Flag | null => {
  if (!a) return b ?? null;
  if (!b) return a;
  return RANK.indexOf(a) <= RANK.indexOf(b) ? a : b;
};

/** Whole words in any script (JavaScript's \b only knows ASCII). */
const words = (alts: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, 'iu');

const PHRASES: [Flag, RegExp][] = [
  ['cancelled', words('cancell?ed|tühistatud|jääb ära|ära jäetud|отмен[её]н[оа]?|отмена')],
  ['postponed', words('postponed|edasi lükatud|lükkub edasi|new date|uus kuupäev|перенес[её]н[оа]?')],
  ['few_left', words('\\d{2}\\s?%\\s*sold\\s?out|(?:last|few) tickets(?: left)?|almost sold\\s?out|viimased piletid|последние билеты')],
  ['sold_out', words('sold\\s?out|välja müüdud|piletid on otsas|распродан[оы]?|билетов нет')],
];

const inText = (s: string): Flag | null => {
  for (const [flag, re] of PHRASES) if (re.test(s)) return flag;
  return null;
};

export function textFlag(title: string, description?: string | null): Flag | null {
  let found = inText(title);
  for (const raw of (description ?? '').split('\n').slice(0, 12)) {
    const line = raw.replace(/\(https?:[^)]*\)/g, '').trim();
    if (!line || line.length > 90) continue;
    const f = inText(line);
    if (!f) continue;
    const re = PHRASES.find(([k]) => k === f)![1];
    const m = re.exec(line)!;
    const shouted = m[0] === m[0].toUpperCase() && /\p{Lu}/u.test(m[0]);
    const leads = m.index <= 2;
    if (shouted || leads) found = worse(found, f);
  }
  return found;
}

/** schema.org eventStatus and offers availability. */
export function schemaFlag(eventStatus: unknown, availability: unknown): Flag | null {
  const s = String(eventStatus ?? ''), a = String(availability ?? '');
  if (/EventCancelled$/.test(s)) return 'cancelled';
  if (/EventPostponed$|EventRescheduled$/.test(s)) return 'postponed';
  if (/SoldOut$/.test(a)) return 'sold_out';
  if (/LimitedAvailability$/.test(a)) return 'few_left';
  return null;
}
