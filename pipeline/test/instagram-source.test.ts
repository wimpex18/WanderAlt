import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectInstagram } from '../sources/instagram.ts';
import type { Source } from '../types.ts';

const source = { id: 'instagram-venues', city: 'tallinn', kind: 'instagram', url: 'https://www.instagram.com/', handle: '@wanderalt', label: 'Instagram', curated: false, config: { max_age_days: 14, accounts_per_run: 15 } } as Source;
const now = new Date('2026-09-30T12:00:00Z');
const cfg = { token: 't', businessId: '1' };
const db = { select: async () => [
  { id: 'tallinn-uus-laine', name: 'Uus Laine', instagram: 'https://www.instagram.com/laine.bar' },
  { id: 'tallinn-private', name: 'Private Place', instagram: 'https://www.instagram.com/private.place' },
  { id: 'tallinn-post', name: 'A Post', instagram: 'https://www.instagram.com/p/ABC/' },
] } as never;

test('recent captions of readable venue accounts become raw items, the rest is skipped', async () => {
  const log: string[] = [];
  const posts = async (h: string) => h === 'private.place' ? null : [
    { caption: 'Fri 3 Oct 21:00 Laine Live: Kurjam & ZLO, doors 20:00', timestamp: '2026-09-29T10:00:00+0000', permalink: 'https://www.instagram.com/p/AAA/', mediaType: 'IMAGE' },
    { caption: 'Thanks!', timestamp: '2026-09-29T10:00:00+0000', permalink: 'https://www.instagram.com/p/BBB/', mediaType: 'IMAGE' },
    { caption: 'An old announcement from long ago, nothing current', timestamp: '2026-08-01T10:00:00+0000', permalink: 'https://www.instagram.com/p/CCC/', mediaType: 'IMAGE' },
  ];
  const items = await collectInstagram(source, db, now, { cfg, posts, log: s => log.push(s) });
  assert.equal(items.length, 1);
  assert.equal(items[0].external_id, 'ig:laine.bar:AAA');
  assert.equal(items[0].url, 'https://www.instagram.com/p/AAA/');
  assert.deepEqual(items[0].payload, { text: 'Fri 3 Oct 21:00 Laine Live: Kurjam & ZLO, doors 20:00', posted_at: '2026-09-29T10:00:00+0000', handle: 'laine.bar', place_id: 'tallinn-uus-laine', venue_name: 'Uus Laine' });
  assert.match(log[0], /2 venue accounts asked, 1 readable, 1 not/);
});

test('without the secrets or a database nothing is asked', async () => {
  assert.deepEqual(await collectInstagram(source, db, now, { cfg: null }), []);
  assert.deepEqual(await collectInstagram(source, null, now, { cfg }), []);
});
