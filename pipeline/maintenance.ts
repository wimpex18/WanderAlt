// Also usable on its own: npm run places:audit / npm run places:maintain.
// All writes use atomic service-only RPCs, except a display-name tidy (one row's
// name and aliases, its id untouched); --dry-run is read-only.
import { writeFileSync } from 'node:fs';
import { CITIES, tzOf } from './cities.ts';
import { Db } from './db.ts';
import { venueName, type Place } from './places.ts';
import { nameKey } from './util.ts';
import { duplicatePlaces, pairKey } from './place-match.ts';
import { checkPlaces } from './place-liveness.ts';
import { dateOnlyJoins, duplicateEvents, oneShowPerItem, type ItemListing, type StoredEvent } from './dedupe.ts';
import { checkWebsite, dueWebsites } from './place-verification.ts';

export const PLACE_COLUMNS = ['id', 'city', 'name', 'aliases', 'kind', 'neighborhood', 'address', 'lat', 'lng', 'osm_id', 'osm_ids',
  'status', 'merged_into', 'created_at', 'picked', 'website', 'website_source', 'instagram', 'facebook', 'opening_hours', 'hours_source', 'hours_checked_at', 'facts_checked_at', 'description', 'wikidata_id',
  'image_url', 'image_attr', 'image_source', 'image_tone', 'image_tone_url', 'enriched_at', 'osm_checked_at', 'osm_last_seen_at', 'osm_missing_count',
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

/** Names stored before venueName (places.ts) cleaned the same way: "Gin Spot Bar (One of Tallinn's
 *  most unique …)" reads "Gin Spot Bar". The id stays, so saves, links and lists are unchanged, and the
 *  old spelling becomes an alias, so the source that wrote it still finds the place. Only this script
 *  applies it, never the scheduled run: a picked place's name is read before it changes
 *  (places:audit lists every rename). */
export async function tidyPlaceNames(db: Pick<Db, 'patch'>, places: Place[], dry = false): Promise<{ id: string; from: string; to: string }[]> {
  const out: { id: string; from: string; to: string }[] = [];
  for (const p of places) {
    const name = venueName(p.name, CITIES[p.city] ?? CITIES.tallinn);
    if (p.merged_into || name === p.name) continue;
    const aliases = [...new Set([...(p.aliases ?? []), nameKey(p.name), nameKey(name)])];
    if (!dry) await db.patch(`places?id=eq.${encodeURIComponent(p.id)}`, { name, aliases });
    console.log(`[places] name ${p.id}: "${p.name}" → "${name}"${dry ? ' (dry run)' : ''}`);
    out.push({ id: p.id, from: p.name, to: name });
    // A later bulk upsert in the same run writes these objects back; it must carry the new name.
    if (!dry) Object.assign(p, { name, aliases });
  }
  return out;
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

/** Which source item listed each live row, and whether that source's items are one show each. */
export async function sourceItems(db: Pick<Db, 'all'>, live: Set<string>): Promise<ItemListing[]> {
  const sources = await db.all<{ id: string; kind: string; config: Record<string, unknown> | null }>('sources?select=id,kind,config&order=id.asc');
  const single = new Map(sources.map(s => [s.id, oneShowPerItem(s.kind, s.config?.shape)]));
  const rows = await db.all<{ event_id: string; raw_item_id: number; source_id: string }>('event_sources?raw_item_id=not.is.null&select=event_id,raw_item_id,source_id&order=event_id.asc,source_id.asc');
  return rows.filter(r => live.has(r.event_id)).map(r => ({ event_id: r.event_id, raw_item_id: r.raw_item_id, single: single.get(r.source_id) ?? false }));
}

export async function reconcileEvents(db: Db, city: string, dry = false) {
  const rows = await db.all<StoredEvent>(`events?city=eq.${encodeURIComponent(city)}&archived_at=is.null&merged_into=is.null&select=id,title,place_id,starts_at,url,first_seen_at,status,has_time&order=id.asc`);
  const undone = await db.all<{ duplicate_id: string; canonical_id: string }>('event_merge_log?reverted_at=not.is.null&select=duplicate_id,canonical_id&order=id.asc');
  const listings = await sourceItems(db, new Set(rows.map(r => r.id)));
  const separate = new Set(undone.map(r => pairKey(r.duplicate_id, r.canonical_id)));
  const tz = tzOf(city), plan = duplicateEvents(tz, rows, separate, listings);
  // Then date-only copies of a show another source lists with its time, among the rows still standing.
  const gone = new Set(plan.map(p => p.duplicate.id));
  plan.push(...dateOnlyJoins(tz, rows.filter(r => !gone.has(r.id)), separate));
  if (!dry) for (const { duplicate, canonical } of plan) {
    // One pair the database refuses (a rule the planner did not foresee) is logged and left alone;
    // it must not stop the run that collects every other source.
    try {
      const change = await db.req<number>('POST', 'rpc/merge_events', {
        p_duplicate: duplicate.id, p_canonical: canonical.id,
      });
      console.log(`[events] merge ${duplicate.id} → ${canonical.id}; undo id ${change}`);
    } catch (e) {
      console.log(`[events] merge ${duplicate.id} → ${canonical.id} refused: ${(e as Error).message.slice(0, 160)}`);
    }
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
    const names = await tidyPlaceNames(db, places, dry);
    const plan = await reconcilePlaces(db, value('--merge') || value('--verify') ? await loadPlaces(db, city) : places, dry);
    console.log(`[places] ${places.filter(p => !p.merged_into).length} canonical places; ${plan.filter(p => p.match.action === 'merge').length} merges, ${plan.filter(p => p.match.action === 'review').length} reviews${dry ? ' (dry run)' : ''}`);
    const checks = args.includes('--check-osm') ? await refreshLiveness(db, dry ? places : await loadPlaces(db, city), dry) : [];
    const events = await reconcileEvents(db, city, dry);
    if (!dry && args.includes('--verify-websites')) await verifyPlaces(db, city, Number(value('--max-website-checks') ?? 10));
    const out = value('--out');
    if (out) writeFileSync(out, JSON.stringify({ names, plan, checks, events }, null, 2));
  } catch (e) { console.error('[places]', (e as Error).message); process.exitCode = 1; }
}
