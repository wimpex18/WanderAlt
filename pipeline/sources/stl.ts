// Sõltumatu Tantsu Lava's schedule (https://www.stl.ee/ajakava) is a Next.js page whose programme
// arrives as JSON in <script id="__NEXT_DATA__">: props.pageProps.events holds `productions`,
// `extraprograms` (workshops, talks, residencies, publications; categories.nodes[].slug) and
// `festivalEvents` (Sõltumatu Tantsu Festival), each node with title, uri (its own page), eventInfo.autor,
// eventSidebar.isFreeEvent and events.events[]: one occurrence each, date "05.11.2026", time "19:00"
// (sometimes "19.00" or "9:30", or none), endDate, endTime, location, soldOut, ticket, register (a sign-up
// form). No node carries a picture. Structure as seen on 9 October 2026.
//
// The festival and the tours play other stages: the location goes through config.venue_map
// (programme.ts), so only Tallinn shows are listed; config.skip_places drops performances for school
// groups and config.skip_categories nodes that are not events (publikatsioonid: a book order).
// config.days: how far ahead (default 120).

import type { Candidate, RawItem, Source } from '../types.ts';
import { getHtml, decodeEntities, httpUrl, clip } from '../util.ts';
import { tallinnToIso } from '../time.ts';
import { whereOf, cleanLink, samePlace } from './programme.ts';

interface Occurrence { date?: string | null; time?: string | null; endDate?: string | null; endTime?: string | null; location?: string | null; soldOut?: boolean | null; ticket?: string | null; register?: string | null }
interface Node {
  title?: string; slug?: string; uri?: string; eventInfo?: { autor?: string | null } | null;
  categories?: { nodes?: { slug?: string }[] } | null; eventSidebar?: { isFreeEvent?: boolean | null } | null;
  events?: { events?: Occurrence[] | null } | null;
}

/** The page's own data, or null when the page carries none. */
export function nextData(html: string): Record<string, unknown> | null {
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]) as Record<string, unknown>; } catch { return null; }
}

const LISTS: [string, string | null][] = [['productions', 'dance'], ['festivalEvents', 'dance festival'], ['extraprograms', null]];

/** "05.11.2026" and "19:00" → Tallinn wall time; the time is null when none is stated. */
export function wall(date: string | null | undefined, time: string | null | undefined): { day: string; time: string | null } | null {
  const d = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((date ?? '').trim());
  if (!d) return null;
  const t = /^(\d{1,2})[:.](\d{2})\b/.exec((time ?? '').trim());
  return { day: `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`, time: t && +t[1] < 24 && +t[2] < 60 ? `${t[1].padStart(2, '0')}:${t[2]}` : null };
}

export interface Show {
  slug: string; title: string; author: string | null; list: string; categories: string[]; free: boolean;
  day: string; time: string | null; end: string | null; venue: string | null; address: string | null; hall: string | null;
  ticket: string | null; sold_out: boolean;
}

/** Every occurrence the page lists, in page order, before any date window. */
export function shows(html: string, source: Source): { url: string | null; show: Show }[] {
  const events = ((nextData(html)?.props as Record<string, unknown> | undefined)?.pageProps as Record<string, unknown> | undefined)?.events as Record<string, { nodes?: Node[] }> | undefined;
  if (!events || typeof events !== 'object') return [];
  const skip = new Set(((source.config.skip_categories as string[] | undefined) ?? []).map(s => s.toLowerCase()));
  const out: { url: string | null; show: Show }[] = [];
  for (const [list, hint] of LISTS) {
    for (const n of events[list]?.nodes ?? []) {
      const categories = (n.categories?.nodes ?? []).map(c => String(c.slug ?? '')).filter(Boolean);
      if (!n.title || !n.slug || categories.some(c => skip.has(c.toLowerCase()))) continue;
      for (const o of n.events?.events ?? []) {
        const at = wall(o.date, o.time);
        const where = at ? whereOf(o.location, source) : null;
        if (!at || !where) continue;
        // An end time before the start is after midnight ("21:00" to "04:00").
        const until = wall(o.endDate ?? o.date, o.endTime);
        let end = until?.time ? tallinnToIso(`${until.day} ${until.time}`) : null;
        const start = tallinnToIso(at.time ? `${at.day} ${at.time}` : at.day)!;
        if (end && Date.parse(end) <= Date.parse(start) && !o.endDate) end = new Date(Date.parse(end) + 86_400_000).toISOString();
        out.push({
          url: httpUrl(n.uri, 'https://www.stl.ee/'),
          show: {
            slug: n.slug, title: decodeEntities(n.title).replace(/\s+/g, ' ').trim(), author: n.eventInfo?.autor?.trim() || null,
            list, categories: hint ? [hint] : categories, free: n.eventSidebar?.isFreeEvent === true,
            day: at.day, time: at.time, end: end && Date.parse(end) > Date.parse(start) ? end : null,
            venue: where.venue, address: where.address, hall: where.hall && !samePlace(where.hall, where.venue) ? where.hall : null,
            ticket: cleanLink(o.ticket) ?? cleanLink(o.register), sold_out: o.soldOut === true,
          },
        });
      }
    }
  }
  return out;
}

export async function collect(source: Source, now = new Date(), fetchPage: (u: string) => Promise<string> = async (u) => (await getHtml(u)).html): Promise<RawItem[]> {
  const horizon = now.getTime() + Number(source.config.days ?? 120) * 86_400_000;
  const seen = new Set<string>(), out: RawItem[] = [];
  for (const { url, show } of shows(await fetchPage(source.url), source)) {
    const start = Date.parse(tallinnToIso(show.time ? `${show.day} ${show.time}` : show.day) ?? '');
    const last = show.end ? Date.parse(show.end) : start + (show.time ? 0 : 86_400_000);
    if (!Number.isFinite(start) || start > horizon || last < now.getTime() - 6 * 3600_000) continue;
    const id = `${show.slug}|${show.day}|${show.time ?? ''}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ external_id: id, url: url ?? source.url, payload: { ...show } });
  }
  return out;
}

export function extract(item: RawItem, source: Source): Candidate[] {
  const p = item.payload as unknown as Show;
  if (!p.title || typeof p.day !== 'string') return [];
  const starts = tallinnToIso(p.time ? `${p.day} ${p.time}` : p.day);
  if (!starts) return [];
  return [{
    title: p.title,
    description: clip([p.author, p.hall].filter(Boolean).join(' · ') || null, 2000),
    starts_at: starts,
    ends_at: p.end,
    has_time: !!p.time,
    venue_name: p.venue,
    address: p.address,
    is_free: p.free ? true : null,
    price_min: p.free ? 0 : null,
    url: item.url ?? null,
    ticket_url: p.ticket,
    series_key: `${source.id}:${p.slug}`,
    kind_hint: p.categories.join(' ') || null,
    flag: p.sold_out ? 'sold_out' : null,
    engine: 'stl',
  } satisfies Candidate];
}
