// The events pipeline, one pass:
//   1. sync sources.<city>.json into the sources table
//   2. collect every source into raw_items (only new or changed items)
//   3. read pending raw items into candidates (structured parse, or a model)
//   4. classify candidates (kind, relevance, English title and summary)
//   5. resolve venues to places, write events and their provenance
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
import { collectTelegram, collectPage, collectRss } from './sources/text.ts';
import { Models, extractEvents, classify } from './llm.ts';
import { Places, type Place } from './places.ts';
import { Db, inList, chunks } from './db.ts';
import { sha, nameKey } from './util.ts';
import { tallinnDay } from './time.ts';

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

const CITY = opt('--city') ?? 'tallinn';
const DRY = flag('--dry-run');
const ONLY = opt('--source');
const MAX_ITEMS = Number(opt('--max-items') ?? 400);

const log = (...xs: unknown[]) => console.log('[pipeline]', ...xs);

export function loadSources(city = CITY): Source[] {
  const url = new URL(`./sources.${city}.json`, import.meta.url);
  return (JSON.parse(readFileSync(url, 'utf8')) as Source[]).map(s => ({ ...s, active: true } as Source));
}

async function collect(source: Source): Promise<RawItem[]> {
  switch (source.kind) {
    case 'fienta': return fienta.collect(source);
    case 'jsonld': return jsonld.collect(source);
    case 'telegram': return collectTelegram(source);
    case 'html': return collectPage(source);
    case 'rss': return collectRss(source);
  }
}

const needsModel = (s: Source) => s.kind === 'telegram' || s.kind === 'html' || s.kind === 'rss';

/** Raw item → candidates. Null means "not now" (no model available). */
async function read(item: RawItem, source: Source, models: Models): Promise<Candidate[] | null> {
  if (source.kind === 'fienta') return fienta.extract(item);
  if (source.kind === 'jsonld') return jsonld.extract(item, source);
  if (!models.ready) return null;
  const p = item.payload as { text?: string; title?: string; posted_at?: string; photos?: string[] };
  const text = [p.title, p.text].filter(Boolean).join('\n\n');
  if (!text.trim() && !p.photos?.length) return [];
  return extractEvents(models, {
    text, source: `${source.label} (${source.handle})`, postedAt: p.posted_at ?? null,
    images: p.photos ?? [], pageUrl: item.url ?? null,
  });
}

export function eventId(city: string, c: Candidate, placeId: string | null): string {
  const local = new Date(c.starts_at).toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' });
  const where = placeId ?? nameKey(c.venue_name ?? '');
  return `ev_${sha([city, nameKey(c.title), tallinnDay(c.starts_at), c.has_time ? local : '', where].join('|')).slice(0, 16)}`;
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
  const models = new Models();
  if (flag('--models')) {
    for (const l of models.available) {
      try {
        const answer = await l.call('Answer in JSON.', 'Return {"ok": true}.', { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, []);
        log(`lane ${l.name} (${l.model}) answered: ${answer.slice(0, 60)}`);
      } catch (e) { log(`lane ${l.name} (${l.model}) failed: ${(e as Error).message}`); }
    }
    if (!models.available.length) log('no model lane has a key; see docs/models.md');
    return;
  }

  const sources = loadSources().filter(s => !ONLY || s.id === ONLY);
  const db = DRY ? null : new Db();
  log(`${DRY ? 'dry run' : 'run'} for ${CITY}: ${sources.length} sources, model lanes: ${models.available.map(l => `${l.name}:${l.model}`).join(', ') || 'none'}`);

  if (db) {
    await db.upsert('sources', sources.map(({ id, city, kind, url, handle, label, curated, config }) =>
      ({ id, city, kind, url, handle, label, curated, config, active: true })), 'id');
  }

  // ── 2. collect ──
  const pending: Pending[] = [];
  const health: Record<string, { ok: boolean; yield: number; error?: string }> = {};
  for (const source of sources) {
    try {
      const items = await collect(source);
      health[source.id] = { ok: true, yield: items.length };
      if (!db) { pending.push(...items.map(item => ({ rawId: null, item, source }))); continue; }
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
  const rawOutcome = new Map<number, { status: string; note: string | null }>();
  for (const p of pending) {
    try {
      const cands = await read(p.item, p.source, models);
      if (cands === null) continue;               // waits for a model
      cands.forEach(c => found.push({ c, p }));
      if (p.rawId !== null) rawOutcome.set(p.rawId, cands.length ? { status: 'done', note: null } : { status: 'skipped', note: 'no dated Tallinn event' });
    } catch (e) {
      if (p.rawId !== null) rawOutcome.set(p.rawId, { status: 'error', note: (e as Error).message.slice(0, 300) });
    }
  }
  log(`read ${pending.length} items into ${found.length} candidates (${models.calls} model calls)`);

  // ── 4. classify ──
  const enrich = await classify(models, found.map(f => f.c));

  // ── 5. places and events ──
  const existingPlaces = db
    ? await db.select<Place>(`places?city=eq.${CITY}&select=id,city,name,aliases,kind,neighborhood,address,lat,lng,osm_id`)
    : [];
  const places = new Places(existingPlaces, CITY, DRY && !flag('--geocode') ? 0 : Number(opt('--max-geocode') ?? 25));

  const events = new Map<string, Record<string, unknown>>();
  const provenance: Record<string, unknown>[] = [];
  for (let i = 0; i < found.length; i++) {
    const { c, p } = found[i];
    const e = enrich[i];
    const place = await places.resolve(c, !(DRY && !flag('--geocode')));
    const id = eventId(CITY, c, place?.id ?? null);
    const trusted = p.source.curated || (p.source.kind === 'fienta' && fienta.trustedOrganiser(p.item, p.source));
    const { status, note } = decide(e, trusted);
    provenance.push({ event_id: id, source_id: p.source.id, raw_item_id: p.rawId, url: c.url ?? p.item.url ?? null, last_seen_at: new Date().toISOString() });
    if (events.has(id)) continue;
    events.set(id, {
      id, city: CITY, title: c.title, title_en: e.title_en, summary_en: e.summary_en, description: c.description ?? null,
      kind: e.kind, tags: e.tags, place_id: place?.id ?? null, venue_name: c.venue_name ?? null, address: c.address ?? null,
      lat: c.lat ?? null, lng: c.lng ?? null, starts_at: c.starts_at, ends_at: c.ends_at ?? null, has_time: c.has_time,
      is_free: c.is_free ?? null, price_min: c.price_min ?? null, price_max: c.price_max ?? null, currency: c.currency ?? null,
      ticket_url: c.ticket_url ?? null, url: c.url ?? null, image_url: c.image_url ?? null, language: c.language ?? null,
      series_key: c.series_key ?? null, relevance: Number.isNaN(e.relevance) ? null : e.relevance,
      status, status_note: note, engine: `${c.engine}+${e.engine}`, last_seen_at: new Date().toISOString(),
    });
  }

  const counts = [...events.values()].reduce<Record<string, number>>((a, e) => ({ ...a, [String(e.status)]: (a[String(e.status)] ?? 0) + 1 }), {});
  log(`events: ${events.size} (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}), new places: ${places.created.length}`);

  if (!db) {
    const out = opt('--out');
    const rows = [...events.values()].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
    if (out) writeFileSync(out, JSON.stringify({ events: rows, places: places.created, health }, null, 2));
    for (const e of rows.slice(0, Number(opt('--show') ?? 15))) {
      log(`  ${e.status} ${new Date(String(e.starts_at)).toLocaleString('en-GB', { timeZone: 'Europe/Tallinn', dateStyle: 'short', timeStyle: 'short' })} · ${e.kind} · ${e.title_en ?? e.title} @ ${e.venue_name ?? '?'}`);
    }
    return;
  }

  if (places.created.length) {
    await db.upsert('places', places.created.map(p => ({ ...p, kind: p.kind ?? null })), 'id');
  }
  const ids = [...events.keys()];
  const existing = new Set<string>();
  for (const part of chunks(ids, 150)) {
    for (const r of await db.select<{ id: string }>(`events?id=in.${encodeURIComponent(inList(part))}&select=id`)) existing.add(r.id);
  }
  const fresh = ids.filter(id => !existing.has(id)).map(id => events.get(id)!);
  for (const part of chunks(fresh, 200)) await db.insert('events', part);
  // Known events: refresh the facts, keep whatever status a person or an earlier run gave them.
  for (const id of ids.filter(id => existing.has(id))) {
    const { status: _s, status_note: _n, relevance: _r, id: _i, ...facts } = events.get(id)!;
    await db.patch(`events?id=eq.${encodeURIComponent(id)}`, facts);
  }
  const prov = new Map(provenance.map(p => [`${p.event_id}|${p.source_id}`, p]));
  for (const part of chunks([...prov.values()], 200)) await db.upsert('event_sources', part, 'event_id,source_id');

  for (const [rawId, o] of rawOutcome) {
    await db.patch(`raw_items?id=eq.${rawId}`, { status: o.status, note: o.note });
  }

  // Events written before any model was available get classified now.
  if (models.ready) {
    const waiting = await db.select<{ id: string; title: string; venue_name: string | null; description: string | null; starts_at: string; status_note: string | null }>(
      `events?city=eq.${CITY}&relevance=is.null&status=in.(review,published)&archived_at=is.null&order=starts_at.asc&limit=200&select=id,title,venue_name,description,starts_at,status_note`);
    const cands = waiting.map(w => ({ title: w.title, venue_name: w.venue_name, description: w.description, starts_at: w.starts_at, has_time: true, engine: 'db' }) as Candidate);
    const late = await classify(models, cands);
    let n = 0;
    for (let i = 0; i < waiting.length; i++) {
      const e = late[i];
      if (Number.isNaN(e.relevance)) continue;
      const { status, note } = decide(e, (waiting[i].status_note ?? '').startsWith('trusted'));
      await db.patch(`events?id=eq.${encodeURIComponent(waiting[i].id)}`, {
        kind: e.kind, tags: e.tags, relevance: e.relevance, title_en: e.title_en, summary_en: e.summary_en, status, status_note: note,
      });
      n++;
    }
    if (waiting.length) log(`classified ${n} of ${waiting.length} earlier events`);
  }

  // ── 6. archive and health ──
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 12 * 3600_000).toISOString();
  await db.patch(`events?archived_at=is.null&or=(and(ends_at.is.null,starts_at.lt.${cutoff}),ends_at.lt.${now})`, { archived_at: now });

  for (const [id, h] of Object.entries(health)) {
    const [prev] = await db.select<{ consecutive_failures: number }>(`sources?id=eq.${encodeURIComponent(id)}&select=consecutive_failures`);
    await db.patch(`sources?id=eq.${encodeURIComponent(id)}`, h.ok
      ? { last_run_at: now, last_ok_at: now, last_yield: h.yield, consecutive_failures: 0, last_error: null }
      : { last_run_at: now, last_yield: 0, consecutive_failures: (prev?.consecutive_failures ?? 0) + 1, last_error: h.error ?? null });
  }
  log(`wrote ${fresh.length} new events, refreshed ${existing.size}; ${models.calls} model calls`);

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
