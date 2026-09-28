// Venue sites built on WordPress that keep their programme in a custom post
// type with ACF fields, read through the site's own REST API. Structured,
// so no model reads it. A source whose config says shape 'kai' uses Kai
// Art Center's own routes instead (kai.ts). Kultuurikatel
// (/wp-json/wp/v2/events) is the default shape:
//   acf.event_date "20261128", acf.end_date, acf.add_time + event_start_time "19:00",
//   acf.event_payment_link, acf.event_price, acf.event_featured_image.

import type { Candidate, RawItem, Source } from '../types.ts';
import { get, decodeEntities, htmlToText, httpUrl, clip } from '../util.ts';
import { tallinnToIso, tallinnDay } from '../time.ts';
import * as kai from './kai.ts';

interface WpEvent {
  id: number;
  link?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  acf?: Record<string, unknown>;
}

const ymd = (v: unknown): string | null => {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(v ?? '').trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const hhmm = (v: unknown): string | null => {
  const m = /^(\d{1,2})[:.](\d{2})/.exec(String(v ?? '').trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};

export async function collect(source: Source, now = new Date()): Promise<RawItem[]> {
  if (source.config.shape === 'kai') return kai.collect(source, now);
  const pages = Number(source.config.pages ?? 2);
  const today = tallinnDay(now.toISOString());
  const horizon = tallinnDay(new Date(now.getTime() + Number(source.config.days ?? 45) * 86_400_000).toISOString());
  const out: RawItem[] = [];
  for (let page = 1; page <= pages; page++) {
    const url = new URL(source.url);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    url.searchParams.set('_fields', 'id,link,title,excerpt,acf');
    const r = await get(url.href, { accept: 'application/json' }).catch(e => {
      if (page > 1 && /^400 /.test((e as Error).message)) return null;   // past the last page
      throw e;
    });
    if (!r) break;
    const rows = await r.json() as WpEvent[];
    for (const e of rows) {
      const day = ymd(e.acf?.event_date);
      const end = ymd(e.acf?.end_date) ?? day;
      if (!day || !end || end < today || day > horizon) continue;
      out.push({ external_id: String(e.id), url: httpUrl(e.link), payload: { id: e.id, link: e.link, title: e.title?.rendered, excerpt: e.excerpt?.rendered, acf: e.acf } });
    }
    if (rows.length < 100) break;
  }
  return out;
}

export function extract(item: RawItem, source: Source): Candidate[] {
  if (source.config.shape === 'kai') return kai.extract(item, source);
  const p = item.payload as { title?: string; excerpt?: string; link?: string; acf?: Record<string, unknown> };
  const a = p.acf ?? {};
  const day = ymd(a.event_date);
  if (!day || !p.title) return [];
  const start = a.add_time ? hhmm(a.event_start_time) : null;
  const endDay = ymd(a.end_date);
  const endTime = a.add_time ? hhmm(a.event_end_time) : null;
  const starts = tallinnToIso(start ? `${day} ${start}` : day);
  if (!starts) return [];
  const ends = endDay && endDay !== day ? tallinnToIso(`${endDay} ${endTime ?? '23:59'}`)
    : endTime ? tallinnToIso(`${day} ${endTime}`) : null;
  const price = String(a.event_price ?? '').trim();
  const nums = [...price.matchAll(/(\d+(?:[.,]\d+)?)/g)].map(m => Number(m[1].replace(',', '.')));
  const free = /tasuta|free|vaba/i.test(price);
  return [{
    title: decodeEntities(p.title).trim(),
    description: clip(p.excerpt ? htmlToText(p.excerpt) : null, 2000),
    starts_at: starts,
    ends_at: ends,
    has_time: !!start,
    venue_name: (source.config.venue_name as string | undefined) ?? null,
    address: (source.config.address as string | undefined) ?? null,
    is_free: free ? true : nums.length ? false : null,
    price_min: free ? 0 : nums.length ? Math.min(...nums) : null,
    price_max: nums.length > 1 ? Math.max(...nums) : null,
    currency: nums.length ? 'EUR' : null,
    ticket_url: httpUrl(a.event_payment_link),
    url: httpUrl(p.link),
    image_url: httpUrl(a.event_featured_image),
    kind_hint: null,
    engine: 'wordpress',
  }];
}
