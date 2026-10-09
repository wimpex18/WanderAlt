// Kanuti Gildi SAAL's programme page (https://saal.ee/en/program/) carries every performance since 2011
// as one row (about 2,500, 7 MB), shown or hidden by script, so the page read as text by a model gave
// nothing. Each row: <div id="3941" type-name="event" start-time="Thu Oct 01 2026 17:00:00 GMT+0000 …"
// performance-categories="[12]">, labels in <p class="today"> ("On Tour", "Saal Presents", "Guest",
// "Premiere!"), the show's own page and its artist, name and subtitle in the <h3>, then a column of <p>:
// the place ("Kanuti Gildi SAAL", "Püha Vaimu SAAL", "Studio", "Von Krahli Teater", "Tartu Uus Teater",
// "Kunsthal Ghent") and the prices ("17 / 22 EUR", "At the door: 20 / 25 EUR", "Free Admission"), and a
// ticket button with event-start and event-end in ISO UTC and the ticket link, or "Sold out". Rows carry
// no picture. Category names come from the page's own filter (toggleCat(12) "Performance"). Structure as
// seen on 9 October 2026.
//
// SAAL also lists its tours and partner stages: the place goes through config.venue_map (programme.ts),
// so only Tallinn shows are listed. A row that names no place and is not "On Tour" is at SAAL.
// config.days: how far ahead (default 120).

import type { Candidate, RawItem, Source } from '../types.ts';
import { getHtml, decodeEntities, clip } from '../util.ts';
import { whereOf, cleanLink, samePlace } from './programme.ts';

export interface Row {
  id: string; start: string; end: string | null; title: string; artist: string | null; subtitle: string | null;
  page: string | null; labels: string[]; place: string | null; prices: string[]; ticket: string | null;
  sold_out: boolean; free: boolean; categories: string[];
}

const text = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const PRICE = /\d\s*(?:\/\s*\d+\s*)?(?:eur|€|gbp|£|sek|nok|dkk|pln|usd|\$)|free admission|tasuta|^at the door/i;

/** The page's own category names by id, from its filter. */
export function categories(html: string): Map<string, string> {
  return new Map([...html.matchAll(/toggleCat\((\d+)\)"><div[^>]*>([^<]+)</g)].map(m => [m[1], text(m[2])]));
}

/** Every programme row, in page order. */
export function rows(html: string): Row[] {
  const names = categories(html);
  const out: Row[] = [];
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  for (const part of body.split(/(?=<div id="\d+" type-name="event")/).slice(1)) {
    const head = /^<div[^>]*>/.exec(part)?.[0] ?? '';
    const button = /<a\b[^>]*type-name="ticket-button"[^>]*>([\s\S]*?)<\/a>/i.exec(part);
    const startAttr = (button && attr(button[0], 'event-start')) ?? attr(head, 'start-time');
    const start = startAttr ? new Date(startAttr) : null;
    const name = /<span class="name">([\s\S]*?)<\/span>/i.exec(part);
    if (!start || Number.isNaN(start.getTime()) || !name || !text(name[1])) continue;
    const end = button ? attr(button[0], 'event-end') : null;
    const column = /<div class="col-xs-6 col-md-2 col-lg-2">([\s\S]*?)<\/div>/i.exec(part)?.[1] ?? '';
    const lines = [...column.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map(m => text(m[1])).filter(Boolean);
    const place = lines[0] && !PRICE.test(lines[0]) ? lines[0] : null;
    const label = button ? text(button[1]) : '';
    out.push({
      id: attr(head, 'id')!,
      start: start.toISOString(),
      end: end && !Number.isNaN(Date.parse(end)) && Date.parse(end) > start.getTime() ? new Date(end).toISOString() : null,
      title: text(name[1]),
      artist: text(/<span class="artist">([\s\S]*?)<\/span>/i.exec(part)?.[1] ?? '') || null,
      subtitle: text(/<span class="subtitle">([\s\S]*?)<\/span>/i.exec(part)?.[1] ?? '') || null,
      page: cleanLink(/<h3><a href="([^"]+)"/i.exec(part)?.[1], 'https://saal.ee/'),
      labels: [...part.matchAll(/<p class="today">([^<]*)<\/p>/gi)].map(m => text(m[1])).filter(Boolean),
      place,
      prices: lines.slice(place ? 1 : 0).filter(l => PRICE.test(l)),
      ticket: button ? cleanLink(attr(button[0], 'href')) : null,
      sold_out: /sold out|välja müüdud/i.test(label),
      free: /free admission|tasuta/i.test([label, ...lines].join(' ')),
      categories: (/\[([\d,\s]*)\]/.exec(attr(head, 'performance-categories') ?? '')?.[1] ?? '')
        .split(',').map(s => names.get(s.trim())).filter((s): s is string => !!s),
    });
  }
  return out;
}

export async function collect(source: Source, now = new Date(), fetchPage: (u: string) => Promise<string> = async (u) => (await getHtml(u, { timeoutMs: 60_000 })).html): Promise<RawItem[]> {
  const horizon = now.getTime() + Number(source.config.days ?? 120) * 86_400_000;
  const out: RawItem[] = [];
  for (const r of rows(await fetchPage(source.url))) {
    const start = Date.parse(r.start), last = Date.parse(r.end ?? r.start);
    if (start > horizon || last < now.getTime() - 6 * 3600_000) continue;
    if (!r.place && r.labels.some(l => /on tour/i.test(l))) continue;
    const where = whereOf(r.place, source);
    if (!where) continue;
    out.push({ external_id: r.id, url: r.page ?? source.url, payload: { ...r, venue: where.venue, address: where.address, hall: where.hall } });
  }
  return out;
}

/** "17 / 22 EUR", "At the door: 20 / 25 EUR": the lowest and highest stated price. */
function prices(lines: string[]): { min: number | null; max: number | null; currency: string | null } {
  const nums = lines.flatMap(l => [...l.matchAll(/(\d+(?:[.,]\d+)?)/g)].map(m => Number(m[1].replace(',', '.'))));
  const cur = lines.join(' ');
  return {
    min: nums.length ? Math.min(...nums) : null,
    max: nums.length > 1 ? Math.max(...nums) : null,
    currency: !nums.length ? null : /eur|€/i.test(cur) ? 'EUR' : /gbp|£/i.test(cur) ? 'GBP' : null,
  };
}

export function extract(item: RawItem, _source?: Source): Candidate[] {
  const p = item.payload as unknown as Row & { venue: string | null; address: string | null; hall: string | null };
  if (!p.title || !p.start) return [];
  const local = new Date(p.start).toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' });
  const timed = local !== '00:00';
  const price = prices(p.prices);
  const slug = /\/performance\/([a-z0-9-]+)/.exec(p.page ?? '')?.[1];
  return [{
    title: p.title,
    description: clip([p.artist, p.subtitle, p.hall && !samePlace(p.hall, p.venue) ? p.hall : null, ...p.labels]
      .filter(Boolean).join(' · ') || null, 2000),
    starts_at: p.start,                      // a row at 00:00 in Tallinn is a date without a time
    ends_at: p.end,
    has_time: timed,
    venue_name: p.venue,
    address: p.address,
    is_free: p.free ? true : price.min != null ? false : null,
    price_min: p.free ? 0 : price.min,
    price_max: p.free ? null : price.max,
    currency: p.free ? null : price.currency,
    url: item.url ?? null,
    ticket_url: p.ticket,
    series_key: slug ? `saal:${slug}` : null,
    kind_hint: p.categories.join(' ') || null,
    flag: p.sold_out ? 'sold_out' : null,
    engine: 'saal',
  } satisfies Candidate];
}
