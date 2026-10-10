import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { copyCovers, shrink, ART_BUCKET } from '../event-art.ts';
import type { Source } from '../types.ts';

const paavli = { id: 'paavli', kind: 'html', url: 'https://www.kultuurivabrik.ee/en/events', config: { copy_covers: true, venue_site: 'https://www.kultuurivabrik.ee/' } } as unknown as Source;

test('a cover is copied once, from the venue\'s own record, only for a listing with no picture', async () => {
  const uploads: string[] = [], patches: { path: string; body: unknown }[] = [], reads: string[] = [];
  const db = {
    all: async (path: string) => { reads.push(path); return [{ event_id: 'ev_1', raw_item_id: 7, events: { image_url: null } }, { event_id: 'ev_2', raw_item_id: 8, events: { image_url: null } }]; },
    select: async () => [
      { id: 7, external_id: 'data:923802290770315', payload: { cover: 'https://scontent.ftll3-1.fna.fbcdn.net/v/t39/cover.jpg?oe=6900' } },
      { id: 8, external_id: 'data:1', payload: { cover: 'https://evil.example/cover.jpg' } },
    ],
    storageUpload: async (bucket: string, path: string) => { uploads.push(`${bucket}/${path}`); return `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}`; },
    patch: async (path: string, body: unknown) => { patches.push({ path, body }); return null; },
  };
  const fetched: string[] = [];
  const fetcher = (async (u: string) => { fetched.push(u); return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }); }) as unknown as typeof fetch;
  const n = await copyCovers(db as never, [paavli, { ...paavli, id: 'other', config: {} } as Source], 30, { fetcher, shrink: async () => new Uint8Array([9]), log: () => {} });
  assert.equal(n, 1);
  assert.match(reads[0], /source_id=eq\.paavli/);
  assert.match(reads[0], /events\.image_url=is\.null/);
  assert.deepEqual(fetched, ['https://scontent.ftll3-1.fna.fbcdn.net/v/t39/cover.jpg?oe=6900'], 'only a signed CDN address of the record itself is fetched');
  assert.match(uploads[0], new RegExp(`^${ART_BUCKET}/paavli/[0-9a-f]{20}\\.jpg$`));
  assert.equal(patches[0].path, 'events?id=eq.ev_1&image_url=is.null');
  assert.deepEqual((patches[0].body as { image_attr: string }).image_attr, 'Image from kultuurivabrik.ee');
});

test('a copy is a JPEG at most 1200 px wide; a tiny or broken picture is no copy', async () => {
  const big = await sharp({ create: { width: 2400, height: 1260, channels: 3, background: '#d83a14' } }).png().toBuffer();
  const out = await shrink(new Uint8Array(big));
  const meta = await sharp(out!).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', 1200, 630]);
  const tiny = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#000' } }).png().toBuffer();
  assert.equal(await shrink(new Uint8Array(tiny)), null);
  assert.equal(await shrink(new Uint8Array([1, 2, 3])), null);
});
