// Evenings: two to four stops on foot around one listing. Code finds every
// route that works (a picked place before, a bar or club after, each close,
// open when you would be there); a free model then chooses the best few for
// each day and writes a plain title and one sentence on why they go
// together. The model only sees facts we hold and can only pick from the
// routes code built; anything else it says is dropped. With no model lane
// the same routes are titled by rule. The site reads the `routes` table and
// checks every stop again in the page, so a stale route is never shown.
//
//   node pipeline/routes.ts             compose and write
//   node pipeline/routes.ts --dry-run   compose and print
//   --public                            read with SUPABASE_ANON_KEY (a dry run needs no service key)
//   --out file.json                     also save the rows

import { writeFileSync } from 'node:fs';
import { Db, chunks, inList } from './db.ts';
import { Models, PLACE_KINDS } from './llm.ts';
import { hoursAt } from './hours.ts';
import { TZ, tallinnDay, tallinnToIso } from './time.ts';
import { EVENT_KINDS } from './types.ts';
import { nameKey } from './util.ts';

export interface RouteEvent { id: string; title: string; title_en: string | null; kind: string | null; starts_at: string; ends_at: string | null; has_time: boolean | null; place_id: string | null; flag: string | null }
export interface RoutePlace { id: string; name: string; kind: string | null; lat: number | null; lng: number | null; opening_hours: string | null; pick_note: string | null; neighborhood: string | null }
export interface RouteStop { type: 'place' | 'event'; id: string; minute: number }
export interface RouteCandidate { id: string; day: string; area: string; score: number; stops: RouteStop[]; walkMin: number }
export interface RouteRow { id: string; city: string; day: string; area: string; title: string; blurb: string | null; stops: RouteStop[]; score: number; engine: string }

const ANCHORS = new Set(['gig', 'club', 'film', 'theatre', 'talk', 'workshop', 'festival', 'exhibition']);
const BEFORE = new Set(['record store', 'bookshop', 'gallery', 'thrift', 'arts centre', 'cinema']);
const AFTER = new Set(['bar', 'club', 'taproom']);
// Keep these in step with route.js and geo.js: one walking pace, the same walks and rules.
const MAX_BEFORE = 15, MAX_AFTER = 12, WALK_M_PER_MIN = 80, STAY = 40;
// The hours a kind usually keeps (route.js USUAL). A place with none filed is a stop only inside them,
// as the page checks every stored walk the same way and drops one that breaks this.
export const USUAL: Record<string, [number, number]> = {
  'record store': [11 * 60, 19 * 60], bookshop: [10 * 60, 19 * 60], thrift: [10 * 60, 19 * 60],
  gallery: [11 * 60, 18 * 60], museum: [10 * 60, 18 * 60], 'arts centre': [11 * 60, 19 * 60],
  bar: [17 * 60, 60], taproom: [15 * 60, 23 * 60], club: [23 * 60, 4 * 60],
};
const usual = (kind: string | null, minute: number): boolean => {
  const w = USUAL[kind ?? ''];
  if (!w) return false;
  const m = ((minute % 1440) + 1440) % 1440;
  return w[0] < w[1] ? m >= w[0] && m < w[1] : m >= w[0] || m < w[1];
};
// What a later walk the same day loses for ending where, or at the kind of place where, a better one ends.
const REPEAT_END = 1;

const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const minuteOf = (iso: string): number => {
  const p = Object.fromEntries(clockFmt.formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return +p.hour * 60 + +p.minute;
};
export const clockText = (m: number): string => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const r = 6371000, k = Math.PI / 180, dLat = (b.lat - a.lat) * k, dLng = (b.lng - a.lng) * k;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
};
const walkMin = (m: number): number => Math.max(1, Math.round(m / WALK_M_PER_MIN));
const round5 = (m: number): number => Math.round(m / 5) * 5;

/** Every working evening for one day, the best one around each listing. */
export function candidatesForDay(day: string, events: RouteEvent[], hostOf: (id: string) => RoutePlace | undefined, picked: RoutePlace[], nowMs: number): RouteCandidate[] {
  const dayStart = Date.parse(tallinnToIso(`${day} 00:00`) ?? '');
  if (Number.isNaN(dayStart)) return [];
  const today = tallinnDay(new Date(nowMs).toISOString()) === day;
  const floor = today ? minuteOf(new Date(nowMs).toISOString()) + 20 : 11 * 60;
  const at = (minute: number) => new Date(dayStart + minute * 60_000);
  const spots = picked.filter(p => p.lat != null && p.lng != null);
  const pos = (p: RoutePlace) => ({ lat: p.lat as number, lng: p.lng as number });
  // Open by its filed hours, or unfiled and inside its kind's usual ones, when you arrive and five
  // minutes before you leave (route.js fitsStay).
  const fits = (p: RoutePlace, minute: number) => {
    const h = hoursAt(p.opening_hours, at(minute));
    return h === 'open' || (h === 'unknown' && usual(p.kind, minute));
  };
  const stays = (p: RoutePlace, minute: number, leave: number) => fits(p, minute) && fits(p, Math.max(leave, minute + 10) - 5);
  type Stop = { p: RoutePlace; w: number; minute: number; s: number };
  const drafts: { e: RouteEvent; host: RoutePlace; start: number; before: Stop | null; afters: Stop[]; base: number }[] = [];

  for (const e of events) {
    if (!e.has_time || ['cancelled', 'postponed', 'sold_out'].includes(e.flag ?? '') || !ANCHORS.has(e.kind ?? '') || !e.place_id) continue;
    if (tallinnDay(e.starts_at) !== day) continue;
    const host = hostOf(e.place_id);
    if (!host || host.lat == null || host.lng == null) continue;
    const start = minuteOf(e.starts_at);
    if (start < floor || start >= 24 * 60) continue;
    const here = pos(host);
    const len = e.ends_at ? Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60_000) : 120;
    const end = start + (Number.isFinite(len) && len > 0 ? len : 120);

    let before: Stop | null = null;
    const afters: Stop[] = [];
    for (const p of spots) {
      if (p.id === host.id) continue;
      const w = walkMin(metres(pos(p), here));
      if (w < 2) continue;                                                  // the same building is not a walk
      if (BEFORE.has(p.kind ?? '') && w <= MAX_BEFORE) {
        const minute = Math.max(round5(floor - 10), round5(start - w - 60));
        if (minute + 30 + w > start) continue;                              // half an hour there, at least
        if (!stays(p, minute, start - w)) continue;
        const s = (hoursAt(p.opening_hours, at(minute)) === 'open' ? 2 : 1) - w / 30 + (p.pick_note ? .2 : 0);
        if (!before || s > before.s) before = { p, w, minute, s };
      }
      if (AFTER.has(p.kind ?? '') && w <= MAX_AFTER) {
        const minute = round5(end + 15 + w);
        if (minute > 23 * 60 + 30 || minute < (p.kind === 'club' ? 21 * 60 : 16 * 60)) continue;   // a club after nine, a bar after four, nothing past half eleven
        if (!stays(p, minute, minute + STAY)) continue;
        afters.push({ p, w, minute, s: (hoursAt(p.opening_hours, at(minute)) === 'open' ? 1.5 : .8) - w / 30 });
      }
    }
    if (!before && !afters.length) continue;
    afters.sort((a, b) => b.s - a.s || a.p.id.localeCompare(b.p.id));
    let base = 1;                                                          // the host is a picked place or a listed one; both are fine
    base -= Math.max(0, start - floor - 360) / 120;                        // prefer the next few hours
    if (before) base += 3 + before.s;
    drafts.push({ e, host, start, before, afters, base });
  }

  // Filed hours score higher than unfiled ones, and taprooms are the after-stops that always have
  // them, so six of seven walks once ended at one. The best walk keeps its best after-stop; each
  // walk below it weighs the places, and kinds of place, the walks above already end at.
  const rank = (d: typeof drafts[number]) => d.base + (d.afters[0] ? 2 + d.afters[0].s : 0);
  drafts.sort((a, b) => rank(b) - rank(a) || a.e.id.localeCompare(b.e.id));
  const endKinds = new Map<string, number>(), endPlaces = new Map<string, number>();
  const out: RouteCandidate[] = [];
  for (const { e, host, start, before, afters, base } of drafts) {
    const after = afters
      .map(o => ({ o, v: o.s - REPEAT_END * ((endKinds.get(o.p.kind ?? '') ?? 0) + (endPlaces.get(o.p.id) ?? 0)) }))
      .sort((a, b) => b.v - a.v || a.o.p.id.localeCompare(b.o.p.id))[0]?.o ?? null;
    const stops: RouteStop[] = [];
    let score = base, walk = 0;
    if (before) { stops.push({ type: 'place', id: before.p.id, minute: before.minute }); walk += before.w; }
    stops.push({ type: 'event', id: e.id, minute: start });
    if (after) {
      stops.push({ type: 'place', id: after.p.id, minute: after.minute }); score += 2 + after.s; walk += after.w;
      endKinds.set(after.p.kind ?? '', (endKinds.get(after.p.kind ?? '') ?? 0) + 1);
      endPlaces.set(after.p.id, (endPlaces.get(after.p.id) ?? 0) + 1);
    }
    out.push({ id: `${day}:${e.id}`, day, area: host.neighborhood ?? '', score: Math.round(score * 100) / 100, stops, walkMin: walk });
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** The few the model chooses between: best first, no picked place more than twice. */
export function shortlist(cands: RouteCandidate[], n = 6): RouteCandidate[] {
  const used = new Map<string, number>();
  const out: RouteCandidate[] = [];
  for (const c of cands) {
    const ids = c.stops.filter(s => s.type === 'place').map(s => s.id);
    if (ids.some(id => (used.get(id) ?? 0) >= 2)) continue;
    ids.forEach(id => used.set(id, (used.get(id) ?? 0) + 1));
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

// ── Words ───────────────────────────────────────────────────

// The words of route.js titleFor, so a walk reads the same whether this run or the page composed it.
const BEFORE_WORD: Record<string, string> = { 'record store': 'Records', bookshop: 'Books', gallery: 'A gallery', thrift: 'A thrift shop', 'arts centre': 'An arts centre', cinema: 'A film', museum: 'A museum' };
const FIRST_WORD: Record<string, string> = { taproom: 'Craft beer', bar: 'A bar', club: 'A club' };
const ANCHOR_WORD: Record<string, string> = { gig: 'A gig', club: 'A club night', film: 'A film', theatre: 'A stage', talk: 'A talk', workshop: 'A workshop', exhibition: 'An opening', festival: 'A festival' };
const ANOTHER: Record<string, string> = { 'A late drink': 'Another late drink', 'A drink': 'Another drink', 'A club': 'Another club', 'A bar': 'Another bar', 'A film': 'Another film', 'A gallery': 'Another gallery', 'A thrift shop': 'Another thrift shop' };

/** The title when no model has written one, or when what it wrote is only a list. */
export function ruleTitle(c: RouteCandidate, kinds: Map<string, string | null>): string {
  const used = new Set<string>();
  return c.stops.map((s, i) => {
    const k = kinds.get(`${s.type}:${s.id}`) ?? '';
    let w = s.type === 'event' ? ANCHOR_WORD[k] ?? 'A show'
      : BEFORE_WORD[k] ?? (i === 0 ? FIRST_WORD[k] ?? 'A place' : s.minute >= 21 * 60 ? 'A late drink' : k === 'club' ? 'A club' : 'A drink');
    if (used.has(w) && ANOTHER[w]) w = ANOTHER[w];
    used.add(w);
    return i === 0 ? w : w.charAt(0).toLowerCase() + w.slice(1);
  }).join(', ');
}

// Kind words and stop names with nothing between them ("Thrift gig taproom", "Terminal, workshop,
// taproom", "Film bar") list the stops; they are not a title. "Records, a stage, a late drink" is one.
const KIND_WORDS = new Set([...PLACE_KINDS, ...EVENT_KINDS, 'taproom', 'museum', 'records', 'books', 'vinyl', 'beer', 'craft',
  'drink', 'drinks', 'stage', 'show', 'comedy', 'opening', 'screening', 'concert', 'dj'].flatMap(k => k.split(' ')));
const LINKS = new Set(['and', 'then', 'plus']);
export function listTitle(title: string, stopNames: string[]): boolean {
  const own = new Set(stopNames.flatMap(n => nameKey(n).split(' ')));
  const words = nameKey(title).split(' ').filter(Boolean);
  return words.length > 0 && words.every(w => LINKS.has(w) || own.has(w) || KIND_WORDS.has(w) || KIND_WORDS.has(w.replace(/s$/, '')));
}

/** A model's words, or null when they break the house voice. */
export function cleanText(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length < 3 || t.length > max) return null;
  if (/[<>!]|https?:|@\w|discover|\b(vibes?|curated|perfect|ideal|cozy|cosy|gem|unwind|immerse|iconic|legendary|stunning|amazing|experience)\b/i.test(t)) return null;
  return t;
}

const SCHEMA = {
  type: 'object',
  properties: { routes: { type: 'array', maxItems: 3, items: { type: 'object', properties: {
    id: { type: 'string' }, title: { type: 'string' }, blurb: { type: 'string' },
  }, required: ['id', 'title', 'blurb'] } } },
  required: ['routes'],
};
const SYSTEM = `You choose and name evening routes for visitors to Tallinn who like independent and alternative culture.
Each candidate is a short walk through two to four stops: a place, then one dated listing, then maybe a bar. Choose the best up to three, best first, preferring routes that differ in area and in kind of evening.
For each, give a plain title of two to six words that reads as a phrase (for example "Records, a stage, a late drink"), not a list of kinds or names such as "Thrift gig taproom", and one plain sentence of at most 140 characters on why the stops go together.
Use only the facts given. Do not invent details, hours, prices or opinions, and add no adjectives that are not in the facts. No exclamation marks, no marketing words, never the word "discover". Plain English, present tense.
Answer with JSON only.`;

export interface Names { label: (s: RouteStop) => string; kind: (s: RouteStop) => string | null; note: (s: RouteStop) => string | null }

/** What the model sees for one day: only what we hold. */
export function modelBrief(day: string, cands: RouteCandidate[], names: Names): string {
  return JSON.stringify({ day, candidates: cands.map(c => ({
    id: c.id, area: c.area, walkMinutes: c.walkMin,
    stops: c.stops.map(s => ({ time: clockText(s.minute), type: s.type, name: names.label(s), kind: names.kind(s), note: names.note(s) })),
  })) });
}

/** The routes to keep: the model's choices that are real, then the best of the rest. */
export function finalise(day: string, city: string, cands: RouteCandidate[], answer: unknown, ruleTitleOf: (c: RouteCandidate) => string, engine: string, want = 3,
  stopNamesOf: (c: RouteCandidate) => string[] = () => []): RouteRow[] {
  const byId = new Map(cands.map(c => [c.id, c]));
  const rows: RouteRow[] = [];
  const seen = new Set<string>();
  const raw = (answer as { routes?: unknown[] } | null)?.routes;
  for (const r of Array.isArray(raw) ? raw : []) {
    const x = r as { id?: unknown; title?: unknown; blurb?: unknown };
    const c = typeof x.id === 'string' ? byId.get(x.id) : undefined;
    if (!c || seen.has(c.id) || rows.length >= want) continue;
    seen.add(c.id);
    // "Late" has to be true: nothing is late before nine.
    const named = cleanText(x.title, 60);
    const lateOk = !named || !/\blate\b/i.test(named) || c.stops[c.stops.length - 1].minute >= 21 * 60;
    const title = named && lateOk && !listTitle(named, stopNamesOf(c)) ? named : ruleTitleOf(c);
    rows.push({ id: `${city}:${c.id}`, city, day, area: c.area, title, blurb: cleanText(x.blurb, 160), stops: c.stops, score: c.score, engine });
  }
  for (const c of cands) {
    if (rows.length >= want) break;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    rows.push({ id: `${city}:${c.id}`, city, day, area: c.area, title: ruleTitleOf(c), blurb: null, stops: c.stops, score: c.score, engine: 'rules' });
  }
  return rows;
}

// ── The run ─────────────────────────────────────────────────

const iso = (ms: number) => new Date(ms).toISOString();

export async function composeRoutes(db: Db, city: string, models: Models | null, opts: { dry?: boolean; days?: number; now?: number } = {}): Promise<RouteRow[]> {
  const now = opts.now ?? Date.now();
  const startedAt = iso(now);
  const days = Array.from({ length: opts.days ?? 3 }, (_, i) => tallinnDay(iso(now + i * 86_400_000)));
  const to = iso(now + ((opts.days ?? 3) + 1) * 86_400_000);
  const events = await db.all<RouteEvent>(`events?city=eq.${city}&status=eq.published&archived_at=is.null&merged_into=is.null&has_time=eq.true&starts_at=gte.${encodeURIComponent(iso(now))}&starts_at=lt.${encodeURIComponent(to)}&order=starts_at.asc,id.asc&select=id,title,title_en,kind,starts_at,ends_at,has_time,place_id,flag`);
  const places = await db.all<RoutePlace>(`places?city=eq.${city}&picked=eq.true&status=eq.active&merged_into=is.null&order=id.asc&select=id,name,kind,lat,lng,opening_hours,pick_note,neighborhood`);
  const placeById = new Map(places.map(p => [p.id, p]));
  // Hosts need coordinates too, and they are not always picked.
  const hostIds = [...new Set(events.map(e => e.place_id).filter((x): x is string => !!x && !placeById.has(x)))];
  for (const part of chunks(hostIds, 100)) {
    for (const p of await db.select<RoutePlace>(`places?id=in.${inList(part)}&select=id,name,kind,lat,lng,opening_hours,pick_note,neighborhood`)) placeById.set(p.id, p);
  }
  const eventById = new Map(events.map(e => [e.id, e]));
  const names: Names = {
    label: s => (s.type === 'event' ? (eventById.get(s.id)?.title_en || eventById.get(s.id)?.title) : placeById.get(s.id)?.name) ?? s.id,
    kind: s => (s.type === 'event' ? eventById.get(s.id)?.kind : placeById.get(s.id)?.kind) ?? null,
    note: s => (s.type === 'place' ? placeById.get(s.id)?.pick_note ?? null : null),
  };
  const kinds = new Map<string, string | null>([...events.map(e => [`event:${e.id}`, e.kind] as const), ...[...placeById.values()].map(p => [`place:${p.id}`, p.kind] as const)]);

  const all: RouteRow[] = [];
  for (const day of days) {
    // Only picked places may come before or after; a listing's own venue is its anchor, never a stop.
    const real = shortlist(candidatesForDay(day, events, id => placeById.get(id), places, now));
    if (!real.length) continue;
    let answer: unknown = null, engine = 'rules';
    if (models?.ready) {
      try {
        const r = await models.ask(SYSTEM, modelBrief(day, real, names), SCHEMA);
        answer = r.data; engine = r.engine;
      } catch (e) { console.warn(`[routes] ${day}: no model answer (${(e as Error).message}); titled by rule`); }
    }
    all.push(...finalise(day, city, real, answer, c => ruleTitle(c, kinds), engine, 3, c => c.stops.map(names.label)));
  }

  if (!opts.dry) {
    await db.upsert('routes', all, 'id');
    await db.req('DELETE', `routes?city=eq.${city}&created_at=lt.${encodeURIComponent(startedAt)}`);
  }
  return all;
}

if (import.meta.main) {
  const dry = process.argv.includes('--dry-run');
  const city = process.argv.find(a => a.startsWith('--city='))?.slice(7) ?? 'tallinn';
  // A dry run only reads published events and places, which the public key may do.
  const db = new Db(dry && process.argv.includes('--public') ? process.env.SUPABASE_ANON_KEY?.trim() : undefined);
  const models = new Models(undefined, 6, Number(process.env.WORKERS_AI_NEURON_BUDGET ?? 2400));
  composeRoutes(db, city, models, { dry }).then(rows => {
    for (const r of rows) console.log(`${r.day} ${r.area.padEnd(12)} ${r.title}  [${r.engine}]${r.blurb ? `\n    ${r.blurb}` : ''}\n    ${r.stops.map(s => `${s.type}:${s.id}@${clockText(s.minute)}`).join(' → ')}`);
    const out = process.argv.find(a => a.startsWith('--out='))?.slice(6);
    if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
    console.log(`${rows.length} routes${dry ? ' (dry run, nothing written)' : ' written'}`);
  }).catch(e => { console.error('[routes] failed:', e); process.exit(1); });
}
