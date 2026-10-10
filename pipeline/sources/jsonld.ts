// schema.org Event markup (JSON-LD) on a venue's own pages. Structured,
// so no model reads it. Kino Sõprus publishes ScreeningEvent nodes whose
// film is a separate node in the same @graph, joined here by @id.

import type { Candidate, RawItem, Source } from '../types.ts';
import { get, htmlToText, httpUrl, clip } from '../util.ts';
import { toIso } from '../time.ts';
import { tzOf } from '../cities.ts';
import { schemaFlag } from '../flags.ts';

type Node = Record<string, unknown>;

const isEvent = (n: Node) => {
  const t = n['@type'];
  return (Array.isArray(t) ? t : [t]).some(x => typeof x === 'string' && /Event$/.test(x));
};

export function parseJsonLd(html: string): Node[] {
  const nodes: Node[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const walk = (x: unknown) => {
        if (Array.isArray(x)) x.forEach(walk);
        else if (x && typeof x === 'object') {
          const n = x as Node;
          nodes.push(n);
          if (n['@graph']) walk(n['@graph']);
        }
      };
      walk(data);
    } catch { /* a broken block is skipped, not fatal */ }
  }
  return nodes;
}

const text = (v: unknown): string | null =>
  typeof v === 'string' ? v : (v && typeof v === 'object' && typeof (v as Node).name === 'string' ? (v as Node).name as string : null);

export async function collect(source: Source, now = new Date()): Promise<RawItem[]> {
  const pages = [source.url, ...((source.config.extra_urls as string[] | undefined) ?? [])];
  const horizon = now.getTime() + Number(source.config.days ?? 45) * 86_400_000;
  const out: RawItem[] = [];
  for (const page of pages) {
    const html = await (await get(page, { accept: 'text/html' })).text();
    const nodes = parseJsonLd(html);
    const byId = new Map(nodes.filter(n => typeof n['@id'] === 'string').map(n => [n['@id'] as string, n]));
    for (const n of nodes.filter(isEvent)) {
      const start = Date.parse(toIso(n.startDate as string | undefined, tzOf(source.city)) ?? '');
      if (!(start <= horizon)) continue;
      const work = n.workPresented as Node | undefined;
      const film = work && typeof work['@id'] === 'string' ? byId.get(work['@id'] as string) ?? work : work;
      const loc = n.location as Node | undefined;
      const place = loc && typeof loc['@id'] === 'string' ? byId.get(loc['@id'] as string) ?? loc : loc;
      const id = (n['@id'] as string | undefined) ?? `${n.url ?? page}#${n.startDate}`;
      const url = httpUrl(n.url, page) ?? (typeof n['@id'] === 'string' ? httpUrl((n['@id'] as string).split('#')[0]) : null);
      out.push({ external_id: id, url, payload: { ...n, location: place ?? null, _work: film ?? null, _page: page } });
    }
  }
  return out;
}

export function extract(item: RawItem, source: Source): Candidate[] {
  const n = item.payload as Node;
  const work = (n._work as Node | null) ?? null;
  const tz = tzOf(source.city), starts = toIso(n.startDate as string | undefined, tz);
  if (!starts) return [];
  const loc = n.location as Node | undefined;
  const addr = loc?.address;
  const address = typeof addr === 'string' ? addr
    : addr && typeof addr === 'object' ? [ (addr as Node).streetAddress, (addr as Node).addressLocality ].filter(Boolean).join(', ') : null;
  const offers = (Array.isArray(n.offers) ? n.offers[0] : n.offers) as Node | undefined;
  // A single price far above a ticket's is a group booking, not the door price.
  const plausible = (v: unknown) => { const x = Number(v); return v != null && v !== '' && Number.isFinite(x) && x <= 150 ? x : null; };
  const price = plausible(offers?.lowPrice ?? offers?.price);
  const high = plausible(offers?.highPrice);
  const image = Array.isArray(n.image) ? n.image[0] : n.image ?? work?.image;
  const title = text(n.name) ?? text(work?.name);
  if (!title) return [];
  const desc = (n.description ?? work?.description) as string | undefined;
  return [{
    title: title.trim(),
    description: clip(desc ? htmlToText(desc) : null, 4000),
    starts_at: starts,
    ends_at: toIso(n.endDate as string | undefined, tz),
    has_time: /T\d{2}:\d{2}/.test(String(n.startDate)),
    venue_name: (source.config.venue_name as string | undefined) ?? text(loc) ?? null,   // a one-venue site names its halls
    address: address || null,
    is_free: price === 0 ? true : price != null ? false : null,
    price_min: price,
    price_max: high,
    currency: (offers?.priceCurrency as string | undefined) ?? null,
    ticket_url: httpUrl(offers?.url, item.url ?? undefined),
    url: item.url ?? null,
    image_url: httpUrl(typeof image === 'object' && image ? (image as Node).url : image),
    series_key: work && typeof work['@id'] === 'string' ? `jsonld:${work['@id']}` : null,
    kind_hint: String(n['@type']),
    flag: schemaFlag(n.eventStatus, offers?.availability),
    engine: 'jsonld',
  }];
}
