// The events pipeline, one pass:
//   1. sync sources.<city>.json into the sources table
//   2. collect every source into raw_items (only new or changed items)
//   3. read pending raw items into candidates (structured parse, or a model)
//   4. classify candidates (kind, relevance, English title and summary)
//   5. fold the OpenStreetMap venue catalogue into places, enrich a few
//      places (links, photo), resolve venues, write events and provenance
//   6. archive what has ended, record each source's health
//
//   node pipeline/run.ts                 full pass (needs SUPABASE_SERVICE_ROLE_KEY)
//   node pipeline/run.ts --dry-run       collect, read and classify; print, write nothing
//   node pipeline/run.ts --source kino-soprus --dry-run --out /tmp/x.json
//   node pipeline/run.ts --models        list configured model lanes and probe each once

import { readFileSync, writeFileSync } from 'node:fs';
import type { Candidate, Enrichment, RawItem, Source } from './types.ts';
import * as fienta from './sources/fienta.ts';
import * as jsonld from './sources/jsonld.ts';
import * as wordpress from './sources/wordpress.ts';
import { osmCatalogue, enrichPlace } from './venues.ts';
import { collectTelegram, collectPage, collectRss } from './sources/text.ts';
import { Models, extractEvents, classify, classifyPlaces, transcribePoster, usage } from './llm.ts';
import { englishModels, refreshEnglish } from './english.ts';
import { attachPosters } from './posters.ts';
import { Places, isDistrict, type Place } from './places.ts';
import { Seen } from './dedupe.ts';
import { textFlag, worse } from './flags.ts';
import { Db, inList, chunks } from './db.ts';
import { sha, nameKey, scrubContacts, httpUrl } from './util.ts';
import { tallinnDay } from './time.ts';
import { PLACE_COLUMNS, loadPlaces, reconcilePlaces, reconcileEvents, refreshLiveness, verifyPlaces } from './maintenance.ts';

/** Refresh source facts without erasing reviewed artwork or classification. */
export function eventRefreshFacts(row: Record<string, unknown>): Record<string, unknown> {
  const { status: _s, status_note: _n, relevance: _r, ...facts } = row;
  // English copy belongs to the separate editorial queue, including originals.
  delete facts.title_en; delete facts.summary_en;
  if (!facts.image_url) { delete facts.image_url; delete facts.image_attr; }
  if (String(facts.engine).endsWith('+rules')) {
    delete facts.kind; delete facts.tags;
  }
  return facts;
}

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

const CITY = opt('--city') ?? 'tallinn';
const DRY = flag('--dry-run');
const ONLY = opt('--source');
const MAX_ITEMS = Number(opt('--max-items') ?? 400);
const MAX_ATTEMPTS = 3;          // a raw item that errors this often is parked as 'error'
const KEEP_RAW_DAYS = 60;

const log = (...xs: unknown[]) => console.log('[pipeline]', ...xs);

export function loadSources(city = CITY): Source[] {
  const url = new URL(`./sources.${city}.json`, import.meta.url);
  return (JSON.parse(readFileSync(url, 'utf8')) as Source[]).map(s => ({ ...s, active: true } as Source));
}

async function collect(source: Source): Promise<RawItem[]> {
  switch (source.kind) {
    case 'fienta': return fienta.collect(source);
    case 'jsonld': return jsonld.collect(source);
    case 'wordpress': return wordpress.collect(source);
    case 'osm': return [];            // places, not events: step 5
    case 'telegram': return collectTelegram(source);
    case 'html': return collectPage(source);
    case 'rss': return collectRss(source);
  }
}

/** Posters read per run; each costs about 35 Workers AI neurons. */
const posters = { left: Number(opt('--max-posters') ?? 30) };

const needsModel = (s: Source) => s.kind === 'telegram' || s.kind === 'html' || s.kind === 'rss';

/** Raw item → candidates. Null means "not now" (no model available). */
async function read(item: RawItem, source: Source, models: Models): Promise<Candidate[] | null> {
  if (source.kind === 'fienta') return fienta.extract(item);
  if (source.kind === 'jsonld') return jsonld.extract(item, source);
  if (source.kind === 'wordpress') return wordpress.extract(item, source);
  if (!models.ready) return null;
  const p = item.payload as { text?: string; title?: string; posted_at?: string; photos?: string[] };
  // A post's poster often carries the date, time and venue its text leaves out.
  const poster = p.photos?.[0] && posters.left > 0 && usage.neurons < models.neuronBudget - 50 ? (posters.left--, await transcribePoster(p.photos[0])) : null;
  const text = [p.title, p.text, poster ? `Text on the attached poster:\n${poster}` : ''].filter(Boolean).join('\n\n');
  if (!text.trim() && !p.photos?.length) return [];
  const found = await extractEvents(models, {
    text, source: `${source.label} (${source.handle})`, postedAt: p.posted_at ?? null,
    images: p.photos ?? [], pageUrl: item.url ?? null,
  });
  // A single venue's own programme page: every event is at that venue,
  // whatever hall name the page uses.
  const venue = source.config.venue_name as string | undefined;
  return venue ? found.map(c => ({ ...c, venue_name: venue })) : found;
}

export function eventId(city: string, c: Candidate, placeId: string | null): string {
  const local = new Date(c.starts_at).toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' });
  const where = placeId ?? nameKey(c.venue_name ?? '');
  return `ev_${sha([city, nameKey(c.title), tallinnDay(c.starts_at), c.has_time ? local : '', where].join('|')).slice(0, 16)}`;
}

/** Formats that are never WanderAlt, whoever lists them: a venue that
 *  rents its halls out (Kultuurikatel) lists conferences and trade fairs
 *  beside its gigs. Rejected by rule, before a model is asked. */
const OFF_TOPIC = /\b(conference|konverents|summit|forum|foorum|seminar|koolitus|webinar|expo|trade fair|messe|hackathon|business|networking|investor|recruitment|job fair|töömess)\b/i;
export function offTopic(title: string): { status: string; note: string } | null {
  const m = OFF_TOPIC.exec(title);
  return m ? { status: 'rejected', note: `rule: ${m[1].toLowerCase()}` } : null;
}

/** Publish, hold for review, or reject. Trusted sources need a lower bar. */
export function decide(e: Enrichment, trusted: boolean): { status: string; note: string } {
  const r = e.relevance;
  if (Number.isNaN(r)) return trusted
    ? { status: 'published', note: 'trusted source, not classified' }
    : { status: 'review', note: 'not classified yet' };
  if (trusted) return r >= 0.3 ? { status: 'published', note: 'trusted source' } : { status: 'review', note: `trusted source, low fit ${r.toFixed(2)}` };
  if (r >= 0.6) return { status: 'published', note: `fit ${r.toFixed(2)}` };
  if (r >= 0.35) return { status: 'review', note: `borderline fit ${r.toFixed(2)}` };
  return { status: 'rejected', note: `low fit ${r.toFixed(2)}` };
}

interface Pending { rawId: number | null; item: RawItem; source: Source }

async function main() {
  // Keep some Workers AI allocation for new events' English copy after writes.
  const callBudget = Number(process.env.LLM_CALL_BUDGET ?? 60);
  const englishBudget = DRY ? 0 : Math.min(6, Math.max(0, callBudget));
  const models = new Models(undefined, Math.max(0, callBudget - englishBudget),
    Math.max(0, Number(process.env.WORKERS_AI_NEURON_BUDGET ?? 1500) - (DRY ? 0 : 500)));
  if (flag('--models')) {
    for (const l of models.available) {
      try {
        const answer = await l.call('Answer in JSON.', 'Return {"ok": true}.', { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] });
        log(`lane ${l.name} (${l.model}) answered: ${answer.slice(0, 60)}`);
      } catch (e) { log(`lane ${l.name} (${l.model}) failed: ${(e as Error).message}`); }
    }
    if (!models.available.length) log('no model lane has a key; see docs/models.md');
    return;
  }

  const sources = loadSources().filter(s => !ONLY || s.id === ONLY);
  const db = DRY ? null : new Db();
  const english = englishModels(englishBudget);

  // The run's row, and what today's earlier runs already spent: the free
  // Workers AI allocation is per day (reset 00:00 UTC) and per account.
  // A missing table (migration not applied yet) leaves the per-run cap alone.
  let runId: number | null = null;
  if (db) {
    try {
      const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
      const spent = (await db.select<{ neurons: number }>(`pipeline_runs?started_at=gte.${dayStart.toISOString()}&select=neurons`))
        .reduce((a, r) => a + Number(r.neurons || 0), 0);
      const daily = Number(process.env.WORKERS_AI_DAILY_NEURONS || 6000);
      models.neuronBudget = Math.max(0, Math.min(models.neuronBudget, daily - spent));
      const [row] = await db.req<{ id: number }[]>('POST', 'pipeline_runs', [{}], 'return=representation');
      runId = row?.id ?? null;
      log(`Workers AI: ${Math.round(spent)} neurons spent today, ${Math.round(models.neuronBudget)} allowed this run`);
    } catch (e) {
      log(`pipeline_runs unavailable, daily budget not applied: ${(e as Error).message}`);
    }
  }
  log(`${DRY ? 'dry run' : 'run'} for ${CITY}: ${sources.length} sources, model lanes: ${models.available.map(l => `${l.name}:${l.model}`).join(', ') || 'none'}`);

  if (db) {
    // Reserve free calls for English before prose extraction spends its budget.
    await refreshEnglish(db, english, CITY, 20);
    await db.upsert('sources', sources.map(({ id, city, kind, url, handle, label, curated, config }) =>
      ({ id, city, kind, url, handle, label, curated, config, active: true })), 'id');
    // A source removed from the JSON stops being read and stops being shown.
    if (!ONLY) await db.patch(`sources?city=eq.${CITY}&active=is.true&id=not.in.${encodeURIComponent(inList(sources.map(s => s.id)))}`, { active: false });
  }

  // ── 2. collect ──
  const pending: Pending[] = [];
  const health: Record<string, { ok: boolean; yield: number; error?: string }> = {};
  for (const source of sources) {
    try {
      const items = await collect(source);
      health[source.id] = { ok: true, yield: items.length };
      if (!db) { pending.push(...items.map(item => ({ rawId: null, item, source }))); log(`${source.id}: ${items.length} items`); continue; }
      const known = new Map<string, string>();
      for (const part of chunks(items.map(i => i.external_id), 150)) {
        const rows = await db.select<{ external_id: string; content_hash: string }>(
          `raw_items?source_id=eq.${encodeURIComponent(source.id)}&external_id=in.${encodeURIComponent(inList(part))}&select=external_id,content_hash`);
        for (const r of rows) known.set(r.external_id, r.content_hash);
      }
      const fresh = items
        .map(i => ({ ...i, content_hash: sha(JSON.stringify(i.payload)) }))
        .filter(i => known.get(i.external_id) !== i.content_hash);
      for (const part of chunks(fresh, 200)) {
        await db.upsert('raw_items', part.map(i => ({
          source_id: source.id, external_id: i.external_id, url: i.url ?? null, content_hash: i.content_hash,
          payload: i.payload, fetched_at: new Date().toISOString(), status: 'new', note: null, attempts: 0,
        })), 'source_id,external_id');
      }
      // Seeing an unchanged source item is still fresh activity evidence.
      // Refresh only its provenance; never re-read it or clear its flags.
      const changed = new Set(fresh.map(i => i.external_id));
      for (const part of chunks(items.filter(i => !changed.has(i.external_id)).map(i => i.external_id), 150)) {
        await db.req('POST', 'rpc/refresh_source_seen', { p_source: source.id, p_external_ids: part });
      }
      log(`${source.id}: ${items.length} items, ${fresh.length} new or changed`);
    } catch (e) {
      health[source.id] = { ok: false, yield: 0, error: (e as Error).message };
      log(`${source.id}: collect failed: ${(e as Error).message}`);
    }
  }

  if (db) {
    const ids = sources.map(s => s.id);
    const rows = await db.select<{ id: number; source_id: string; external_id: string; url: string | null; payload: Record<string, unknown>; attempts: number }>(
      `raw_items?status=eq.new&source_id=in.${encodeURIComponent(inList(ids))}&order=fetched_at.asc&limit=${MAX_ITEMS}&select=id,source_id,external_id,url,payload,attempts`);
    const byId = new Map(sources.map(s => [s.id, s]));
    for (const r of rows) pending.push({ rawId: r.id, item: r, source: byId.get(r.source_id)! });
  }
  // Structured sources first: they cost no model calls.
  pending.sort((a, b) => Number(needsModel(a.source)) - Number(needsModel(b.source)));

  // ── 3. read ──
  const found: { c: Candidate; p: Pending }[] = [];
  const done: number[] = [];
  const skipped: number[] = [];
  const failed: { id: number; attempts: number; note: string }[] = [];
  const wasRead = new Set<Pending>();
  for (const p of pending) {
    try {
      const cands = await read(p.item, p.source, models);
      if (cands === null) continue;               // waits for a model
      wasRead.add(p);
      cands.forEach(c => found.push({ c, p }));
      if (p.rawId !== null) (cands.length ? done : skipped).push(p.rawId);
    } catch (e) {
      const attempts = Number((p.item as { attempts?: number }).attempts ?? 0) + 1;
      if (p.rawId !== null) failed.push({ id: p.rawId, attempts, note: (e as Error).message.slice(0, 300) });
      log(`${p.source.id}/${p.item.external_id}: read failed (${attempts}/${MAX_ATTEMPTS}): ${(e as Error).message}`);
    }
  }
  log(`read ${pending.length} items into ${found.length} candidates (${models.calls} model calls)`);
  // A page that is still fetched but no longer yields events has usually
  // been redesigned; say so, since collection alone looks healthy.
  for (const s of sources.filter(needsModel)) {
    const read = pending.filter(p => p.source.id === s.id && wasRead.has(p));
    if (read.length && !found.some(f => f.p.source.id === s.id)) log(`${s.id}: ${read.length} items read, no events found in any`);
  }

  // ── 4. classify ──
  const enrich = await classify(models, found.map(f => f.c));

  // ── 5. places and events ──
  let existingPlaces = db ? await loadPlaces(db, CITY) : [];
  if (db) {
    const plan = await reconcilePlaces(db, existingPlaces);
    if (plan.some(p => p.match.action === 'merge')) existingPlaces = await loadPlaces(db, CITY);
    await reconcileEvents(db, CITY);
  }
  // The venue catalogue: every cultural venue OpenStreetMap knows in the city.
  const osm = sources.find(s => s.kind === 'osm');
  let skipCatalogue = false;
  if (db && osm && !flag('--no-liveness')) {
    try {
      await refreshLiveness(db, existingPlaces, false, Number(opt('--max-liveness') ?? 50));
      existingPlaces = await loadPlaces(db, CITY);
    } catch (e) {
      health[osm.id] = { ok: false, yield: 0, error: `liveness: ${(e as Error).message}` };
      skipCatalogue = true;
      log(`${osm.id}: liveness failed; visibility unchanged: ${(e as Error).message}`);
    }
  }
  const places = new Places(existingPlaces, CITY, DRY && !flag('--geocode') ? 0 : Number(opt('--max-geocode') ?? 100));
  if (osm && !skipCatalogue) {
    try {
      const catalogue = await osmCatalogue(CITY, String(osm.config.area ?? 'Tallinn'));
      for (const p of catalogue) places.merge(p);
      if (health[osm.id]?.ok !== false) health[osm.id] = { ok: true, yield: catalogue.length };
      log(`${osm.id}: ${catalogue.length} venues; ${places.created.length} new, ${places.updated.length} updated`);
    } catch (e) {
      health[osm.id] = { ok: false, yield: 0, error: (e as Error).message };
      log(`${osm.id}: failed: ${(e as Error).message}`);
    }
  }
  // Areas a visitor knows (Kalamaja, not Põhja-Tallinna) for places that
  // carry a district or nothing; 40 a run, one Nominatim lookup each.
  if (!(DRY && !flag('--geocode'))) {
    let n = 0;
    for (const p of places.all().filter(p => (p.status ?? 'active') === 'active' && p.lat != null && isDistrict(p.neighborhood)).slice(0, 40)) {
      if (await places.area(p)) {
        n++;
        if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
      }
    }
    if (n) log(`areas: ${n} places moved from a district to their asum`);
  }

  // Links and a photo for a few places a run, from sources that identify them.
  if (!flag('--no-enrich')) {
    // A place with no picture is looked at again after a month: sites add logos.
    const monthAgo = Date.now() - 30 * 86_400_000;
    const due = places.all().filter(p => (p.status ?? 'active') === 'active' && (p.wikidata_id || p.website)
      && (!p.enriched_at || (!p.image_url && Date.parse(p.enriched_at) < monthAgo))).slice(0, Number(opt('--max-enrich') ?? 25));
    for (const p of due) {
      Object.assign(p, await enrichPlace(p), { enriched_at: new Date().toISOString() });
      if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
    }
    if (due.length) log(`enriched ${due.length} places`);
  }

  // Upcoming events already stored, so a second source's copy of a show joins it.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const seen = new Seen(db
    ? (await db.all<{ id: string; title: string; place_id: string | null; venue_name: string | null; starts_at: string }>(
        `events?city=eq.${CITY}&archived_at=is.null&merged_into=is.null&starts_at=gte.${since}&select=id,title,place_id,venue_name,starts_at&order=id.asc`))
        .map(k => ({ id: k.id, title: k.title, where: k.place_id ?? nameKey(k.venue_name ?? ''), start: Date.parse(k.starts_at) }))
    : []);

  const events = new Map<string, Record<string, unknown>>();
  const provenance: Record<string, unknown>[] = [];
  for (let i = 0; i < found.length; i++) {
    const { c, p } = found[i];
    const e = enrich[i];
    const place = await places.resolve(c, !(DRY && !flag('--geocode')));
    const where = place?.id ?? nameKey(c.venue_name ?? '');
    const start = Date.parse(c.starts_at);
    const id = seen.match(c.title, where, start) ?? eventId(CITY, c, place?.id ?? null);
    seen.add({ id, title: c.title, where, start });
    const trusted = p.source.curated || (p.source.kind === 'fienta' && fienta.trustedOrganiser(p.item, p.source));
    const { status, note } = offTopic(c.title) ?? decide(e, trusted);
    // Any source saying a show is off or sold out wins over one that doesn't.
    const state = worse(c.flag, textFlag(c.title, c.description));
    const imagePage = httpUrl(c.url ?? p.item.url);
    provenance.push({ event_id: id, source_id: p.source.id, raw_item_id: p.rawId, url: c.url ?? p.item.url ?? null,
      flag: state, last_seen_at: new Date().toISOString() });
    if (events.has(id)) { const had = events.get(id)!; had.flag = worse(had.flag as never, state); continue; }
    events.set(id, {
      id, city: CITY, title: c.title, title_en: e.title_en, summary_en: e.summary_en, description: scrubContacts(c.description),
      kind: e.kind, tags: e.tags, place_id: place?.id ?? null, venue_name: c.venue_name ?? null, address: c.address ?? null,
      lat: c.lat ?? null, lng: c.lng ?? null, starts_at: c.starts_at, ends_at: c.ends_at ?? null, has_time: c.has_time,
      is_free: c.is_free ?? null, price_min: c.price_min ?? null, price_max: c.price_max ?? null, currency: c.currency ?? null,
      ticket_url: c.ticket_url ?? null, url: c.url ?? null, image_url: c.image_url ?? null, language: c.language ?? null,
      image_attr: c.image_url && imagePage ? `Image from ${new URL(imagePage).hostname.replace(/^www\./, '')}` : null,
      series_key: c.series_key ?? null, relevance: Number.isNaN(e.relevance) ? null : e.relevance,
      flag: state, status, status_note: note, engine: `${c.engine}+${e.engine}`, last_seen_at: new Date().toISOString(),
    });
  }

  // Venues OpenStreetMap could not name get a kind from the model, judged
  // by their name, address and the events held there.
  const unnamed = places.all().filter(p => !p.kind).slice(0, 90);
  if (unnamed.length && models.ready) {
    const held = (id: string) => [...events.values()].filter(e => e.place_id === id).map(e => String(e.title));
    const kinds = await classifyPlaces(models, unnamed.map(p => ({ name: p.name, address: p.address, events: held(p.id) })));
    kinds.forEach((k, i) => {
      const p = unnamed[i];
      if (!k) return;
      p.kind = k;
      if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
    });
    log(`venue kinds: ${kinds.filter(Boolean).length} of ${unnamed.length} from the model`);
  }

  const counts = [...events.values()].reduce<Record<string, number>>((a, e) => ({ ...a, [String(e.status)]: (a[String(e.status)] ?? 0) + 1 }), {});
  log(`events: ${events.size} (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}), new places: ${places.created.length}`);

  if (!db) {
    const out = opt('--out');
    const rows = [...events.values()].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
    if (out) writeFileSync(out, JSON.stringify({ events: rows, places: places.created, health }, null, 2));
    log(`${models.calls} model calls, ${Math.round(usage.neurons)} Workers AI neurons`);
    for (const e of rows.slice(0, Number(opt('--show') ?? 15))) {
      log(`  ${e.status} ${new Date(String(e.starts_at)).toLocaleString('en-GB', { timeZone: 'Europe/Tallinn', dateStyle: 'short', timeStyle: 'short' })} · ${e.kind} · ${e.title_en ?? e.title} @ ${e.venue_name ?? '?'}`);
    }
    return;
  }

  const touched = [...places.created, ...places.updated];
  if (touched.length) {
    // Every row carries every column: a bulk upsert takes its column list
    // from the first row, and a missing key would be written as null.
    await db.upsert('places', touched.map(p => ({
      // Liveness/visibility fields belong to their atomic RPC, not a
      // stale bulk snapshot. New rows receive the database defaults.
      ...Object.fromEntries(PLACE_COLUMNS.filter(k => !k.startsWith('osm_') || ['osm_id','osm_ids'].includes(k))
        .filter(k => !['status','merged_into','created_at','verified_at','website_checked_at'].includes(k) && !k.startsWith('verification_'))
        .map(k => [k, (p as unknown as Record<string, unknown>)[k] ?? null])),
      aliases: p.aliases ?? [], osm_ids: p.osm_ids ?? [], updated_at: new Date().toISOString(),
    })), 'id');
  }
  const ids = [...events.keys()];
  const existing = new Set<string>();
  for (const part of chunks(ids, 150)) {
    for (const r of await db.select<{ id: string }>(`events?id=in.${encodeURIComponent(inList(part))}&select=id`)) existing.add(r.id);
  }
  const fresh = ids.filter(id => !existing.has(id)).map(id => events.get(id)!);
  for (const part of chunks(fresh, 200)) await db.insert('events', part);
  // Known events: refresh the facts, keep whatever status a person or an
  // earlier run gave them. A run without a model keeps the earlier
  // classification too. Upsert with merge-duplicates updates only the
  // columns sent, and every row here already exists.
  const refresh = ids.filter(id => existing.has(id)).map(id => eventRefreshFacts(events.get(id)!));
  const byShape = new Map<string, Record<string, unknown>[]>();
  for (const r of refresh) {
    const shape = Object.keys(r).sort().join(',');
    byShape.set(shape, [...(byShape.get(shape) ?? []), r]);
  }
  for (const group of byShape.values()) for (const part of chunks(group, 200)) await db.upsert('events', part, 'id');
  const prov = new Map<string, Record<string, unknown>>();
  for (const p of provenance) {
    const key = `${p.event_id}|${p.source_id}`;
    prov.set(key, { ...p, flag: worse(prov.get(key)?.flag as never, p.flag as never) });
  }
  for (const part of chunks([...prov.values()], 200)) await db.upsert('event_sources', part, 'event_id,source_id');
  for (const part of chunks(ids, 200)) await db.req('POST', 'rpc/refresh_event_flags', { p_ids: part });

  for (const part of chunks(done, 200)) await db.patch(`raw_items?id=in.(${part.join(',')})`, { status: 'done', note: null });
  for (const part of chunks(skipped, 200)) await db.patch(`raw_items?id=in.(${part.join(',')})`, { status: 'skipped', note: 'no dated Tallinn event' });
  for (const f of failed) {
    await db.patch(`raw_items?id=eq.${f.id}`, { status: f.attempts >= MAX_ATTEMPTS ? 'error' : 'new', attempts: f.attempts, note: f.note });
  }

  // Events written before any model was available get classified now.
  if (models.ready) {
    const waiting = await db.select<{ id: string; title: string; venue_name: string | null; description: string | null; starts_at: string; status_note: string | null }>(
      `events?city=eq.${CITY}&relevance=is.null&status=in.(review,published)&archived_at=is.null&or=(status_note.is.null,status_note.not.like.manual*)&order=starts_at.asc&limit=200&select=id,title,venue_name,description,starts_at,status_note`);
    const cands = waiting.map(w => ({ title: w.title, venue_name: w.venue_name, description: w.description, starts_at: w.starts_at, has_time: true, engine: 'db' }) as Candidate);
    const late = await classify(models, cands);
    let n = 0;
    for (let i = 0; i < waiting.length; i++) {
      const e = late[i];
      if (Number.isNaN(e.relevance)) continue;
      const { status, note } = decide(e, (waiting[i].status_note ?? '').startsWith('trusted'));
      await db.patch(`events?id=eq.${encodeURIComponent(waiting[i].id)}`, {
        kind: e.kind, tags: e.tags, relevance: e.relevance, status, status_note: note,
      });
      n++;
    }
    if (waiting.length) log(`classified ${n} of ${waiting.length} earlier events`);
  }

  // ── 6. archive and health ──
  await refreshEnglish(db, english, CITY, 40);
  if (!flag('--no-posters')) {
    try {
      const n = await attachPosters(db, CITY, Number(opt('--max-event-pages') ?? 15));
      if (n) log(`posters: ${n} events got the picture their own page attaches to them`);
    } catch (e) { log(`posters failed: ${(e as Error).message}`); }
  }
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 12 * 3600_000).toISOString();
  await db.patch(`events?archived_at=is.null&or=(and(ends_at.is.null,starts_at.lt.${cutoff}),ends_at.lt.${now})`, { archived_at: now });
  const stale = new Date(Date.now() - KEEP_RAW_DAYS * 86_400_000).toISOString();
  await db.req('DELETE', `raw_items?status=in.(done,skipped,error)&fetched_at=lt.${stale}`);
  if (!flag('--no-verification')) await verifyPlaces(db, CITY, Number(opt('--max-website-checks') ?? 10));

  for (const [id, h] of Object.entries(health)) {
    const [prev] = await db.select<{ consecutive_failures: number }>(`sources?id=eq.${encodeURIComponent(id)}&select=consecutive_failures`);
    await db.patch(`sources?id=eq.${encodeURIComponent(id)}`, h.ok
      ? { last_run_at: now, last_ok_at: now, last_yield: h.yield, consecutive_failures: 0, last_error: null }
      : { last_run_at: now, last_yield: 0, consecutive_failures: (prev?.consecutive_failures ?? 0) + 1, last_error: h.error ?? null });
  }
  log(`wrote ${fresh.length} new events, refreshed ${existing.size}; ${models.calls} model calls, ${Math.round(usage.neurons)} Workers AI neurons`);
  if (runId != null) {
    await db.patch(`pipeline_runs?id=eq.${runId}`, {
      finished_at: new Date().toISOString(), neurons: usage.neurons, model_calls: models.calls,
      events_new: fresh.length, events_seen: existing.size, ok: !Object.values(health).some(h => !h.ok),
    });
  }

  const failing = Object.entries(health).filter(([, h]) => !h.ok);
  const empty = Object.entries(health).filter(([, h]) => h.ok && h.yield === 0);
  if (failing.length || empty.length) {
    // A non-zero exit marks the Actions run red, which is the alert.
    console.error(`[pipeline] sources failing: ${failing.map(([id, h]) => `${id} (${h.error})`).join('; ') || 'none'}; empty: ${empty.map(([id]) => id).join(', ') || 'none'}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main().catch(e => { console.error('[pipeline] failed:', e); process.exit(1); });
}
