import type { Place } from './places.ts';
import { osmIds, placeNames } from './place-match.ts';
import { closureReason, overpass, type OsmElement } from './osm.ts';
import { nameKey } from './util.ts';

const WEEK = 7 * 86_400_000;
export const duePlaces = (places: Place[], now = Date.now(), limit = 50) => places
  .filter(p => !p.merged_into && osmIds(p).length &&
    (!p.osm_checked_at || now - Date.parse(p.osm_checked_at) >= WEEK))
  .sort((a, b) => (a.osm_checked_at ?? '').localeCompare(b.osm_checked_at ?? '') || a.id.localeCompare(b.id))
  .slice(0, Math.max(0, Math.min(50, limit)));

export function identityQuery(places: Place[]): string {
  const ids = [...new Set(places.flatMap(osmIds))];
  const selectors = ['node', 'way', 'relation'].map(type => {
    const numeric = ids.map(id => new RegExp(`^${type}/([1-9]\\d*)$`).exec(id)?.[1]).filter(Boolean);
    return numeric.length ? `${type}(id:${numeric.join(',')});` : '';
  }).join('');
  if (!selectors) throw new Error('No valid OSM identities to check');
  return `[out:json][timeout:30];(${selectors});out center tags;`;
}

export function livenessPatch(p: Place, elements: OsmElement[], now = new Date().toISOString()): Partial<Place> {
  const ids = osmIds(p);
  const hits = elements.filter(el => ids.includes(`${el.type}/${el.id}`));
  const patch: Partial<Place> = { osm_checked_at: now };
  if (!hits.length) return { ...patch, osm_state: 'missing', osm_missing_count: (p.osm_missing_count ?? 0) + 1,
    osm_note: 'OSM identity missing; possible replacement or map edit. Review, do not infer closure.' };
  patch.osm_last_seen_at = now;
  patch.osm_missing_count = 0;
  const recognised = hits.filter(el => {
    const t = el.tags ?? {};
    const names = [t.name, t['name:et'], t['name:en'], ...(t.alt_name ?? '').split(';')].filter(Boolean).map(nameKey);
    return names.some(n => placeNames(p).some(known => n === known || (known.length >= 5 && n.includes(known))));
  });
  const present = recognised.find(el => !closureReason(el.tags ?? {}, p.kind) &&
    ['amenity', 'shop', 'tourism'].some(k => !!el.tags?.[k]));
  if (present) {
    Object.assign(patch, { osm_state: 'present', osm_note: null });
    // A retained map object is not evidence that a business reopened.
    // A closed venue needs an explicit admin verification to reopen.
    return patch;
  }
  // All retained identities must explicitly agree. A missing or renamed
  // alternate node could be the live replacement for a disused old node.
  const reasons = hits.map(el => closureReason(el.tags ?? {}, p.kind));
  if (hits.length === ids.length && reasons.every(Boolean)) {
    Object.assign(patch, { osm_state: 'closed', osm_note: reasons.join('; ') });
    if ((p.status ?? 'active') === 'active' && p.osm_auto_close !== false) Object.assign(patch, { status: 'closed', osm_closed_by_check: true });
    return patch;
  }
  return { ...patch, osm_state: 'review', osm_note: 'OSM exists but name, venue tags or alternate identities disagree. Review.' };
}

export async function checkPlaces(places: Place[], now = new Date().toISOString(), limit = 50) {
  const due = duePlaces(places, Date.parse(now), limit);
  if (!due.length) return [];
  const elements = await overpass(identityQuery(due));
  return due.map(place => ({ place, patch: livenessPatch(place, elements, now) }));
}
