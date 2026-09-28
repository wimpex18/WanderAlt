// Kai Art Center (Kai kunstikeskus, Noblessner) runs WordPress with its own
// REST routes, read here as a 'wordpress' source with config.shape 'kai'.
// Structured, so no model reads it. Shapes as seen on 28 September 2026:
//   /wp-json/www-api/v1/calendar        films: ID, slug, title, excerpt, post_type 'movie',
//     thumbnail.url, acf.starting_datetime "2026-10-28 18:00:00", acf.ending_datetime,
//     acf.reocurring_event + acf.reocurring_dates[{reocurring_starting_datetime, …ending…}]
//   /wp-json/www-api/v1/current-events  exhibitions: slug, title, post_type 'event',
//     thumbnail.url, starting_datetime and ending_datetime at the top level (a run of weeks)
// Both routes mix Estonian and English posts, one post per language with
// the same dates; the English one is kept. Pages live at
// https://kai.center/en/<post_type>/<slug>.

import type { Candidate, RawItem, Source } from '../types.ts';
import { get, decodeEntities, htmlToText, httpUrl, clip } from '../util.ts';
import { tallinnToIso } from '../time.ts';

type Row = Record<string, unknown>;

const field = (r: Row, k: string): unknown => r[k] ?? (r.acf as Row | undefined)?.[k];
const wall = (v: unknown): string | null => {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(String(v ?? '').trim());
  return m ? (m[2] ? `${m[1]} ${m[2]}` : m[1]) : null;
};

/** Every dated occurrence of a post, as Tallinn wall times. */
export function occurrences(r: Row): { start: string; end: string | null }[] {
  const dates = field(r, 'reocurring_dates');
  if (field(r, 'reocurring_event') && Array.isArray(dates) && dates.length) {
    return (dates as Row[])
      .map(d => ({ start: wall(d.reocurring_starting_datetime), end: wall(d.reocurring_ending_datetime) }))
      .filter((o): o is { start: string; end: string | null } => !!o.start);
  }
  const start = wall(field(r, 'starting_datetime'));
  return start ? [{ start, end: wall(field(r, 'ending_datetime')) }] : [];
}

const ESTONIAN = /[õäöü]|\b(linastus|kinos|näitus|avamine|vestlus|etendus|kontsert|kunstikeskus|suletud|avame)\b/i;
/* The title decides: an English excerpt can still name Türker Süer. */
const isEstonian = (r: Row) => ESTONIAN.test(decodeEntities(String(r.title ?? '')));

/** One post per language: posts with the same type and dates are one event. */
export function oneLanguage(rows: Row[]): Row[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.post_type}|${JSON.stringify(occurrences(r))}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].flatMap(g => {
    if (g.length !== 2) return g;
    const en = g.filter(r => !isEstonian(r));
    return en.length === 1 ? en : g;
  });
}

export function pageUrl(r: Row): string | null {
  const type = String(r.post_type ?? '');
  const slug = String(r.slug ?? '');
  return /^[a-z_-]+$/.test(type) && /^[a-z0-9-]+$/.test(slug) ? `https://kai.center/en/${type}/${slug}` : null;
}

export async function collect(source: Source, now = new Date()): Promise<RawItem[]> {
  const urls = [source.url, ...((source.config.extra_urls as string[] | undefined) ?? [])];
  const horizon = now.getTime() + Number(source.config.days ?? 60) * 86_400_000;
  const skip = source.config.skip_titles ? new RegExp(String(source.config.skip_titles), 'i') : null;
  const rows: Row[] = [];
  for (const u of urls) {
    const data = await (await get(u, { accept: 'application/json' })).json() as unknown;
    if (Array.isArray(data)) rows.push(...data.filter((r): r is Row => !!r && typeof r === 'object'));
  }
  const seen = new Set<string>();
  const out: RawItem[] = [];
  for (const r of oneLanguage(rows)) {
    const id = String(r.ID ?? r.slug ?? '');
    if (!id || seen.has(id) || typeof r.title !== 'string') continue;
    seen.add(id);
    if (skip?.test(decodeEntities(r.title))) continue;
    const live = occurrences(r).some(o => {
      const s = Date.parse(tallinnToIso(o.start) ?? '');
      const e = Date.parse(tallinnToIso(o.end ?? o.start) ?? '');
      return s <= horizon && e >= now.getTime();
    });
    if (!live) continue;
    const thumb = r.thumbnail as Row | undefined;
    out.push({
      external_id: id,
      url: pageUrl(r),
      payload: {
        id, slug: r.slug, post_type: r.post_type, title: r.title, excerpt: r.excerpt ?? null,
        image: httpUrl(thumb?.url), occurrences: occurrences(r),
      },
    });
  }
  return out;
}

export function extract(item: RawItem, source: Source): Candidate[] {
  const p = item.payload as { id?: string; post_type?: string; title?: string; excerpt?: string | null; image?: string | null; occurrences?: { start: string; end: string | null }[] };
  if (!p.title) return [];
  const many = (p.occurrences ?? []).length > 1;
  const gone = Date.now() - 6 * 3600_000;
  return (p.occurrences ?? []).flatMap(o => {
    const starts = tallinnToIso(o.start);
    if (!starts) return [];
    /* A run of screenings keeps its past dates; only what is ahead is listed. */
    if (Date.parse(tallinnToIso(o.end ?? o.start) ?? starts) < gone) return [];
    const timed = / (?!00:00)\d{2}:\d{2}$/.test(o.start);
    return [{
      title: decodeEntities(p.title!).trim(),
      description: clip(p.excerpt ? htmlToText(p.excerpt) : null, 2000),
      starts_at: starts,
      ends_at: o.end && o.end !== o.start ? tallinnToIso(o.end) : null,
      has_time: timed,
      venue_name: (source.config.venue_name as string | undefined) ?? 'Kai',
      address: (source.config.address as string | undefined) ?? null,
      url: item.url ?? null,
      image_url: httpUrl(p.image),
      series_key: many ? `kai:${p.id}` : null,
      kind_hint: p.post_type === 'movie' ? 'film' : null,
      engine: 'kai',
    } satisfies Candidate];
  });
}
