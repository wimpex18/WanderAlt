import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectInstagram, collectHashtags } from '../sources/instagram.ts';
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

test('hashtag captions carry no inferred venue and reject invalid identities and dates', async () => {
  const tagSource = { ...source, config: { hashtags: ['tallinn', 'tallinn'], enabled: true } };
  let requests = 0;
  const post = { caption: 'A concert on Friday in Tallinn, doors at 20:00', timestamp: '2026-09-29T10:00:00Z', permalink: 'https://www.instagram.com/p/ABC/', mediaType: 'IMAGE' };
  const posts = (async () => { requests++; return [post, post, { ...post, permalink: 'https://evil.example/p/X/' }, { ...post, timestamp: 'invalid' }, { ...post, timestamp: '2026-10-01T10:00:00Z' }]; }) as never;
  const rows = await collectHashtags(tagSource, now, { cfg, posts, log: () => {} });
  assert.equal(requests, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].external_id, 'ig:hashtag:ABC');
  assert.equal(rows[0].payload.venue_name, undefined);
  assert.equal(rows[0].payload.hashtag, 'tallinn');
  await assert.rejects(collectHashtags({ ...source, config: { hashtags: ['a', 'b', 'c', 'd'], enabled: true } }, now, { cfg, posts }), /three fixed/);
});

test('venue account rotation reaches every account across consecutive six-hour runs', async () => {
  const places = Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: String(i), instagram: `https://instagram.com/venue${i}/` }));
  const seen = new Set<string>();
  for (let i = 0; i < 3; i++) await collectInstagram({ ...source, config: { accounts_per_run: 3 } }, { select: async () => [...places] } as never,
    new Date(now.getTime() + i * 6 * 3_600_000), { cfg, posts: async h => { seen.add(h); return []; }, log: () => {} });
  assert.equal(seen.size, 7);
});

test('shared handles are read once, have no assumed venue, and signed artwork is never queued', async () => {
  const db = { select: async () => ['one', 'two'].map(id => ({ id, name: id, instagram: 'https://instagram.com/shared/' })) } as never;
  let calls = 0;
  const rows = await collectInstagram(source, db, now, { cfg, log: () => {}, lookup: async () => {
    calls++; return { kind: 'found', posts: [
      { caption: null, timestamp: now.toISOString(), permalink: 'https://instagram.com/p/POST/?sig=expires', mediaType: 'IMAGE', posterAvailable: true, imageUrl: 'https://x.cdninstagram.com/image.jpg?expires=123' },
      { caption: 'A dated event announcement here', timestamp: 'not-a-date', permalink: 'https://instagram.com/p/BAD/', mediaType: 'IMAGE' },
      { caption: 'A dated event announcement here', timestamp: now.toISOString(), permalink: 'https://evil.test/p/BAD/', mediaType: 'IMAGE' },
    ] };
  } });
  assert.equal(calls, 1); assert.equal(rows.length, 1);
  assert.equal(rows[0].url, 'https://www.instagram.com/p/POST/');
  assert.equal(rows[0].payload.venue_name, undefined);
  assert.equal(rows[0].payload.poster_available, true);
  assert.ok(!JSON.stringify(rows).includes('expires'));
});

test('permission refusal stops account fanout and hashtag collection defaults off', async () => {
  let calls = 0;
  await assert.rejects(collectInstagram(source, db, now, { cfg, lookup: async () => { calls++; return { kind: 'stop', reason: 'code 190' }; } }), /stopped/);
  assert.equal(calls, 1);
  assert.deepEqual(await collectHashtags({ ...source, config: { hashtags: ['tallinn'] } }, now, { cfg, posts: async () => { throw new Error('must not call'); } }), []);
});
