// Also usable on its own: npm run places:audit / npm run places:maintain.
// All writes use atomic service-only RPCs; --dry-run is read-only.
import { writeFileSync } from 'node:fs';
import { Db } from './db.ts';
import type { Place } from './places.ts';
import { duplicatePlaces, pairKey } from './place-match.ts';
import { checkPlaces } from './place-liveness.ts';
import { duplicateEvents, type StoredEvent } from './dedupe.ts';
import { checkWebsite, dueWebsites } from './place-verification.ts';

export const PLACE_COLUMNS = ['id', 'city', 'name', 'aliases', 'kind', 'neighborhood', 'address', 'lat', 'lng', 'osm_id', 'osm_ids',
  'status', 'merged_into', 'created_at', 'picked', 'website', 'website_source', 'instagram', 'facebook', 'opening_hours', 'hours_source', 'hours_checked_at', 'facts_checked_at', 'description', 'wikidata_id',
  'image_url', 'image_attr', 'image_source', 'enriched_at', 'osm_checked_at', 'osm_last_seen_at', 'osm_missing_count',
  'osm_state', 'osm_note', 'osm_closed_by_check', 'osm_auto_close', 'verification_state', 'verification_checked_at',
  'website_checked_at', 'verified_at', 'verification_source', 'verification_url', 'verification_note'];
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

/** Places created from a source's Russian phrase ("в театре Сюдалинна") carry
 *  no identity: no OpenStreetMap id, no coordinates. They are removed, and the
 *  events that named them keep the rest of their facts without a venue. */
export async function retireForeignScriptPlaces(db: Db, places: Place[], dry = false): Promise<Place[]> {
  const junk = places.filter(p => /[\u0400-\u04ff]/.test(p.name) && !p.osm_id && !(p.osm_ids ?? []).length && p.lat == null);
  for (const p of junk) {
    if (dry) continue;
    try {
      const id = encodeURIComponent(p.id);
      await db.patch(`events?place_id=eq.${id}`, { place_id: null, venue_name: null });
      await db.req('DELETE', `places?id=eq.${id}`);
      console.log(`[places] removed ${p.id} "${p.name}": a Cyrillic phrase, not a venue name`);
    } catch (e) {
      console.log(`[places] could not remove ${p.id}: ${(e as Error).message}`);
    }
  }
  return places.filter(p => !junk.includes(p));
}

export async function refreshLiveness(db: Db, places: Place[], dry = false, limit = 50) {
  const checks = await checkPlaces(places, new Date().toISOString(), limit);
  for (const { place, patch } of checks) {
    if (!dry) await db.req('POST', 'rpc/check_place_liveness', { p_id: place.id, p_patch: patch });
    console.log(`[places] OSM ${place.id}: ${patch.osm_state}${patch.osm_note ? ` (${patch.osm_note})` : ''}`);
  }
  return checks;
}

export async function verifyPlaces(db: Db, city: string, websiteLimit = 10) {
  const events = await db.req<number>('POST', 'rpc/verify_event_places', { p_city: city });
  console.log(`[places] ${events} venues verified from recent trusted listings`);
  const results = [];
  for (const place of dueWebsites(await loadPlaces(db, city), Date.now(), websiteLimit)) {
    let evidence;
    try {
      evidence = await checkWebsite(place);
    } catch (e) {
      // A timeout, challenge or outage proves neither closure nor activity.
      // Mark the attempted check for fair weekly rotation, preserving status.
      await db.patch(`places?id=eq.${encodeURIComponent(place.id)}`, { website_checked_at: new Date().toISOString() });
      console.log(`[places] website ${place.id}: unavailable; verification unchanged (${(e as Error).message})`);
      continue;
    }
    // Database failures must fail the run, rather than masquerade as an
    // unavailable website and silently discard the observation.
    await db.req('POST', 'rpc/record_place_verification', { p_id: place.id, p_state: evidence.state,
      p_source: evidence.source, p_url: evidence.url, p_note: evidence.note, p_observed_at: evidence.observed_at });
    results.push({ id: place.id, ...evidence });
    console.log(`[places] website ${place.id}: ${evidence.state}; ${evidence.note}`);
  }
  return results;
}

export async function reconcileEvents(db: Db, city: string, dry = false) {
  const rows = await db.all<StoredEvent>(`events?city=eq.${encodeURIComponent(city)}&archived_at=is.null&merged_into=is.null&select=id,title,place_id,starts_at,url,first_seen_at,status,has_time&order=id.asc`);
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
    if (value('--verify')) {
      if (dry || !value('--reason') || !['verified','review','closed'].includes(value('--state') ?? '')) throw new Error('Manual verification needs --state, --reason and a write run');
      await db.req('POST', 'rpc/record_place_verification', { p_id: value('--verify'), p_state: value('--state'),
        p_source: 'manual', p_url: value('--url') ?? null, p_note: value('--reason') });
      console.log(`[places] manual verification recorded for ${value('--verify')}`);
    }
    if (value('--merge') && value('--into')) {
      if (dry || !value('--reason')) throw new Error('Manual merges need --reason and a write run');
      const id = await db.req('POST', 'rpc/merge_places', { p_duplicate: value('--merge'), p_canonical: value('--into'), p_reason: value('--reason') });
      console.log(`[places] manual merge recorded; undo id ${id}`);
    }
    const plan = await reconcilePlaces(db, value('--merge') || value('--verify') ? await loadPlaces(db, city) : places, dry);
    console.log(`[places] ${places.filter(p => !p.merged_into).length} canonical places; ${plan.filter(p => p.match.action === 'merge').length} merges, ${plan.filter(p => p.match.action === 'review').length} reviews${dry ? ' (dry run)' : ''}`);
    const checks = args.includes('--check-osm') ? await refreshLiveness(db, dry ? places : await loadPlaces(db, city), dry) : [];
    const events = await reconcileEvents(db, city, dry);
    if (!dry && args.includes('--verify-websites')) await verifyPlaces(db, city, Number(value('--max-website-checks') ?? 10));
    const out = value('--out');
    if (out) writeFileSync(out, JSON.stringify({ plan, checks, events }, null, 2));
  } catch (e) { console.error('[places]', (e as Error).message); process.exitCode = 1; }
}
