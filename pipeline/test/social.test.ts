import { test } from 'node:test';
import assert from 'node:assert/strict';
import { threadsToken, tonightText } from '../social.ts';
import * as threads from '../social/threads.ts';
import * as instagram from '../social/instagram.ts';
import * as facebook from '../social/facebook.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test('Threads scope diagnostics distinguish a valid token from missing search grants', async () => {
  const info = await threads.tokenInfo('private-token', (async u => {
    assert.equal(new URL(String(u)).hostname, 'graph.threads.com');
    return json({ data: { is_valid: true, scopes: ['threads_basic'], expires_at: 100 } });
  }) as typeof fetch);
  assert.deepEqual(info, { valid: true, scopes: ['threads_basic'], expiresAt: 100 });
  assert.ok(!JSON.stringify(info).includes('private-token'));
});

test('Facebook publishes only to the configured assigned Page with its Page token', async () => {
  const cfg = { token: 'system-secret', businessId: '1784' };
  const calls: { path: string; method?: string; auth: string | null; body: string }[] = [];
  const fetcher = (async (u: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(u)).pathname;
    assert.ok(!String(u).includes('secret'));
    calls.push({ path, method: init?.method, auth: new Headers(init?.headers).get('authorization'), body: String(init?.body ?? '') });
    if (path.endsWith('/accounts')) return json({ data: [
      { id: '11', name: 'Other Page', access_token: 'wrong-secret', tasks: ['MANAGE'] },
      { id: '42', name: 'WanderAlt', access_token: 'page-secret', tasks: ['CREATE_CONTENT'] },
    ] });
    if (init?.method === 'GET') return json({ data: [] });
    return json({ id: '42_123' });
  }) as typeof fetch;
  const page = await facebook.ownPage(cfg, '42', fetcher);
  await facebook.checkPage(page, fetcher);
  assert.equal(calls.filter(c => c.method === 'POST').length, 0);
  assert.equal(await facebook.publishText(page, 'Tonight', fetcher), '42_123');
  assert.equal(calls.at(-1)?.path, '/v26.0/42/feed');
  assert.equal(calls.at(-1)?.auth, 'Bearer page-secret');
  assert.equal(new URLSearchParams(calls.at(-1)?.body).get('message'), 'Tonight');
  await assert.rejects(facebook.ownPage(cfg, '99', fetcher), /not assigned/);
  await assert.rejects(facebook.ownPage(cfg, '', fetcher), /numeric/);
  await assert.rejects(facebook.publishText(page, ' ', fetcher), /needs text/);
  const denied = (async () => json({ data: [{ id: '42', name: 'WanderAlt', access_token: 'secret', tasks: ['ANALYZE'] }] })) as typeof fetch;
  await assert.rejects(facebook.ownPage(cfg, '42', denied), /not assigned/);
  const failure = (async () => json({ error: { code: 190, message: 'page-secret' } }, 400)) as typeof fetch;
  await assert.rejects(facebook.publishText(page, 'Tonight', failure), e => e instanceof Error && /190/.test(e.message) && !e.message.includes('secret'));
});

test('the tonight post fits Threads, names the site once and keeps the voice', () => {
  const events = Array.from({ length: 12 }, (_, i) => ({ title: `Night number ${i} with a fairly long title`, venue: 'Heldeke!', starts_at: `2026-10-01T${String(15 + (i % 6)).padStart(2, '0')}:00:00Z` }));
  const text = tonightText(events, new Date('2026-10-01T10:00:00Z'));
  assert.ok(text.length > 0 && text.length <= 500);
  assert.ok(threads.fitsThreads(text));
  assert.match(text, /^Tonight in Tallinn, Thursday 1 October:\n\n\d\d:\d\d /);
  assert.ok(text.endsWith('\n\nwanderalt.app'));
  assert.ok(!text.includes('!') || text.includes('Heldeke!'));     // the only "!" is a venue's own name
  assert.equal(tonightText([], new Date()), '');
  assert.match(tonightText([{ title: 'Jazz', venue: null, starts_at: '2026-10-01T16:00:00Z', has_time: false }]), /\nJazz\n/);
});

test('a Threads post needs text within the limits', async () => {
  assert.equal(threads.fitsThreads(''), false);
  assert.equal(threads.fitsThreads('x'.repeat(501)), false);
  assert.equal(threads.fitsThreads('a https://a.ee b https://b.ee c https://c.ee d https://d.ee e https://e.ee f https://f.ee'), false);
  const calls: string[] = [];
  const fetcher = (async (u: string, init?: { body?: string }) => {
    calls.push(`${u.split('/').slice(-1)[0].split('?')[0]} ${init?.body ?? ''}`.replace(/access_token=[^&]+/, 'access_token=…'));
    return json(String(u).endsWith('threads_publish') ? { id: 'post1' } : { id: 'container1' });
  }) as never;
  assert.equal(await threads.publish('tok', '42', { text: 'Tonight' }, fetcher, 0), 'post1');
  assert.match(calls[0], /^threads media_type=TEXT&text=Tonight/);
  assert.match(calls[1], /^threads_publish creation_id=container1/);
  await assert.rejects(threads.publish('tok', '42', { text: '' }, fetcher, 0), /1–500/);
  await assert.rejects(threads.me('tok', (async () => json({ error: { code: 190, message: 'expired' } }, 400)) as never), /190 expired/);
});

test('Threads search and lookup report what Meta answers', async () => {
  const hits = await threads.keywordSearch('tok', 'Tallinn', (async () => json({ data: [{ id: '1', username: 'me', text: 'x' }] })) as never);
  assert.equal(hits.length, 1);
  assert.equal(await threads.profileLookup('tok', 'laine.bar', (async () => json({ error: { message: 'no' } }, 400)) as never), null);
});

test('a Threads token is refreshed when under thirty days remain and stored', async () => {
  const now = Date.parse('2026-10-01T00:00:00Z');
  const saved: Record<string, unknown>[] = [];
  const db = (row?: { token: string; expires_at: string | null }) => ({
    select: async () => row ? [row] : [],
    upsert: async (_t: string, rows: Record<string, unknown>[]) => { saved.push(...rows); },
  }) as never;
  const refresh = (async () => json({ access_token: 'new', expires_in: 5_184_000 })) as never;
  assert.equal(await threadsToken(db({ token: 'old', expires_at: '2026-10-10T00:00:00Z' }), {} as never, refresh, now), 'new');
  assert.equal(saved[0].token, 'new');
  assert.equal(await threadsToken(db({ token: 'fine', expires_at: '2026-12-01T00:00:00Z' }), {} as never, refresh, now), 'fine');
  assert.equal(saved.length, 1);
  assert.equal(await threadsToken(db(), { THREADS_ACCESS_TOKEN: 'seed' } as never, refresh, now), 'new');   // the secret is taken, refreshed, stored
  assert.equal(await threadsToken(db(), {} as never, refresh, now), null);
});

test('an Instagram post is JPEG, within quota, polled and published', async () => {
  const cfg = { token: 't', businessId: '1784' };
  await assert.rejects(instagram.publishImage(cfg, { imageUrl: 'https://x.ee/a.png', caption: 'c' }), /JPEG only/);
  await assert.rejects(instagram.publishImage(cfg, { imageUrl: 'https://x.ee/a.jpg', caption: 'c'.repeat(2201) }), /2,200/);
  const seen: string[] = [];
  let polls = 0;
  const fetcher = (async (u: string) => {
    const path = new URL(u).pathname;
    seen.push(path.split('/').slice(2).join('/'));
    if (path.endsWith('content_publishing_limit')) return json({ data: [{ quota_usage: 3, config: { quota_total: 100 } }] });
    if (path.endsWith('/media')) return json({ id: 'c1' });
    if (path.endsWith('/c1')) return json({ status_code: ++polls < 2 ? 'IN_PROGRESS' : 'FINISHED' });
    return json({ id: 'm1' });
  }) as never;
  assert.equal(await instagram.publishImage(cfg, { imageUrl: 'https://x.ee/a.jpg', caption: 'hello' }, fetcher, 0), 'm1');
  assert.deepEqual(seen, ['1784/content_publishing_limit', '1784/media', 'c1', 'c1', '1784/media_publish']);
  const full = (async () => json({ data: [{ quota_usage: 100, config: { quota_total: 100 } }] })) as never;
  await assert.rejects(instagram.publishImage(cfg, { imageUrl: 'https://x.ee/a.jpg', caption: 'c' }, full, 0), /quota used/);
});

test('a failed keyword search is retried plainly and reports both answers', async () => {
  const urls: string[] = [];
  const failing = (async (u: string) => { urls.push(u); return json({ error: { code: 500, message: 'boom' } }, 500); }) as never;
  await assert.rejects(threads.keywordSearch('tok', 'Tallinn', failing), /full query: .*500 boom; plain query: .*500 boom/);
  assert.equal(urls.length, 2);
  assert.ok(!urls[1].includes('search_type'));
  let n = 0;
  const flaky = (async () => ++n === 1 ? json({ error: { code: 100, message: 'bad param' } }, 400) : json({ data: [{ id: '1' }] })) as never;
  assert.equal((await threads.keywordSearch('tok', 'Tallinn', flaky)).length, 1);
});

test('recent posts of a known account are read through business_discovery', async () => {
  const { recentPosts } = await import('../instagram.ts');
  const cfg = { token: 't', businessId: '1784' };
  const posts = await recentPosts('laine.bar', cfg, 50, (async (u: string) => {
    assert.match(decodeURIComponent(u), /media\.limit\(25\)\{caption,timestamp,permalink,media_type,media_url,children/);
    return json({ business_discovery: { username: 'laine.bar', media: { data: [{ caption: 'Gig', timestamp: '2026-09-30T10:00:00+0000', permalink: 'https://www.instagram.com/p/x/', media_type: 'IMAGE' }] } } });
  }) as never);
  assert.deepEqual(posts, [{ caption: 'Gig', timestamp: '2026-09-30T10:00:00+0000', permalink: 'https://www.instagram.com/p/x/', mediaType: 'IMAGE' }]);
  assert.equal(await recentPosts('x', cfg, 5, (async () => json({ error: { code: 110 } })) as never), null);
});

test('Instagram never publishes an unfinished or failed image container', async () => {
  const cfg = { token: 'private', businessId: '1784' };
  for (const status of ['IN_PROGRESS', 'ERROR', 'EXPIRED']) {
    let published = false;
    const fetcher = (async (u: string) => {
      const path = new URL(u).pathname;
      if (path.endsWith('content_publishing_limit')) return json({ data: [{ quota_usage: 0, config: { quota_total: 100 } }] });
      if (path.endsWith('/media')) return json({ id: 'pending' });
      if (path.endsWith('/media_publish')) { published = true; return json({ id: 'unexpected' }); }
      return json({ status_code: status });
    }) as never;
    await assert.rejects(instagram.publishImage(cfg, { imageUrl: 'https://x.ee/a.jpg', caption: 'Tallinn' }, fetcher, 0), /still processing|ERROR|EXPIRED/);
    assert.equal(published, false);
  }
  await assert.rejects(instagram.publishImage(cfg, { imageUrl: 'file:///a.jpg', caption: 'Tallinn' }), /HTTP\(S\)/);
  await assert.rejects(instagram.publishImage(cfg, { imageUrl: 'https://x.ee/a.jpg', caption: ' ' }), /caption/);
});
