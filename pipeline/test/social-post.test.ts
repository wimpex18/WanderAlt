import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { loadPost, checkImage } from '../social/post.ts';
import { publishPhoto } from '../social/facebook.ts';
import { publishImage } from '../social/instagram.ts';
import { publish } from '../social/threads.ts';

const good = { image: 'https://wanderalt.app/brand/social/teaser/teaser-1-soon.jpg', location: '106039436102339', threads: 'Soon. Tallinn, a walk at a time.' };

test('a post file needs a public https jpg and text for at least one platform', () => {
  assert.equal(loadPost(good).location, '106039436102339');
  assert.throws(() => loadPost({ ...good, image: 'https://wanderalt.app/x.png' }), /\.jpg/);
  assert.throws(() => loadPost({ ...good, image: 'http://wanderalt.app/x.jpg' }), /https/);
  assert.throws(() => loadPost({ image: good.image }), /at least one/);
  assert.throws(() => loadPost({ ...good, location: 106039436102339 }), /numeric ID in quotes/);
  assert.throws(() => loadPost([]), /JSON object/);
});

test('the voice and the platform limits are enforced before anything is sent', () => {
  assert.throws(() => loadPost({ ...good, threads: 'Soon!' }), /exclamation/);
  assert.throws(() => loadPost({ ...good, facebook: 'Come discover Tallinn.' }), /discover/);
  assert.throws(() => loadPost({ ...good, threads: 'x'.repeat(501) }), /500/);
  assert.throws(() => loadPost({ ...good, instagram: 'x'.repeat(2201) }), /2,200/);
});

test('every post file in the repo loads, so a bad edit fails here and not at send time', () => {
  const dir = new URL('../../brand/social/teaser/', import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  assert.ok(files.length >= 3);
  for (const f of files) {
    const post = loadPost(JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
    assert.equal(post.location, '106039436102339', f);
  }
});

test('the picture must already be public and a JPEG', async () => {
  const head = (status: number, type: string) => (async () => new Response(null, { status, headers: { 'content-type': type } })) as unknown as typeof fetch;
  await checkImage('https://x.test/a.jpg', head(200, 'image/jpeg'));
  await assert.rejects(checkImage('https://x.test/a.jpg', head(404, 'text/html')), /not public yet/);
  await assert.rejects(checkImage('https://x.test/a.jpg', head(200, 'text/html')), /not image\/jpeg/);
});

test('Facebook posts a photo with its caption and an optional place', async () => {
  const seen: { url: string; body: string }[] = [];
  const fetcher = (async (url: string, init?: { body?: string }) => { seen.push({ url, body: String(init?.body) }); return new Response(JSON.stringify({ id: '1', post_id: '99_1' })); }) as unknown as typeof fetch;
  const page = { id: '99', name: 'WanderAlt', token: 't' };
  assert.equal(await publishPhoto(page, { imageUrl: 'https://x.test/a.jpg', caption: 'Soon.', placeId: '106039436102339' }, fetcher), '99_1');
  assert.match(seen[0].url, /\/99\/photos$/);
  const q = new URLSearchParams(seen[0].body);
  assert.deepEqual([q.get('url'), q.get('caption'), q.get('place'), q.get('published')], ['https://x.test/a.jpg', 'Soon.', '106039436102339', 'true']);
  await publishPhoto(page, { imageUrl: 'https://x.test/a.jpg', caption: 'Soon.' }, fetcher);
  assert.equal(new URLSearchParams(seen[1].body).has('place'), false);
  await assert.rejects(publishPhoto(page, { imageUrl: 'https://x.test/a.jpg', caption: ' ' }, fetcher), /caption/);
});

test('Instagram and Threads pass the location only when one is given', async () => {
  const bodies: Record<string, string> = {};
  const fetcher = (async (url: string, init?: { method?: string; body?: string }) => {
    const path = new URL(url).pathname;
    if (init?.method === 'POST') bodies[path.split('/').pop()!] = String(init.body);
    if (path.endsWith('content_publishing_limit')) return new Response(JSON.stringify({ data: [{ quota_usage: 0, config: { quota_total: 100 } }] }));
    if (path.endsWith('/c1')) return new Response(JSON.stringify({ status_code: 'FINISHED' }));
    if (path.endsWith('/media') || path.endsWith('/threads')) return new Response(JSON.stringify({ id: 'c1' }));
    return new Response(JSON.stringify({ id: 'p1' }));
  }) as unknown as typeof fetch;
  await publishImage({ token: 't', businessId: 'b' }, { imageUrl: 'https://x.test/a.jpg', caption: 'Soon.', altText: 'Alt', locationId: '106039436102339' }, fetcher, 0);
  assert.equal(new URLSearchParams(bodies.media).get('location_id'), '106039436102339');
  await publish('t', 'u', { text: 'Soon.', imageUrl: 'https://x.test/a.jpg', locationId: '555' }, fetcher, 0);
  assert.equal(new URLSearchParams(bodies.threads).get('location_id'), '555');
  await publish('t', 'u', { text: 'Soon.' }, fetcher, 0);
  assert.equal(new URLSearchParams(bodies.threads).has('location_id'), false);
});
