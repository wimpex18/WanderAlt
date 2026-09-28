// Also usable on its own: npm run places:audit / npm run places:maintain.
// All writes use atomic service-only RPCs; --dry-run is read-only.
import { writeFileSync } from 'node:fs';
import { Db } from './db.ts';
import type { Place } from './places.ts';
import { duplicatePlaces, pairKey } from './place-match.ts';
import { checkPlaces } from './place-liveness.ts';
import { duplicateEvents, type StoredEvent } from './dedupe.ts';

export const PLACE_COLUMNS = ['id', 'city', 'name', 'aliases', 'kind', 'neighborhood', 'address', 'lat', 'lng', 'osm_id', 'osm_ids',
  'status', 'merged_into', 'created_at', 'website', 'instagram', 'facebook', 'opening_hours', 'description', 'wikidata_id',
  'image_url', 'image_attr', 'image_source', 'enriched_at', 'osm_checked_at', 'osm_last_seen_at', 'osm_missing_count',
  'osm_state', 'osm_note', 'osm_closed_by_check', 'osm_auto_close'];
export const loadPlaces = (db: Db, city: string) => db.all<Place>(`places?city=eq.${encodeURIComponent(city)}&select=${PLACE_COLUMNS.join(',')}&order=id.asc`);

export async function reconcilePlaces(db: Db, places: Place[], dry = false) {
  const reviews = await db.all<{ place_a: string; place_b: string; state: string }>('place_match_reviews?select=place_a,place_b,state&order=place_a.asc,place_b.asc');
  const separate = new Set(reviews.filter(r => r.state === 'separate').map(r => pairKey(r.place_a, r.place_b)));
  const plan = duplicatePlaces(places, separate);
  if (dry) return plan;
  for (const { duplicate, canonical, match } of plan) {
    if (match.action === 'merge') {
      const change = await db.req<number>('POST', 'rpc/merge_places', {
        p_duplicate: duplicate.id, p_canonical: canonical.id, p_reason: match.reason, p_evidence: match,
      });
      console.log(`[places] merge ${duplicate.id} → ${canonical.id} (${match.reason}); undo id ${change}`);
    } else {
      const [place_a, place_b] = [duplicate.id, canonical.id].sort();
      await db.upsert('place_match_reviews', [{ place_a, place_b, state: 'pending', reason: match.reason, evidence: match,
        updated_at: new Date().toISOString() }], 'place_a,place_b');
      console.log(`[places] review ${place_a} / ${place_b}: ${match.distance == null ? '?' : Math.round(match.distance)} m, similarity ${match.similarity.toFixed(2)}`);
    }
  }
  return plan;
}

export async function refreshLiveness(db: Db, places: Place[], dry = false, limit = 50) {
  const checks = await checkPlaces(places, new Date().toISOString(), limit);
  for (const { place, patch } of checks) {
    if (!dry) await db.req('POST', 'rpc/check_place_liveness', { p_id: place.id, p_patch: patch });
    console.log(`[places] OSM ${place.id}: ${patch.osm_state}${patch.osm_note ? ` (${patch.osm_note})` : ''}`);
  }
  return checks;
}

export async function reconcileEvents(db: Db, city: string, dry = false) {
  const rows = await db.all<StoredEvent>(`events?city=eq.${encodeURIComponent(city)}&archived_at=is.null&merged_into=is.null&select=id,title,place_id,starts_at,first_seen_at,status,has_time&order=id.asc`);
  const undone = await db.all<{ duplicate_id: string; canonical_id: string }>('event_merge_log?reverted_at=not.is.null&select=duplicate_id,canonical_id&order=id.asc');
  const plan = duplicateEvents(rows, new Set(undone.map(r => pairKey(r.duplicate_id, r.canonical_id))));
  if (!dry) for (const { duplicate, canonical } of plan) {
    const change = await db.req<number>('POST', 'rpc/merge_events', {
      p_duplicate: duplicate.id, p_canonical: canonical.id,
    });
    console.log(`[events] merge ${duplicate.id} → ${canonical.id}; undo id ${change}`);
  }
  return plan;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const value = (key: string) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
  const dry = args.includes('--dry-run');
  const db = new Db(), city = value('--city') ?? 'tallinn';
  try {
    const places = await loadPlaces(db, city);
    if (value('--merge') && value('--into')) {
      if (dry || !value('--reason')) throw new Error('Manual merges need --reason and a write run');
      const id = await db.req('POST', 'rpc/merge_places', { p_duplicate: value('--merge'), p_canonical: value('--into'), p_reason: value('--reason') });
      console.log(`[places] manual merge recorded; undo id ${id}`);
    }
    const plan = await reconcilePlaces(db, value('--merge') ? await loadPlaces(db, city) : places, dry);
    console.log(`[places] ${places.filter(p => !p.merged_into).length} canonical places; ${plan.filter(p => p.match.action === 'merge').length} merges, ${plan.filter(p => p.match.action === 'review').length} reviews${dry ? ' (dry run)' : ''}`);
    const checks = args.includes('--check-osm') ? await refreshLiveness(db, dry ? places : await loadPlaces(db, city), dry) : [];
    const events = await reconcileEvents(db, city, dry);
    const out = value('--out');
    if (out) writeFileSync(out, JSON.stringify({ plan, checks, events }, null, 2));
  } catch (e) { console.error('[places]', (e as Error).message); process.exitCode = 1; }
}
