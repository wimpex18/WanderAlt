// Venue sites built with Next.js's App Router ship their programme inside the page as React Server
// Component ("flight") data rather than as rendered HTML: script tags `self.__next_f.push([1,"…"])`
// whose strings join into rows, `<hex id>:<JSON>` or `<hex id>:T<hex byte length>,<text>`. In the
// JSON "$3f" names another row, "$25:props:children" a path inside one, "$undefined" nothing. The
// rendered HTML shows at most a title and a time (Paavli's page, read as text by a model, gave no events
// in any run); the end, the ticket link, the place and the description are only in this data, so this
// reads the records themselves and no model is asked. Structure as seen on 9 October 2026:
//   Paavli Kultuurivabrik, https://www.kultuurivabrik.ee/en/events: `data`, the venue's Facebook
//     events: id, title, content (a text row), date "2026-10-09T20:00:00+0300", end_time, ticketUrl,
//     eventUrl, cover.source. The cover is a signed Facebook CDN address that expires, so it is never
//     artwork; the venue's page has no page per event, only an anchor (/en/events#<id>).
//   Von Krahl, https://vonkrahl.ee/: the layout's EventsProvider carries `strapiEvents` (the theatre's
//     own events: id, title, start and end in UTC, location, slug of /sundmused/<slug>, eventType,
//     saleStatus, buyTicketsUrl) and `fientaEvents` (its Fienta ticket calendar: start and end as
//     Tallinn wall time, location, fientaId, slug of the production /lavastused/<slug>, and the
//     production with its poster, "/uploads/…" on https://strapi.vonkrahl.ee/, where the site's own
//     image links point). One show can be in both lists; the first wins.
//
// config.records: one mapping per record list, in order of preference:
//   { list, id, title, start, end?, where?, ticket?, page?, image?, image_base?, description?, status?, kind?, series? }
//   A value is a path in the record ("project.poster.url"); an array tries each path in turn. page is a
//   template filled from the record ("https://vonkrahl.ee/sundmused/{slug}"); a record without that
//   field links to the programme page. image_base resolves a relative image path. status words
//   (soldOut, cancelled) set the flag. Places come from `where` through config.venue_map (programme.ts);
//   config.skip_titles drops shows named for another town ("Tartu Punch"); config.days: how far ahead
//   (default 120).

import type { Candidate, RawItem, Source } from '../types.ts';
import { getHtml, decodeEntities, htmlToText, clip, nameKey, scrubContacts } from '../util.ts';
import { toIso } from '../time.ts';
import { textFlag } from '../flags.ts';
import { whereOf, cleanLink, samePlace } from './programme.ts';

type Rows = Map<string, unknown>;

/** The flight data's text: every `self.__next_f.push([1, "…"])` string, in order. */
export function flightText(html: string): string {
  let out = '';
  for (const m of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    try {
      const a = JSON.parse(m[1]) as unknown[];
      if (a[0] === 1 && typeof a[1] === 'string') out += a[1];
    } catch { /* a broken chunk is skipped, not fatal */ }
  }
  return out;
}

/** Rows by id: parsed JSON, or the string of a text row. A text row's length counts UTF-8 bytes. */
export function flightRows(text: string): Rows {
  const buf = Buffer.from(text, 'utf8');
  const rows: Rows = new Map();
  let i = 0;
  while (i < buf.length) {
    const colon = buf.indexOf(0x3a, i);
    if (colon < 0) break;
    const id = buf.toString('utf8', i, colon).trim();
    if (/^[0-9a-f]+$/.test(id) && buf[colon + 1] === 0x54) {             // 'T': a text row
      const comma = buf.indexOf(0x2c, colon);
      const len = parseInt(buf.toString('utf8', colon + 2, comma), 16);
      if (comma < 0 || !Number.isFinite(len)) break;
      rows.set(id, buf.toString('utf8', comma + 1, comma + 1 + len));
      i = comma + 1 + len;
      continue;
    }
    let nl = buf.indexOf(0x0a, colon);
    if (nl < 0) nl = buf.length;
    const body = buf.toString('utf8', colon + 1, nl);
    // Module rows (I[…]) and hints (HL[…]) are not data.
    if (/^[0-9a-f]+$/.test(id) && /^[[{"\d-]|^(?:null|true|false)$/.test(body)) {
      try { rows.set(id, JSON.parse(body)); } catch { /* skipped */ }
    }
    i = nl + 1;
  }
  return rows;
}

const isElement = (x: unknown): x is unknown[] => Array.isArray(x) && x[0] === '$' && x.length === 4;

/** A value with its references followed: "$3f" is row 3f, "$6:props:data" a path inside row 6. */
export function deref(v: unknown, rows: Rows, depth = 0): unknown {
  if (typeof v !== 'string' || !v.startsWith('$') || depth > 12) return v;
  if (v.startsWith('$$')) return v.slice(1);
  if (v.startsWith('$D')) return v.slice(2);                             // a Date
  const m = /^\$([0-9a-f]+)((?::[^:]+)*)$/.exec(v);
  if (!m || !rows.has(m[1])) return undefined;                           // $undefined, $L…, $S…: not data
  let cur = deref(rows.get(m[1]), rows, depth + 1);
  for (const seg of m[2].split(':').slice(1)) cur = deref(step(cur, seg), rows, depth + 1);
  return cur;
}

const step = (cur: unknown, seg: string): unknown =>
  isElement(cur) && seg === 'props' ? cur[3] : cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[seg] : undefined;

/** The value at a dotted path, references followed at every step; an array of paths tries each. */
export function pick(record: unknown, path: string | string[] | undefined, rows: Rows): unknown {
  for (const p of Array.isArray(path) ? path : path ? [path] : []) {
    let cur = deref(record, rows);
    for (const seg of p.split('.')) cur = deref(step(cur, seg), rows);
    if (cur != null && cur !== '') return cur;
  }
  return null;
}

/** Every array of records held under `list`, anywhere in the data. */
export function records(rows: Rows, list: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (x: unknown, depth: number) => {
    if (depth > 60 || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) { for (const y of x) walk(y, depth + 1); return; }
    for (const [k, v] of Object.entries(x)) {
      if (k === list && Array.isArray(v)) out.push(...v.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r)));
      else walk(v, depth + 1);
    }
  };
  for (const v of rows.values()) walk(v, 0);
  return out;
}

export interface FlightMap {
  list: string; id: string | string[]; title: string | string[]; start: string | string[];
  end?: string | string[]; where?: string | string[]; ticket?: string | string[]; page?: string;
  image?: string | string[]; image_base?: string; description?: string | string[]; status?: string | string[];
  kind?: string | string[]; series?: string | string[];
}

/** One show as the page states it, in the shape the raw item keeps. */
export interface Show {
  title: string; start: string; end: string | null; has_time: boolean; venue: string | null;
  address: string | null; hall: string | null; ticket: string | null; image: string | null;
  description: string | null; status: string | null; kind: string | null; series: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim() : null;
const oneLine = (s: string) => decodeEntities(s).replace(/\s+/g, ' ').trim();

/** A page template filled from the record; a missing or odd value leaves no own page. */
function fill(template: string | undefined, record: unknown, rows: Rows, base: string): string | null {
  if (!template) return null;
  let ok = true;
  const out = template.replace(/\{([\w.]+)\}/g, (_m, path: string) => {
    const v = str(pick(record, path, rows));
    if (!v || !/^[\w-]+$/.test(v)) { ok = false; return ''; }
    return encodeURIComponent(v);
  });
  return ok ? cleanLink(out, base) : null;
}

/** Artwork the page gives for this show. A signed social-media CDN address expires: never artwork. */
const artwork = (v: unknown, base: string): string | null => {
  const u = cleanLink(v, base);
  return u && !/(^|\.)(fbcdn\.net|cdninstagram\.com)$/.test(new URL(u).hostname) ? u : null;
};

export function shows(html: string, source: Source): { key: string; url: string | null; show: Show }[] {
  const rows = flightRows(flightText(html));
  const skip = source.config.skip_titles ? new RegExp(String(source.config.skip_titles), 'iu') : null;
  const out: { key: string; url: string | null; show: Show }[] = [];
  for (const map of (source.config.records as FlightMap[] | undefined) ?? []) {
    for (const r of records(rows, map.list)) {
      const title = str(pick(r, map.title, rows));
      const rawStart = str(pick(r, map.start, rows));
      const start = toIso(rawStart);
      if (!title || !start || skip?.test(title)) continue;
      const where = whereOf(str(pick(r, map.where, rows)), source);
      if (!where) continue;
      const end = toIso(str(pick(r, map.end, rows)));
      const text = str(pick(r, map.description, rows));
      out.push({
        key: `${map.list}:${str(pick(r, map.id, rows)) ?? `${nameKey(title)}|${start}`}`,
        url: fill(map.page, r, rows, source.url),
        show: {
          title: oneLine(title), start, end: end && Date.parse(end) > Date.parse(start) ? end : null,
          has_time: /\d{1,2}:\d{2}/.test(rawStart ?? ''), venue: where.venue, address: where.address,
          hall: where.hall && !samePlace(where.hall, where.venue) ? where.hall : null,
          ticket: cleanLink(pick(r, map.ticket, rows)), image: artwork(pick(r, map.image, rows), map.image_base ?? source.url),
          // Styled letters (𝑨𝒀𝑨𝑵𝑶, a common Facebook flourish) read as plain ones: AYANO.
          description: clip(scrubContacts(text ? htmlToText(text).normalize('NFKC') : null), 2000),
          status: str(pick(r, map.status, rows)), kind: str(pick(r, map.kind, rows)), series: str(pick(r, map.series, rows)),
        },
      });
    }
  }
  // An id is one occurrence (a Facebook event, a Fienta date's own ticket page), so a moved start stays
  // the same item; an id a page gives twice (a production's) also takes the start.
  const count = new Map<string, number>();
  for (const o of out) count.set(o.key, (count.get(o.key) ?? 0) + 1);
  return out.map(o => (count.get(o.key)! > 1 ? { ...o, key: `${o.key}|${o.show.start}` } : o));
}

export async function collect(source: Source, now = new Date(), fetchPage: (u: string) => Promise<string> = async (u) => (await getHtml(u)).html): Promise<RawItem[]> {
  const horizon = now.getTime() + Number(source.config.days ?? 120) * 86_400_000;
  const seen = new Set<string>(), out: RawItem[] = [];
  for (const { key, url, show } of shows(await fetchPage(source.url), source)) {
    const start = Date.parse(show.start), last = Date.parse(show.end ?? show.start);
    if (start > horizon || last < now.getTime() - 6 * 3600_000) continue;
    // The same show in a second list (Von Krahl's own events and its Fienta calendar).
    const same = `${nameKey(show.title)}|${show.start}`;
    if (seen.has(key) || seen.has(same)) continue;
    seen.add(key); seen.add(same);
    out.push({ external_id: key, url: url ?? source.url, payload: { ...show } });
  }
  return out;
}

export function extract(item: RawItem, source: Source): Candidate[] {
  const p = item.payload as unknown as Show;
  if (!p.title || !p.start || Number.isNaN(Date.parse(p.start))) return [];
  return [{
    title: p.title,
    description: clip([p.hall, p.description].filter(Boolean).join('\n\n') || null, 2000),
    starts_at: p.start,
    ends_at: p.end ?? null,
    has_time: p.has_time,
    venue_name: p.venue,
    address: p.address,
    url: item.url ?? null,
    ticket_url: p.ticket,
    image_url: p.image,
    series_key: p.series ? `${source.id}:${p.series}` : null,
    kind_hint: p.kind,
    flag: p.status ? textFlag(p.status) : null,
    engine: 'nextflight',
  } satisfies Candidate];
}
