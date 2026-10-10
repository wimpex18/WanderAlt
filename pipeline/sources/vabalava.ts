// Vaba Lava's programme page (https://vabalava.ee/mangukava/) lists every show as one block: a poster,
// the show's own page, a date ("T 06.10"), a time, the hall, the producing company and a ticket link.
// Read as text by a model it lost the poster, the own page and the ticket link, took a wrong venue for
// tour dates in other towns (Tartu, Pärnu, Viljandi, Kuressaare, Narva) and spent free-model quota every
// time the page changed. This reads the blocks directly. Structure as seen on 10 October 2026.
//
// The page has one tab per town (Tallinn, Narva, Tartu, Kuressaare, Viljandi, Pärnu), each holding its
// shows. Every show under the tab named config.tab (default "Tallinn") is listed at its own hall: the
// black box at Salme Kultuurikeskus, and co-productions elsewhere in Tallinn (Sakala 3 Teatrimaja).
// config.venue_map: [[regex on the hall text, our venue name], …] gives a hall our name for it. A page
// without tabs falls back to venue_map alone, a hall it does not name being a tour date elsewhere.
// config.days: how far ahead (default 120).
import type { Candidate, RawItem, Source } from '../types.ts';
import { getHtml, decodeEntities, httpUrl, clip } from '../util.ts';
import { tallinnToIso } from '../time.ts';

export interface Block {
  slug: string; url: string; title: string; date: string; time: string | null; hall: string; company: string | null;
  image: string | null; ticket: string | null;
  /** The town tab the show sits under, or null on a page without tabs. */
  town: string | null;
}

const DOW: Record<string, number> = { E: 1, T: 2, K: 3, N: 4, R: 5, L: 6, P: 0 };
const text = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** The page's own scheduling blocks, in order, each with the town tab it sits under. */
export function blocks(html: string): Block[] {
  const towns = new Map([...html.matchAll(/data-bs-target="#([\w-]+)"[^>]*>([\s\S]{0,300}?)<\/button>/gi)].map(m => [m[1], text(m[2])]));
  const panes = html.split(/<div class="tab-pane\b/).slice(1).map(p => ({ town: towns.get(/^[^"]*" id="([^"]+)"/.exec(p)?.[1] ?? '') ?? null, html: p }));
  return (towns.size && panes.length ? panes : [{ town: null, html }]).flatMap(p => readBlocks(p.html, p.town));
}

function readBlocks(html: string, town: string | null): Block[] {
  const out: Block[] = [];
  for (const part of html.split(/<div class="[^"]*\bschedule-item\b[^"]*">/).slice(1)) {
    const link = /<a href="(https:\/\/vabalava\.ee\/programm\/([a-z0-9-]+)\/?)"[^>]*schedule-link/i.exec(part);
    const title = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(part);
    const times = [...part.matchAll(/<time[^>]*>([\s\S]*?)<\/time>/gi)].map(m => text(m[1]));
    const date = times.find(t => /^[A-ZÕÄÖÜ]\s+\d{1,2}\.\d{1,2}$/i.test(t));
    if (!link || !title || !date) continue;
    const hall = /text-uppercase[^>]*>([\s\S]*?)<\//i.exec(part);
    const company = /<div><i>([\s\S]*?)<\/i><\/div>/i.exec(part);
    const ticket = /<a href="([^"]+)"[^>]*schedule-ticket/i.exec(part);
    const img = /<img\b[^>]*>/i.exec(part)?.[0] ?? '';
    // Prefer a 768 to 1024 px rendition from the srcset over the 512 px thumbnail.
    const srcset = [...(/srcset="([^"]+)"/i.exec(img)?.[1] ?? '').matchAll(/(\S+)\s+(\d+)w/g)].map(m => ({ u: m[1], w: +m[2] })).filter(c => c.w >= 768).sort((a, b) => a.w - b.w)[0];
    out.push({
      slug: link[2], url: link[1], title: text(title[1]), date: date.replace(/\s+/g, ' '),
      time: times.find(t => /^\d{1,2}:\d{2}$/.test(t)) ?? null, hall: hall ? text(hall[1]) : '',
      company: company ? text(company[1]) || null : null,
      image: httpUrl(srcset?.u ?? /\bsrc="([^"]+)"/i.exec(img)?.[1]),
      ticket: httpUrl(decodeEntities(ticket?.[1] ?? '')),
      town,
    });
  }
  return out;
}

/** "T 06.10" with the day's Estonian letter: the year that makes the weekday right, from today on. */
export function dateOf(label: string, now = new Date()): string | null {
  const m = /^([A-ZÕÄÖÜ])\s+(\d{1,2})\.(\d{1,2})$/i.exec(label.trim());
  if (!m) return null;
  const [, letter, d, mo] = m;
  const want = DOW[letter.toUpperCase()];
  for (let y = now.getUTCFullYear(); y <= now.getUTCFullYear() + 1; y++) {
    const at = new Date(Date.UTC(y, +mo - 1, +d));
    if (at.getUTCMonth() !== +mo - 1 || at.getTime() < now.getTime() - 3 * 86_400_000) continue;
    if (want === undefined || at.getUTCDay() === want) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

const clean = (u: string | null) => {
  if (!u) return null;
  const url = new URL(u);
  for (const k of [...url.searchParams.keys()]) if (/^(fbclid|gclid|utm_.*|_aem_.*|mc_.*)$/i.test(k)) url.searchParams.delete(k);
  return url.href;
};

const venueFor = (hall: string, source: Source): string | null => {
  const map = (source.config.venue_map as [string, string][] | undefined) ?? [];
  for (const [re, name] of map) if (new RegExp(re, 'i').test(hall)) return name;
  return null;
};

export async function collect(source: Source, now = new Date(), fetchPage: (u: string) => Promise<string> = async (u) => (await getHtml(u)).html): Promise<RawItem[]> {
  const horizon = now.getTime() + Number(source.config.days ?? 120) * 86_400_000;
  const seen = new Set<string>(), out: RawItem[] = [];
  const home = String(source.config.tab ?? 'Tallinn').toLowerCase();
  for (const b of blocks(await fetchPage(source.url))) {
    // Under a town tab: that town's shows only, each at its own hall. Without tabs: the halls venue_map names.
    if (b.town != null && b.town.toLowerCase() !== home) continue;
    const day = dateOf(b.date, now), venue = venueFor(b.hall, source) ?? (b.town != null && b.hall ? b.hall : null);
    if (!day || !venue) continue;
    const start = Date.parse(tallinnToIso(`${day} ${b.time ?? '00:00'}`) ?? '');
    if (!Number.isFinite(start) || start > horizon || start < now.getTime() - 6 * 3600_000) continue;
    const id = `${b.slug}|${day}|${b.time ?? ''}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ external_id: id, url: b.url, payload: { ...b, day, venue, ticket: clean(b.ticket) } });
  }
  return out;
}

export function extract(item: RawItem, source: Source): Candidate[] {
  const p = item.payload as unknown as Block & { day: string; venue: string };
  const starts = tallinnToIso(`${p.day} ${p.time ?? '00:00'}`);
  if (!starts || !p.title) return [];
  return [{
    title: p.title,
    description: clip([p.company, p.hall && p.hall !== p.venue ? p.hall : ''].filter(Boolean).join(' · ') || null, 2000),
    starts_at: starts,
    has_time: !!p.time,
    venue_name: p.venue,
    address: (source.config.address as string | undefined) ?? null,
    url: item.url ?? null,
    ticket_url: p.ticket,
    image_url: p.image,
    series_key: `vabalava:${p.slug}`,
    kind_hint: 'theatre',
    language: 'et',
    engine: 'vabalava',
  } satisfies Candidate];
}
