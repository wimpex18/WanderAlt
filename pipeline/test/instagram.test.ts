import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachInstagramPictures, instagramConfig, instagramHandle, lookupProfile, storePicture, hashtagPosts } from '../instagram.ts';
import type { Place } from '../places.ts';

const cfg = { token: 't', businessId: '1784' };
const reply = (body: unknown) => (async () => new Response(JSON.stringify(body))) as typeof fetch;

test('hashtag search fetches recent media with a bearer token and reports permission failures safely', async () => {
  const fetcher = (async (raw: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(raw));
    assert.equal(u.searchParams.has('access_token'), false);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer t');
    return new Response(JSON.stringify(u.pathname.endsWith('ig_hashtag_search') ? { data: [{ id: '123' }] } : { data: [{ caption: 'Concert', timestamp: '2026-10-05T10:00:00Z', permalink: 'https://instagram.com/p/X/', media_type: 'IMAGE' }] }));
  }) as typeof fetch;
  assert.equal((await hashtagPosts('tallinn', cfg, 25, fetcher)).length, 1);
  await assert.rejects(hashtagPosts('#tallinn', cfg, 25, fetcher), /without #/);
  await assert.rejects(hashtagPosts('tallinn', cfg, 25, reply({ error: { code: 10, message: 'credential-secret' } })), e => e instanceof Error && /code 10/.test(e.message) && !e.message.includes('credential-secret'));
});

test('a failing larger hashtag batch retries five posts once, but permission failures are not retried', async () => {
  const sizes: string[] = [];
  const fetcher = (async (raw: string | URL | Request) => {
    const u = new URL(String(raw));
    if (u.pathname.endsWith('ig_hashtag_search')) return new Response(JSON.stringify({ data: [{ id: '123' }] }));
    sizes.push(u.searchParams.get('limit')!);
    return sizes.length === 1 ? new Response(JSON.stringify({ error: { code: 1 } }), { status: 500 }) : new Response(JSON.stringify({ data: [] }));
  }) as typeof fetch;
  assert.deepEqual(await hashtagPosts('tallinn', cfg, 25, fetcher), []);
  assert.deepEqual(sizes, ['25', '5']);
});

test('only a profile link gives a username', () => {
  assert.equal(instagramHandle('https://www.instagram.com/laine.bar'), 'laine.bar');
  assert.equal(instagramHandle('https://instagram.com/kanutigildisaal/'), 'kanutigildisaal');
  assert.equal(instagramHandle('https://www.instagram.com/p/ABC123/'), null);
  assert.equal(instagramHandle('https://www.instagram.com/explore'), null);
  assert.equal(instagramHandle('https://evil.example/laine.bar'), null);
  assert.equal(instagramHandle(null), null);
});

test('both secrets are needed', () => {
  assert.equal(instagramConfig({ INSTAGRAM_ACCESS_TOKEN: 'a' } as never), null);
  assert.deepEqual(instagramConfig({ INSTAGRAM_ACCESS_TOKEN: ' a ', INSTAGRAM_BUSINESS_ID: '1' } as never), { token: 'a', businessId: '1' });
});

test('a lookup keeps only the account that was asked for, and stops on a refused token', async () => {
  const ok = await lookupProfile('Laine.Bar', cfg, reply({ business_discovery: { username: 'laine.bar', profile_picture_url: 'https://cdn/x.jpg' } }));
  assert.deepEqual(ok, { kind: 'found', username: 'laine.bar', pictureUrl: 'https://cdn/x.jpg' });
  assert.equal((await lookupProfile('a', cfg, reply({ business_discovery: { username: 'other', profile_picture_url: 'https://cdn/x.jpg' } }))).kind, 'none');
  assert.equal((await lookupProfile('a', cfg, reply({ error: { code: 110, error_subcode: 2207013, message: 'cannot find' } }))).kind, 'none');
  for (const code of [190, 10, 200, 4]) assert.equal((await lookupProfile('a', cfg, reply({ error: { code, message: 'x' } }))).kind, 'stop');
  assert.equal((await lookupProfile('a', cfg, (async () => { throw new Error('offline'); }) as never)).kind, 'stop');
  // the token is sent in the query once and never logged by this code
  let seen = '';
  await lookupProfile('a', cfg, (async (u: string) => { seen = u; return new Response('{}'); }) as never);
  assert.match(decodeURIComponent(seen), /business_discovery\.username\(a\)/);
});

test('a picture is copied only when it is a small image', async () => {
  const uploads: string[] = [];
  const db = { storageUpload: async (b: string, p: string) => { uploads.push(`${b}/${p}`); return `https://db/${b}/${p}`; } };
  const image = (type: string, size: number) => (async () => new Response(new Uint8Array(size), { headers: { 'content-type': type } })) as typeof fetch;
  assert.equal(await storePicture(db as never, 'tallinn-x', 'https://cdn/x', image('image/jpeg', 1000)), 'https://db/venue-pictures/instagram/tallinn-x.jpg');
  assert.equal(await storePicture(db as never, 'tallinn-x', 'https://cdn/x', image('text/html', 1000)), null);
  assert.equal(await storePicture(db as never, 'tallinn-x', 'https://cdn/x', image('image/jpeg', 3_000_000)), null);
  assert.equal(await storePicture(db as never, 'tallinn-x', 'https://cdn/x', image('image/svg+xml', 100)), null);
  assert.deepEqual(uploads, ['venue-pictures/instagram/tallinn-x.jpg']);
});

test('the step fills places without a picture, skips the rest and stops when Meta refuses', async () => {
  const place = (id: string, over: Partial<Place> = {}) => ({ id, city: 'tallinn', name: id, aliases: [], status: 'active', instagram: `https://www.instagram.com/${id}`, ...over }) as Place;
  const places = [place('aaa'), place('bbb'), place('has-picture', { image_url: 'https://x/y.png' }), place('no-link', { instagram: null }), place('ccc')];
  const log: string[] = [];
  const lookup = async (handle: string) => handle === 'bbb' ? { kind: 'none', reason: 'code 110' } as const : { kind: 'found', username: handle, pictureUrl: `https://cdn/${handle}` } as const;
  const done = await attachInstagramPictures({} as never, places, cfg, 20, { lookup: lookup as never, store: (async (_d: unknown, id: string) => `https://db/${id}`) as never, log: s => log.push(s) });
  assert.deepEqual(done.map(p => p.id).sort(), ['aaa', 'ccc']);
  assert.equal(places[0].image_source, 'logo');
  assert.match(log[0], /3 profiles looked at, 2 pictures stored; skipped: 1× code 110/);
  const stop: string[] = [];
  const none = await attachInstagramPictures({} as never, [place('ddd'), place('eee')], cfg, 20, { lookup: (async () => ({ kind: 'stop', reason: 'Meta refused (code 190)' })) as never, log: s => stop.push(s) });
  assert.equal(none.length, 0);
  assert.match(stop[0], /stopped: Meta refused/);
});
