// Conservative identity matching. Distance alone never joins two venues:
// neighbouring galleries and separate halls are common in Tallinn.
import type { Place } from './places.ts';
import { nameKey } from './util.ts';

export const osmIds = (p: Place): string[] => [...new Set([p.osm_id, ...(p.osm_ids ?? [])].filter((s): s is string => !!s))];
export const placeNames = (p: Place): string[] => [...new Set([p.name, ...p.aliases].map(nameKey).filter(Boolean))];

export function metres(a: Pick<Place, 'lat' | 'lng'>, b: Pick<Place, 'lat' | 'lng'>): number | null {
  if (![a.lat, a.lng, b.lat, b.lng].every(v => typeof v === 'number' && Number.isFinite(v))) return null;
  return Math.hypot((a.lat! - b.lat!) * 111_320,
    (a.lng! - b.lng!) * 111_320 * Math.cos((a.lat! + b.lat!) * Math.PI / 360));
}

// Keep house/unit numbers: two branches at 60a/1 and 60a/8 are distinct.
export const addressKey = (s: string | null | undefined) => nameKey((s ?? '').split(',')[0]
  .replace(/\b(tänav|tn)\.?\s*/gi, ' ').replace(/\bmaantee\b/gi, 'mnt').replace(/\bpuiestee\b/gi, 'pst'));

const GENERIC = new Set(('tallinn tallinna eesti estonia sa ou mtu as club klubi kino cinema galerii gallery ' +
  'theatre teater baar bar pub cafe kohvik shop store raamatupood raamatukauplus').split(' '));
export const core = (s: string) => nameKey(s).split(' ').filter(w => !GENERIC.has(w)).join(' ');
const roomNumbers = (s: string) => nameKey(s).match(/\b\d+\b/g)?.join(' ') ?? '';

/** Normalised edit similarity, independent of input order. */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

export interface PlaceMatch {
  action: 'merge' | 'review';
  reason: string;
  distance: number | null;
  similarity: number;
}

export function comparePlaces(a: Place, b: Place): PlaceMatch | null {
  if (a.id === b.id || a.city !== b.city || a.merged_into || b.merged_into) return null;
  const distance = metres(a, b);
  const sameOsm = osmIds(a).some(id => osmIds(b).includes(id));
  const namesA = placeNames(a), namesB = placeNames(b);
  const exact = namesA.some(n => namesB.includes(n));
  const ca = core(a.name), cb = core(b.name);
  const similarity = Math.max(nameSimilarity(nameKey(a.name), nameKey(b.name)), nameSimilarity(ca, cb));
  const evidence = { distance, similarity };
  const closureConflict = (a.status === 'closed') !== (b.status === 'closed');
  if (sameOsm) return { ...evidence, action: (distance != null && distance > 250) || a.status === 'hidden' || b.status === 'hidden' || closureConflict ? 'review' : 'merge', reason: closureConflict ? 'closure status needs review' : 'same OSM identity' };
  const aa = addressKey(a.address), ab = addressKey(b.address);
  const sameAddress = !!aa && aa === ab;
  const near = distance != null && distance <= 100;
  if (!near && !sameAddress) return null;
  if (distance != null && distance > 150) return null; // conflicting coordinates beat an address label
  const distinctive = ca.length >= 4 && cb.length >= 4;
  const compatible = !a.kind || !b.kind || a.kind === b.kind;
  const numbersAgree = roomNumbers(a.name) === roomNumbers(b.name);
  const addressConflict = !!aa && !!ab && !sameAddress;
  const strong = exact || (distinctive && ca === cb) ||
    (distinctive && similarity >= 0.92 && (sameAddress || (distance != null && distance <= 40)));
  if (strong && compatible && numbersAgree && !addressConflict && a.status !== 'hidden' && b.status !== 'hidden' && !closureConflict) {
    return { ...evidence, action: 'merge', reason: exact ? 'same name nearby' : 'similar name and location' };
  }
  const shared = ca.split(' ').some(w => w.length >= 5 && cb.split(' ').includes(w));
  if (strong || (distinctive && similarity >= 0.72) || (shared && sameAddress)) {
    return { ...evidence, action: 'review', reason: 'name and location need review' };
  }
  return null;
}

/** Oldest stored id wins; a lexical tie-break makes every run agree. */
export const canonicalOrder = (a: Place, b: Place) =>
  (a.created_at ?? '9999').localeCompare(b.created_at ?? '9999') || a.id.localeCompare(b.id);

export const pairKey = (a: string, b: string) => [a, b].sort().join('|');

export function duplicatePlaces(places: Place[], separate = new Set<string>()): { duplicate: Place; canonical: Place; match: PlaceMatch }[] {
  const sorted = places.filter(p => !p.merged_into).slice().sort(canonicalOrder);
  const out: { duplicate: Place; canonical: Place; match: PlaceMatch }[] = [];
  const folded = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (folded.has(a.id)) continue;
    for (const b of sorted.slice(i + 1)) {
      if (folded.has(b.id)) continue;
      if (separate.has(pairKey(a.id, b.id))) continue;
      const match = comparePlaces(a, b);
      if (!match) continue;
      out.push({ duplicate: b, canonical: a, match });
      if (match.action === 'merge') folded.add(b.id);
    }
  }
  return out;
}
