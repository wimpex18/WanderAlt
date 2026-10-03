// Facts a venue states about itself that disagree with what we hold: a place that moved, closed
// or changed its hours. The venue's Instagram bio is read about once a month (one
// business_discovery call, shared with the hours cascade) and three things are compared:
//   address  a "📍 Telliskivi 60/2" or "Address:" line against the stored street and house number
//   hours    the bio's days and times against the stored hours, when both can be read
//   closure  wording such as "permanently closed" or "we have moved"
// Bios in Estonian, English and Russian are read. A disagreement is written to place_fact_flags for a person to look at. Nothing here changes a
// stored fact: bios are marketing copy, and a flag costs a minute where a wrong overwrite costs trust.
import type { Place } from './places.ts';
import { nameKey } from './util.ts';
import { bioHours } from './bio-hours.ts';
import { hoursAt } from './hours.ts';
import { instagramHandle, lookupBio, type InstagramConfig } from './instagram.ts';

export interface Finding { placeId: string; field: 'address' | 'hours' | 'closure'; stored: string | null; found: string }
const REVISIT_DAYS = 30;

const streetAndNumber = (raw: string): { street: string; number: string } | null => {
  const m = /^\s*([\p{L}][\p{L}.' \-]*?)\s+(\d{1,4})\s*[A-Za-z]?(?:\s*[/-]\s*\w+)?\s*$/u.exec(raw.split(',')[0].trim());
  return m ? { street: nameKey(m[1].replace(/(?<![\p{L}])(tänav|tn|ул|улица)\.?\s*/giu, ' ').replace(/\bmaantee\b/gi, 'mnt').replace(/\bpuiestee\b/gi, 'pst')), number: m[2] } : null;
};

/** The address a bio gives on a 📍 or "Address:" line, as written, or null. */
export function bioAddress(text: string | null | undefined): string | null {
  for (const line of String(text ?? '').split(/\n+/)) {
    const m = /(?:📍|\baddress\s*:|\baadress\s*:|адрес\s*:)\s*(.+)$/iu.exec(line);
    if (m && streetAndNumber(m[1])) return m[1].split(/[|•·]/)[0].trim();
  }
  return null;
}

/** True when two addresses name a different street or a different house number. */
export function addressDiffers(stored: string | null | undefined, found: string): boolean {
  const a = streetAndNumber(stored ?? ''), b = streetAndNumber(found);
  return !!a && !!b && (a.street !== b.street || a.number !== b.number);
}

const CLOSURE = /(permanently closed|closed (down )?for good|closed permanently|closing down|has closed|have closed|we('| ha)ve moved|we moved|moved to|new (location|address)|uus (asukoht|aadress)|oleme kolinud|kolisime|sulgesime|suletud jäädavalt|jäädavalt suletud|закрыт[аоы]? навсегда|окончательно закрыт|мы закрылись|мы переехали|переехали|новый адрес|новая локация)/iu;
/** The line of a bio that says the place closed or moved, or null. */
export function bioClosure(text: string | null | undefined): string | null {
  const line = String(text ?? '').split(/\n+/).find(l => CLOSURE.test(l));
  return line ? line.trim().slice(0, 140) : null;
}

/** Do two hours strings describe a different week? Half hours that one calls open and the other does
 *  not, as a share of the half hours either calls open: an extra day or a shifted evening counts, an
 *  opening time that moved by half an hour does not. */
export function hoursDiffer(a: string, b: string, share = 0.25): boolean {
  const base = Date.parse('2026-01-05T00:00:00Z');
  let apart = 0, union = 0;
  for (let i = 0; i < 7 * 48; i++) {
    const at = new Date(base + i * 30 * 60_000), x = hoursAt(a, at), y = hoursAt(b, at);
    if (x === 'unknown' || y === 'unknown') return false;
    if (x === 'open' || y === 'open') { union++; if (x !== y) apart++; }
  }
  return union > 0 && apart / union > share;
}

/** What a bio says that disagrees with the place's stored facts. */
export function findings(p: Place, bio: string): Finding[] {
  const out: Finding[] = [];
  const address = bioAddress(bio);
  if (address && addressDiffers(p.address, address)) out.push({ placeId: p.id, field: 'address', stored: p.address ?? null, found: address });
  const hours = bioHours(bio);
  if (hours && p.opening_hours && p.hours_source !== 'instagram' && hoursDiffer(p.opening_hours, hours)) out.push({ placeId: p.id, field: 'hours', stored: p.opening_hours, found: hours });
  const closure = bioClosure(bio);
  if (closure) out.push({ placeId: p.id, field: 'closure', stored: null, found: closure });
  return out;
}

/** Active places with an Instagram link not looked at in the last month, picked first. */
export function dueForDrift(places: Place[], now = Date.now()): Place[] {
  return places
    .filter(p => (p.status ?? 'active') === 'active' && !p.merged_into && instagramHandle(p.instagram)
      && (!p.facts_checked_at || now - Date.parse(p.facts_checked_at) > REVISIT_DAYS * 86_400_000))
    .sort((a, b) => Number(!!b.picked) - Number(!!a.picked) || (a.facts_checked_at ?? '').localeCompare(b.facts_checked_at ?? '') || a.id.localeCompare(b.id));
}

interface Deps { bio?: typeof lookupBio; bios?: Map<string, string>; log?: (s: string) => void; now?: number }

/** Read bios for up to `limit` due places. Bios already read this run (`bios`, filled by the hours
 *  cascade) cost no call. Returns the places looked at and what disagreed. */
export async function checkDrift(places: Place[], cfg: InstagramConfig, limit = 30, deps: Deps = {}): Promise<{ looked: Place[]; found: Finding[] }> {
  const bio = deps.bio ?? lookupBio, log = deps.log ?? console.log, now = deps.now ?? Date.now();
  const looked: Place[] = [], found: Finding[] = [];
  for (const p of dueForDrift(places, now).slice(0, limit)) {
    const handle = instagramHandle(p.instagram)!;
    let text = deps.bios?.get(handle.toLowerCase());
    if (text == null) {
      const r = await bio(handle, cfg);
      if (r.kind === 'stop') { log(`[drift] stopped: ${r.reason}`); break; }
      if (r.kind === 'found') text = r.biography;
    }
    p.facts_checked_at = new Date(now).toISOString();
    looked.push(p);
    if (text) for (const f of findings(p, text)) { found.push(f); log(`[drift] ${p.name}: ${f.field}: bio says "${f.found}", we hold ${f.stored ? `"${f.stored}"` : 'nothing'}`); }
  }
  log(`[drift] ${looked.length} bios compared, ${found.length} differences`);
  return { looked, found };
}
