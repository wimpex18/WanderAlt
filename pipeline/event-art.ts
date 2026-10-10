// A picture a venue's own programme attaches to one event, at an address that expires: Paavli's records
// are its Facebook events, and each cover is a signed Facebook CDN link that stops working within days,
// so a listing could never keep it. A source with config.copy_covers keeps that address in its raw item
// (sources/nextflight.ts, map.cover), and this copies the picture once into the public bucket event-art,
// re-encoded as a JPEG at most 1200 px wide (which also drops its metadata), and gives the listing our
// copy with the venue's site as its attribution. Identity is the venue's own record, never a guess from
// a name; a listing that already has a picture is left alone, and a failed copy leaves it without one.

import sharp from 'sharp';
import type { Db } from './db.ts';
import type { Source } from './types.ts';
import { chunks } from './db.ts';
import { sha, UA } from './util.ts';

export const ART_BUCKET = 'event-art';
const MAX_BYTES = 8_000_000;

/** A copy for the listing: a JPEG at most 1200 px wide, or null for anything that is not a usable picture. */
export async function shrink(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const img = sharp(bytes, { failOn: 'error' });
    const meta = await img.metadata();
    if (!meta.width || !meta.height || meta.width < 300 || meta.height < 150) return null;
    return new Uint8Array(await img.rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer());
  } catch { return null; }
}

const host = (u: unknown) => { try { return new URL(String(u)).hostname.replace(/^www\./, ''); } catch { return null; } };

/** Copy up to `limit` covers for upcoming listings of copy_covers sources that have no picture. Returns how many. */
export async function copyCovers(db: Pick<Db, 'select' | 'all' | 'patch' | 'storageUpload'>, sources: Source[], limit = 30,
  deps: { fetcher?: typeof fetch; shrink?: typeof shrink; log?: (s: string) => void } = {}): Promise<number> {
  const log = deps.log ?? ((s: string) => console.log(`[covers] ${s}`));
  let copied = 0;
  for (const source of sources.filter(s => s.config.copy_covers)) {
    const now = new Date().toISOString();
    const links = await db.all<{ event_id: string; raw_item_id: number | null; events: { image_url: string | null } | null }>(
      `event_sources?source_id=eq.${encodeURIComponent(source.id)}&raw_item_id=not.is.null&select=event_id,raw_item_id,events!inner(image_url)`
      + `&events.image_url=is.null&events.archived_at=is.null&events.merged_into=is.null&events.starts_at=gte.${now}&order=event_id.asc`);
    const todo = links.filter(l => l.raw_item_id != null).slice(0, limit - copied);
    const raws = new Map<number, { external_id: string; payload: Record<string, unknown> }>();
    for (const part of chunks(todo.map(l => l.raw_item_id!), 100)) {
      for (const r of await db.select<{ id: number; external_id: string; payload: Record<string, unknown> }>(`raw_items?id=in.(${part.join(',')})&select=id,external_id,payload`)) raws.set(r.id, r);
    }
    const attr = `Image from ${host(source.config.venue_site) ?? host(source.url)}`;
    for (const l of todo) {
      const raw = raws.get(l.raw_item_id!), cover = raw?.payload.cover;
      if (typeof cover !== 'string' || !/(^|\.)(fbcdn\.net|cdninstagram\.com)$/.test(host(cover) ?? '')) continue;
      try {
        const r = await (deps.fetcher ?? fetch)(cover, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
        const type = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(type)) continue;
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (!bytes.length || bytes.length > MAX_BYTES) continue;
        const jpeg = await (deps.shrink ?? shrink)(bytes);
        if (!jpeg) continue;
        const url = await db.storageUpload(ART_BUCKET, `${source.id}/${sha(`${source.id}|${raw!.external_id}`).slice(0, 20)}.jpg`, jpeg, 'image/jpeg');
        await db.patch(`events?id=eq.${encodeURIComponent(l.event_id)}&image_url=is.null`, { image_url: url, image_attr: attr });
        copied++;
      } catch (e) { log(`${l.event_id}: not copied: ${(e as Error).message}`); }
    }
  }
  if (copied) log(`${copied} pictures copied from the venues' own records`);
  return copied;
}
