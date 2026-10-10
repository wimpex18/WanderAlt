// Fienta's public events API: every public event an Estonian organiser
// sells through Fienta, filtered by city. Structured, so no model reads it.
// Organiser email and phone are dropped before anything is stored.

import type { Candidate, RawItem, Source } from '../types.ts';
import { get, htmlToText, httpUrl, clip } from '../util.ts';
import { localToIso } from '../time.ts';
import { tzOf } from '../cities.ts';

interface FientaEvent {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string | null;
  notes_about_time?: string;
  event_status?: string;
  attendance_mode?: string;
  venue?: string;
  address?: string;
  url?: string;
  buy_tickets_url?: string;
  image_url?: string;
  series_id?: string;
  organizer_id?: number;
  organizer_name?: string;
  categories?: string[];
  description?: string;
  price_from_string?: string;
}

const KEEP = [
  'id', 'title', 'starts_at', 'ends_at', 'notes_about_time', 'event_status', 'attendance_mode',
  'venue', 'address', 'url', 'buy_tickets_url', 'image_url', 'series_id', 'organizer_id',
  'organizer_name', 'categories', 'description', 'price_from_string',
] as const;

export async function collect(source: Source, now = new Date()): Promise<RawItem[]> {
  const days = Number(source.config.days ?? 21), tz = tzOf(source.city);
  const skip = new Set((source.config.skip_categories as string[] | undefined) ?? []);
  const url = new URL(source.url);
  url.searchParams.set('starts_from', now.toISOString().slice(0, 10));
  const body = await (await get(url.href, { accept: 'application/json', timeoutMs: 45_000 })).json() as { events?: FientaEvent[] };
  const horizon = now.getTime() + days * 86_400_000;

  return (body.events ?? [])
    .filter(e => e.attendance_mode !== 'online')
    .filter(e => {
      const start = Date.parse(localToIso(e.starts_at, tz) ?? '');
      const end = Date.parse(localToIso(e.ends_at ?? '', tz) ?? '') || start;
      // Long-running listings (a museum ticket valid for years) are not events.
      return start <= horizon && end >= now.getTime() && end - start < 45 * 86_400_000;
    })
    .filter(e => !(e.categories ?? []).length || (e.categories ?? []).some(c => !skip.has(c)))
    .map(e => {
      const payload: Record<string, unknown> = {};
      for (const k of KEEP) if (e[k] != null) payload[k] = e[k];
      return { external_id: String(e.id), url: e.url ?? null, payload };
    });
}

/** "From 10 EUR", "5 - 12 EUR", "Free", "Tasuta" → price fields. */
export function parsePrice(s: string | undefined): Pick<Candidate, 'is_free' | 'price_min' | 'price_max' | 'currency'> {
  if (!s) return { is_free: null, price_min: null, price_max: null, currency: null };
  if (/\b(free|tasuta|бесплатно)\b/i.test(s)) return { is_free: true, price_min: 0, price_max: 0, currency: null };
  const nums = [...s.matchAll(/(\d+(?:[.,]\d+)?)/g)].map(m => Number(m[1].replace(',', '.')));
  const cur = /eur|€/i.test(s) ? 'EUR' : null;
  if (!nums.length) return { is_free: null, price_min: null, price_max: null, currency: cur };
  const min = Math.min(...nums);
  return {
    is_free: min === 0 ? true : false,
    price_min: min,
    price_max: /^from\b|^alates\b/i.test(s.trim()) ? null : Math.max(...nums),
    currency: cur,
  };
}

export function extract(item: RawItem, source: Source): Candidate[] {
  const tz = tzOf(source.city);
  const e = item.payload as unknown as FientaEvent;
  const starts = localToIso(e.starts_at, tz);
  if (!starts) return [];
  const ends = e.ends_at ? localToIso(e.ends_at, tz) : null;
  const hasTime = !/ 00:00:00$/.test(e.starts_at);
  const address = e.address?.replace(/,?\s*Harju ?(maakond|maa)$/i, '').trim() || null;
  return [{
    title: e.title.trim(),
    description: clip(e.description ? htmlToText(e.description) : null, 4000),
    starts_at: starts,
    ends_at: ends && ends !== starts ? ends : null,
    has_time: hasTime,
    venue_name: e.venue?.trim() || null,
    address,
    ...parsePrice(e.price_from_string),
    ticket_url: httpUrl(e.buy_tickets_url),
    url: httpUrl(e.url),
    image_url: httpUrl(e.image_url),
    series_key: e.series_id ? `fienta:${e.series_id}` : null,
    kind_hint: [...(e.categories ?? []), e.organizer_name ?? ''].filter(Boolean).join(', '),
    flag: e.event_status === 'cancelled' ? 'cancelled' : /postponed|rescheduled/.test(e.event_status ?? '') ? 'postponed' : null,
    engine: 'fienta',
  }];
}

/** Organisers whose whole programme belongs on WanderAlt: independent venues and collectives listed by
 *  hand in the source's `trusted_organizer_ids`. Fienta sells for anyone, so this, not the source being
 *  curated or a venue filter, is what trusts a Fienta listing (run.ts trustedListing). */
export function trustedOrganiser(item: RawItem, source: Source): boolean {
  const ids = (source.config.trusted_organizer_ids as number[] | undefined) ?? [];
  return ids.includes(Number((item.payload as { organizer_id?: number }).organizer_id));
}
